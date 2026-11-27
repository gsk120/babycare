-- Apply once before deploying the worker/API changes. Safe to rerun.
begin;

alter table babycare.recommendation_items
  add column if not exists sources jsonb check (jsonb_typeof(sources) = 'array');

-- Preserve citations of recommendations written by the earlier schema.
do $$
begin
  if to_regclass('babycare.recommendation_sources') is not null
     and to_regclass('babycare.reference_pdfs') is not null then
    update babycare.recommendation_items as item
       set sources = (
         select jsonb_agg(jsonb_build_object('book', pdf.title, 'page', source.page)
                          order by pdf.title, source.page)
           from babycare.recommendation_sources as source
           join babycare.reference_pdfs as pdf on pdf.id = source.pdf_id
          where source.item_id = item.id
       )
     where item.sources is null;
  end if;
end;
$$;

update babycare.recommendation_items set sources = '[]'::jsonb where sources is null;

alter table babycare.recommendation_items
  alter column sources set default '[]'::jsonb,
  alter column sources set not null;

commit;

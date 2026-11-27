-- Supabase SQL Editor에서 실행한다. 새 Vercel 버전의 추천 저장과 출처 표시를 먼저 확인한다.
-- 필요한 경우 Storage 화면에서 babycare-pdfs 버킷을 확인하고 삭제한다.
begin;

do $$
begin
  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'babycare'
       and table_name = 'recommendation_items'
       and column_name = 'sources'
       and data_type = 'jsonb'
       and is_nullable = 'NO'
  ) then
    raise exception 'store-recommendation-citations.sql을 먼저 실행해 주세요.';
  end if;

  if exists (select 1 from storage.buckets where id = 'babycare-pdfs') then
    raise exception 'Supabase Storage에서 babycare-pdfs 버킷을 먼저 확인하고 삭제해 주세요.';
  end if;

  if to_regclass('babycare.recommendation_sources') is not null then
    lock table babycare.recommendation_sources in access exclusive mode;
    if exists (select 1 from babycare.recommendation_sources) then
      if to_regclass('babycare.reference_pdfs') is null then
        raise exception '이전 출처를 대조할 PDF 목록을 찾을 수 없어요.';
      end if;

      lock table babycare.reference_pdfs in access exclusive mode;
      if exists (
        select 1
          from babycare.recommendation_sources as source
          left join babycare.reference_pdfs as pdf on pdf.id = source.pdf_id
          left join babycare.recommendation_items as item on item.id = source.item_id
         where pdf.id is null or item.id is null
            or not item.sources @> jsonb_build_array(jsonb_build_object('book', pdf.title, 'page', source.page))
      ) then
        raise exception '새 컬럼으로 옮겨지지 않은 추천 출처가 있어요.';
      end if;
    end if;
  end if;
end;
$$;

drop policy if exists babycare_pdf_admin_access on storage.objects;
drop policy if exists babycare_pdf_admin_guard on storage.objects;
drop function if exists babycare_private.is_pdf_admin();
drop table if exists babycare_private.pdf_admins;
drop schema if exists babycare_private;

drop table if exists babycare.recommendation_sources;
drop table if exists babycare.reference_pdfs;
drop table if exists babycare.family_prompts;

commit;

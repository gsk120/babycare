-- Apply to an existing Babycare database before saving a cooking environment.
begin;

alter table babycare.recommendation_settings
  add column if not exists cooking_environment text
  check (char_length(cooking_environment) between 1 and 1200 and btrim(cooking_environment) <> '');

commit;

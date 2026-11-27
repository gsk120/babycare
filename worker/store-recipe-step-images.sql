-- Apply after the recommendation citations migration and before enabling the image worker.
begin;

create table if not exists babycare.recipe_image_sets (
  version text primary key check (version ~ '^[0-9a-f]{64}$'),
  recipe jsonb not null check (jsonb_typeof(recipe) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists babycare.recipe_step_images (
  version text not null references babycare.recipe_image_sets(version) on delete cascade,
  step smallint not null check (step between 1 and 30),
  title text not null check (btrim(title) <> ''),
  alt text not null check (btrim(alt) <> ''),
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'failed')),
  object_path text unique,
  lease_id uuid,
  lease_until timestamptz,
  primary key (version, step),
  check ((status = 'ready') = (object_path is not null)),
  check ((status = 'processing') = (lease_id is not null)),
  check ((lease_id is null) = (lease_until is null))
);

alter table babycare.recommendation_items add column if not exists image_version text
  references babycare.recipe_image_sets(version);

alter table babycare.recipe_image_sets enable row level security;
alter table babycare.recipe_step_images enable row level security;
revoke all on babycare.recipe_image_sets, babycare.recipe_step_images from public, anon, authenticated, service_role, babycare_app;
drop policy if exists app_access on babycare.recipe_image_sets;
drop policy if exists app_access on babycare.recipe_step_images;
create policy app_access on babycare.recipe_image_sets to babycare_app using (true) with check (true);
create policy app_access on babycare.recipe_step_images to babycare_app using (true) with check (true);
grant select, insert on babycare.recipe_image_sets, babycare.recipe_step_images to babycare_app;
grant update (status, object_path, lease_id, lease_until) on babycare.recipe_step_images to babycare_app;
grant update (image_version) on babycare.recommendation_items to babycare_app;

commit;

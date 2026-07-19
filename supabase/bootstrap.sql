-- EduGlobal CRM - Supabase bootstrap
-- Safe to run more than once.

begin;

create table if not exists public.app_state (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.set_app_state_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_app_state_updated_at on public.app_state;
create trigger trg_app_state_updated_at
before update on public.app_state
for each row
execute function public.set_app_state_updated_at();

insert into public.app_state (id, payload)
values ('default', '{}'::jsonb)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'crm-files',
  'crm-files',
  true,
  12582912,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

commit;

-- Notes:
-- 1. The backend uses SUPABASE_SERVICE_ROLE_KEY, so normal RLS policies are not
--    required for server-side reads/writes to app_state or uploads to storage.
-- 2. Files are uploaded to the public bucket path:
--    crm-files/documents/<generated-file-name>
-- 3. If you want a different bucket name, update both this file and:
--    SUPABASE_STORAGE_BUCKET in Render.

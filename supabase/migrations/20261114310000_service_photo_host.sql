-- B10 review fix: services.photo_url (20261114300000_service_photos.sql) accepted the bucket's path on
-- any https site, so a slip could point a service card at a file outside HomeKlin. A bucket photo must
-- now sit on a Supabase project's own address (<20-letter ref>.supabase.co), which is where the upload
-- in src/lib/catalog/admin-actions.ts puts it. The rest of the rule is unchanged. That migration is
-- already applied, so the fix is its own migration. Its unnamed check was named services_photo_url_check
-- by Postgres.

alter table public.services drop constraint services_photo_url_check;

alter table public.services
  add constraint services_photo_url_check
    check (
      photo_url is null
      or photo_url ~ '^/images/[a-z0-9_-][a-z0-9._-]*$'
      or photo_url ~ '^https://[a-z0-9]{20}\.supabase\.co/storage/v1/object/public/service-photos/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
    );

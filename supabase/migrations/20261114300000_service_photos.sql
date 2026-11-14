-- B10: a photo per service, shown on the customer's service cards (Admin-ServiceNew, "Tambah foto").
-- Until now the photos lived only in the app (src/components/customer/service-photos.ts), so a service
-- admin added later had none; that map stays the fallback for services without a photo here.
--
-- The photos sit in a public bucket, because every visitor sees them on the catalog anyway. Unlike the
-- cleaner photos (written only by the server with the secret key), these are written with the signed-in
-- admin's own session, so the storage policies below check the role in the database a second time after
-- the Server Action's authorize(["admin"]) (src/lib/catalog/admin-actions.ts). Images only, at most 2 MB.
-- Sources: https://supabase.com/docs/guides/storage/buckets/fundamentals ("Public buckets") and
-- https://supabase.com/docs/guides/storage/security/access-control

-- A site image (/images/...) or a photo in the service-photos bucket under a random name, nothing else:
-- no other bucket (a cleaner's photo), no other site, no script address. The app only ever writes the
-- address the upload returned; the check stops a slip or a hand-made request from storing anything else.
alter table public.services
  add column photo_url text
    check (
      photo_url is null
      or photo_url ~ '^/images/[a-z0-9_-][a-z0-9._-]*$'
      or photo_url ~ '^https://[a-z0-9.-]+(:[0-9]+)?/storage/v1/object/public/service-photos/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
    );

comment on column public.services.photo_url is
  'The service''s photo on the customer cards: a site image or a file in the service-photos bucket. Null: the app''s own photo or the type icon.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('service-photos', 'service-photos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']);

-- Only an admin adds, replaces or removes a file in this bucket. Reading a file needs no policy (the
-- bucket is public, served by its public address); the select policy is for admins only, because
-- replacing (upsert) and removing a file read its row first. Nobody else has a policy, so every other
-- role is refused.
create policy "Admins add service photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'service-photos' and (select public.is_admin()));

create policy "Admins see service photo files"
  on storage.objects for select to authenticated
  using (bucket_id = 'service-photos' and (select public.is_admin()));

create policy "Admins replace service photos"
  on storage.objects for update to authenticated
  using (bucket_id = 'service-photos' and (select public.is_admin()))
  with check (bucket_id = 'service-photos' and (select public.is_admin()));

create policy "Admins remove service photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'service-photos' and (select public.is_admin()));

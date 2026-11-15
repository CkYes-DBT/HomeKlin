"use server";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { updateTag } from "next/cache";
import { redirect } from "@/i18n/navigation";
import { authorize } from "@/lib/auth/dal";
import { catalogCacheTag } from "@/lib/catalog/catalog";
import { requireSupabaseConfig } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  parseServiceForm,
  parseServicePhoto,
  serviceFormValues,
  servicePhotoUrlSchema,
  type ServiceErrorKey,
  type ServiceField,
  type ServiceFormValues,
  type ServiceInput,
} from "@/lib/validation/service";

// Admin adds and changes HomeKlin's services and their prices (T7b, /admin/services). A Server Action
// is a public POST endpoint whatever page shows the form, so every action here:
// 1. checks the role itself first (authorize, src/lib/auth/dal.ts) and refuses anyone but an admin
//    with a message, before reading the form;
// 2. parses the form with Zod (src/lib/validation/service.ts), so invalid input never reaches the
//    database;
// 3. writes through the signed-in admin's own client, so row-level security checks the role a second
//    time (supabase/migrations/20261024120000_admin_services.sql). Nobody deletes a service: switching
//    it off keeps it for past orders;
// 4. after a successful write only, expires the catalog's cache tag with updateTag, so the customer
//    pages (which cache their catalog reads with cacheTag(catalogCacheTag)) show the change at once.
// B10: the form may carry a photo (field "photo", JPEG, PNG or WebP up to 2 MB) or ask to remove the
// stored one ("removePhoto"). It is uploaded to the public service-photos bucket under a random name with
// the admin's own session, so the bucket's storage policies check the role once more; the address the
// upload returns becomes services.photo_url. A file whose service could not be saved is removed again,
// and a replaced or removed photo's old file goes after the save. A form without either keeps the photo.
// Database messages never reach the browser; the answer is a message key the page translates.
// The language comes from a hidden field (root params do not reach Server Actions), so the redirect
// keeps admin's language.
// Sources: node_modules/next/dist/docs/01-app/02-guides/server-actions.md ("Security"),
// node_modules/next/dist/docs/01-app/03-api-reference/04-functions/updateTag.md and
// node_modules/next/dist/docs/01-app/02-guides/forms.md

/** Why a change could not be saved, as a message key ("AdminServiceForm.formErrors.<key>"). */
export type ServiceFailureKey = "forbidden" | "notFound" | "unavailable";

export type ServiceFormState = {
  fieldErrors?: Partial<Record<ServiceField | "photo", ServiceErrorKey>>;
  formError?: ServiceFailureKey;
  /** What admin typed, to refill the form after an error. */
  values?: ServiceFormValues;
} | null;

type DatabaseError = { code?: string };

// Postgres error codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
const uniqueViolation = "23505";
const insufficientPrivilege = "42501";

/** A refusal by row-level security means "not allowed"; anything else is a problem to try again later. */
function failureOf(error: DatabaseError): ServiceFailureKey {
  return error.code === insufficientPrivilege ? "forbidden" : "unavailable";
}

/** The columns admin may change. The id is never among them: it names the row. */
function changedColumns(service: ServiceInput) {
  return {
    category: service.category,
    name_id: service.nameId,
    name_en: service.nameEn,
    description_id: service.descriptionId,
    description_en: service.descriptionEn,
    price_idr: service.priceIdr,
    duration_minutes: service.durationMinutes,
    sort_order: service.sortOrder,
    is_active: service.isActive,
  };
}

const photoBucket = "service-photos";

/** Whether an address is a photo in this project's own service-photos bucket (review L3). */
const isOwnPhotoUrl = (photoUrl: string) => servicePhotoUrlSchema(requireSupabaseConfig().url).safeParse(photoUrl).success;

/** The file name of a photo in our bucket, from its public address; null for a site image or none. */
function bucketFileOf(photoUrl: string | null | undefined): string | null {
  if (!photoUrl || !isOwnPhotoUrl(photoUrl)) return null;
  return photoUrl.slice(photoUrl.lastIndexOf("/") + 1);
}

/** Removes files from the bucket after the fact; a failure leaves an unused file, never a broken page. */
async function removeFiles(supabase: SupabaseClient, files: (string | null)[]) {
  const names = files.filter((name): name is string => name !== null);
  if (names.length === 0) return;
  const { error } = await supabase.storage.from(photoBucket).remove(names);
  if (error) console.error("[admin services] could not remove an unused service photo:", error.message);
}

type PhotoChoice = Extract<ReturnType<typeof parseServicePhoto>, { ok: true }>;
type PhotoStep = { ok: true; column: { photo_url?: string | null }; uploaded: string | null } | { ok: false; state: ServiceFormState };

/** Uploads the form's new photo, or notes its removal: the photo_url column to write, if any. */
async function photoStep(supabase: SupabaseClient, choice: PhotoChoice, values: ServiceFormValues): Promise<PhotoStep> {
  if (!choice.upload) return { ok: true, column: choice.remove ? { photo_url: null } : {}, uploaded: null };

  const name = `${randomUUID()}.${choice.upload.extension}`;
  const storage = supabase.storage.from(photoBucket);
  const { error } = await storage.upload(name, choice.upload.file, { contentType: choice.upload.file.type });
  if (error) {
    console.error("[admin services] could not upload a service photo:", error.message);
    return { ok: false, state: { formError: "unavailable", values } };
  }
  const publicUrl = storage.getPublicUrl(name).data.publicUrl;
  // Only an address in this project's own bucket is stored (review L3).
  if (!isOwnPhotoUrl(publicUrl)) {
    console.error("[admin services] the uploaded photo's address is not in this project's bucket");
    await removeFiles(supabase, [name]);
    return { ok: false, state: { formError: "unavailable", values } };
  }
  return { ok: true, column: { photo_url: publicUrl }, uploaded: name };
}

export async function createService(_previous: ServiceFormState, formData: FormData): Promise<ServiceFormState> {
  if (!(await authorize(["admin"]))) return { formError: "forbidden" };

  const values = serviceFormValues(formData);
  const parsed = parseServiceForm(formData);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, values };

  const photoChoice = parseServicePhoto(formData);
  if (!photoChoice.ok) return { fieldErrors: { photo: "photoInvalid" }, values };

  const service = parsed.data;
  const supabase = await createSupabaseServerClient({ writeCookies: true });
  const photo = await photoStep(supabase, photoChoice, values);
  if (!photo.ok) return photo.state;
  const { error } = await supabase.from("services").insert({ id: service.id, ...changedColumns(service), ...photo.column });
  if (error) {
    await removeFiles(supabase, [photo.uploaded]);
    if (error.code === uniqueViolation) return { fieldErrors: { id: "idTaken" }, values };
    return { formError: failureOf(error), values };
  }

  updateTag(catalogCacheTag);
  return redirect({ href: { pathname: "/admin/services", query: { created: service.id } }, locale: parsed.locale });
}

export async function updateService(_previous: ServiceFormState, formData: FormData): Promise<ServiceFormState> {
  if (!(await authorize(["admin"]))) return { formError: "forbidden" };

  const values = serviceFormValues(formData);
  const parsed = parseServiceForm(formData);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, values };

  const photoChoice = parseServicePhoto(formData);
  if (!photoChoice.ok) return { fieldErrors: { photo: "photoInvalid" }, values };

  const service = parsed.data;
  const supabase = await createSupabaseServerClient({ writeCookies: true });
  const photo = await photoStep(supabase, photoChoice, values);
  if (!photo.ok) return photo.state;
  // The stored photo, read only when this save replaces or removes it, so its file can go afterwards.
  const replacing = "photo_url" in photo.column;
  const before = replacing ? await supabase.from("services").select("photo_url").eq("id", service.id).maybeSingle() : null;
  // select() returns the changed rows: none means there is no such service (row-level security also
  // hides every row from anyone but admin, so nothing would change for them either).
  const { data, error } = await supabase
    .from("services")
    .update({ ...changedColumns(service), ...photo.column })
    .eq("id", service.id)
    .select("id");
  if (error || !data || data.length === 0) {
    await removeFiles(supabase, [photo.uploaded]);
    return { formError: error ? failureOf(error) : "notFound", values };
  }
  if (replacing) await removeFiles(supabase, [bucketFileOf(before?.data?.photo_url)]);

  updateTag(catalogCacheTag);
  return redirect({ href: { pathname: "/admin/services", query: { saved: service.id } }, locale: parsed.locale });
}

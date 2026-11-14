"use server";

import { updateTag } from "next/cache";
import { faqCacheTag } from "@/components/support/faq-cached";
import { redirect } from "@/i18n/navigation";
import { authorize } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  faqFormValues,
  parseFaqForm,
  parseFaqId,
  type FaqErrorKey,
  type FaqField,
  type FaqFormValues,
  type FaqInput,
} from "@/lib/validation/faq";

// Admin adds and changes HomeKlin's FAQ (D1, /admin/faq, the user's mock "Admin-Faq"). As with the
// services (src/lib/catalog/admin-actions.ts), every action here:
// 1. checks the role itself first (authorize) and refuses anyone but an admin, before reading the form;
// 2. parses the form with Zod (src/lib/validation/faq.ts), so invalid input never reaches the database;
// 3. writes through the signed-in admin's own client, so row-level security checks the role a second
//    time ("Admins add FAQ entries", "Admins change FAQ entries" in
//    supabase/migrations/20261104120000_support.sql). Nobody deletes an entry here: unticking
//    "Tampilkan di halaman bantuan" makes it a draft the customers no longer see;
// 4. after a successful write only, expires the FAQ's cache tag, so /support shows the change at once.
// Database messages never reach the browser; the answer is a message key the page translates.
// Sources: node_modules/next/dist/docs/01-app/02-guides/server-actions.md ("Security") and
// node_modules/next/dist/docs/01-app/03-api-reference/04-functions/updateTag.md

/** Why a change could not be saved, as a message key ("AdminFaqForm.formErrors.<key>"). */
export type FaqFailureKey = "forbidden" | "notFound" | "unavailable";

export type FaqFormState = {
  fieldErrors?: Partial<Record<FaqField, FaqErrorKey>>;
  formError?: FaqFailureKey;
  /** What admin typed, to refill the form after an error. */
  values?: FaqFormValues;
} | null;

// Postgres error codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
const insufficientPrivilege = "42501";

function failureOf(error: { code?: string }): FaqFailureKey {
  return error.code === insufficientPrivilege ? "forbidden" : "unavailable";
}

function columnsOf(entry: FaqInput) {
  return {
    question_id: entry.questionId,
    question_en: entry.questionEn,
    answer_id: entry.answerId,
    answer_en: entry.answerEn,
    keywords: entry.keywords,
    sort_order: entry.sortOrder,
    is_published: entry.isPublished,
  };
}

export async function createFaq(_previous: FaqFormState, formData: FormData): Promise<FaqFormState> {
  if (!(await authorize(["admin"]))) return { formError: "forbidden" };

  const values = faqFormValues(formData);
  const parsed = parseFaqForm(formData);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, values };

  const supabase = await createSupabaseServerClient({ writeCookies: true });
  const { data, error } = await supabase.from("faq_entries").insert(columnsOf(parsed.data)).select("id").single<{ id: string }>();
  if (error || !data) return { formError: error ? failureOf(error) : "unavailable", values };

  updateTag(faqCacheTag);
  return redirect({ href: { pathname: "/admin/faq", query: { created: data.id } }, locale: parsed.locale });
}

export async function updateFaq(_previous: FaqFormState, formData: FormData): Promise<FaqFormState> {
  if (!(await authorize(["admin"]))) return { formError: "forbidden" };

  const values = faqFormValues(formData);
  const id = parseFaqId(formData.get("id"));
  if (!id) return { formError: "notFound", values };
  const parsed = parseFaqForm(formData);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, values };

  const supabase = await createSupabaseServerClient({ writeCookies: true });
  // select() returns the changed rows: none means there is no such entry.
  const { data, error } = await supabase.from("faq_entries").update(columnsOf(parsed.data)).eq("id", id).select("id");
  if (error) return { formError: failureOf(error), values };
  if (!data || data.length === 0) return { formError: "notFound", values };

  updateTag(faqCacheTag);
  return redirect({ href: { pathname: "/admin/faq", query: { saved: id } }, locale: parsed.locale });
}

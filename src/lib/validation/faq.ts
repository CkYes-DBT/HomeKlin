import type { Locale } from "next-intl";
import { z } from "zod";
import { routing } from "@/i18n/routing";

// Server-side checks for the admin's FAQ form (D1, the user's mock "Admin-Faq";
// markdown/CONSTRAINTS.md: every server action parses its input with Zod). The limits are the
// database's own (public.faq_entries in supabase/migrations/20261104120000_support.sql): both
// questions 5 to 200 characters, both answers 5 to 2000, the keywords at most 300. Each problem comes
// back as a message key per field ("AdminFaqForm.errors.<key>" in src/messages).

export const faqLimits = {
  questionMin: 5,
  questionMax: 200,
  answerMin: 5,
  answerMax: 2000,
  keywordsMax: 300,
} as const;

/** The form's text fields, in the order they appear. */
export const faqTextFields = ["questionId", "questionEn", "answerId", "answerEn", "keywords", "sortOrder"] as const;

/** A field that can have a problem (the publish checkbox cannot be wrong). */
export type FaqField = (typeof faqTextFields)[number];

export type FaqErrorKey =
  | "questionRequired"
  | "questionTooShort"
  | "questionTooLong"
  | "answerRequired"
  | "answerTooShort"
  | "answerTooLong"
  | "keywordsTooLong"
  | "sortOrderInvalid";

/** An FAQ entry as admin enters it, checked and typed. */
export type FaqInput = {
  questionId: string;
  questionEn: string;
  answerId: string;
  answerEn: string;
  /** "pesan, booking, jadwal": extra search words, one comma and space between them. */
  keywords: string;
  sortOrder: number;
  isPublished: boolean;
};

/** What the form shows: every field as typed, the checkbox, and the entry's id ("" for a new one). */
export type FaqFormValues = Record<FaqField, string> & { id: string; isPublished: boolean };

export type FaqParseResult =
  | { ok: true; locale: Locale; data: FaqInput }
  | { ok: false; locale: Locale; fieldErrors: Partial<Record<FaqField, FaqErrorKey>> };

// The language is a hidden field a visitor can edit, so it can never fail the form.
const locale = z.enum(routing.locales).catch(routing.defaultLocale);

/** A question: trimmed, one line (every run of spaces or line breaks becomes one space). */
const question = z
  .string()
  .transform((value) => value.trim().replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(1, { error: "questionRequired" })
      .min(faqLimits.questionMin, { error: "questionTooShort" })
      .max(faqLimits.questionMax, { error: "questionTooLong" }),
  );

/** An answer: trimmed, its line breaks kept (the help page shows paragraphs). */
const answer = z
  .string()
  .transform((value) => value.trim().replace(/\r\n/g, "\n"))
  .pipe(
    z
      .string()
      .min(1, { error: "answerRequired" })
      .min(faqLimits.answerMin, { error: "answerTooShort" })
      .max(faqLimits.answerMax, { error: "answerTooLong" }),
  );

const keywords = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((word) => word.trim().replace(/\s+/g, " "))
      .filter(Boolean)
      .join(", "),
  )
  .pipe(z.string().max(faqLimits.keywordsMax, { error: "keywordsTooLong" }));

// 0 to 9999: four digits at most.
const sortOrder = z.string().trim().regex(/^\d{1,4}$/, { error: "sortOrderInvalid" }).transform(Number);

const faqSchema = z.object({
  questionId: question,
  questionEn: question,
  answerId: answer,
  answerEn: answer,
  keywords,
  sortOrder,
  // A ticked checkbox posts "on"; an unticked one posts nothing.
  isPublished: z.boolean(),
});

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** The form that adds or changes an FAQ entry. Which entry it changes is a hidden id (parseFaqId). */
export function parseFaqForm(formData: FormData): FaqParseResult {
  const input: Record<string, unknown> = Object.fromEntries(faqTextFields.map((name) => [name, text(formData, name)]));
  input.isPublished = formData.get("isPublished") === "on";
  const language = locale.parse(formData.get("locale"));

  const result = faqSchema.safeParse(input);
  if (result.success) return { ok: true, locale: language, data: result.data };

  const fieldErrors: Partial<Record<FaqField, FaqErrorKey>> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as FaqField;
    // The first problem per field is the one to fix first ("required" before "too short").
    fieldErrors[field] ??= issue.message as FaqErrorKey;
  }
  return { ok: false, locale: language, fieldErrors };
}

/** An FAQ entry's id from a hidden field or the address, or null if no entry could have it. */
export function parseFaqId(value: unknown): string | null {
  const result = z.uuid().safeParse(value);
  return result.success ? result.data : null;
}

/** Longest value sent back to refill the form; a little above the longest the database takes. */
const maxEcho = 2400;

/** What admin typed, as typed (cut to a sane length), to refill the form after an error. */
export function faqFormValues(formData: FormData): FaqFormValues {
  const values = Object.fromEntries(faqTextFields.map((name) => [name, text(formData, name).slice(0, maxEcho)]));
  return {
    ...(values as Record<FaqField, string>),
    id: text(formData, "id").slice(0, 64),
    isPublished: formData.get("isPublished") === "on",
  };
}

/** A stored entry, as admin's FAQ list reads it (src/lib/support/faq-admin.ts). */
export type AdminFaqEntry = {
  id: string;
  question: { id: string; en: string };
  answer: { id: string; en: string };
  keywords: string;
  sortOrder: number;
  isPublished: boolean;
};

/** A stored entry as the edit form's starting values. */
export function faqToFormValues(entry: AdminFaqEntry): FaqFormValues {
  return {
    id: entry.id,
    questionId: entry.question.id,
    questionEn: entry.question.en,
    answerId: entry.answer.id,
    answerEn: entry.answer.en,
    keywords: entry.keywords,
    sortOrder: String(entry.sortOrder),
    isPublished: entry.isPublished,
  };
}

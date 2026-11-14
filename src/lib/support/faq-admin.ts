import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminFaqEntry } from "@/lib/validation/faq";
import { SupportError } from "./support";

// Admin's FAQ list (D1, /admin/faq): every entry, published or draft, in the help page's order. Read
// with the signed-in admin's own client, so row-level security decides what comes back ("Users read
// published FAQ entries, admins every entry", supabase/migrations/20261104120000_support.sql): an
// admin sees the drafts too, anyone else only what is published. Never cached, so admin always sees
// what is stored.

type FaqRow = {
  id: string;
  question_id: string;
  question_en: string;
  answer_id: string;
  answer_en: string;
  keywords: string;
  sort_order: number;
  is_published: boolean;
};

export async function listAllFaq(client: SupabaseClient): Promise<AdminFaqEntry[]> {
  const { data, error } = await client
    .from("faq_entries")
    .select("id, question_id, question_en, answer_id, answer_en, keywords, sort_order, is_published")
    .order("sort_order")
    .order("question_id");
  if (error) throw new SupportError(error);
  return (data as FaqRow[]).map((row) => ({
    id: row.id,
    question: { id: row.question_id, en: row.question_en },
    answer: { id: row.answer_id, en: row.answer_en },
    keywords: row.keywords,
    sortOrder: row.sort_order,
    isPublished: row.is_published,
  }));
}

/** The order number a new entry gets: one after the last, so it lands at the end of the list. */
export function nextFaqOrder(entries: readonly { sortOrder: number }[]): number {
  return entries.reduce((highest, entry) => Math.max(highest, entry.sortOrder), 0) + 1;
}

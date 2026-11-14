import { describe, expect, it } from "vitest";
import { faqFormValues, faqToFormValues, parseFaqForm, parseFaqId } from "@/lib/validation/faq";

// The admin's FAQ form (D1, the user's mock "Admin-Faq"; src/lib/validation/faq.ts): every field is
// checked on the server with the limits of the database (public.faq_entries in
// supabase/migrations/20261104120000_support.sql), and each problem comes back as a message key per
// field. Nothing that fails here may reach the database.

const valid = {
  questionId: "Bagaimana cara memesan layanan HomeKlin?",
  questionEn: "How do I book a HomeKlin service?",
  answerId: "Pilih layanan, tentukan tanggal dan jam, lalu selesaikan pembayaran.",
  answerEn: "Choose a service, pick a date and time, then complete the payment.",
  keywords: "pesan, booking, jadwal",
  sortOrder: "1",
  isPublished: "on",
  locale: "en",
};

function form(fields: Record<string, string | undefined>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    if (value !== undefined) data.set(name, value);
  }
  return data;
}

describe("parseFaqForm", () => {
  it("accepts a complete entry and types it", () => {
    const result = parseFaqForm(form(valid));
    expect(result).toEqual({
      ok: true,
      locale: "en",
      data: {
        questionId: valid.questionId,
        questionEn: valid.questionEn,
        answerId: valid.answerId,
        answerEn: valid.answerEn,
        keywords: "pesan, booking, jadwal",
        sortOrder: 1,
        isPublished: true,
      },
    });
  });

  it("keeps line breaks in an answer but trims it, and makes a question one line", () => {
    const result = parseFaqForm(form({ ...valid, questionId: "  Apa  itu\nHomeKlin? ", answerId: " Baris satu.\n\nBaris dua. " }));
    expect(result.ok && result.data.questionId).toBe("Apa itu HomeKlin?");
    expect(result.ok && result.data.answerId).toBe("Baris satu.\n\nBaris dua.");
  });

  it("tidies the keywords: one comma and space between words, no empty ones", () => {
    const result = parseFaqForm(form({ ...valid, keywords: " bayar ,, refund,payment , " }));
    expect(result.ok && result.data.keywords).toBe("bayar, refund, payment");
    const none = parseFaqForm(form({ ...valid, keywords: undefined }));
    expect(none.ok && none.data.keywords).toBe("");
  });

  it("an unticked box is a draft", () => {
    const result = parseFaqForm(form({ ...valid, isPublished: undefined }));
    expect(result.ok && result.data.isPublished).toBe(false);
  });

  it("names each problem with the first thing to fix", () => {
    const result = parseFaqForm(
      form({
        ...valid,
        questionId: "",
        questionEn: "Why?",
        answerId: "x".repeat(2001),
        answerEn: "   ",
        keywords: "k".repeat(301),
        sortOrder: "-1",
      }),
    );
    expect(result).toEqual({
      ok: false,
      locale: "en",
      fieldErrors: {
        questionId: "questionRequired",
        questionEn: "questionTooShort",
        answerId: "answerTooLong",
        answerEn: "answerRequired",
        keywords: "keywordsTooLong",
        sortOrder: "sortOrderInvalid",
      },
    });
  });

  it("a question over 200 characters is too long", () => {
    const result = parseFaqForm(form({ ...valid, questionEn: "q".repeat(201) }));
    expect(result.ok ? null : result.fieldErrors.questionEn).toBe("questionTooLong");
  });

  it("falls back to Indonesian for an unknown language, without failing the form", () => {
    expect(parseFaqForm(form({ ...valid, locale: "fr" })).locale).toBe("id");
  });
});

describe("parseFaqId", () => {
  it("accepts an entry id and refuses anything else", () => {
    expect(parseFaqId("2f1c7e8a-5b7a-4b8e-9a4c-1f2d3e4c5b6a")).toBe("2f1c7e8a-5b7a-4b8e-9a4c-1f2d3e4c5b6a");
    expect(parseFaqId("not-an-id")).toBeNull();
    expect(parseFaqId(undefined)).toBeNull();
  });
});

describe("faqFormValues and faqToFormValues", () => {
  it("send back what admin typed, cut to a sane length", () => {
    const values = faqFormValues(form({ ...valid, answerId: "a".repeat(5000), isPublished: undefined }));
    expect(values.answerId).toHaveLength(2400);
    expect(values.isPublished).toBe(false);
    expect(values.questionEn).toBe(valid.questionEn);
  });

  it("start the edit form from the stored entry", () => {
    expect(
      faqToFormValues({
        id: "e1",
        question: { id: "Tanya?", en: "Ask?" },
        answer: { id: "Jawab.", en: "Answer." },
        keywords: "a, b",
        sortOrder: 3,
        isPublished: false,
      }),
    ).toEqual({
      id: "e1",
      questionId: "Tanya?",
      questionEn: "Ask?",
      answerId: "Jawab.",
      answerEn: "Answer.",
      keywords: "a, b",
      sortOrder: "3",
      isPublished: false,
    });
  });
});

describe("nextFaqOrder", () => {
  it("puts a new entry after the last one, or first in an empty list", async () => {
    const { nextFaqOrder } = await import("@/lib/support/faq-admin");
    expect(nextFaqOrder([{ sortOrder: 3 }, { sortOrder: 7 }, { sortOrder: 1 }])).toBe(8);
    expect(nextFaqOrder([])).toBe(1);
  });
});

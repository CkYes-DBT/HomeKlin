import { beforeEach, describe, expect, it, vi } from "vitest";

// The Server Actions behind /admin/faq (D1, src/lib/support/faq-actions.ts). A Server Action is a
// public POST endpoint, so each one checks the role itself before anything else, writes through the
// signed-in admin's own Supabase client (row-level security checks the role a second time), and only
// after a successful write expires the FAQ's cache tag, so the help page shows the change at once.
// Supabase, the role check, the cache and the redirect are replaced by stand-ins.

type DbError = { code: string; message: string };

const authorizeMock = vi.fn();
const updateTagMock = vi.fn();
const redirectMock = vi.fn();
const createClientMock = vi.fn();

let insertResult: { data: { id: string } | null; error: DbError | null };
let updateResult: { data: { id: string }[] | null; error: DbError | null };
const insertSingleMock = vi.fn(async () => insertResult);
const insertSelectMock = vi.fn(() => ({ single: insertSingleMock }));
const insertMock = vi.fn(() => ({ select: insertSelectMock }));
const updateSelectMock = vi.fn(async () => updateResult);
const eqMock = vi.fn(() => ({ select: updateSelectMock }));
const updateMock = vi.fn(() => ({ eq: eqMock }));
const fromMock = vi.fn(() => ({ insert: insertMock, update: updateMock }));

vi.mock("@/lib/auth/dal", () => ({ authorize: authorizeMock }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: createClientMock }));
vi.mock("next/cache", () => ({ updateTag: updateTagMock }));
vi.mock("@/i18n/navigation", () => ({ redirect: redirectMock }));

const { createFaq, updateFaq } = await import("@/lib/support/faq-actions");

const admin = { id: "admin-1", role: "admin", fullName: "Uji Admin" };
const entryId = "2f1c7e8a-5b7a-4b8e-9a4c-1f2d3e4c5b6a";

const fields = {
  questionId: "Apakah petugas membawa peralatan?",
  questionEn: "Do cleaners bring their equipment?",
  answerId: "Ya, petugas membawa peralatan standar.",
  answerEn: "Yes, cleaners bring standard equipment.",
  keywords: "peralatan, bahan",
  sortOrder: "7",
  locale: "en",
};

const columns = {
  question_id: fields.questionId,
  question_en: fields.questionEn,
  answer_id: fields.answerId,
  answer_en: fields.answerEn,
  keywords: "peralatan, bahan",
  sort_order: 7,
  is_published: true,
};

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

function expectNoWrite() {
  expect(insertMock).not.toHaveBeenCalled();
  expect(updateMock).not.toHaveBeenCalled();
  expect(updateTagMock).not.toHaveBeenCalled();
  expect(redirectMock).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  authorizeMock.mockResolvedValue(admin);
  createClientMock.mockResolvedValue({ from: fromMock });
  insertResult = { data: { id: entryId }, error: null };
  updateResult = { data: [{ id: entryId }], error: null };
});

describe("createFaq", () => {
  it("refuses anyone who is not an admin before reading the form or touching the database", async () => {
    authorizeMock.mockResolvedValue(null);
    const state = await createFaq(null, form(fields));
    expect(authorizeMock).toHaveBeenCalledWith(["admin"]);
    expect(state).toMatchObject({ formError: "forbidden" });
    expect(createClientMock).not.toHaveBeenCalled();
    expectNoWrite();
  });

  it("sends invalid input back with a message key per field, and never to the database", async () => {
    const state = await createFaq(null, form({ ...fields, questionEn: "Hi", answerId: "" }));
    expect(state).toMatchObject({
      fieldErrors: { questionEn: "questionTooShort", answerId: "answerRequired" },
      values: { questionEn: "Hi", answerId: "" },
    });
    expectNoWrite();
  });

  it("adds the entry through the admin's own client, then refreshes the FAQ and opens the list", async () => {
    await createFaq(null, form({ ...fields, isPublished: "on" }));
    expect(fromMock).toHaveBeenCalledWith("faq_entries");
    expect(insertMock).toHaveBeenCalledWith(columns);
    expect(updateTagMock).toHaveBeenCalledWith("faq");
    expect(redirectMock).toHaveBeenCalledWith({ href: { pathname: "/admin/faq", query: { created: entryId } }, locale: "en" });
  });

  it("says not allowed when row-level security refuses, and try again for anything else", async () => {
    insertResult = { data: null, error: { code: "42501", message: "denied" } };
    expect(await createFaq(null, form(fields))).toMatchObject({ formError: "forbidden" });
    insertResult = { data: null, error: { code: "23514", message: "check" } };
    expect(await createFaq(null, form(fields))).toMatchObject({ formError: "unavailable", values: { questionId: fields.questionId } });
    expect(updateTagMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe("updateFaq", () => {
  it("refuses anyone who is not an admin", async () => {
    authorizeMock.mockResolvedValue(null);
    expect(await updateFaq(null, form({ ...fields, id: entryId }))).toMatchObject({ formError: "forbidden" });
    expectNoWrite();
  });

  it("refuses a missing or malformed id without touching the database", async () => {
    expect(await updateFaq(null, form({ ...fields, id: "drop table" }))).toMatchObject({ formError: "notFound" });
    expectNoWrite();
  });

  it("changes the entry with that id, then refreshes the FAQ and opens the list", async () => {
    await updateFaq(null, form({ ...fields, id: entryId }));
    expect(updateMock).toHaveBeenCalledWith({ ...columns, is_published: false });
    expect(eqMock).toHaveBeenCalledWith("id", entryId);
    expect(updateTagMock).toHaveBeenCalledWith("faq");
    expect(redirectMock).toHaveBeenCalledWith({ href: { pathname: "/admin/faq", query: { saved: entryId } }, locale: "en" });
  });

  it("says the entry is gone when no row changed", async () => {
    updateResult = { data: [], error: null };
    expect(await updateFaq(null, form({ ...fields, id: entryId }))).toMatchObject({ formError: "notFound" });
    expect(updateTagMock).not.toHaveBeenCalled();
  });
});

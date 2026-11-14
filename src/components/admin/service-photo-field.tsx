"use client";

import { CircleAlert, ImageUp, X } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";

// The same rule as parseServicePhoto on the server (src/lib/validation/service.ts), checked here first
// so a wrong file is refused before it is sent.
const photoTypes = ["image/jpeg", "image/png", "image/webp"];
const maxPhotoBytes = 2 * 1024 * 1024;

type ServicePhotoFieldProps = {
  /** The form's own id prefix (useId in the panel). */
  id: string;
  /** What the service card shows now (rendered on the server): the service's photo or its type's icon. */
  current: ReactNode;
  /** The service has a photo of its own (services.photo_url), which can be removed. */
  ownPhoto: boolean;
  /** The server's refusal of the file, in words. */
  error?: string;
};

// "Foto layanan" in admin's service panel (D1, the mock "Admin-ServiceNew" "Tambah foto"; B10): the
// photo the customers' service card shows, a button that opens the file picker (JPEG, PNG or WebP up to
// 2 MB, checked here and again on the server), a preview of the chosen file with a way to take it back,
// and, for a service with a photo of its own, "Hapus foto" (form field removePhoto), after which the
// card falls back to the app's photo or the type's icon. The file goes with the panel's form (field
// "photo") to createService or updateService. React empties the form's fields after a refused save; the
// preview then goes too, so it never shows a file that is no longer chosen.
// Source: https://developer.mozilla.org/docs/Web/API/URL/createObjectURL_static
export function ServicePhotoField({ id, current, ownPhoto, error }: ServicePhotoFieldProps) {
  const t = useTranslations("AdminServiceForm.photo");
  const input = useRef<HTMLInputElement>(null);
  const shownUrl = useRef<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [wrongFile, setWrongFile] = useState(false);
  const [remove, setRemove] = useState(false);

  function show(file: File | null) {
    if (shownUrl.current) URL.revokeObjectURL(shownUrl.current);
    shownUrl.current = file ? URL.createObjectURL(file) : null;
    setPreview(shownUrl.current);
  }

  useEffect(() => {
    const form = input.current?.form;
    function onReset() {
      if (shownUrl.current) URL.revokeObjectURL(shownUrl.current);
      shownUrl.current = null;
      setPreview(null);
      setRemove(false);
    }
    form?.addEventListener("reset", onReset);
    return () => {
      form?.removeEventListener("reset", onReset);
      if (shownUrl.current) URL.revokeObjectURL(shownUrl.current);
    };
  }, []);

  function choose(file: File | undefined) {
    if (file && (!photoTypes.includes(file.type) || file.size > maxPhotoBytes)) {
      setWrongFile(true);
      show(null);
      if (input.current) input.current.value = "";
      return;
    }
    setWrongFile(false);
    setRemove(false);
    show(file ?? null);
  }

  function takeBack() {
    show(null);
    setWrongFile(false);
    if (input.current) {
      input.current.value = "";
      input.current.focus();
    }
  }

  const message = wrongFile ? t("invalid") : error;
  const status = preview ? t("chosen") : remove ? t("removing") : ownPhoto ? t("own") : t("fallback");

  return (
    <div data-testid="panel-photo" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed border-border-control bg-field px-3 py-2.5">
        <span className={`relative shrink-0 ${remove ? "opacity-40" : ""}`}>
          {preview ? (
            <Image src={preview} alt={t("previewAlt")} width={88} height={88} unoptimized className="size-touch rounded-sm bg-sunken object-cover" />
          ) : (
            current
          )}
        </span>
        <span className="flex min-w-0 flex-1 basis-48 flex-col leading-snug">
          <span id={`${id}-photo-title`} className="text-sm font-semibold text-ink">
            {t("title")}
          </span>
          <span id={`${id}-photo-status`} className="text-xs text-ink-muted" aria-live="polite">
            {status}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {/* The browser's own file button names itself in the browser's language, so the input is
              hidden visually and a button-styled label in the page's language opens it. The input keeps
              the keyboard focus; the label shows the focus ring. */}
          <input
            ref={input}
            id={`${id}-photo`}
            name="photo"
            type="file"
            accept={photoTypes.join(",")}
            aria-describedby={`${id}-photo-title ${id}-photo-status ${id}-photo-hint${message ? ` ${id}-photo-error` : ""}`}
            aria-invalid={message ? true : undefined}
            onChange={(event) => choose(event.target.files?.[0])}
            className="peer sr-only"
          />
          <label
            htmlFor={`${id}-photo`}
            className={`${outline} cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus`}
          >
            <ImageUp className="size-4 shrink-0" aria-hidden="true" />
            {preview || ownPhoto ? t("change") : t("add")}
          </label>
          {preview ? (
            <button type="button" onClick={takeBack} className={outline}>
              <X className="size-4 shrink-0" aria-hidden="true" />
              {t("takeBack")}
            </button>
          ) : null}
        </span>
      </div>
      {ownPhoto && !preview ? (
        <label className="inline-flex min-h-touch w-fit cursor-pointer items-center gap-2.5 px-1 text-sm font-medium text-ink">
          <input
            type="checkbox"
            name="removePhoto"
            checked={remove}
            onChange={(event) => setRemove(event.target.checked)}
            className="size-5 shrink-0 cursor-pointer accent-primary"
          />
          {t("remove")}
        </label>
      ) : null}
      <p id={`${id}-photo-hint`} className="px-1 text-sm text-ink-muted">
        {t("hint")}
      </p>
      {message ? (
        <p id={`${id}-photo-error`} role="alert" className="flex items-start gap-1.5 px-1 text-sm font-medium text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{message}</span>
        </p>
      ) : null}
    </div>
  );
}

/** The outline pill (markdown/design.md, Buttons), as the panel's Batal. */
const outline =
  "inline-flex min-h-touch items-center justify-center gap-2 rounded-full border-[1.5px] border-outline px-4 text-sm font-semibold whitespace-nowrap text-ink transition-[background-color,transform] duration-150 ease-out-quart hover:bg-card active:scale-[0.98] active:bg-sunken";

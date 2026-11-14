"use client";

import { ChevronDown } from "lucide-react";
import { useState, type SelectHTMLAttributes } from "react";

type SubmitOnChangeSelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "defaultValue" | "onChange"> & {
  /** The value the page was read with; a new one from the server replaces the choice. */
  value: string;
  options: readonly { value: string; label: string }[];
};

// A native select inside a plain GET form (the admin monitor's area filter, M2): choosing an option
// sends the form at once, a full page load like "Perbarui daftar", so the cards and their video links
// are read again. Without JavaScript the form's own submit button (in <noscript>) does the same. The
// select follows the server's value when the address changes (the back button), without remounting.
// Source: https://react.dev/reference/react/useState#storing-information-from-previous-renders
export function SubmitOnChangeSelect({ value, options, className = "", ...select }: SubmitOnChangeSelectProps) {
  const [selected, setSelected] = useState(value);
  const [fromServer, setFromServer] = useState(value);
  if (value !== fromServer) {
    setFromServer(value);
    setSelected(value);
  }
  return (
    <span className="relative block">
      <select
        {...select}
        value={selected}
        onChange={(event) => {
          setSelected(event.target.value);
          event.target.form?.requestSubmit();
        }}
        className={`w-full cursor-pointer appearance-none ${className}`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3.5 size-4.5 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
    </span>
  );
}

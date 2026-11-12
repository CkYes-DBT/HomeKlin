type RoleBadgeProps = {
  label: string;
  /** onDark: on the redesign's dark band (the admin top bar below 1024 px); on-band is 9.5:1 on band-raised. */
  onDark?: boolean;
};

const looks = {
  light: "rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs font-semibold text-ink-muted",
  dark: "rounded-full bg-band-raised px-2.5 py-0.5 text-xs font-semibold text-on-band",
};

// Tells staff and cleaners which mode they are in ("Petugas", "Agensi", "Admin"), next to the wordmark.
export function RoleBadge({ label, onDark = false }: RoleBadgeProps) {
  return <span className={onDark ? looks.dark : looks.light}>{label}</span>;
}

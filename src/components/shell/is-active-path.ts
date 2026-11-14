export type NavMatch = {
  href: string;
  /** Section roots ("/", "/agency") match only their own path, so one item is current at a time. */
  exact?: boolean;
  /** Other sections that belong to this item, so it stays current there too (the agency's schedule under Petugas). */
  alsoOn?: readonly string[];
};

function trimTrailingSlash(path: string): string {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

/** Whether a navigation item is the current page (or the section the current page belongs to). */
export function isActivePath(pathname: string, item: NavMatch): boolean {
  const path = trimTrailingSlash(pathname);
  if (item.exact) return path === item.href;
  return [item.href, ...(item.alsoOn ?? [])].some((href) => path === href || path.startsWith(`${href}/`));
}

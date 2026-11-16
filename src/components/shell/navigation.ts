import type { LucideIcon } from "lucide-react";
import type { MessageKeys, Messages, NestedKeyOf } from "next-intl";
import { appNavigation } from "./app-navigation";
import { backOfficeNavigation } from "./back-office-navigation";
import type { NavMatch } from "./is-active-path";

/** A message key inside one namespace of src/messages/id.json, e.g. "customer.home" in AppNavigation. */
export type MessageKeyIn<Namespace extends keyof Messages> = MessageKeys<
  Messages[Namespace],
  NestedKeyOf<Messages[Namespace]>
>;

export type NavItem<LabelKey extends string = string> = NavMatch & { labelKey: LabelKey; icon: LucideIcon };
/** labelKey names the landmark ("Navigasi utama"), each item's labelKey its label. */
export type Navigation<LabelKey extends string = string> = {
  labelKey: LabelKey;
  items: readonly NavItem<LabelKey>[];
};
/** A navigation entry that is not a page but a menu: the customer's "Akun", which opens the name and the log-out action. */
export type AccountMenuItem<LabelKey extends string = string> = { labelKey: LabelKey; icon: LucideIcon };
/** The customer and cleaner menus: the section links, and (customer only) the account menu after them. */
export type AppNavigationEntry<LabelKey extends string = string> = Navigation<LabelKey> & {
  account?: AccountMenuItem<LabelKey>;
};
export type AppNavKey = "customer" | "cleaner";
export type BackOfficeNavKey = "agency" | "admin" | "owner";
export type NavKey = AppNavKey | BackOfficeNavKey;
/**
 * How a back-office shell looks: default is the light T3b sidebar (agency, owner); forest is the
 * redesign's dark-green band (the admin console, Phase 13, markdown/design.md).
 */
export type ShellTone = "default" | "forest";

// Every shell's navigation in one place, for server code and tests. Client components import
// app-navigation.ts or back-office-navigation.ts directly, so each bundle carries only its own menus.
// The labels are in the message files, under the namespace named here.
export const navigation = { ...appNavigation, ...backOfficeNavigation };

export const navigationMessages = {
  customer: "AppNavigation",
  cleaner: "AppNavigation",
  agency: "BackOfficeNavigation",
  admin: "BackOfficeNavigation",
  owner: "BackOfficeNavigation",
} as const satisfies Record<NavKey, keyof Messages>;

import {
  BrushCleaning,
  CircleQuestionMark,
  ClipboardCheck,
  ClipboardList,
  House,
  UserRound,
} from "lucide-react";
import type { AppNavigationEntry, AppNavKey, MessageKeyIn } from "./navigation";

// Customer and cleaner menus. Kept apart from the back-office menus so the pages customers
// download never carry agency menu labels or routes (markdown/PRODUCT.md principle 6).
// The first item of each list is its home: the wordmark links there. The customer's "Akun" is not a
// page: `account` is the menu that opens the signed-in name and "Keluar" (account-menu.tsx), shown
// after the section links. The cleaner's "Akun" stays a page, so it is a plain item.
// Labels: the AppNavigation namespace of src/messages/*.json, which the app shells send to the browser.
export const appNavigation = {
  customer: {
    labelKey: "customer.label",
    items: [
      { href: "/home", exact: true, labelKey: "customer.home", icon: House },
      { href: "/services", labelKey: "customer.services", icon: BrushCleaning },
      { href: "/orders", labelKey: "customer.orders", icon: ClipboardList },
      { href: "/support", labelKey: "customer.support", icon: CircleQuestionMark },
    ],
    account: { labelKey: "customer.account", icon: UserRound },
  },
  cleaner: {
    labelKey: "cleaner.label",
    items: [
      { href: "/cleaner", exact: true, labelKey: "cleaner.home", icon: House },
      { href: "/cleaner/jobs", labelKey: "cleaner.jobs", icon: ClipboardCheck },
      { href: "/cleaner/account", labelKey: "cleaner.account", icon: UserRound },
    ],
  },
} satisfies Record<AppNavKey, AppNavigationEntry<MessageKeyIn<"AppNavigation">>>;

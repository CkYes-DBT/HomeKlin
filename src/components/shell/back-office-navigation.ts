import {
  Building2,
  ChartColumn,
  CircleCheck,
  CircleHelp,
  ClipboardList,
  History,
  LayoutGrid,
  MessageCircle,
  ShieldCheck,
  UsersRound,
  Video,
} from "lucide-react";
import type { BackOfficeNavKey, MessageKeyIn, Navigation } from "./navigation";

// Agency, admin and owner menus. Partner agencies run cleaners, availability and assignment (their
// menu follows the partner mocks, D2: summary first; the schedule is part of Petugas, and "Video
// petugas" is kept although the mocks leave it out, so the live view and recordings stay reachable);
// HomeKlin admin owns the services and the one price list (its menu follows the mock, R2b: no
// dashboard, live monitoring first, /admin redirects there); the owner sees the business numbers and
// decides which partner agencies and admins HomeKlin has.
// Labels: the BackOfficeNavigation namespace of src/messages/*.json, sent to the browser by the
// back-office shell only.
export const backOfficeNavigation = {
  agency: {
    labelKey: "agency.label",
    items: [
      { href: "/agency", exact: true, labelKey: "agency.summary", icon: ChartColumn },
      { href: "/agency/orders", labelKey: "agency.incoming", icon: ClipboardList },
      { href: "/agency/past", labelKey: "agency.past", icon: CircleCheck },
      { href: "/agency/cleaners", alsoOn: ["/agency/schedule"], labelKey: "agency.cleaners", icon: UsersRound },
      { href: "/agency/recordings", labelKey: "agency.videos", icon: Video },
      { href: "/agency/services", labelKey: "agency.services", icon: LayoutGrid },
    ],
  },
  admin: {
    labelKey: "admin.label",
    items: [
      { href: "/admin/monitor", labelKey: "admin.monitor", icon: Video },
      { href: "/admin/services", labelKey: "admin.services", icon: LayoutGrid },
      { href: "/admin/tickets", labelKey: "admin.tickets", icon: MessageCircle },
      { href: "/admin/faq", labelKey: "admin.faq", icon: CircleHelp },
      { href: "/admin/recordings", labelKey: "admin.recordings", icon: History },
    ],
  },
  owner: {
    labelKey: "owner.label",
    items: [
      { href: "/owner", exact: true, labelKey: "owner.numbers", icon: ChartColumn },
      { href: "/owner/agencies", labelKey: "owner.agencies", icon: Building2 },
      { href: "/owner/admins", labelKey: "owner.admins", icon: ShieldCheck },
    ],
  },
} satisfies Record<BackOfficeNavKey, Navigation<MessageKeyIn<"BackOfficeNavigation">>>;

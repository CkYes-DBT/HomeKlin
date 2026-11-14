# Redesign gaps

Where a mock of the canvas "HomeKlin App Screens" (`mocks/`) shows something the app cannot do or has no data for. Each entry: the mock element, what was built instead, and what the backend would need. Phase 14, one section per group.

## Admin

Built in D1 (2026-11-14). Mocks: `Admin-Live`, `Admin-Order`, `Admin-Order-Issue`, `Admin-Support`, `Admin-Faq`, `Admin-ServiceNew`.

### Order detail (`Admin-Order`, `Admin-Order-Issue`), page `/admin/orders/HK-xxxx`

| Mock element | Built instead | Backend needed |
|---|---|---|
| Address ("Jl. Kemang Raya No. 12") | Left out | `admin_jobs()` (or a new admin reader) returning `orders.address` |
| Customer note ("Mohon lepas sepatu...") | Left out | The order form has no note field: a `note` column on `orders`, a field on `/pesan`, and an admin reader |
| Customer card with name and phone | Card shown only when the customer has a help chat about the order; the name comes from the ticket inbox. No phone | A reader giving admin the order's customer name and `contact_phone` |
| Payment: customer price, agency fee (70%), HomeKlin income | Today's list price for the service, a note that the booked price and the split are not shown to admin, and "Lunas" (every order the admin sees is paid) | `order_fees` and `agencies.payout_percent` are owner and agency only (migration `20261111090000_agency_fees.sql` says "never exposed to admins"), and `orders.price_idr` has no admin reader. Needs an admin reader of the booked price, and an owner decision on whether admin may see the fee split |
| Timeline time for "Ditugaskan" (08.30) | Step shown as done, without a time | An `assigned_at` column on `orders`, set when the agency assigns a cleaner |
| Time of "Siaran terputus" (09.41) | The time of the stream's last status report (`stream_sessions.updated_at`) | If the phone reports the same status again, the time moves to that report. A stream status history (one row per change) would give the exact time of the drop |
| "Buka obrolan pelanggan" on every order | Shown only when the customer opened a help chat about the order | Admin cannot start a chat: `open_ticket` is customer only. An admin "start chat with customer" function |
| Whole monitor card is a link to the order | The order number on the card is the link; "Buka" stays full screen (user decision) | None |

### Live monitoring (`Admin-Live`)

| Mock element | Built instead | Backend needed |
|---|---|---|
| "Contoh" badge next to the title | Left out: the page shows real data | None |
| Area select lists two areas | Lists every served area from the catalog | None |

### Support chats (`Admin-Support`)

| Mock element | Built instead | Backend needed |
|---|---|---|
| Row preview shows the latest message | Shows the customer's first question (and the order number when there is one) | `admin_ticket_inbox()` returning the last message's text |
| Row time is a clock time ("09.12", "Kemarin") | Relative time ("5 menit yang lalu") from the ticket's start | None (presentation choice); the last message time needs the inbox to return it |
| "Pesan otomatis HomeKlin" bubble | Not shown: the app sends no automatic message | An automatic first reply when a ticket opens |
| Read tick ("Terbaca") on admin messages | Left out | Read receipts: a `read_at` per message, set when the customer views the chat |
| "Lampirkan foto" button in the composer | Left out | Photo upload: a storage bucket for ticket attachments, an attachment column and RLS |
| "Tandai selesai" | Kept the existing "Tutup tiket" (same action, `close_ticket`), so the words match the "Ditutup" status | None |
| Filter "Selesai" | Named "Ditutup", to match the ticket status shown on each row | None |

### FAQ (`Admin-Faq`)

| Mock element | Built instead | Backend needed |
|---|---|---|
| A draft with an empty English answer | Both answers are required (5 to 2000 characters), also for a draft | The database checks both lengths (`faq_entries`); a draft without a translation needs those checks relaxed |
| No way to delete an entry in the mock | None built either; unticking "Tampilkan di halaman bantuan" hides it | None |

### Service create and edit panel (`Admin-ServiceNew`)

| Mock element | Built instead | Backend needed |
|---|---|---|
| Separate page "Tambah layanan baru" | The panel in place on `/admin/services?new` (user decision) | None |
| "Tambah foto" upload button | A photo row that shows the service's photo, or its type's icon, and says photos are added by the development team | Photos are files in `public/images` mapped by service id. Upload needs a storage bucket, a `photo_path` column on `services` and RLS |
| One "Nama layanan" and one "Deskripsi singkat" | Both languages, as before | None (the app needs both) |
| "Durasi (jam)" | "Durasi (menit)", as before | None (the database stores minutes) |
| Note: "Draf sampai nama, jenis, durasi, dan harga terisi ... agensi mitra memilih dari daftar" | The note says what is true here: unticked, the service is a draft customers do not see | Partner agencies do not pick services in this app (SPEC: agencies do not manage services) |

### Menu

The mock menu has four items; the app keeps "Rekaman" as a fifth (user decision). `/admin/recordings` got the same card and header styling.

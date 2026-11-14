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

## Owner

Built in D3 (2026-11-14). Mocks: `Owner-Overview`, `Owner-Partners`, `Owner-PartnerNew`, `Owner-Admins`, `Owner-AdminNew`. Uses Phase 15 B5: `owner_numbers(p_days)` (the 7, 30 and 90 day toggle, growth against the period before, 14 daily bars, payouts per agency), the 30-day partner numbers of `owner_agencies` and the last sign-in of `owner_admins`.

### Overview (`Owner-Overview`), page `/owner`

| Mock element | Built instead | Backend needed |
|---|---|---|
| "Contoh" badge next to the title | Left out: the page shows real data | None |
| "Data per 5 Nov 2026" in the description | Left out; the numbers are read on every visit | None |
| Not in the mock | "Pesanan menurut status" (all time) kept: SPEC (Owner) requires orders by status | None |
| Mark a payout as paid (`markPayoutPaid`) | Not built; no mock shows it either | `markPayoutPaid` needs a payout id, and the owner has no reader that lists payouts (`owner_payouts_overview()` gives totals only; the `payouts` table has no grant for signed-in users) |

### Partner agencies (`Owner-Partners`), page `/owner/agencies`

| Mock element | Built instead | Backend needed |
|---|---|---|
| Status "Menunggu persetujuan" and "Approve" | Only Aktif and Ditangguhkan | A pending status on `agencies` and an approve function (B14, not approved) |
| "View" per partner | Left out: there is no partner detail page | A partner detail page and its reader (not planned) |
| Suspend in one click | Suspend and reactivate ask once more in place first (kept from T29c) | None |
| Not in the mock | Areas, cleaners and whether the partner has a sign-in, under the name | None |

### Add a partner (`Owner-PartnerNew`), page `/owner/agencies/new`

| Mock element | Built instead | Backend needed |
|---|---|---|
| Nama penanggung jawab, Email, Nomor WhatsApp | Not asked; the form has the name and the areas served (the areas are not in the mock, but the partner needs them to get bookings) | Contact columns on `agencies` and `owner_add_agency` arguments (B14, not approved) |
| "Kirim undangan", invitation email, status "Menunggu persetujuan" | "Tambah mitra": the partner is active at once; its sign-in is linked by the development team as before | Invitation email and a pending status (B14, not approved) |

### Admin accounts (`Owner-Admins`), page `/owner/admins`

| Mock element | Built instead | Backend needed |
|---|---|---|
| "Contoh" badge | Left out | None |
| "Dibuat oleh Rizky Pratama, Pemilik" | Left out; the details show the email, the creation date and the access | Who created the account (a `created_by` on the admin, or the auth log) |
| "Hapus akun ... Tindakan ini tidak bisa dibatalkan" | "Hapus admin": the admin role is taken away and the account stays as an ordinary account, which the question says (unchanged `removeAdmin`) | Deleting the account itself would need a decision on its tickets and messages |

### Create an admin (`Owner-AdminNew`), page `/owner/admins/new`

| Mock element | Built instead | Backend needed |
|---|---|---|
| "Kata sandi sementara ... Admin mengganti kata sandi saat pertama masuk" | "Kata sandi awal", with the note to share it privately; the admin can also sign in with an emailed code | A forced password change at first sign-in (B14, not approved) |

### Menu and shell

The owner layout uses the forest shell as in the mocks: the role card "Dasbor pemilik" over "Pemilik HomeKlin", the three sections, the language switch and the signed-in owner at the bottom. The menu item "Angka bisnis" is now "Ringkasan". No gap.

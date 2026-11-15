# Redesign gaps

Where a mock of the canvas "HomeKlin App Screens" (`mocks/`) shows something the app cannot do or has no data for. Each entry: the mock element, what was built instead, and what the backend would need. Phase 14, one section per group.

## Admin

Built in D1 (2026-11-14). Mocks: `Admin-Live`, `Admin-Order`, `Admin-Order-Issue`, `Admin-Support`, `Admin-Faq`, `Admin-ServiceNew`. Wired to the Phase 15 backend on 2026-11-14: the order page reads `admin_order_detail` (address, note, customer name and phone, booked price with the agency fee and HomeKlin income, payment method, the times of booked, paid, assigned, checked in and finished), the service panel uploads and removes photos (B10), and the support chats label guests and show "Terkirim" or "Terbaca" (B13).

### Order detail (`Admin-Order`, `Admin-Order-Issue`), page `/admin/orders/HK-xxxx`

| Mock element | Built instead | Backend needed |
|---|---|---|
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
| One "Nama layanan" and one "Deskripsi singkat" | Both languages, as before | None (the app needs both) |
| "Durasi (jam)" | "Durasi (menit)", as before | None (the database stores minutes) |
| Note: "Draf sampai nama, jenis, durasi, dan harga terisi ... agensi mitra memilih dari daftar" | The note says what is true here: unticked, the service is a draft customers do not see | None since B12: partner agencies now choose their services on `/agency/services`; the note could say so (copy decision) |

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

## Cleaner

Built in D4 (2026-11-15). Mocks: `Cleaner-Home`, `Cleaner-Jobs`, `Cleaner-Job`, `Cleaner-Live`, `Cleaner-Account` (`Cleaner-Chat` is out of scope: the user excluded cleaner chat, B13). The cleaner app keeps its phone layout on every width, now in the forest look (`theme-forest` on the `(cleaner)` layout). Pages: `/cleaner` (home, where signing in lands), `/cleaner/jobs` (list), `/cleaner/jobs/HK-xxxx` (one job, with check-in, the stream and check-out), `/cleaner/account`. Backend used: `my_job_stats` (B6), `my_cleaner_profile` (B11), `my_jobs` with `order_code` and `customer_note` (B1, B7), `my_stream_status`.

### Home (`Cleaner-Home`), page `/cleaner`

| Mock element | Built instead | Backend needed |
|---|---|---|
| Phone "0812 3456 7890, Jakarta Selatan" | The phone and work area the agency set (B11); until it does, "Nomor telepon dan area kerja Anda diisi oleh agensi Anda." | None |
| Round initials "WA" | The cleaner's photo when the agency added one, else the initials | None |
| Not in the mock | When the numbers cannot be read, a calm note in place of the tiles; the welcome and the profile still show | None |

### Jobs (`Cleaner-Jobs`), page `/cleaner/jobs`

| Mock element | Built instead | Backend needed |
|---|---|---|
| "Belum mulai" on every job of today | The state the job really has: Belum dibuka, Siap check-in, Sedang dikerjakan, Waktu check-in lewat, Selesai (follows the clock); the next one also wears "Berikutnya" and the forest edge | None |
| "09.00 - 11.00" | "09.00-11.00 WIB", as everywhere else in the app (no spaced dash; the time zone written) | None |
| "Mendatang" | "Akan datang" (the label the app already used) | None |
| Not in the mock | "Baru selesai": jobs finished in the last day, so a cleaner sees that check-out went through | None |

### One job (`Cleaner-Job`, `Cleaner-Live`), page `/cleaner/jobs/HK-xxxx`

| Mock element | Built instead | Backend needed |
|---|---|---|
| Back link "Pekerjaan hari ini" | "Pekerjaan", the list's own name (it also holds later days) | None |
| "Check-in memberi tahu pelanggan ..., lalu siaran dari kamera ponsel Anda dimulai" | Check-in and the stream stay two steps (T18, T22): after check-in the page offers "Mulai siaran"; the line under the button says the location is recorded once | None |
| Camera preview "Pratinjau kamera ponsel Anda" | A frame that says the stream is running: the stream comes from the clip library, not the phone's camera (docs/adr/0002) | A camera stream source (out of scope, ADR 0002) |
| "Sambungkan ulang siaran" as a fixed button | Shown when the signal is weak or lost (it reports the stream as active again), beside the two "Simulasi" buttons and "Hentikan siaran", which the demo needs | None |
| "Pelanggan: Dewi" only | The customer's name with a phone link ("Telepon"), and the order number | None |
| Not in the mock | A job that is not the cleaner's, or finished more than a day ago, says "Pekerjaan tidak ditemukan" (`my_jobs` returns only those) | A cleaner read of older jobs, if they should open |

### Account (`Cleaner-Account`), page `/cleaner/account`

| Mock element | Built instead | Backend needed |
|---|---|---|
| "Notifikasi pekerjaan: Aktif" | Left out: the app sends cleaners no notifications | Job notifications for cleaners (push or email) and a setting to turn them off |
| "Izin kamera dan lokasi: Diizinkan" | "Izin lokasi", read from the browser (Diizinkan, Ditanya saat check-in, Ditolak with how to allow it); the camera is not used (ADR 0002) | None |
| "Bahasa: Indonesia" | The page's language as text; it is changed with the ID / EN switch in the bar | None |
| "Hubungi admin HomeKlin" | Left out: support chat is for customers only (B13 approved customers only) and there is no help page for cleaners | Cleaner tickets (B13 for cleaners, not approved) |

### Menu and shell

| Mock element | Built instead | Backend needed |
|---|---|---|
| Bottom navigation Beranda, Pekerjaan, Riwayat, Akun | Beranda, Pekerjaan, Akun. "Riwayat" is left out: `my_jobs` returns only today's and later jobs and those finished in the last day, so there is no history to show | A cleaner read of finished jobs (for example `my_past_jobs(p_days)`) |
| App bar with the wordmark and the language switch only | The wordmark, the "Petugas" badge (T5: says which mode the user is in) and the switch; from 768 px the sections and the account chip join the bar | None |

## Customer

Pass 5a built in D5 (2026-11-15): the booking flow, the home and the orders. Mocks: `Main` and `Phone-Services`, `Customer-Booking` and `Phone-Booking`, `Customer-Payment` and `Phone-Payment`, `Customer-Confirmed` and `Phone-Confirmed`, `Customer-Orders` and `Phone-Orders`, `Customer-Home` and `Phone-Home`. Pass 5b (live, replay, support and guest chat, the `/o/<token>` page, the emails, the landing) follows. The `(customer)` layout now wears `theme-forest` with the redesign's fonts and the forest shell, so the pages of 5b already sit on the cream page with their old components until then. Pages: step 1 `/services`, step 2 `/pesan`, step 3 `/orders?booked=<id>` (payment, then the confirmation), an order's page `/orders?order=<id>`, the list `/orders`, the home `/home`. Backend used: `slot_windows` with `is_full` and the `serviceId` option (B11, B12), the form field `note` (B7), `order_code` (B1), `payment_type` as `paymentMethod` (B8), `resendOrderEmail` (B9), `assigned_at`, `checked_in_at`, `completed_at` (B3), the cleaner's name and photo.

### Shell (all customer pages)

| Mock element | Built instead | Backend needed |
|---|---|---|
| Marketing-style top bar (Layanan, Cara kerja, Keamanan, Bantuan) and a menu button on phones | The app shell in its forest tone: Beranda, Layanan, Pesanan, Bantuan, Akun in the bar from 768 px and in the bottom navigation on phones (customer pages are mobile-first with a bottom bar); the bar is as wide as the mocks' 1200 px column | None |
| Footer "Bantuan, Kebijakan privasi, Syarat layanan" | Left out on the app pages, as before (the landing page has the footer) | None |
| "CONTOH" badge beside the titles | Left out: the pages show real data | None |

### Step 1, service and time (`Main`, `Phone-Services`), page `/services`

| Mock element | Built instead | Backend needed |
|---|---|---|
| Four services | Every active service, with the search and the type filter of T8 kept above the cards (the mock has neither; dropping them would drop a tested feature); each card keeps its rating and latest reviews (T30) | None |
| "Pesan sekarang" always on | Disabled until a service is chosen, with "Pilih layanan dulu untuk melanjutkan." under it; without a time, step 2 asks for one | None |
| Times for the chosen service | Yes (B12); before a service is chosen, the area's times over every service | None |
| Without JavaScript | The step is one GET form to `/pesan`; switching the day needs JavaScript (the first day's times show) | None |

### Step 2, details (`Customer-Booking`, `Phone-Booking`), page `/pesan`

| Mock element | Built instead | Backend needed |
|---|---|---|
| "Sekali / Berulang" (recurring bookings) | Left out: not approved (Phase 15 B14) | Recurring bookings (schedule, payment per visit) |
| "Nama lengkap" field | Left out: `book_slot` takes no name; a guest's account gets its name later on the account page | A name argument on `book_slot` or on the code sign-in |
| Service shown only in the summary with "Ubah" | The "Layanan" card with its select stays (the landing's links and the old `/book` address open step 2 directly), and "Ubah" in the summary leads back to step 1 with the choice | None |
| Date as a calendar input | A select of the days that have free times, then that day's chips; the area select stays in the same card ("Area dan jadwal") | None |
| Consent as a checkbox | The switch of T9 (the same field `consent`) | None |
| "Lanjut ke pembayaran" for everyone | A signed-in customer: "Lanjut ke pembayaran". A guest: "Kirim kode" first, then "Lanjut ke pembayaran" on the code step (the emailed code places the order and makes the account) | None |
| "... dikirim ke nadia.putri@email.id" | The note without the address (a guest types it below; a signed-in customer sees it on the form) | None |
| Times for the chosen service | The service in the address decides the windows (B12); changing the service on step 2 keeps them, and booking checks the agency again | None |

### Step 3, payment (`Customer-Payment`, `Phone-Payment`), page `/orders?booked=<id>`

| Mock element | Built instead | Backend needed |
|---|---|---|
| Choosing QRIS, virtual account or card on the page | The ways to pay as information ("Cara membayar"); the choice is made on Midtrans' Snap page | `enabled_payments` passed to Snap (B8, optional, not built) |
| "Kembali ke detail pemesanan" | "Lihat detail pesanan" (the order is made already; step 2 cannot edit it), and "Kembali ke daftar pesanan" above the steps | Editing an unpaid order |
| "Email" in the summary | Order number, service, time, area and address | None |
| Not in the mock | A failed or cancelled order shows its status here with "Pesan lagi" instead of the button; back from Midtrans, "Pembayaran sedang dikonfirmasi" until the signed notification arrives | None |

### Confirmation (`Customer-Confirmed`, `Phone-Confirmed`), the same page once paid

| Mock element | Built instead | Backend needed |
|---|---|---|
| "Kami mengirim detail pesanan dan profil Petugas HomeKlin ke ..." | "Detail pesanan dikirim ke email Anda, dan nama serta foto Petugas HomeKlin menyusul setelah ditugaskan" (no cleaner is known at payment; B9 emails them on assignment) | None |
| "Dibayar" pill | "Sudah dibayar", the app's status word | None |
| Not in the mock | "Lihat pesanan" to the order's page | None |

### Order page (`Customer-Orders`, `Phone-Orders`), page `/orders?order=<id>`

| Mock element | Built instead | Backend needed |
|---|---|---|
| "Dibayar, Senin, 2 Nov, 13.20" | "Dibayar" without a time: the payment time is not stored | `orders.paid_at` set from the notification |
| Steps Dipesan, Dibayar, Check-in, Sedang berlangsung, Selesai | The same plus "Petugas ditugaskan" (B3); each step's state is also written for screen readers | None |
| Hero for every order | Only for a paid order; one waiting for payment shows the steps and "Bayar sekarang" in its details | None |
| Not in the mock | The live view (T23), the recording (T15) and the review (T30) on the same page, in white frames (restyled in 5b) | None |

### Home and orders (`Customer-Home`, `Phone-Home`), pages `/home` and `/orders`

| Mock element | Built instead | Backend needed |
|---|---|---|
| "Putar ulang rekaman" button on a past order | Each order is one link to its page, where the player is; the card says until when the recording is kept | None |
| `/home` shows only "Pesanan Anda" | For a signed-in customer `/home` is "Pesanan Anda" with the latest 3 orders and "Lihat semua pesanan"; for a visitor (and staff) it is where to start: the area, which opens step 1, and the services. The sample job of T7 is gone | None |

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

## Partner agency

Where a partner mock shows something the app cannot do or has no data for. For each: the mock element, what was built instead, and what the backend would need.

Wired to the Phase 15 backend on 2026-11-14: order numbers, the agency's fee ("perkiraan" until check-out) and the customer's note on the incoming jobs, the order pages and the completed orders (B1, B4, B7), the assignment time (B3), the services choice (B12) and each cleaner's phone and area (B11). The order_fees read blocker found in D2 was fixed in `20261114160000_agency_fee_reads.sql`.

### Partner-Summary (Ringkasan)

| Mock element | Built instead | Backend needs |
|---|---|---|
| "naik 6% dari 30 hari sebelumnya" under the total | A plain hint ("dari pekerjaan selesai 30 hari terakhir") | Exists since B5 (`agency_summary` returns `previous_total_fee_idr`); the page does not show it yet (not in this wiring step) |
| "Data per 5 Nov 2026" in the description | Left out | Nothing; the numbers are live, so no "as of" date is needed |
| Service names per service | Built, in both languages from the catalog | `agency_fees_by_service` returns `name_id` only; fine as it is |

### Partner-Jobs (Pekerjaan masuk)

| Mock element | Built instead | Backend needs |
|---|---|---|
| "Contoh" label next to the title | Left out | Nothing; the list is real data |

### Partner-Job and Partner-Job-Done (order detail)

| Mock element | Built instead | Backend needs |
|---|---|---|
| "Ditugaskan 08.30" on an order assigned before B3 | "Sudah" without a time: `assigned_at` is empty on orders assigned before it was recorded | Nothing; every new assignment has its time |
| A red "LIVE" dot on the video | The calm live pill with the breathing green dot, as `markdown/design.md` requires (never a red REC dot) | Nothing; design decision |
| A placeholder with a play button and "Putar rekaman" | The real player with its controls, playing the recording link the server made for this agency | Nothing |
| Address hidden on the order page (the mock shows only the area) | Area and address both shown, as on the old orders list: the agency dispatches its cleaner there | Nothing; say if the address should be hidden |

### Partner-Past (Pesanan selesai)

| Mock element | Built instead | Backend needs |
|---|---|---|
| Not in the mock | A finished job without a fee row (older test data) shows the expected fee marked "perkiraan" | Nothing; `check_out` writes the real fee |

### Partner-Cleaners (Petugas dan ketersediaan)

| Mock element | Built instead | Backend needs |
|---|---|---|
| "Area" per cleaner, "Jakarta Selatan, Jakarta Pusat" (two areas) | One area per cleaner, chosen from the agency's own areas, with the phone, in an edit row under the cleaner | `cleaners.area_id` holds one area (B11); several areas per cleaner would need a `cleaner_areas` table |
| Status "Libur" (day off) | "Sedang bertugas" (checked in at a job now) or "Tidak sedang bertugas" | Cleaners have no availability of their own |
| "Atur jadwal" per cleaner | One "Atur jadwal" for the agency's whole schedule (`/agency/schedule`) | Availability is kept per window and area as a number of places (`availability_slots.capacity`), not per cleaner |
| Week grid with "2 petugas" and a tooltip naming the cleaners | Read-only grid of the week's windows: "2 dari 3 kosong", "Penuh" or "Tutup", per start time and day, all areas added up; changing windows stays on the Jadwal page | Per-cleaner availability (see above) to name who is free; clicking a cell to open or close it needs no backend change (the Jadwal page's add and remove actions exist) but was left for a later pass |
| "Tambah petugas" opens a form | The header button jumps to the existing add-cleaner form at the end of the page | Nothing |

### Partner-Videos (Video petugas)

| Mock element | Built instead | Backend needs |
|---|---|---|
| Not in the mocks' menu | Kept in the menu as "Video petugas" (sixth item), so live views and recordings stay reachable; the same choice as the admin menu keeping "Rekaman" | Nothing; decision for the user |
| "Petugas" filter (select) | Left out | Nothing; a `?cleaner=` filter on the page is possible later |
| Order number on each live card | Not shown on the agency's live tiles | `live_streams()` already returns it; a small UI change |

### Partner-Services (Layanan)

| Mock element | Built instead | Backend needs |
|---|---|---|
| Not in the mock | "Tawarkan semua layanan, juga layanan baru dari HomeKlin" in the edit mode: the agency's state before it ever chose (`offerAll`), so new services are offered without a visit | Nothing; decision for the user whether to keep it |
| "Imbalan agensi (70%)" column | Left out | The agency cannot read its own `payout_percent` (agencies table is closed to `authenticated`); `my_agency()` could return it |
| Draft service "Cuci Kasur, belum tersedia" (shown, not choosable) | Left out: `agency_service_choices()` and the public catalog list active services only | `agency_service_choices()` returning draft services too (with `is_active`), if the user wants agencies to see what is coming |

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

Pass 5a built in D5 (2026-11-15): the booking flow, the home and the orders. Mocks: `Main` and `Phone-Services`, `Customer-Booking` and `Phone-Booking`, `Customer-Payment` and `Phone-Payment`, `Customer-Confirmed` and `Phone-Confirmed`, `Customer-Orders` and `Phone-Orders`, `Customer-Home` and `Phone-Home`. The `(customer)` layout wears `theme-forest` with the redesign's fonts and the forest shell; pass 5b (below) finished the remaining customer pages. Pages: step 1 `/services`, step 2 `/pesan`, step 3 `/orders?booked=<id>` (payment, then the confirmation), an order's page `/orders?order=<id>`, the list `/orders`, the home `/home`. Backend used: `slot_windows` with `is_full` and the `serviceId` option (B11, B12), the form field `note` (B7), `order_code` (B1), `payment_type` as `paymentMethod` (B8), `resendOrderEmail` (B9), `assigned_at`, `checked_in_at`, `completed_at` (B3), the cleaner's name and photo.

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
| "Pesan sekarang" always on | Always on again since the booking-flow fixes (2026-11-16): pressed without a service, "Pilih salah satu layanan untuk melanjutkan." shows by the services and the cursor goes to the first one; without a time, step 2 asks for one | None |
| Times for the chosen service | Yes (B12); before a service is chosen, the area's times over every service | None |
| Without JavaScript | The step is one GET form to `/pesan`; switching the day needs JavaScript (the first day's times show) | None |

### Step 2, details (`Customer-Booking`, `Phone-Booking`), page `/pesan`

| Mock element | Built instead | Backend needed |
|---|---|---|
| "Sekali / Berulang" (recurring bookings) | Left out: not needed (user, 2026-11-16) | None |
| "Nama lengkap" field | Left out: `book_slot` takes no name; a guest's account gets its name later on the account page | A name argument on `book_slot` or on the code sign-in |
| Service shown only in the summary with "Ubah" | Since 2026-11-16: a valid choice from step 1 shows once, as the read-only card "Layanan dan jadwal" (see below); the "Layanan" select and the "Area dan jadwal" pickers show only when the address lacks a valid choice (the landing's links, a time that is gone) | None |
| Date as a calendar input | A select of the days that have free times, then that day's chips; the area select stays in the same card ("Area dan jadwal") | None |
| Consent as a checkbox | The switch of T9 (the same field `consent`) | None |
| "Lanjut ke pembayaran" for everyone | A signed-in customer: "Lanjut ke pembayaran". A guest: "Kirim kode" first, then "Lanjut ke pembayaran" on the code step (the emailed code places the order and makes the account) | None |
| "... dikirim ke nadia.putri@email.id" | The note without the address (a guest types it below; a signed-in customer sees it on the form) | None |
| Times for the chosen service | The service in the address decides the windows (B12); since 2026-11-16 a new service on step 2's select reads the page again with it, so its own times follow; booking checks the agency again | None |

### Step 3, payment (`Customer-Payment`, `Phone-Payment`), page `/orders?booked=<id>`

| Mock element | Built instead | Backend needed |
|---|---|---|
| Choosing QRIS, virtual account or card on the page | Since 2026-11-16 one plain line in the order card ("Cara membayar: QRIS, virtual account, ...; Anda memilih caranya di halaman Midtrans"), so nothing looks like a choice; the choice is made on Midtrans' Snap page | `enabled_payments` passed to Snap (B8, optional, not built) |
| "Kembali ke detail pemesanan" | "Lihat detail pesanan" (the order is made already; step 2 cannot edit it), and "Kembali ke daftar pesanan" above the steps | Editing an unpaid order |
| "Email" in the summary | Order number, service, time, area and address | None |
| Not in the mock | A failed or cancelled order shows its status here with "Pesan lagi" instead of the button; back from Midtrans, "Pembayaran sedang dikonfirmasi" until the signed notification arrives | None |

### Booking-flow fixes after the Impeccable critique (2026-11-16), steps 1 to 3

The user chose to fix the critique's five priority issues and allowed departures from the mocks. Each departure:

| Mock element | Built instead | Backend needed |
|---|---|---|
| Step 2 "Layanan" card with the service, and the area and date pickers, also when step 1 chose them | One read-only card "Layanan dan jadwal" (picture, name, duration, price, area, day and time range) with "Ubah" back to step 1, which opens with the same choice; the pickers stay for an address without a valid choice | None |
| Nothing kept when going back a step | "Ubah" keeps the typed address, note, phone and guest email in the tab's sessionStorage and fills them in again when step 2 opens (read once, then removed; never the consent, never in the address or on the server) | None |
| Step 1 chips with the start time only ("10.00", "15.00, penuh"); step 2 chips as ranges, full times left out | One chip on both steps: the range "10.00-12.00"; a full time shown disabled with "penuh" written under it, also a time taken while step 2 was open | None |
| Service select options "Pembersihan Rutin · Rp 85.000" | Names only (the price was cut off by the arrow at 360 px); the price shows under the select with the service's picture | None |
| Day select "Besok, Senin 16 November" | Short day names ("Besok, Sen 16 Nov", "Tomorrow, Mon 16 Nov") and a wider select, so nothing is cut off at 360 px or in English | None |
| Step 2 button disabled until the consent is on, hint "... di atas" | The button always works; without the consent the switch shows "Nyalakan persetujuan siaran untuk memesan." and gets the cursor (the server's check, as before). The hint under the button says "Nyalakan persetujuan siaran untuk melanjutkan." with a link to the switch | None |
| Order of step 2's cards: service, area and time, address, contact, live stream | Choice, address, live stream (with the consent), contact: the consent sits next to the home it is about | None |
| Not in the mocks | On phones (below 768 px) steps 1 and 2 have a bar above the bottom menu with the service, the time, the price and the step's button; it steps aside while the step's own button is on screen | None |
| "Petugas HomeKlin check-in di alamat Anda" note under the summary (step 1) | One fact line under the title of steps 1 and 2: "Petugas HomeKlin check-in di alamat Anda, dan hanya Anda serta tim pemantau HomeKlin yang dapat menonton siarannya." The critique's wording ("hanya Anda yang menonton") was not used: the monitoring team can watch too | None |
| Grey note panels (sunken) | White panels with a hairline and a lime-wash icon, ink text | None |
| "Tidak perlu membuat akun" on steps 1 and 2 for everyone | Only for a guest: the step 1 note for a signed-in customer reads "Alamat dan nomor HP Anda diisi di langkah berikutnya."; step 2's title text no longer says it (the guest's email hint does) | None |
| Step 3: four method cards, a sandbox banner above, "Bayar sekarang" forest | The order card holds until when the time is held ("Jadwal ini kami simpan sampai pukul 14.20 WIB", 2 hours after ordering, and that the Midtrans page lasts 60 minutes), the simulation note, the lime "Bayar sekarang" and the methods line; the main column says "Setelah membayar" in the confirmation's three steps; the email note beside it is gone (it is step 1 of that list) | None. The hold is enforced lazily: `release_unpaid_orders()` runs when someone books and in the daily cron, so an unpaid order can stay "Menunggu pembayaran" past the time shown until then |
| Steps on two lines at 360 px ("Bayar" alone) | One line down to 360 px, "Langkah 2 dari 3" under it | None |

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
| Not in the mock | The live view (T23), the recording (T15) and the review (T30) on the same page, in white frames; the live view and the recordings also have pages of their own (5b) | None |

### Home and orders (`Customer-Home`, `Phone-Home`), pages `/home` and `/orders`

| Mock element | Built instead | Backend needed |
|---|---|---|
| "Putar ulang rekaman" button on a past order | Each order is one link to its page, where the player is; the card says until when the recording is kept | None |
| `/home` shows only "Pesanan Anda" | For a signed-in customer `/home` is "Pesanan Anda" with the latest 3 orders and "Lihat semua pesanan"; for a visitor (and staff) it is where to start: the area, which opens step 1, and the services. The sample job of T7 is gone | None |

Pass 5b built in D5 (2026-11-15): live, recordings, help and the guest chat, the order-link page, the emails, the landing page, and the account page. Mocks: `Customer-Live` and `Phone-Live`, `Customer-Replay` and `Phone-Replay`, `Customer-Support` and `Phone-Support`, `Customer-Chat` and `Phone-Chat`, `Customer-Email-Order` and `Phone-Email-Order`, `Customer-Email-Replay` and `Phone-Email-Replay`, `Landing` and `Phone-Landing`. New pages: `/orders/recording?order=<id>` (recordings) and `/o/<token>` (order link). Backend used: `watchStream` (unchanged), `recordingLink` (unchanged), the guest chat actions and `getGuestTicket` (B13), the read times `customer_read_at` and `admin_read_at`, `getOrderByLink` (B14a), the B9 senders.

### Live view (`Customer-Live`, `Phone-Live`), page `/orders/live?order=<id>`

| Mock element | Built instead | Backend needed |
|---|---|---|
| "LIVE" badge with a red dot | The existing live pill, in words ("Siaran langsung", the stream's state Aktif, Sinyal lemah or Terputus), never a red REC dot (markdown/design.md) | None |
| "Hanya Anda dan tim HomeKlin yang dapat menonton" | "Hanya Anda dan tim pemantau HomeKlin" (the decision in Progress.md), also on the order page and step 1 | None |
| Status steps "Dipesan dan dibayar, Petugas check-in, Sedang berlangsung, Selesai" | The order page's six steps (Dipesan, Dibayar, Petugas ditugaskan, Check-in, Sedang berlangsung, Selesai) | None |

### Recordings (`Customer-Replay`, `Phone-Replay`), page `/orders/recording?order=<id>`

| Mock element | Built instead | Backend needed |
|---|---|---|
| A custom player (big lime play button, a timeline 0:00 to 1:58:00) | The browser's own player in the frame (keyboard and captions settings come with it), with until when it is kept and the countdown below | None |
| "Tersedia 7 hari" and "Dihapus otomatis Kamis, 12 Nov 2026" chips | "Tersedia sampai ..." and the countdown of T15 | None |
| Title line "09.04 sampai 11.02" | Check-in to check-out times, when both are known | None |
| Not in the mock | Reached from the order page ("Buka halaman rekaman"), "Pesanan Anda" ("Lihat semua rekaman") and the live page after the job | None |

### Help and chat (`Customer-Support`, `Phone-Support`, `Customer-Chat`, `Phone-Chat`), page `/support`

| Mock element | Built instead | Backend needed |
|---|---|---|
| "Chat dengan admin" goes straight to a chat | For a visitor: a short form (name, email optional, the question carried over from the search), then the chat; a browser with an open guest chat gets "Lanjutkan chat Anda". A signed-in customer keeps the T20 form (urgency, related order) and their own ticket list | None |
| Header "Admin HomeKlin" | "Tim HomeKlin" (the name the chat already used); the region is still "Percakapan dengan Tim HomeKlin" | None |
| "Admin membalas setiap hari, 08.00 sampai 20.00" | Left out: no support hours are agreed | Support hours from the client |
| Paperclip (attachments) | Left out: chats carry text only | Attachments (storage, size limits, scanning) |
| Double ticks on every own message | "Terkirim" or "Terbaca" in words with one or two ticks, from admin's read time (B13) | None |
| Live updates | A signed-in customer: Realtime ("Tersambung"). A guest: the page asks again every 10 seconds ("Diperbarui otomatis setiap 10 detik"), because Realtime needs a session | Realtime for guests (a signed token per chat) |
| "Ibu Nadia" in admin's reply, the email in the chat | Whatever admin writes; the app adds no names | None |

### Order link (B14a), page `/o/<token>`

| Mock element | Built instead | Backend needed |
|---|---|---|
| Not in the mocks (the emails link "homeklin.id/pesanan/HK-1042") | `/o/<token>` signs the order's customer in and opens their full order page `/orders?order=<id>`, with the live view, the recording and help (user decision 2026-11-16: the account is made when they order, and the email is theirs). Only a customer account is ever signed in this way. A wrong, cancelled or expired link leads to the sign-in page with "Tautan di email ini sudah tidak berlaku". Never cached, no Referer | None |

### Emails (`Customer-Email-Order`, `Customer-Email-Replay`)

| Mock element | Built instead | Backend needed |
|---|---|---|
| Sent at payment with the Petugas | Three emails as before: the confirmation at booking, the Petugas when the agency assigns one, the recording when the cleaner checks out; all in the mock's layout (forest wordmark tile, rows, lime button, the link written out, "Tautan ini khusus untuk Anda" on a private link) | None |
| The home icon in the wordmark tile | A forest tile with an "H" (no image, so mail apps that block images still show it) | None |
| Inter Tight, Inter | Arial: mail apps do not load web fonts reliably | None |
| Recording email: Petugas, check-in and check-out rows | Order number and service; the times are not in the email facts | Check-in and check-out times in `order_email_facts` |
| "Halo, Nadia" | No greeting by name: the email facts hold no customer name | The customer's name in `order_email_facts` |
| "Kepada", "Dari" header block and "CONTOH" | The mail app's own header | None |

### Landing (`Landing`, `Phone-Landing`), page `/`

| Mock element | Built instead | Backend needed |
|---|---|---|
| Copy | Now as in the mock: "Rumah bersih yang bisa Anda tonton langsung", "Layanan Kebersihan HomeKlin", "Cara kerja, dalam lima langkah", the price note and the consent line. Kept by decision: "Pesan sekarang", "tim pemantau HomeKlin", one brand | None |

### Account page, `/account`

| Mock element | Built instead | Backend needed |
|---|---|---|
| No mock | The account card on the forest look (lime-wash avatar, outlined "Keluar"), in the wide column; the code step of the order form and the loading frame (`GateFallback`) on the forest look too. The sign-in page keeps the T3b look (no mock) | None |

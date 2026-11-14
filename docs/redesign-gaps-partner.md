# Redesign gaps: partner agency group (D2)

Where a partner mock shows something the app cannot do or has no data for. For each: the mock element, what was built instead, and what the backend would need. To be merged into `docs/redesign-gaps.md`.

## Blocker found while building

| Mock element | Built instead | Backend needs |
|---|---|---|
| Partner-Summary: every number, chart and the payouts table | The page is built on `agency_summary`, `agency_fees_daily`, `agency_fees_by_cleaner`, `agency_fees_by_service` and `agency_payouts_list`. In the test project an agency session gets "permission denied for table order_fees" from all of them, so the page shows the error notice "Ringkasan imbalan belum bisa dimuat". The same error hides the fee column on "Pesanan selesai" (with an info notice) and the fee on the order page. | `20261111090000_agency_fees.sql` revokes all table rights on `order_fees` and `payouts` from `authenticated`, and the summary functions are SECURITY INVOKER, so RLS never gets a chance. A migration with `grant select on public.order_fees, public.payouts to authenticated;` (RLS still limits each agency to its own rows, the owner to all) fixes it. The T44 tests did not catch it: they check only that agency A cannot see agency B's rows (an empty result also passes when the read fails) and that invalid `p_days` is refused. Needs the user's approval (schema change). |

## Partner-Summary (Ringkasan)

| Mock element | Built instead | Backend needs |
|---|---|---|
| "naik 6% dari 30 hari sebelumnya" under the total | A plain hint ("dari pekerjaan selesai 30 hari terakhir") | `agency_summary` for the period before the chosen one (for example a `p_offset_days` parameter, or a 60/180-day option) |
| "Data per 5 Nov 2026" in the description | Left out | Nothing; the numbers are live, so no "as of" date is needed |
| Daily bars | Built (last 14 days; 7 in the 7-day range), with a sentence for screen readers and a "Lihat angka per hari" table | `agency_fees_daily` groups by the UTC date, not the Jakarta date; a job finished between 00.00 and 07.00 WIB lands on the day before. Use `(o.completed_at at time zone 'Asia/Jakarta')::date` |
| Service names per service | Built, in both languages from the catalog | `agency_fees_by_service` returns `name_id` only; fine as it is |

## Partner-Jobs (Pekerjaan masuk)

| Mock element | Built instead | Backend needs |
|---|---|---|
| "Imbalan agensi" column (Rp 60.000 per job) | Left out of the incoming list | The agency's fee is known only after check-out (`order_fees`). An expected fee needs the order price and the agency's `payout_percent`, which an agency cannot read: `agency_jobs()` could return `price_idr` and the expected fee |
| Order number "HK-1042" on every row | Shown for jobs under way only (from `live_streams()`) | `agency_jobs()` returns no `order_code`; add `o.code` as `admin_jobs()` got in `20261112100000_admin_jobs_code.sql`. Then it can also be searched |
| "Contoh" label next to the title | Left out | Nothing; the list is real data |

## Partner-Job and Partner-Job-Done (order detail)

| Mock element | Built instead | Backend needs |
|---|---|---|
| "Catatan pelanggan" | Left out | Orders have no customer note field (booking has none either) |
| "Ditugaskan 08.30" (time of assignment) | "Ditugaskan: Sudah / Belum" | `orders` has no `assigned_at`; `assign_cleaner()` would have to record it |
| A red "LIVE" dot on the video | The calm live pill with the breathing green dot, as `markdown/design.md` requires (never a red REC dot) | Nothing; design decision |
| A placeholder with a play button and "Putar rekaman" | The real player with its controls, playing the recording link the server made for this agency | Nothing |
| Address hidden on the order page (the mock shows only the area) | Area and address both shown, as on the old orders list: the agency dispatches its cleaner there | Nothing; say if the address should be hidden |

## Partner-Past (Pesanan selesai)

| Mock element | Built instead | Backend needs |
|---|---|---|
| Order number "HK-1019" | Left out | `order_code` in `agency_jobs()` (see above) |
| "Imbalan agensi" per order | Built from `order_fees` (agency's own rows), but hidden today by the grant problem above | The grant migration above |

## Partner-Cleaners (Petugas dan ketersediaan)

| Mock element | Built instead | Backend needs |
|---|---|---|
| "Area" per cleaner | Left out | Cleaners have no area; agencies do (`agency_areas`). A `cleaner_areas` table if cleaners should be limited to areas |
| Status "Libur" (day off) | "Sedang bertugas" (checked in at a job now) or "Tidak sedang bertugas" | Cleaners have no availability of their own |
| "Atur jadwal" per cleaner | One "Atur jadwal" for the agency's whole schedule (`/agency/schedule`) | Availability is kept per window and area as a number of places (`availability_slots.capacity`), not per cleaner |
| Week grid with "2 petugas" and a tooltip naming the cleaners | Read-only grid of the week's windows: "2 dari 3 kosong", "Penuh" or "Tutup", per start time and day, all areas added up; changing windows stays on the Jadwal page | Per-cleaner availability (see above) to name who is free; clicking a cell to open or close it needs no backend change (the Jadwal page's add and remove actions exist) but was left for a later pass |
| "Tambah petugas" opens a form | The header button jumps to the existing add-cleaner form at the end of the page | Nothing |

## Partner-Videos (Video petugas)

| Mock element | Built instead | Backend needs |
|---|---|---|
| Not in the mocks' menu | Kept in the menu as "Video petugas" (sixth item), so live views and recordings stay reachable; the same choice as the admin menu keeping "Rekaman" | Nothing; decision for the user |
| "Petugas" filter (select) | Left out | Nothing; a `?cleaner=` filter on the page is possible later |
| Order number on each live card | Not shown on the agency's live tiles | `live_streams()` already returns it; a small UI change |

## Partner-Services (Layanan)

| Mock element | Built instead | Backend needs |
|---|---|---|
| "Ubah pilihan", a "Ditawarkan" checkbox per service, "Simpan pilihan" | Read-only list of HomeKlin's active services (photo, type, duration, customer price), every row "Ditawarkan", and a note that every active service can be booked in the agency's areas and that choosing is not available yet | An `agency_services` table, a write action and RLS, and routing (`book_slot` / `free_slots`) that only offers an agency's windows for the services it offers |
| "Imbalan agensi (70%)" column | Left out | The agency cannot read its own `payout_percent` (agencies table is closed to `authenticated`); `my_agency()` could return it |
| Draft service "Cuci Kasur, belum tersedia" | Left out: the agency reads the public catalog, which has active services only | An agency-readable list of draft services, if the user wants agencies to see what is coming |

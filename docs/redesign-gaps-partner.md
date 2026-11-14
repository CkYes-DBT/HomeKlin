# Redesign gaps: partner agency group (D2)

Where a partner mock shows something the app cannot do or has no data for. For each: the mock element, what was built instead, and what the backend would need. To be merged into `docs/redesign-gaps.md`.

Wired to the Phase 15 backend on 2026-11-14: order numbers, the agency's fee ("perkiraan" until check-out) and the customer's note on the incoming jobs, the order pages and the completed orders (B1, B4, B7), the assignment time (B3), the services choice (B12) and each cleaner's phone and area (B11). The order_fees read blocker found in D2 was fixed in `20261114160000_agency_fee_reads.sql`.

## Partner-Summary (Ringkasan)

| Mock element | Built instead | Backend needs |
|---|---|---|
| "naik 6% dari 30 hari sebelumnya" under the total | A plain hint ("dari pekerjaan selesai 30 hari terakhir") | Exists since B5 (`agency_summary` returns `previous_total_fee_idr`); the page does not show it yet (not in this wiring step) |
| "Data per 5 Nov 2026" in the description | Left out | Nothing; the numbers are live, so no "as of" date is needed |
| Service names per service | Built, in both languages from the catalog | `agency_fees_by_service` returns `name_id` only; fine as it is |

## Partner-Jobs (Pekerjaan masuk)

| Mock element | Built instead | Backend needs |
|---|---|---|
| "Contoh" label next to the title | Left out | Nothing; the list is real data |

## Partner-Job and Partner-Job-Done (order detail)

| Mock element | Built instead | Backend needs |
|---|---|---|
| "Ditugaskan 08.30" on an order assigned before B3 | "Sudah" without a time: `assigned_at` is empty on orders assigned before it was recorded | Nothing; every new assignment has its time |
| A red "LIVE" dot on the video | The calm live pill with the breathing green dot, as `markdown/design.md` requires (never a red REC dot) | Nothing; design decision |
| A placeholder with a play button and "Putar rekaman" | The real player with its controls, playing the recording link the server made for this agency | Nothing |
| Address hidden on the order page (the mock shows only the area) | Area and address both shown, as on the old orders list: the agency dispatches its cleaner there | Nothing; say if the address should be hidden |

## Partner-Past (Pesanan selesai)

| Mock element | Built instead | Backend needs |
|---|---|---|
| Not in the mock | A finished job without a fee row (older test data) shows the expected fee marked "perkiraan" | Nothing; `check_out` writes the real fee |

## Partner-Cleaners (Petugas dan ketersediaan)

| Mock element | Built instead | Backend needs |
|---|---|---|
| "Area" per cleaner, "Jakarta Selatan, Jakarta Pusat" (two areas) | One area per cleaner, chosen from the agency's own areas, with the phone, in an edit row under the cleaner | `cleaners.area_id` holds one area (B11); several areas per cleaner would need a `cleaner_areas` table |
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
| Not in the mock | "Tawarkan semua layanan, juga layanan baru dari HomeKlin" in the edit mode: the agency's state before it ever chose (`offerAll`), so new services are offered without a visit | Nothing; decision for the user whether to keep it |
| "Imbalan agensi (70%)" column | Left out | The agency cannot read its own `payout_percent` (agencies table is closed to `authenticated`); `my_agency()` could return it |
| Draft service "Cuci Kasur, belum tersedia" (shown, not choosable) | Left out: `agency_service_choices()` and the public catalog list active services only | `agency_service_choices()` returning draft services too (with `is_active`), if the user wants agencies to see what is coming |

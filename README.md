# Race Management PWA (MVP)

Offline-first Progressive Web App for outdoor race events (trail running / MTB / orienteering-style). It supports athlete registration, race-day QR checkpoint timing, strict anti-cheat route enforcement (stages + blocks), and results that transition from **provisional** (device/offline + sync) to **official** (server-validated).

## What this is

This repo is an MVP implementation of an “operate-from-a-phone” race timing system:

- **Athletes** use a phone to scan QR checkpoints (Start / Checkpoints / Finish).
- **Race Mode** is a high-contrast, full-screen UI designed for outdoor readability and minimal taps.
- The app works **offline-first** during the race and syncs scans when connectivity returns.
- Route integrity is enforced locally (to prevent accidental/intentional out-of-order scanning), and **official results** are only produced after server-side validation.

## Tech

- React + TypeScript + Vite
- Tailwind CSS
- PWA (manifest + service worker) via `vite-plugin-pwa`
- Offline storage: IndexedDB via `idb`
- Backend: Supabase (Auth + Postgres + Realtime + Edge Functions)
- QR scanning: `html5-qrcode`

## Key flows

- **Public**: event info + registration + live results + projector board
- **Athlete**: login → register → load Bib QR → Race Mode (scan Start/CP/Finish)
- **Staff**: check-in tooling (basic MVP)
- **Admin**: schema + functions are in place; UI is currently a skeleton

## Local dev

1. Install deps

   - `npm install`

2. Create env file

   - Copy `.env.example` to `.env.local`
   - Fill:
     - `VITE_SUPABASE_URL`
     - `VITE_SUPABASE_ANON_KEY`
     - `VITE_QR_VERIFY_PUBLIC_KEY_B64` (Ed25519 public key, base64)

   Localhost verification (no Supabase required):

   - Set `VITE_LOCAL_AUTH=1`
   - Optional: set `VITE_LOCAL_AUTH_AUTO_ADMIN=1` to auto-sign-in on start
   - Demo credentials:
     - Email: `admin@admin.com`
     - Password: `123456789@`

3. Run

   - `npm run dev`

Other useful commands:

- `npm run build`
- `npm run preview`

## Supabase setup (schema + functions)

- SQL migration: `supabase/migrations/20260314_init.sql`
- Edge Functions:
  - `race-package` (download athlete’s route stages for offline mode)
  - `ingest-scan` (upload scan events + provisional results)
  - `validate-finish` (server-side revalidate scan log → official/incomplete)
  - `register-for-event` (registration form handler)
  - `sign-qr` (admin-only QR signer)

Recommended workflow:

- Create a Supabase project
- Apply the migration via Supabase SQL editor (or Supabase CLI)
- Deploy edge functions
- Configure env for functions:
  - `QR_SIGNING_PRIVATE_KEY_B64` (32-byte seed base64, admin-only)

## QR format + signatures

Checkpoint and Bib QRs are expected to be **signed**. The client verifies signatures before accepting scans.

- Token format: `RM1.<payloadB64Url>.<sigB64Url>`
- Signature: Ed25519
- Verify key is configured via `VITE_QR_VERIFY_PUBLIC_KEY_B64`

The `sign-qr` edge function signs payloads for printing/issuance (admin-only).

## Race Mode behavior

- Offline-first: scans are written to IndexedDB immediately, then synced via a queue when online.
- Strict route engine: stages and blocks are enforced on-device (wrong/early scans are rejected and logged).
- Recovery: if a race is active, reopening the PWA auto-returns to Race Mode.
- Accidental-exit protection: blocks back/close during racing, and uses long-press+confirm to exit.

## Repo map (high level)

- `src/pages/athlete/RaceModePage.tsx`: primary race-day screen
- `src/race/routeEngine.ts`: stage/block progression rules
- `src/offline/*`: IndexedDB schema + local repository
- `src/sync/*`: sync queue processor (Edge Function calls)
- `supabase/migrations/*`: Postgres schema + RLS
- `supabase/functions/*`: Edge Functions used by the app

## Notes

- Provisional results are derived from synced scans; official results only after server-side validation.
- Node: Vite 7 tooling expects Node >= 20.19 (Node 20.17 may work but is not guaranteed).

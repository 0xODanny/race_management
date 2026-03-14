# Race Management PWA (MVP)

Offline-first PWA for outdoor race events (trail running / MTB / orienteering-style): athlete registration, race-day QR checkpoint timing, strict anti-cheat route enforcement (stages + blocks), live/provisional vs official results, staff check-in tools, and admin management.

## Tech

- React + TypeScript + Vite
- Tailwind CSS
- PWA (manifest + service worker) via `vite-plugin-pwa`
- Offline storage: IndexedDB via `idb`
- Backend: Supabase (Auth + Postgres + Realtime + Edge Functions)
- QR scanning: `html5-qrcode`

## Local dev

1. Install deps

   - `npm install`

2. Create env file

   - Copy `.env.example` to `.env.local`
   - Fill:
     - `VITE_SUPABASE_URL`
     - `VITE_SUPABASE_ANON_KEY`
     - `VITE_QR_VERIFY_PUBLIC_KEY_B64` (Ed25519 public key, base64)

3. Run

   - `npm run dev`

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

## Race Mode behavior

- Offline-first: scans are written to IndexedDB immediately, then synced via a queue when online.
- Strict route engine: stages and blocks are enforced on-device (wrong/early scans are rejected and logged).
- Recovery: if a race is active, reopening the PWA auto-returns to Race Mode.
- Accidental-exit protection: blocks back/close during racing, and uses long-press+confirm to exit.

## Notes

- Provisional results are derived from synced scans; official results only after server-side validation.
- Node: Vite 7 tooling expects Node >= 20.19 (Node 20.17 may work but is not guaranteed).

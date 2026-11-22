# SOOULL

SOOULL is a private, web-first platform for preserving personal stories, legacy records, important information, trusted contacts, private files and an explicitly consented AI Legacy companion.

**Production:** https://sooull.vercel.app/  
**Repository:** https://github.com/sahrrichardm-star/SOOULL  
**Production branch:** `main`

## Technology

- React 19, TypeScript and Vite
- Vercel for production hosting and GitHub-connected deployments
- Supabase Auth, PostgreSQL, Row Level Security, Storage and Edge Functions
- Private Storage bucket: `private-assets`
- Vercel AI Gateway for server-side AI Legacy inference

Cloudflare Worker configuration remains in the repository for reference, but Cloudflare Workers is not the production hosting target.

## Local development

Requirements: Node.js 24 or later and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set these Vite build-time variables in `.env.local`:

- `VITE_SUPABASE_URL` — the SOOULL Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` — the Supabase publishable key

A legacy anon key is supported as a fallback. Never put a Supabase secret key or service-role key in a browser environment variable, source file, or Git commit.

Build locally:

```bash
npm run build
```

## Production deployment

The `main` branch is connected to the Vercel project `sooull`. Pushes to `main` trigger production deployments.

Required Vercel Production environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

After changing Vercel environment variables, redeploy so the Vite client bundle is rebuilt.

The repository commits `package-lock.json` for reproducible dependency installs. GitHub Actions at `.github/workflows/ci.yml` uses `npm ci`, runs `npm audit` and builds plus smoke-tests the production bundle.

## SOOULL central backend

Customer and administrator frontends remain separate deployments. Their authenticated server-side operations now enter through the single `sooull-api` Edge Function gateway in the primary Supabase project. The gateway accepts only an explicit service allowlist, requires a signed-in JWT, restricts browser origins, limits JSON payloads to 1 MB, and forwards the original user token to the relevant internal service. It never exposes service-role credentials to either browser.

Current internal services routed by the gateway: `admin-overview`, `admin-management`, `persona-chat`, and `delete-account`. Existing service-level authorization, MFA, RLS, and fresh-auth checks remain in force. This is the first consolidation phase: the gateway centralizes the public backend entry point while the existing internal service implementations are retained for a safe migration. The next phase is to move shared business logic into versioned server modules behind this gateway and retire duplicate public entry points only after end-to-end verification.

The application uses the existing SOOULL Supabase project.

- Auth: email/password, Google OAuth, email confirmation and password reset
- Database: user-owned Stories, Legacy, Safekeeping, Profiles, Assets, Wallet records, Trusted People and AI Legacy records
- Storage: private `private-assets` bucket with owner-folder policies
- Edge Functions: `persona-chat` and `delete-account`

Apply database changes through reviewed SQL migration files in `supabase/migrations/`. Do not bypass migrations with ad hoc production DDL. Keep service-role credentials server-side only.

### Authentication redirects

In Supabase Dashboard → Authentication → URL Configuration:

- Set the Site URL to `https://sooull.vercel.app`.
- Include the production redirect URL `https://sooull.vercel.app/**`.
- Add any approved preview or custom-domain redirects only when those environments are in use.

The app uses the current site origin for email confirmation and password-reset redirects.

### AI Legacy server configuration

AI Legacy does not send model keys to the browser. To enable response generation, configure these secrets in Supabase Dashboard → Edge Functions → Secrets:

- `AI_GATEWAY_API_KEY`
- `AI_GATEWAY_MODEL`

Never paste secrets into chat, commit them, or expose them through `VITE_*` variables. AI Legacy is disabled after a data restore until its settings are reviewed. Consent records are never imported or overwritten by a backup restore.

### Auth security settings

Enable Supabase Auth → Password Security → Leaked Password Protection. The Supabase Security Advisor currently reports this setting as disabled until an administrator enables it.

## Application modules

- **Stories:** private personal memories and life events
- **Legacy:** values, lessons, wishes and letters
- **Safekeeping:** important records and review reminders
- **Assets & Wallet:** private photos, PDFs, CSV and spreadsheet/office documents, audio/video files, recordings and personal financial references (100 MB per file)
- **AI Legacy:** consent-controlled text companion based only on explicitly approved sources
- **Trusted People:** private emergency and trusted-contact records; these contacts do not receive account access
- **Account:** profile, avatar, email/password management, MFA and account deletion

Wallet records are personal references and document links. They are not a live bank connection or a regulated payment wallet. Never store full card numbers, CVVs, PINs, passwords or bank login credentials.

AI Legacy currently supports text-based responses only. Voice recordings are stored as private user files; voice cloning and likeness generation are not enabled.

## Backups and restoration

The Account header provides **Export ZIP backup** and **Restore backup**.

- Backup format: SOOULL ZIP version 5; restore also accepts supported version 3 and 4 archives.
- Includes profile information, collections, private asset binaries, wallet records, trusted contacts and AI Legacy history.
- Browser archive limit: 250 MB total payload; individual private files are limited by the Storage bucket.
- Restore merges records by their IDs. Matching records are updated; unrelated existing records are kept.
- Profile fields may be updated by a restore.
- AI Legacy consent is never imported or overwritten. AI Legacy remains disabled after restore until its settings are reviewed and saved.
- Restore is performed in batches. If an error occurs after some database batches have committed, rerunning the same backup is designed to be safe.

Backups contain sensitive personal information. Store them in a secure location and do not share them publicly.

## Security and privacy model

- Row Level Security is enabled on application tables.
- Owner policies restrict records to the authenticated user.
- MFA-aware restrictive policies protect sensitive tables and private Storage operations.
- Supabase manages base privileges on `storage.objects`; private-file isolation is enforced by RLS owner-folder policies and the absence of anonymous object policies. Do not alter platform-managed Storage grants without testing the Storage API.
- Private files are accessed through short-lived signed URLs.
- AI Legacy uses server-side request limits and validates the authenticated user, active consent and approved source selection.
- Account deletion requires a fresh authentication event and MFA when a verified factor exists.
- The PWA service worker caches only same-origin application shell assets. It does not cache Supabase API responses or private account data.

## Production checks

Before calling a release production-ready, verify:

1. Signup, email confirmation, Google OAuth and profile completion.
2. Sign-in, password reset, password update and email change.
3. MFA enrollment, backup authenticator challenge and unenrollment.
4. Story, Legacy, Safekeeping and Trusted People CRUD under RLS.
5. Private asset upload, download, recording, wallet attachment and deletion.
6. ZIP export and restore, including private files and cross-account AI consent safeguards.
7. AI Legacy consent, approved-source isolation, conversation history and quota handling.
8. Account deletion, including Storage cleanup and fresh-authentication requirements.
9. Responsive layout, PWA installation and offline app-shell behavior.
10. Supabase Security Advisor, Vercel build status and production runtime errors.

A successful TypeScript/Vite build is not a substitute for end-to-end testing of these flows.

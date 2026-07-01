# Books for Romi

A cozy, personalized book–recommendation web app — a gift. It shows a cinematic
3D "coverflow" carousel of book suggestions, learns what Romi likes as she swipes
(right to love, left to pass, up to skip), lets her save books for later, and
links out to buy them. Her likes and saves sync to the cloud so nothing is lost.

The recommendations are seeded from her real Goodreads library (296 books) and get
smarter every time she swipes.

## Highlights

- **Cinematic coverflow** carousel with 3D tilt, spring physics, and swipe gestures.
- **Tinder-style rating:** swipe right = love (trains the algorithm), left = pass
  (hidden forever), up = neutral skip (no effect).
- **Personalized recommender** built from her ratings, favorite authors, and genres.
- **Save shelf, Loved shelf, and Want to Read shelf** (her 45 Goodreads want-to-reads).
- **Beautiful pink-floral fallback covers** for books without artwork.
- **Cloud sync** via Supabase (with automatic localStorage fallback).
- **Installable PWA** — add to iPhone home screen for an app-like feel.

## Tech stack

Vite + React + TypeScript, Tailwind CSS, Framer Motion, Supabase, and book data
from [Hardcover](https://hardcover.app) (covers + discovery), [Open Library](https://openlibrary.org/developers/api),
and [Google Books](https://developers.google.com/books) (price + buy links).

## Getting started (local)

```bash
npm install
npm run parse-library   # generates src/data/library.json from the Goodreads export
npm run seed-library    # syncs read/DNF books + taste weights to Supabase
npm run dev             # http://localhost:5173
```

The app works immediately with **no configuration** — without Supabase it stores
swipes and saves in the browser's localStorage. Add Supabase (below) when you're
ready for cloud sync across her devices.

## Supabase setup (cloud sync)

1. Create a free project at [supabase.com](https://supabase.com).
2. In the dashboard, open **SQL Editor → New query**, paste the contents of
   [`supabase/schema.sql`](supabase/schema.sql), and run it. This creates the
   `swipes`, `saved_books`, `taste_weights`, and `book_cache` tables with Row
   Level Security enabled.
3. In **Project Settings → API**, copy the **Project URL** and the **anon public**
   key.
4. Create a `.env.local` file (copy from [`.env.example`](.env.example)):

   ```bash
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   ```

5. Restart `npm run dev`. Swipes and saves now persist to Supabase.

### Optional: Hardcover API (covers + discovery)

Hardcover supplies Goodreads-quality cover art and powers extra recommendation
search. Get a token from [hardcover.app → Account → API](https://hardcover.app/account/api)
and add it as a **server-side** env var (no `VITE_` prefix):

```bash
HARDCOVER_API_TOKEN=your-hardcover-token
```

Locally, `npm run dev` proxies `/api/hardcover` via Vite. On Vercel, the same
route lives at `api/hardcover.ts` — add `HARDCOVER_API_TOKEN` in project settings.

> Never put this token in frontend code or `VITE_*` vars. Hardcover explicitly
> requires backend-only access.

### Optional: Google Books API key

Covers and recommendations already call the public Google Books API with no key.
For heavier use (or if you hit rate limits), enable the Books API in
[Google Cloud Console](https://console.cloud.google.com/apis/library/books.googleapis.com),
create an API key, restrict it to the Books API and your domain, and add:

```bash
VITE_GOOGLE_BOOKS_API_KEY=your-google-books-api-key
```

> Security note: the anon key is meant to be public (it ships in the frontend).
> Row Level Security restricts all writes to the single `romi` profile, so a leaked
> URL can't be used to corrupt her data.

## Deploy to Vercel

1. Push this folder to a GitHub repo.
2. Import it at [vercel.com/new](https://vercel.com/new) — the framework and build
   settings are auto-detected via [`vercel.json`](vercel.json).
3. Add the `VITE_SUPABASE_*` environment variables in the Vercel project
   settings (and `HARDCOVER_API_TOKEN`, `VITE_APP_PASSCODE`, or
   `VITE_GOOGLE_BOOKS_API_KEY` if desired).
4. Deploy. Vercel gives you a public URL like `books-for-romi.vercel.app`.

## Optional: passcode gate

To keep the public URL a little private, set an environment variable:

```bash
VITE_APP_PASSCODE=ouranniversary
```

When set, the app shows a soft passcode screen before loading. Leave it blank to
disable. (This is a light barrier, not real security.)

## Optional: make it feel like a real app (PWA)

On her iPhone, open the site in Safari → Share → **Add to Home Screen**. It
launches full-screen with the custom icon, no browser chrome.

## Updating her library later

### Automatic (recommended)

Every **Sunday at 8:00 UTC**, Vercel Cron calls `/api/cron/sync-goodreads`, which:

1. Pulls Romi's full Goodreads library via RSS (read, want-to-read, currently reading, DNF, and tag shelves).
2. Upserts rows into Supabase `library_books`.
3. Refreshes taste weights and pass-swipes for finished books.
4. Updates the **Reading Map** (Obsidian-style graph) — new reads appear as nodes automatically.

Required Vercel env vars (see [`.env.example`](.env.example)):

```bash
GOODREADS_USER_ID=71171257
CRON_SECRET=your-random-secret   # Vercel sends Authorization: Bearer <CRON_SECRET>
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

The cron schedule lives in [`vercel.json`](vercel.json). Opening the **Map** tab always re-fetches the latest library from Supabase.

### Manual sync

Run locally anytime (updates `library.json` + Supabase):

```bash
npm run sync-goodreads
```

### Legacy markdown export

If you still maintain `Romi_Goodreads_Library.md`, replace it and run:

```bash
npm run parse-library
npm run seed-library
```

## How the recommender works

1. `scripts/parseLibrary.ts` turns her Goodreads export into structured JSON.
2. `src/lib/recommender.ts` builds a "taste profile" — author and genre weights
   from her star ratings and personal shelves (favorites, romance, rom-coms, etc.),
   with negative weight for DNFs.
3. It generates candidates she hasn't read: her Want to Read list first, then more
   books by her favorite authors and in her strongest genres (Hardcover + Open
   Library + Google Books, merged and de-duplicated).
4. Every love/pass nudges the relevant weights, so the queue keeps improving.
   Skips are neutral and never recorded.

## Gifting checklist

- [ ] `npm run parse-library` has been run (library.json exists)
- [ ] Supabase project created and `supabase/schema.sql` run
- [ ] `VITE_SUPABASE_*` env vars set locally and on Vercel
- [ ] (Optional) `HARDCOVER_API_TOKEN` set locally and on Vercel
- [ ] Deployed to Vercel and the URL loads
- [ ] Tested a few swipes + a save, confirmed they persist after refresh
- [ ] Opened on your phone and added to Home Screen to check the icon
- [ ] Send her the link 💗

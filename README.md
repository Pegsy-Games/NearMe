# NearMe

A hyper-local geography quiz game. Shows Street View images from around the player's address and asks them to name the street. Solo + Kahoot-style multiplayer.

Live at [nearme.pegsy.uk](https://nearme.pegsy.uk). Part of [Pegsy Games](https://pegsy.uk).

## Tech stack

- **Next.js 14** (App Router), React 18, plain JS (no TypeScript)
- **Supabase** (Postgres + Realtime) — multiplayer rooms + location cache
- **Google APIs** — Places Autocomplete, Street View Metadata + Image, Geocoding, Cloud Vision (image quality scoring)
- **OpenStreetMap Overpass** — road geometry for sampling + pre-flight density check
- **Vercel** deployment
- `canvas-confetti`, `qrcode.react`

## Repository structure

```
src/
├── app/
│   ├── api/              — server routes proxying Google APIs, holding the API key
│   ├── multiplayer/
│   │   ├── host/page.js  — host flow
│   │   └── join/page.js  — player join + play flow
│   ├── page.js           — solo mode
│   ├── layout.js
│   ├── globals.css
│   ├── robots.js
│   └── sitemap.js
└── lib/
    ├── config.js         — radius, questionsPerGame, Vision thresholds
    ├── locations.js      — cache check + sample mixing + batch processing + save
    ├── osm.js            — Overpass wrappers w/ 3-mirror retry
    ├── questions.js      — question assembly w/ name-dedup cap
    ├── api.js            — client-side wrappers around /api/* routes
    ├── supabase.js       — DB client + location_library helpers
    ├── geo.js            — distance / haversine utils
    ├── scoring.js
    └── useConfetti.js
supabase/                 — schema (location_library, game_rooms, game_players, game_answers)
```

## How the location pipeline works

When a player picks an address, NearMe finds ~40 valid Street View panoramas within 500 m (`CONFIG.radius`) to build 10 questions:

1. **Cache lookup** — hash `(lat.toFixed(4), lng.toFixed(4), radius)` → query Supabase `location_library`. If ≥ 40 cached rows, return them (skip all API calls).
2. **OSM road sampling** — if cache misses, query Overpass for playable roads (`primary | secondary | tertiary | unclassified | residential | living_street`). Sample up to 8 nodes per road, capped at 100 points total.
3. **Random top-up** — bring total candidates to 100 by adding random 2D samples in bands 50–450 m from the pin. Ensures urban addresses keep their historical sample count even if OSM returns few/zero.
4. **Per-candidate pipeline** (parallel batches of 8): Street View metadata → reverse geocode → Cloud Vision (reject images without streetscape features, `VISION_CONFIG.minScoreToAccept: 3`) → save passing records.
5. **Question assembly** (`generateQuestions`) — 10 questions, each with 1 correct + 3 distance-matched decoys. A street name can be correct **at most twice per game** (prevents one long road dominating).

## Setup screen map flow (solo + host)

Both share the same map UI pattern:

- 220 px placeholder slot reserved from the start (no layout shift when a pin appears)
- Google Map with draggable marker + blue 500 m `Circle` overlay synced to the marker
- If Google's `place.types` doesn't include a specific type (`street_address | premise | subpremise | route | establishment | point_of_interest`), an amber banner appears: *"That's a broad area. Drag the pin to the exact spot…"* and the map zooms out
- Pre-flight **Overpass road count** on pin set or drag end:
  - Green: *"N streets nearby — good to go"* (N ≥ 10)
  - Amber: *"Only N streets nearby — the game may be short"* (N < 10)
  - Silent if Overpass is unreachable
- The game reads the marker's **final** position, not the raw autocomplete result

Code is duplicated in `src/app/page.js` and `src/app/multiplayer/host/page.js`. An `<AddressPicker>` refactor is overdue.

## Gotchas

NearMe-specific. For cross-game lessons (Vercel settings, env vars, git workflow), see the [playbook](https://github.com/Pegsy-Games/playbook/blob/main/LESSONS_LEARNED.md).

### `source=outdoor` on Street View metadata silently filters urban panoramas
Keep `source=outdoor` **only** on the image endpoints (`/api/streetview-image`, `/api/vision`). Using it on metadata calls silently drops legitimate urban coverage.

### Cloud Vision has a 100/min rate limit per IP
Anything that boosts metadata success rate (e.g. aggressive snap-to-panorama) proportionally blows the Vision cap on a second playthrough within a minute — failures go silent everywhere. Raise the per-route limit first if changing sampling strategy.

### Don't "fix" the street-name filter regex
`src/lib/api.js` `getStreetName` matches `Road | Street | Avenue | …` on purpose. It filters motorways, service roads, car parks — none of which are fun to guess. Previous loosening attempts degraded the game.

### Don't relax `VISION_CONFIG.minScoreToAccept: 3`
The threshold is tuned. Loosening produces hedge/field photos that aren't playable.

### `getCoordinateHash` uses `toFixed(4)` (~10 m grid) deliberately
A 3-decimal / 100 m shared-cache experiment caused the **"54 cached rows but only 7 playable questions"** bug — records from neighbours' searches fell outside each individual user's 500 m radius filter. If shared caching is ever revisited, key records to a canonical cell-centre coordinate and filter distances relative to that, not to the current user.

### Test pipeline changes against a known-working urban address before pushing
Rural-focused fixes have broken urban before (snap-to-panorama + tier-reject → 0 images on production at the founder's own address). Deploy to `test` branch preview URL first and verify urban + rural before merging to `main`.

## Known issues / open follow-ups

- **Multiplayer host** still uses single-tier 500 m default (no widening UI). Real use is families in towns, so not urgent.
- **Rural coverage** stays thin. Rejected fixes: tiered radius (breaks "local"), looser filters (degrades quality), shared cache (broke distance filtering). Realistic next option: a manually curated seed-location pack for known-sparse UK areas.
- **Supabase `location_library` cleanup** — ~2,658 rows, ~9 true dupes (rest legitimate multi-image-per-road). Harmless as-is.
- **`AddressPicker` component refactor** — map + pin + circle + road check + banners duplicated across two files.
- **Bing Webmaster Tools** not set up (Google Search Console is).

## Development

```sh
npm install
cp .env.example .env.local   # fill in values
npm run dev                  # http://localhost:3000
```

`.env.local` requires:

```
NEXT_PUBLIC_SUPABASE_URL=https://xetizepmyboygaahexno.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
GOOGLE_API_KEY=...
```

### Git flow

Test on the `test` branch first, then fast-forward merge to `main`:

```sh
git checkout test
# make changes, commit, push — triggers preview deploy
# verify on https://nearme-git-test-lucs-projects-2c75545a.vercel.app
git checkout main && git merge --ff-only test && git push
```

Pushing to `main` auto-deploys to `nearme.pegsy.uk`. Pushing to `test` deploys to the preview URL above.

## Related

- [Pegsy Games](https://pegsy.uk) — studio site
- [Playbook](https://github.com/Pegsy-Games/playbook) — cross-game platform/tooling lessons
- [Game Template](https://github.com/Pegsy-Games/game-template) — scaffold for new games
- [LESSONS_LEARNED.md](./LESSONS_LEARNED.md) — NearMe-specific historical bug-fix lessons

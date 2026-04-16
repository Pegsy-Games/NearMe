# NearMe

A hyper-local geography quiz game. Users enter their address and are shown Street View images of nearby streets — can you name where you are?

## Stack

- **Frontend:** Vanilla HTML/JS (single page)
- **Database:** Supabase (PostgreSQL)
- **Hosting:** Vercel
- **APIs:** Google Maps (Places, Street View, Geocoding), Google Cloud Vision

## Project Structure

```
nearme/
├── public/
│   └── index.html          # Main game file
├── supabase/
│   └── migrations/
│       └── 001_create_location_library.sql
├── .env.example            # Environment variable template
└── README.md
```

## Environment Variables

Copy `.env.example` to `.env.local` and fill in your values. Never commit real keys.

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `GOOGLE_API_KEY` | Google Cloud API key (server-side only) |

## Setup

1. Create a Supabase project
2. Run `supabase/migrations/001_create_location_library.sql` in the Supabase SQL editor
3. Set environment variables in Vercel dashboard
4. Deploy

## Development Status

See `PROJECT_DOCUMENTATION.md` for full architecture notes.

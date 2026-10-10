# BeFitTracker (web, V1)

A free web app for friends and family: log five meals a day with real nutrition data,
enter steps, water and workouts, and see your day as Apple-Fitness-style rings.

Stack: Next.js 15 (App Router) · Supabase (Postgres, Auth, Row-Level Security) ·
USDA FoodData Central + Open Food Facts. No AI, no paid services.

## Run it locally

1. **Install Node 20+**, then in this folder run `npm install`.
2. **Create a free Supabase project** at supabase.com (pick the Canada region if offered).
3. **Create the tables**: Supabase dashboard → SQL Editor → paste
   `supabase/migrations/0001_init.sql` → Run.
4. **Auth settings** (Supabase → Authentication):
   - URL Configuration → Site URL `http://localhost:3000`, and add
     `http://localhost:3000/auth/callback` to Redirect URLs.
   - Providers → Email: keep "Confirm email" on.
   - Providers → Google (optional): add a Google OAuth client ID/secret.
   - Turn on leaked-password protection if your plan offers it.
4b. **Load the Indian food database** (980 Indian recipes, including South Indian and Kerala dishes):
   - SQL Editor → New query → paste `supabase/migrations/0002_indb_source.sql` → Run.
   - Then open a **new** query → paste `supabase/seed/indb_foods.sql` → Run. Safe to run again.
4c. **Meal skipping**: new query → paste `supabase/migrations/0003_skipped_meals.sql` → Run.
5. **Get a free USDA key** at https://fdc.nal.usda.gov/api-key-signup.
6. `cp .env.example .env.local` and fill in the values.
7. `npm run dev` and open http://localhost:3000.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app with hot reload |
| `npm test` | Unit tests (nutrition maths, food adapters, ranking) |
| `npm run typecheck` | TypeScript check |
| `npm run build` | Production build |

## Deploy for free

Push to GitHub, import the repo in Vercel (Hobby plan), add the same environment
variables, and set `NEXT_PUBLIC_SITE_URL` to your Vercel URL. Add
`https://<your-app>.vercel.app/auth/callback` to Supabase's Redirect URLs.

## Folder map

```
supabase/migrations/0001_init.sql   tables, security rules, sign-up trigger
supabase/migrations/0002_indb_source.sql  adds the Indian Nutrient Databank as a food source
supabase/seed/indb_foods.sql        980 Indian recipes (generated, don't edit by hand)
scripts/indb/build_seed.py          regenerates that file from INDB.xlsx; skipped.txt lists rejected rows
src/middleware.ts                   keeps sessions fresh, guards private pages
src/lib/                            framework-free logic (maths, dates, food adapters)
src/app/(auth)/                     sign-up, sign-in, password reset
src/app/auth/callback/              landing point for email links and Google
src/app/onboarding/                 body stats -> calorie and macro targets
src/app/app/                        signed-in area: Home, Diary, Add food, Targets
src/app/api/foods/search/           food search across all sources
src/app/coach/                      instructor area (placeholder until V1.1)
src/components/                     rings, progress bars, buttons
```

A full walkthrough of every section is in the "BeFitTracker — Code Guide" doc.

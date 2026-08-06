# Fanciaga 3

A PWA remote for the **Fanciaga desktop app**. The desktop app is the engine: it keeps doing the
heavy lifting (FFmpeg, spoofing, Bundle.social posting), while Fanciaga 3 runs anywhere — phone,
tablet, browser — and drives it.

## How it works

- Sign in with your **Fanciaga account** (same email & password as the desktop app).
- Fanciaga 3 watches for your desktop app's heartbeat and shows it as **ONLINE**, then pairs with
  it automatically.
- Three cards: **AI Generation**, **Editing**, and **Posting**.
- **Posting** asks for a **Script** file (`*.fanciaga-script.json`) recorded by the desktop app's
  **Script Writter** section: it replicates your recorded group-vault content picks, thumbnail
  choices, and per-post time intervals. Multi-select Instagram accounts to apply the same script
  to each of them — runs are **stacked** on the engine (never parallel) so API rate limits stay safe.
- Disconnect any time from the sidebar (the desktop app also has its own Disconnect button in the
  Script Writter section).

All communication goes through your Supabase project (tables `engine_links`, `engine_commands`,
`scripts` — see `supabase/schema.sql` in the Fanciaga repo). No extra server is needed.

## Develop

```bash
npm install
npm run dev
```

## Deploy to Vercel

1. Push this folder to a GitHub repository.
2. In Vercel: **Add New Project** → import the repo. Framework preset: **Vite**
   (build `npm run build`, output `dist` — auto-detected).
3. (Optional) Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` env vars to override the
   built-in Supabase project.
4. Deploy. `vercel.json` already handles the SPA fallback and service-worker caching.

> Run the updated `supabase/schema.sql` from the Fanciaga repo in your Supabase SQL editor first —
> it creates the `engine_links`, `engine_commands`, and `scripts` tables this app depends on.

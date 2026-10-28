# Awakening stats (unique wallets during 3–6 AM / 3–6 PM EST)

The mint page now records when someone connects their wallet during **Awakening** (3–6 AM or 3–6 PM Eastern). You can see **how many unique wallets** connected during those windows.

## How to enable storage (required for counts)

Right now the API can’t store counts until you add a Redis database.

1. **Vercel dashboard** → Your **333_collection** project (the API project, not 333landingpage).
2. Go to **Storage** (or **Integrations** / **Marketplace**).
3. Add **Upstash Redis** (free tier is enough).
4. Connect it to the **333_collection** project. Vercel will set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for you.
5. **Redeploy** the 333_collection project (so the API has the new env vars).

After that:

- When users **connect their wallet** on the mint page during 3–6 AM or 3–6 PM EST, a visit is recorded (once per window per session).
- On the mint page, the button **“How many connected during Awakening?”** loads the stats and shows:
  - **Total unique wallets** that have connected during any awakening window.
  - **Per-window counts** (e.g. `2025-03-14:am — 5`).

Wallets are stored only as a **hash** (SHA-256), so you get unique counts without storing actual addresses.

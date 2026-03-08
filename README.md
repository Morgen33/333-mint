# 333 The Collection — Mint Page

Minimal landing page to mint from the Candy Machine. No Manus, no 403 RPC bullshit.

## Deploy to Vercel (≈2 min)

1. **Install Vercel CLI** (if you don’t have it):
   ```bash
   npm i -g vercel
   ```

2. **From this folder:**
   ```bash
   cd /Users/mo/Desktop/333_collection/mint-page
   vercel
   ```
   Log in if asked, link to a new project, deploy. You’ll get a URL like `https://333-mint-xxx.vercel.app`.

3. **Optional — use a better RPC** (avoids 403):  
   In Vercel dashboard → Project → Settings → Environment Variables, add:
   - `VITE_RPC_URL` = `https://mainnet.helius-rpc.com/?api_key=YOUR_KEY`  
   Then in `src/App.jsx` change `const RPC = ...` to use `import.meta.env.VITE_RPC_URL || 'https://api.mainnet-beta.solana.com'`.

## Local

```bash
npm install
npm run dev
```

Open http://localhost:5173 — connect Phantom, mint (0.04 SOL).

## What’s in here

- **Candy Machine:** `EV6FZEwQfr1NdJ9GZ4oSHRPDJZMYgpACCwQy6ipZFNPe`
- **Collection:** `DDA9DiC7ahLjiu4eUbvHdsD6Go9j4ar3JQeohegQ7Jzn`
- **Price:** 0.04 SOL (set in Candy Machine)
- Metadata comes from `https://333collection.vercel.app/api/token/<id>` (dynamic).

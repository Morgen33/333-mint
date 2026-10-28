# Clear the Phantom scam warning — do these in order

Two things remove the warning: **1) verify your domain in Phantom Portal**, and **2) use an Address Lookup Table (LUT)** so the mint transaction stays small. Do both.

---

## Part A: Phantom Portal (verify your domain)

1. Go to **[phantom.app/portal](https://phantom.app/portal)** and sign in.
2. Open your app (App ID: `85950ca1-bdc2-421a-a43a-d4aa9c90afb9`), or create one and use this ID.
3. **Allowed origins:** Add `https://333landingpage.vercel.app` (and `https://333collection.xyz` if you use it).
4. **Redirect URLs** (for Google/Apple sign-in): Add `https://333landingpage.vercel.app/auth/callback`.
5. **Public URL:** Set to `https://333landingpage.vercel.app`.
6. **Domain verification:** In Edit App Info, use Domain verification. Add the TXT record Phantom gives you to your domain’s DNS (e.g. in Vercel: Project → Settings → Domains → your domain → add the TXT record). Then in Phantom Portal click **Verify domain**. DNS can take 15–60 minutes.

---

## Part B: Address Lookup Table (LUT) — keeps mint tx small

### B1. Add two lines to `.env`

1. Open **mint-page** → **`.env`** (create it if it doesn’t exist; copy from `.env.example`).
2. Add:

```env
RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
LUT_PAYER_KEYPAIR_PATH=~/.config/solana/id.json
```

- If your Solana keypair is somewhere else, use that path (e.g. `C:\Users\You\.config\solana\id.json` on Windows).
- That wallet needs a little SOL (e.g. ~0.01 SOL) to pay for creating the LUT.

### B2. Create the LUT

In Terminal:

```bash
cd /Users/mo/Desktop/333_collection/mint-page
npm run create-lut
```

When it finishes, it prints one long address. **Copy that entire address.**

### B3. Put the LUT address in `.env`

Open `.env` again and add (paste the address you copied):

```env
VITE_333_LUT_ADDRESS=paste_the_printed_address_here
```

Save the file.

### B4. Build and deploy

```bash
cd /Users/mo/Desktop/333_collection/mint-page
npm run build
vercel --prod
```

If 333landingpage is deployed via Vercel with Git: add **VITE_333_LUT_ADDRESS** in Vercel → Project → Settings → Environment Variables (same value as in `.env`), then redeploy.

---

After Part A and Part B, the scam warning should go away. If it’s still there after a week, use Phantom’s [domain review form](https://docs.google.com/forms/d/1JgIxdmolgh_80xMfQKBKx9-QPC7LRdN6LHpFFW8BlKM/viewform).

# Clear the Phantom “could be malicious” warning (3 steps)

Do these in order. You only do step 1–2 once; then step 3 whenever you deploy.

---

## Step 1: Add two lines to your `.env` file

1. Open the **mint-page** folder (Desktop → 333_collection → mint-page).
2. Open the file **`.env`** in a text editor.  
   (If you don’t see it, press **Cmd + Shift + .** to show hidden files.)
3. Add these **two lines** (adjust the keypair path if yours is different):

```env
RPC_URL=https://api.mainnet-beta.solana.com
LUT_PAYER_KEYPAIR_PATH=~/.config/solana/id.json
```

- If you use a **Helius RPC**, change the first line to your URL, e.g.  
  `RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY`
- If your **keypair is somewhere else**, change the second line to that path, e.g.  
  `LUT_PAYER_KEYPAIR_PATH=/Users/mo/Desktop/my-keypair.json`

4. Save and close `.env`.

**Don’t have a keypair file?** You need a Solana wallet as a JSON keypair (e.g. from `solana-keygen new` or exported from a tool). The wallet needs a little SOL to pay for creating the LUT (~0.01 SOL or less).

---

## Step 2: Run the script and add the LUT address to `.env`

1. Open **Terminal** (Cmd + Space → type **Terminal** → Enter).
2. Run:

```bash
cd /Users/mo/Desktop/333_collection/mint-page
npm run create-lut
```

3. Wait until it finishes. At the **end** it will print a long address (one line of letters/numbers).
4. **Copy that entire address.**
5. Open **`.env`** again and add a **new line**:

```env
VITE_333_LUT_ADDRESS=paste_the_address_here
```

(Replace `paste_the_address_here` with the address you copied. No spaces around `=`.)

6. Save `.env`.

---

## Step 3: Build and deploy

1. In Terminal (same folder):

```bash
npm run build
```

2. Deploy your site (e.g. push to Git so Vercel deploys, or your usual deploy).
3. If you use **Vercel**, add the same LUT address there:  
   **Project → Settings → Environment Variables** → add **VITE_333_LUT_ADDRESS** = the same address → Save, then **Redeploy**.

---

After that, the mint uses the LUT and the Phantom warning should go away. You can share the mint with friends.

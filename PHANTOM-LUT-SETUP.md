# Phantom scam warning fix: Address Lookup Table (LUT)

Phantom support recommended using an **Address Lookup Table** so the mint transaction stays under the 1232-byte limit and leaves room for Lighthouse. That removes the "could be malicious" / scam-style warning.

## What we did in code

- **doMint.js** now uses an optional LUT: if `VITE_333_LUT_ADDRESS` is set, we fetch that on-chain LUT and attach it to the transaction so the message is compressed (v0 + LUT).
- **scripts/create-lut.js** creates and extends one LUT with the 333 collection’s fixed accounts and common program IDs. Run it once, then set the printed address in `.env`.

## One-time setup

1. **Create the LUT** (from `mint-page` directory):

   ```bash
   cd mint-page
   export RPC_URL="https://mainnet.helius-rpc.com/?api-key=YOUR_KEY"   # or your RPC
   export LUT_PAYER_KEYPAIR_PATH="~/.config/solana/id.json"            # wallet that pays for LUT creation
   node scripts/create-lut.js
   ```

   The script will print the LUT address at the end.

2. **Configure the mint page**  
   In `.env` (and in Vercel env vars if you deploy there), set:

   ```env
   VITE_333_LUT_ADDRESS=<the printed LUT address>
   ```

3. **Rebuild and deploy**  
   Run `npm run build` and redeploy. New mints will use the LUT and the transaction size should stay under the limit so Phantom’s warning should stop appearing.

## If you hit compute unit limits

Phantom also said: if the transaction exceeds the **compute unit** limit, consider splitting into two transactions. For a single mint that’s usually not needed; the LUT fix is the main one. If you still see issues, you can try lowering the compute unit limit in `doMint.js` (e.g. from 800_000 to 400_000) so there’s more headroom for Lighthouse, or share a code snippet with Phantom support as they suggested.

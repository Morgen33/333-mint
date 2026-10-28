# Code to share with Phantom for scam-warning review

**Live site:** https://333landingpage.vercel.app  
**Phantom App ID:** `85950ca1-bdc2-421a-a43a-d4aa9c90afb9`

Give Phantom these files (and this note). You can zip the `mint-page` folder **excluding** `node_modules`, `.env`, and `dist`, or share a repo link.

---

## 1. Mint transaction (main logic they care about)

**File:** `src/doMint.js`

- Builds the mint with Metaplex/Umi (`mintV2`, candy machine + candy guard).
- Uses **Address Lookup Table** when `VITE_333_LUT_ADDRESS` is set: fetches LUT via `connection.getAddressLookupTable()`, passes it to the transaction builder with `setAddressLookupTables([lutInput])` so the serialized tx stays small (Phantom’s recommendation).
- **Simulates** before sending: `connection.simulateTransaction(web3Tx, { sigVerify: false })` so Phantom sees a successful simulation.
- **Signing order:** Phantom (wallet) signs first, then the script signs with the generated NFT mint keypair, then we submit.

---

## 2. Phantom / wallet setup

**File:** `src/main.jsx`

- `PhantomProvider` with `appId`, `redirectUrl`, `addressTypes: [AddressType.solana]`.
- `ConnectionProvider` + `WalletProvider` (Phantom + Solflare) with RPC from env or `/api/rpc`.
- RPC is either `VITE_RPC_URL` (full URL) or same-origin `/api/rpc`.

**File:** `src/phantomSolanaAdapter.js`

- Wraps Phantom’s `solana.signTransaction` / `signAllTransactions` so the same mint flow works for Phantom Connect (e.g. Google sign-in) and injected wallet.

**File:** `src/App.jsx`

- Uses `useWallet()` (adapter) and Phantom SDK (`useSolana`, `useConnect`, etc.).
- On Mint click: uses wallet adapter or `createPhantomSolanaAdapter(solana, walletAddress)` and calls `mint(adapter, RPC)` from `doMint.js`.

---

## 3. RPC proxy (no signing, just forwards to Helius)

**File:** `api/rpc.js`

- Serverless handler: forwards POST body to `RPC_UPSTREAM` or `HELIUS_RPC_URL` (full URL only).
- Used so the client can call `getAssetsByOwner` and other RPCs without CORS; not used to build or sign the mint tx.

---

## 4. Address Lookup Table (how we created it)

**File:** `scripts/create-lut.js`

- One-time script: creates an on-chain LUT and extends it with candy machine, candy guard, collection, system/token/metaplex program IDs.
- The printed address is set in env as `VITE_333_LUT_ADDRESS` and read in `doMint.js` at build/runtime.

---

## 5. Env / config (redact API keys if you share)

- `.env.example` lists `VITE_RPC_URL`, `VITE_PHANTOM_APP_ID`, `VITE_333_LUT_ADDRESS`.
- Production build uses `VITE_333_LUT_ADDRESS` so the mint uses the LUT; we still see the scam warning and want Phantom’s guidance.

---

## Short note you can paste to Phantom

> We’re the 333 Collection mint (https://333landingpage.vercel.app). We’ve implemented:
> - Address Lookup Table to keep the mint transaction under the size limit.
> - Simulation with sigVerify: false before sending to Phantom.
> - Phantom signs first, then we add the NFT mint signer and submit.
> We still get the scam warning. Attached is the code for the mint flow (doMint.js), Phantom/wallet setup (main.jsx, phantomSolanaAdapter.js, App.jsx), RPC proxy (api/rpc.js), and LUT creation script (scripts/create-lut.js). Can you review and tell us what we need to change to clear the warning?

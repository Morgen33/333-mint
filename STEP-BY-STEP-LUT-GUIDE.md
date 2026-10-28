# Step-by-step guide: Fix Phantom scam warning (333 collection)

This guide fixes the "could be malicious" warning when minting. Do one section at a time. You can stop after any section and come back later.

---

## Part A: Do you want to do this now?

- **The mint page works without this.** You can keep using it. Phantom might show a warning; the mint can still succeed.
- **This guide creates something called an "Address Lookup Table" (LUT)** so the transaction is smaller and Phantom stops showing that warning.
- **You only do it once.** After that, you just add one line to your project and redeploy.

If you want to do it, continue to Part B. If not, you can close this file and use the mint page as-is.

---

## Part B: Get a Solana keypair file (the wallet that pays for the LUT)

The LUT is created on Solana and costs a tiny bit of SOL. A "keypair file" is a file that represents a wallet. You need one.

### Option 1: You already use Solana in Terminal

1. Open **Terminal** (press Command + Space, type `Terminal`, press Enter).
2. Type: `solana address` and press Enter.
3. If you see a long address (lots of letters and numbers), you have a wallet. The keypair file is usually at:  
   **/Users/mo/.config/solana/id.json**  
   Remember that path. Go to Part C.

If you see "command not found" or an error, use Option 2.

### Option 2: You use Phantom (or another wallet) and don’t have a keypair file

- Creating a keypair file from Phantom is possible but involves exporting private key and converting it. It’s easy to make a mistake, so we don’t recommend it unless you’re comfortable.
- **Easier:** Install Solana’s tools and create a new wallet just for this:
  1. Go to: https://docs.solana.com/cli/install-solana-cli-tools  
  2. Install for Mac.
  3. Open Terminal and run: `solana-keygen new`  
  4. It will create a keypair at `/Users/mo/.config/solana/id.json`.  
  5. Send a small amount of SOL (e.g. 0.1 SOL) to the address it shows so it can pay for creating the LUT.

Then go to Part C.

### Option 3: Skip the LUT for now

- You can skip creating the LUT. The mint page will still work; Phantom may keep showing the warning.
- When you’re ready, come back to this guide and start from Part B again.

---

## Part C: Open Terminal and go to your project

1. Open **Terminal** (Command + Space → type `Terminal` → Enter).
2. You’ll see a window with a line that might look like:  
   `Mo-MacBook-Pro:~ mo$`  
   That’s the "prompt". You type after the `$`.
3. Type exactly this (you can copy and paste):  
   `cd /Users/mo/Desktop/333_collection/mint-page`  
4. Press **Enter**.
5. The next line should still show the same kind of prompt, but it might now show something like:  
   `Mo-MacBook-Pro:mint-page mo$`  
   That means you’re in the right folder. If you see an error like "No such file or directory", the path might be different on your Mac (e.g. your username might not be `mo`). Tell someone the exact error and your folder path.

---

## Part D: Tell the script which RPC and wallet to use

Still in Terminal, do these two steps. **Run each line separately** (type or paste, then Enter).

**Line 1 – RPC (the Solana connection):**

```bash
export RPC_URL="https://api.mainnet-beta.solana.com"
```

Press Enter. You won’t see much; that’s normal.

**Line 2 – Your keypair file (the wallet that pays):**

If your keypair is at the default Solana path, use:

```bash
export LUT_PAYER_KEYPAIR_PATH="$HOME/.config/solana/id.json"
```

If you put your keypair somewhere else (e.g. Desktop), use that path, for example:

```bash
export LUT_PAYER_KEYPAIR_PATH="/Users/mo/Desktop/my-keypair.json"
```

Replace `my-keypair.json` with your real file name. Press Enter.

---

## Part E: Run the script that creates the LUT

1. Still in the same Terminal window, in the same folder (`mint-page`).
2. Type:  
   `node scripts/create-lut.js`  
3. Press **Enter**.
4. Wait. You might see:
   - `Create LUT tx:`
   - Then something like `Extend LUT batch 1`
   - Then at the **very end**, a line that says something like:  
     **LUT address (add to .env as VITE_333_LUT_ADDRESS):**  
     and under it a **long string of letters and numbers** (e.g. 32–44 characters).
5. **Copy that long string.** That’s your LUT address. You’ll paste it in Part G.

**If you see an error:**

- **"Set LUT_PAYER_KEYPAIR_PATH or LUT_PAYER_SECRET_KEY"**  
  You didn’t set the wallet. Go back to Part D and run the second line again with the correct path.

- **"ENOENT" or "no such file"**  
  The path in `LUT_PAYER_KEYPAIR_PATH` is wrong. Check the file exists (e.g. in Finder) and fix the path in Part D.

- **"Insufficient funds" or similar**  
  The wallet you’re using doesn’t have enough SOL. Send a little SOL to that wallet and try again.

---

## Part F: Open your .env file

1. Open **Finder** (the smiley face in the Dock).
2. Go to **Desktop**.
3. Open the folder **333_collection**.
4. Open the folder **mint-page**.
5. Look for a file named **.env**.  
   - If you don’t see it: press **Command + Shift + .** (period) to show hidden files. Look again for **.env**.
6. **Double‑click .env** to open it.  
   - If it asks "Choose an application", pick **TextEdit**.
7. You’ll see several lines that might look like:  
   `VITE_RPC_URL=...`  
   `VITE_PHANTOM_APP_ID=...`  
   Don’t delete anything. You’re only adding one new line.

---

## Part G: Add the LUT address to .env

1. Click at the **end** of the file (after the last line).
2. Press **Enter** to make a new line.
3. Type exactly:  
   `VITE_333_LUT_ADDRESS=`  
   (No space before or after the `=`.)
4. **Paste** the long LUT address you copied in Part E right after the `=`.  
   The line should look like:  
   `VITE_333_LUT_ADDRESS=AbC123XyZ...lotsOfCharacters...`  
   (yours will be different; that’s fine.)
5. Save the file: **Command + S**. Then close the tab or window.

---

## Part H: Build the project again

1. Go back to **Terminal**.
2. Make sure you’re in the mint folder. If you’re not sure, type:  
   `cd /Users/mo/Desktop/333_collection/mint-page`  
   and press Enter.
3. Type:  
   `npm run build`  
4. Press **Enter**.
5. Wait until it finishes. You should see something like **"built in 19.36s"** or similar at the end. That means the build worked.

If you see errors in red, copy the full message and ask someone for help (or share it with me).

---

## Part I: Deploy (so the live site uses the LUT)

- **If you use Vercel:**
  1. Go to [vercel.com](https://vercel.com) and open your 333 collection project.
  2. Go to **Settings** → **Environment Variables**.
  3. Click **Add** (or "Add New").
  4. Name: `VITE_333_LUT_ADDRESS`  
     Value: paste the **same** LUT address you put in `.env`.
  5. Save.
  6. Go to **Deployments**, click the **...** on the latest deployment, and choose **Redeploy** (or push a new commit to trigger a deploy).

- **If you deploy another way:**  
  Deploy the project again so the new build (from Part H) and the new env variable (from Part G) are what’s live. If your host uses env vars, add `VITE_333_LUT_ADDRESS` there too with the same value.

---

## You’re done

After this, when people mint on your live site, the transaction will use the LUT and should stay under the size limit, so Phantom’s "could be malicious" warning should go away (or be much less likely).

**Summary of what you did:**

1. Got a keypair file (wallet that pays for the LUT).
2. Opened Terminal and went to `mint-page`.
3. Set `RPC_URL` and `LUT_PAYER_KEYPAIR_PATH`.
4. Ran `node scripts/create-lut.js` and copied the LUT address.
5. Opened `.env` and added `VITE_333_LUT_ADDRESS=<that address>`.
6. Ran `npm run build`.
7. Added `VITE_333_LUT_ADDRESS` to Vercel (or your host) and redeployed.

If you get stuck, say which part (A, B, C, …) you’re on and what you see on the screen (or paste the error), and someone can give you the next exact step.

/**
 * One-time script to create an Address Lookup Table (ALT) for the 333 collection mint.
 * Phantom: using an ALT keeps the tx under 1232 bytes so the "could be malicious" warning goes away.
 *
 * Run from mint-page: npm run create-lut
 * Reads .env for RPC_URL (or VITE_RPC_URL) and LUT_PAYER_KEYPAIR_PATH.
 * After it succeeds, add the printed address to .env as VITE_333_LUT_ADDRESS=...
 */

import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  AddressLookupTableProgram,
} from '@solana/web3.js';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// Load .env from mint-page directory so you can set RPC and keypair path there
function loadEnv() {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eq = trimmed.indexOf('=');
      if (eq > 0) {
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
        if (key && val) process.env[key] = val;
      }
    }
  }
}
loadEnv();

const RPC = process.env.RPC_URL || process.env.VITE_RPC_URL || 'https://api.mainnet-beta.solana.com';
const RPC_TIMEOUT_MS = 30000; // 30s so we don't hang forever

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s. Check RPC URL and network.`)), ms)
    ),
  ]);
}

// Same as doMint.js
const CANDY_MACHINE_ID = 'EV6FZEwQfr1NdJ9GZ4oSHRPDJZMYgpACCwQy6ipZFNPe';
const CANDY_GUARD_ID = 'F12KrDTqHQu9WT9ro8C7mEEyZM3z2cNKUjWM9q3Ucoqj';
const SOL_PAYMENT_DESTINATION = '3sj96bhYdZaCcLvpoGAmfGPSm97MhpU8BRFsw39QgE48';
const COLLECTION_MINT = 'DDA9DiC7ahLjiu4eUbvHdsD6Go9j4ar3JQeohegQ7Jzn';
const COLLECTION_UPDATE_AUTHORITY = 'BcEydyffqucnpNmLdpqhyYVpDkkbrX5B1Av1ibqk8jxw';

const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';
const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const ASSOCIATED_TOKEN_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const TOKEN_METADATA_PROGRAM_ID = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';
const RENT_SYSVAR_ID = 'SysvarRent111111111111111111111111111111111';
const CANDY_MACHINE_PROGRAM_ID = 'CndyV3LdqHUfDLmE5naZjVN8rBZz4tqhdefbAnjHG3JR';
const CANDY_GUARD_PROGRAM_ID = 'Guard1Jw5J2cnsmECQ6J4BoNV2bR4oZUF7H8dE1By2S';

async function loadPayer() {
  let path = process.env.LUT_PAYER_KEYPAIR_PATH;
  if (path) {
    path = path.replace(/^~/, process.env.HOME || process.env.USERPROFILE || '');
    const fullPath = resolve(path);
    if (!existsSync(fullPath)) {
      throw new Error('Keypair file not found at: ' + fullPath + '\nSet LUT_PAYER_KEYPAIR_PATH in .env to your keypair JSON path (e.g. ~/.config/solana/id.json).');
    }
    const buf = JSON.parse(readFileSync(fullPath, 'utf8'));
    return Keypair.fromSecretKey(Uint8Array.from(buf));
  }
  const b58 = process.env.LUT_PAYER_SECRET_KEY;
  if (b58) {
    const { default: bs58 } = await import('bs58');
    const decoded = bs58.decode(b58);
    return Keypair.fromSecretKey(new Uint8Array(decoded));
  }
  throw new Error(
    'Add LUT_PAYER_KEYPAIR_PATH to your .env file.\n' +
    'Example: LUT_PAYER_KEYPAIR_PATH=~/.config/solana/id.json\n' +
    'Or use a keypair file path (e.g. /Users/mo/Desktop/my-keypair.json).'
  );
}

async function main() {
  console.log('Reading .env and loading keypair...');
  const payer = await loadPayer();
  console.log('Keypair loaded. Connecting to RPC...');
  const connection = new Connection(RPC);

  console.log('Fetching current slot (this may take 10–30s)...');
  let lutAddress = null;
  let createSig = null;
  const MAX_CREATE_ATTEMPTS = 5;

  for (let attempt = 1; attempt <= MAX_CREATE_ATTEMPTS; attempt++) {
    const slot = await withTimeout(connection.getSlot(), RPC_TIMEOUT_MS, 'getSlot');
    // Some RPCs can return the very latest slot which may not be in SlotHashes yet.
    // Use slot-1 to keep it "recent" but safely rooted in history.
    const recentSlot = Math.max(0, slot - 1);

    const [createIx, derivedLutAddress] = AddressLookupTableProgram.createLookupTable({
      authority: payer.publicKey,
      payer: payer.publicKey,
      recentSlot,
    });

    const { blockhash, lastValidBlockHeight } = await withTimeout(
      connection.getLatestBlockhash(),
      RPC_TIMEOUT_MS,
      'getLatestBlockhash'
    );
    const createMsg = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: blockhash,
      instructions: [createIx],
    }).compileToV0Message();
    const createTx = new VersionedTransaction(createMsg);
    createTx.sign([payer]);

    try {
      console.log(`Sending create LUT transaction (attempt ${attempt}/${MAX_CREATE_ATTEMPTS}, slot ${recentSlot})...`);
      createSig = await withTimeout(
        connection.sendTransaction(createTx, { skipPreflight: false }),
        RPC_TIMEOUT_MS,
        'sendTransaction (create LUT)'
      );
      console.log('Create LUT tx:', createSig);
      console.log('Waiting for confirmation...');
      await withTimeout(
        connection.confirmTransaction({ signature: createSig, blockhash, lastValidBlockHeight }, 'confirmed'),
        RPC_TIMEOUT_MS,
        'confirmTransaction'
      );
      lutAddress = derivedLutAddress;
      break;
    } catch (error) {
      const msg = String(error?.message || error);
      const isRecentSlotError =
        msg.includes('not a recent slot') || msg.includes('InvalidInstructionData');
      if (!isRecentSlotError || attempt === MAX_CREATE_ATTEMPTS) throw error;
      console.log('Create LUT failed due to recent-slot mismatch. Retrying with a fresh slot...');
    }
  }

  if (!lutAddress) {
    throw new Error('Failed to create LUT: no address returned.');
  }

  // Wait for the LUT account to exist and be owned by the ALT program before extending
  const ALT_PROGRAM_ID = new PublicKey('AddressLookupTab1e1111111111111111111111111');
  const maxWaitMs = 60000;
  const pollIntervalMs = 2000;
  const started = Date.now();
  console.log('Waiting for LUT account to be visible on chain...');
  while (Date.now() - started < maxWaitMs) {
    const info = await connection.getAccountInfo(lutAddress);
    if (info && info.owner.equals(ALT_PROGRAM_ID)) {
      console.log('LUT account ready.');
      break;
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  const finalCheck = await connection.getAccountInfo(lutAddress);
  if (!finalCheck || !finalCheck.owner.equals(ALT_PROGRAM_ID)) {
    throw new Error('LUT account did not appear in time. Wait a minute and run the script again to extend the existing LUT.');
  }

  const addresses = [
    CANDY_MACHINE_ID,
    CANDY_GUARD_ID,
    COLLECTION_MINT,
    COLLECTION_UPDATE_AUTHORITY,
    SOL_PAYMENT_DESTINATION,
    SYSTEM_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_METADATA_PROGRAM_ID,
    RENT_SYSVAR_ID,
    CANDY_MACHINE_PROGRAM_ID,
    CANDY_GUARD_PROGRAM_ID,
  ].map((s) => new PublicKey(s));

  const BATCH = 20;
  for (let i = 0; i < addresses.length; i += BATCH) {
    const chunk = addresses.slice(i, i + BATCH);
    const extendIx = AddressLookupTableProgram.extendLookupTable({
      lookupTable: lutAddress,
      authority: payer.publicKey,
      payer: payer.publicKey,
      addresses: chunk,
    });
    const { blockhash: bh, lastValidBlockHeight: lv } = await withTimeout(
      connection.getLatestBlockhash(),
      RPC_TIMEOUT_MS,
      'getLatestBlockhash (extend)'
    );
    const msg = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: bh,
      instructions: [extendIx],
    }).compileToV0Message();
    const tx = new VersionedTransaction(msg);
    tx.sign([payer]);
    const sig = await withTimeout(
      connection.sendTransaction(tx, { skipPreflight: false }),
      RPC_TIMEOUT_MS,
      'sendTransaction (extend)'
    );
    console.log('Extend LUT batch', i / BATCH + 1, sig);
    await withTimeout(
      connection.confirmTransaction({ signature: sig, blockhash: bh, lastValidBlockHeight: lv }, 'confirmed'),
      RPC_TIMEOUT_MS,
      'confirmTransaction (extend)'
    );
  }

  console.log('\nLUT address (add to .env as VITE_333_LUT_ADDRESS):');
  console.log(lutAddress.toBase58());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

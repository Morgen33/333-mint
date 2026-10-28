/**
 * Lazy-loaded mint logic so the heavy Metaplex/Umi deps don't break initial page load.
 *
 * Phantom: (1) Sign with Phantom first (wallet signer), then additional signer(s).
 * (2) Simulate with sigVerify: false before signing so user does not pay for failing txs.
 * (3) Use V0 + Address Lookup Table to keep tx smaller and easier for wallet checks.
 */
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import { mplCandyMachine } from '@metaplex-foundation/mpl-candy-machine';
import { mplToolbox, setComputeUnitLimit, setComputeUnitPrice } from '@metaplex-foundation/mpl-toolbox';
import { mintV2, fetchCandyMachine } from '@metaplex-foundation/mpl-candy-machine';
import { transactionBuilder, createSignerFromKeypair, publicKey, some } from '@metaplex-foundation/umi';
import { toWeb3JsTransaction } from '@metaplex-foundation/umi-web3js-adapters';
import {
  Connection,
  Keypair as SolanaKeypair,
  PublicKey as SolanaPublicKey,
  Transaction,
  VersionedTransaction,
} from '@solana/web3.js';
import { MintError } from './mintErrors';

const CANDY_MACHINE_ID = 'EV6FZEwQfr1NdJ9GZ4oSHRPDJZMYgpACCwQy6ipZFNPe';
const CANDY_GUARD_ID = 'F12KrDTqHQu9WT9ro8C7mEEyZM3z2cNKUjWM9q3Ucoqj';
const SOL_PAYMENT_DESTINATION = '3sj96bhYdZaCcLvpoGAmfGPSm97MhpU8BRFsw39QgE48';
const COLLECTION_MINT = 'DDA9DiC7ahLjiu4eUbvHdsD6Go9j4ar3JQeohegQ7Jzn';
const COLLECTION_UPDATE_AUTHORITY = 'BcEydyffqucnpNmLdpqhyYVpDkkbrX5B1Av1ibqk8jxw';
const LUT_ADDRESS = typeof import.meta !== 'undefined' && import.meta.env?.VITE_333_LUT_ADDRESS;

/** Wallet adapters (Phantom, embedded SDK) may return Umi txs or plain objects without .sign(). */
function toSignableWeb3Transaction(tx) {
  if (tx instanceof VersionedTransaction || tx instanceof Transaction) return tx;
  try {
    return toWeb3JsTransaction(tx);
  } catch (_) {
    if (typeof tx?.serialize === 'function') {
      const bytes = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
      try {
        return VersionedTransaction.deserialize(bytes);
      } catch {
        return Transaction.from(bytes);
      }
    }
    throw new Error('Could not parse signed transaction from wallet.');
  }
}

function applyAdditionalSigners(signedTx, additionalSigners) {
  if (!additionalSigners?.length) return signedTx;
  const tx = toSignableWeb3Transaction(signedTx);
  tx.sign(additionalSigners);
  return tx;
}

export async function mint(walletAdapter, rpcUrl) {
  const rpc = rpcUrl || 'https://api.mainnet-beta.solana.com';
  const umi = createUmi(rpc)
    .use(mplCandyMachine())
    .use(mplToolbox())
    .use(walletAdapterIdentity(walletAdapter));

  const candyMachinePb = publicKey(CANDY_MACHINE_ID);
  const candyMachine = await fetchCandyMachine(umi, candyMachinePb);

  const isBlockhashExpired = (e) => {
    const msg = (e?.message || e?.toString || '').toString();
    return /expired|block height exceeded|blockhash/i.test(msg);
  };

  const fetchTransactionLogs = async (connection, signature) => {
    try {
      const tx = await connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
      return tx?.meta?.logMessages || null;
    } catch {
      return null;
    }
  };

  // Polls over HTTP: the RPC is proxied through /api/rpc, which cannot carry the websocket
  // subscription that connection.confirmTransaction relies on.
  const waitForConfirmation = async (connection, signature, timeoutMs = 90_000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      let status = null;
      try {
        const statuses = await connection.getSignatureStatuses([signature]);
        status = statuses?.value?.[0];
      } catch (_) {}
      if (status?.err) {
        const logs = await fetchTransactionLogs(connection, signature);
        throw new MintError(`Transaction failed on-chain: ${JSON.stringify(status.err)}`, {
          stage: 'onchain',
          signature,
          logs,
        });
      }
      if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    throw new MintError(`Transaction ${signature} is still pending confirmation.`, {
      stage: 'pending',
      signature,
    });
  };

  const buildTx = (lutInput) => {
    const kp = SolanaKeypair.generate();
    const nftMint = createSignerFromKeypair(umi, {
      publicKey: publicKey(kp.publicKey.toBase58()),
      secretKey: new Uint8Array(kp.secretKey),
    });
    let builder = transactionBuilder()
      .add(setComputeUnitLimit(umi, { units: 800_000 }))
      .add(setComputeUnitPrice(umi, { microLamports: 200_000 }))
      .add(
        mintV2(umi, {
          candyMachine: candyMachinePb,
          candyGuard: publicKey(CANDY_GUARD_ID),
          nftMint,
          collectionMint: publicKey(COLLECTION_MINT),
          collectionUpdateAuthority: publicKey(COLLECTION_UPDATE_AUTHORITY),
          tokenStandard: candyMachine.tokenStandard,
          mintArgs: {
            solPayment: some({ destination: publicKey(SOL_PAYMENT_DESTINATION) }),
          },
        })
      );
    if (lutInput) builder = builder.setAddressLookupTables([lutInput]);
    return { builder, additionalSigners: [kp], mintAddress: kp.publicKey.toBase58() };
  };

  const runMint = async () => {
    const connection = new Connection(rpc);
    let lutInput = null;
    if (LUT_ADDRESS) {
      const lutRes = await connection.getAddressLookupTable(new SolanaPublicKey(LUT_ADDRESS));
      const lut = lutRes?.value;
      if (lut?.state?.addresses) {
        lutInput = {
          publicKey: publicKey(lut.key.toBase58()),
          addresses: lut.state.addresses.map((a) => publicKey(a.toBase58())),
        };
      }
    }

    const { builder, additionalSigners, mintAddress } = buildTx(lutInput);
    const withBlockhash = await builder.setLatestBlockhash(umi);
    const unsignedTx = withBlockhash.build(umi);
    const signers = withBlockhash.getSigners(umi);

    const numSigs = signers.length;
    const dummySigs = Array.from({ length: numSigs }, () => new Uint8Array(64));
    const txForSim = { ...unsignedTx, signatures: dummySigs };
    const simTx = toWeb3JsTransaction(txForSim);
    const sim = await connection.simulateTransaction(simTx, { sigVerify: false });
    if (sim.value.err) {
      if (sim.value.logs?.length) {
        console.error('Mint simulation failed — program logs:', sim.value.logs);
      }
      throw new MintError(
        'This mint would fail on-chain, so nothing was sent. Details: ' + JSON.stringify(sim.value.err),
        { stage: 'simulate', logs: sim.value.logs || null }
      );
    }

    if (typeof walletAdapter.signTransaction !== 'function') {
      throw new MintError('Wallet does not support signing transactions.', { stage: 'sign' });
    }
    let walletSignedTx;
    try {
      const walletSignTx = toWeb3JsTransaction(unsignedTx);
      const walletSigned = await walletAdapter.signTransaction(walletSignTx);
      walletSignedTx = applyAdditionalSigners(walletSigned, additionalSigners);
    } catch (e) {
      throw new MintError(e?.message || String(e), { stage: 'sign', cause: e });
    }

    let signature;
    try {
      signature = await connection.sendRawTransaction(walletSignedTx.serialize(), {
        preflightCommitment: 'confirmed',
      });
    } catch (e) {
      throw new MintError(e?.message || String(e), {
        stage: 'send',
        logs: e?.logs || e?.transactionLogs || null,
        cause: e,
      });
    }
    if (!signature) throw new MintError('Wallet did not return a transaction signature.', { stage: 'send' });

    await waitForConfirmation(connection, signature);
    return { signature, mintAddress };
  };

  try {
    return await runMint();
  } catch (e) {
    // Only retry when nothing reached the chain, otherwise a retry could double-mint.
    if (!e?.signature && e?.stage !== 'sign' && isBlockhashExpired(e)) return await runMint();
    throw e;
  }
}

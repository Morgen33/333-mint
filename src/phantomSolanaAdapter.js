/**
 * Wraps Phantom SDK's solana object so it can be used as a signer with Umi (walletAdapterIdentity).
 * Use when connected via Phantom Connect (injected or embedded).
 *
 * Must convert Umi ↔ @solana/web3.js the same way as createSignerFromWalletAdapter — Phantom expects web3.js txs.
 */
import { PublicKey } from '@solana/web3.js';
import { fromWeb3JsTransaction, toWeb3JsTransaction } from '@metaplex-foundation/umi-web3js-adapters';

export function createPhantomSolanaAdapter(solana, publicKeyString) {
  if (!solana || !publicKeyString) return null;
  const publicKey = new PublicKey(publicKeyString);
  const asWeb3Tx = (transaction) =>
    transaction && typeof transaction.serialize === 'function'
      ? transaction
      : toWeb3JsTransaction(transaction);

  async function signTransactionUmi(transaction) {
    const web3Tx = asWeb3Tx(transaction);
    const signed = await solana.signTransaction(web3Tx);
    return fromWeb3JsTransaction(signed);
  }

  return {
    publicKey,
    signTransaction: signTransactionUmi,
    async signAndSendTransaction(transaction, connection) {
      const web3Tx = asWeb3Tx(transaction);
      if (typeof solana.signAndSendTransaction !== 'function') {
        const signed = await solana.signTransaction(web3Tx);
        const signature = await connection.sendRawTransaction(signed.serialize());
        return { signature };
      }
      const result = await solana.signAndSendTransaction(web3Tx);
      if (typeof result === 'string') return { signature: result };
      return result;
    },
    async sendTransaction(transaction, connection) {
      const web3Tx = asWeb3Tx(transaction);
      const signed = await solana.signTransaction(web3Tx);
      const signature = await connection.sendRawTransaction(signed.serialize());
      return signature;
    },
    signAllTransactions(transactions) {
      if (typeof solana.signAllTransactions === 'function') {
        return solana
          .signAllTransactions(transactions.map((tx) => toWeb3JsTransaction(tx)))
          .then((signed) => signed.map((tx) => fromWeb3JsTransaction(tx)));
      }
      return Promise.all(transactions.map((tx) => signTransactionUmi(tx)));
    },
  };
}

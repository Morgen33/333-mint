/**
 * Lazy-loaded mint logic so the heavy Metaplex/Umi deps don't break initial page load.
 */
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import { mplCandyMachine } from '@metaplex-foundation/mpl-candy-machine';
import { mplToolbox, setComputeUnitLimit, setComputeUnitPrice } from '@metaplex-foundation/mpl-toolbox';
import { mintV2, fetchCandyMachine } from '@metaplex-foundation/mpl-candy-machine';
import { transactionBuilder, createSignerFromKeypair, publicKey, some } from '@metaplex-foundation/umi';
import { Keypair as SolanaKeypair } from '@solana/web3.js';

const CANDY_MACHINE_ID = 'EV6FZEwQfr1NdJ9GZ4oSHRPDJZMYgpACCwQy6ipZFNPe';
const CANDY_GUARD_ID = 'F12KrDTqHQu9WT9ro8C7mEEyZM3z2cNKUjWM9q3Ucoqj';
const SOL_PAYMENT_DESTINATION = '3sj96bhYdZaCcLvpoGAmfGPSm97MhpU8BRFsw39QgE48';
const COLLECTION_MINT = 'DDA9DiC7ahLjiu4eUbvHdsD6Go9j4ar3JQeohegQ7Jzn';
// Collection NFT update authority = candy machine authority (wallet that ran sugar deploy)
const COLLECTION_UPDATE_AUTHORITY = 'BcEydyffqucnpNmLdpqhyYVpDkkbrX5B1Av1ibqk8jxw';

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

  const buildTx = () => {
    // Use Solana Keypair.generate() so every mint is a new keypair (avoids MetadataAccountMustBeEmpty from reuse)
    const kp = SolanaKeypair.generate();
    const nftMint = createSignerFromKeypair(umi, {
      publicKey: publicKey(kp.publicKey.toBase58()),
      secretKey: new Uint8Array(kp.secretKey),
    });
    return transactionBuilder()
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
  };

  const confirmOptions = { confirm: { commitment: 'confirmed' } };
  try {
    const tx = buildTx();
    const { signature } = await tx.sendAndConfirm(umi, confirmOptions);
    return signature;
  } catch (e) {
    // One retry only for "block height exceeded" (blockhash expired while user was approving in Phantom)
    if (isBlockhashExpired(e)) {
      const tx2 = buildTx();
      const { signature } = await tx2.sendAndConfirm(umi, confirmOptions);
      return signature;
    }
    throw e;
  }
}

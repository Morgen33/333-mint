import React, { useCallback, useRef, useState } from 'react';
import { usePhantom, useAccounts, useDisconnect, useSolana, useConnect } from '@phantom/react-sdk';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { mint } from './doMint';
import { explainMintError } from './mintErrors';
import { createPhantomSolanaAdapter } from './phantomSolanaAdapter';
import { ardriveUrlToArweave, getTokenImageUrl } from './tokenImages';
import './App.css';

// RPC and metadata: use proxy so "Load from wallet" works from any origin (no CORS)
const rawRpc = import.meta.env.VITE_RPC_URL || '/api/rpc';
const RPC = rawRpc.startsWith('http') ? rawRpc : `${window.location.origin}${rawRpc}`;
const METADATA_API = import.meta.env.VITE_METADATA_API || 'https://333collection.vercel.app';
// Collection mint for filtering wallet NFTs (must match candy machine collection)
const COLLECTION_MINT = 'DDA9DiC7ahLjiu4eUbvHdsD6Go9j4ar3JQeohegQ7Jzn';
// Main 333 collection site (showcase / info)
const MAIN_COLLECTION_URL = 'https://333collection.xyz/';
const SUPPLY_API = `${MAIN_COLLECTION_URL}api/candy-machine`;
const MAX_MINT_BATCH = 7;
const MINT_PRICE_SOL = 0.04;
const TOTAL_SUPPLY = 333;
const PREVIEW_TOKEN_IDS = [1, 2, 3, 4, 5, 6, 7];
const PREVIEW_INTERVAL_MS = 3500;

function clampMintCount(value) {
  return Math.min(MAX_MINT_BATCH, Math.max(1, Number(value) || 1));
}

// Awakening = 3–6 AM and 3–6 PM EST. Returns "YYYY-MM-DD:am" or "YYYY-MM-DD:pm", or null.
function getAwakeningWindowId() {
  const now = new Date();
  const est = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hours = est.getHours();
  const dateStr = est.toISOString().slice(0, 10);
  if (hours >= 3 && hours < 6) return `${dateStr}:am`;
  if (hours >= 15 && hours < 18) return `${dateStr}:pm`;
  return null;
}

async function hashWalletForTracking(walletAddress) {
  const enc = new TextEncoder();
  const data = await crypto.subtle.digest('SHA-256', enc.encode(walletAddress));
  return Array.from(new Uint8Array(data))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Record one unique wallet during this awakening window (idempotent per session).
function recordAwakeningVisit(apiBase, walletHash, windowId) {
  const key = `awakening_sent_${windowId}`;
  if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(key)) return;
  fetch(`${apiBase}/api/awakening-visit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletHash, windowId }),
  })
    .then(() => {
      try {
        sessionStorage.setItem(key, '1');
      } catch (_) {}
    })
    .catch(() => {});
}

// Fetch all 333 collection NFTs owned by wallet via Helius DAS getAssetsByOwner
async function fetchWallet333Tokens(ownerAddress, rpcUrl) {
  const allItems = [];
  let page = 1;
  const limit = 100;
  let hasMore = true;
  while (hasMore) {
    const body = {
      jsonrpc: '2.0',
      id: 'wallet-333',
      method: 'getAssetsByOwner',
      params: {
        ownerAddress,
        page,
        limit,
        options: { showFungible: false },
      },
    };
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error.message || 'RPC error');
    const result = json.result;
    const items = result?.items ?? [];
    for (const item of items) {
      const grouping = item.grouping || [];
      const is333 = grouping.some(
        (g) => (g.group_key === 'collection' && g.group_value === COLLECTION_MINT)
      );
      if (!is333) continue;
      const uri = item.content?.json_uri || item.content?.metadata?.uri || '';
      const match = /\/token\/(\d+)/i.exec(uri) || /(\d+)$/.exec(uri);
      const id = match ? parseInt(match[1], 10) : null;
      if (id >= 1 && id <= 333) allItems.push(id);
    }
    if (items.length < limit) hasMore = false;
    else page += 1;
  }
  return [...new Set(allItems)].sort((a, b) => a - b);
}

async function rpcCall(rpcUrl, method, params) {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `${method}-${Date.now()}`,
      method,
      params,
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || `RPC error (${method})`);
  return json.result;
}

function parseTokenIdFromUri(uri) {
  if (!uri) return null;
  const match = /\/token\/(\d+)/i.exec(uri) || /(\d+)$/.exec(uri);
  const id = match ? parseInt(match[1], 10) : null;
  return Number.isFinite(id) ? id : null;
}

function normalizeMediaUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const arweaveFromArdrive = ardriveUrlToArweave(url);
  if (arweaveFromArdrive) return arweaveFromArdrive;
  if (url.startsWith('ipfs://')) {
    return `https://ipfs.io/ipfs/${url.replace('ipfs://', '')}`;
  }
  if (url.startsWith('ar://')) {
    return `https://arweave.net/${url.replace('ar://', '')}`;
  }
  return url;
}

function isThumbProxyUrl(url) {
  return typeof url === 'string' && /333collection\.vercel\.app\/api\/thumb/i.test(url);
}

function pickImageFromAsset(asset) {
  const files = asset?.content?.files || [];

  // Prefer direct CDN/file URIs — the thumb proxy often 503s or takes 30s+.
  for (const f of files) {
    const uri = normalizeMediaUrl(f?.uri);
    if (!uri || isThumbProxyUrl(uri)) continue;
    if (/image|png|jpg|jpeg|gif|webp|avif/i.test(`${f?.mime || ''} ${uri}`)) {
      return uri;
    }
  }

  const linksImage = normalizeMediaUrl(asset?.content?.links?.image);
  if (linksImage && !isThumbProxyUrl(linksImage)) return linksImage;

  if (linksImage) return linksImage;

  const imageLike = files.find((f) =>
    /image|png|jpg|jpeg|gif|webp|avif/i.test(`${f?.mime || ''} ${f?.uri || ''}`)
  );
  if (imageLike?.uri) return normalizeMediaUrl(imageLike.uri);

  const anyUri = files.find((f) => f?.uri)?.uri;
  if (anyUri) return normalizeMediaUrl(anyUri);

  return null;
}

function pickDisplayImageUrl(metadataImage, metadataAnimation, asset) {
  const fromAsset = pickImageFromAsset(asset);
  const metaImage = normalizeMediaUrl(metadataImage);
  const metaAnimation = normalizeMediaUrl(metadataAnimation);

  if (fromAsset && !isThumbProxyUrl(fromAsset)) return fromAsset;
  if (metaImage && !isThumbProxyUrl(metaImage)) return metaImage;
  if (metaAnimation && !isThumbProxyUrl(metaAnimation)) return metaAnimation;
  return fromAsset || metaImage || metaAnimation;
}

async function resolveMintDisplay(mintAddress, rpcUrl, metadataApi) {
  const asset = await rpcCall(rpcUrl, 'getAsset', { id: mintAddress });
  const uri = asset?.content?.json_uri || asset?.content?.metadata?.uri || '';
  const tokenId = parseTokenIdFromUri(uri);

  // Prefer project metadata API so dynamic state (Awakened/Dormant) matches your site.
  if (tokenId && metadataApi) {
    try {
      const res = await fetch(`${metadataApi}/api/token/${tokenId}`);
      if (res.ok) {
        const data = await res.json();
        return {
          mint: mintAddress,
          tokenId,
          name: data?.name || `333 #${tokenId}`,
          image: getTokenImageUrl(tokenId, data?.attributes) || pickDisplayImageUrl(data?.image, data?.animation_url, asset),
          animationUrl: normalizeMediaUrl(data?.animation_url) || null,
          attributes: data?.attributes || [],
        };
      }
    } catch (_) {}
  }

  return {
    mint: mintAddress,
    tokenId,
    name: asset?.content?.metadata?.name || (tokenId ? `333 #${tokenId}` : mintAddress),
    image: pickImageFromAsset(asset),
    animationUrl: normalizeMediaUrl(asset?.content?.links?.animation) || null,
    attributes: asset?.content?.metadata?.attributes || [],
  };
}

const MINT_GALLERY_STORAGE_KEY = (wallet) => `333_mint_gallery_${wallet}`;

function loadMintGallery(wallet) {
  if (!wallet) return [];
  try {
    const raw = localStorage.getItem(MINT_GALLERY_STORAGE_KEY(wallet));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveMintGallery(wallet, items) {
  if (!wallet) return;
  try {
    localStorage.setItem(MINT_GALLERY_STORAGE_KEY(wallet), JSON.stringify(items));
  } catch (_) {}
}

async function resolveMintDisplayWithRetry(mintAddress, rpcUrl, metadataApi, attempts = 8, delayMs = 600) {
  let lastError = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const result = await resolveMintDisplay(mintAddress, rpcUrl, metadataApi);
      if (result?.image || result?.tokenId) return result;
    } catch (e) {
      lastError = e;
    }
    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  if (lastError) throw lastError;
  return resolveMintDisplay(mintAddress, rpcUrl, metadataApi);
}

function enqueueMintGalleryResolve(wallet, mintAddress, signature, rpcUrl, metadataApi, upsert, update) {
  upsert(wallet, {
    mint: mintAddress,
    signature,
    name: 'Your 333',
    image: null,
    loading: true,
    mintedAt: Date.now(),
  });

  resolveMintDisplayWithRetry(mintAddress, rpcUrl, metadataApi)
    .then((resolved) =>
      update(wallet, mintAddress, {
        ...resolved,
        signature,
        loading: false,
        mintedAt: Date.now(),
      })
    )
    .catch(() =>
      update(wallet, mintAddress, {
        name: '333 — refresh to load image',
        loading: false,
        signature,
      })
    );
}

async function fetchMintedFromSignature(signature, walletAddress, rpcUrl, metadataApi) {
  const tx = await rpcCall(rpcUrl, 'getTransaction', [
    signature,
    { maxSupportedTransactionVersion: 0, encoding: 'json' },
  ]);
  const post = tx?.meta?.postTokenBalances || [];
  const pre = tx?.meta?.preTokenBalances || [];
  const preMints = new Set(pre.map((b) => b?.mint).filter(Boolean));

  const candidate =
    post.find(
      (b) =>
        b?.owner === walletAddress &&
        b?.uiTokenAmount?.decimals === 0 &&
        b?.uiTokenAmount?.amount === '1' &&
        !preMints.has(b?.mint)
    ) ||
    post.find((b) => b?.uiTokenAmount?.decimals === 0 && b?.uiTokenAmount?.amount === '1');

  if (!candidate?.mint) return null;
  return resolveMintDisplay(candidate.mint, rpcUrl, metadataApi);
}

async function fetchRecentCollectionMints(rpcUrl, metadataApi, candyMachineAddress, limit = 12) {
  const signatures = await rpcCall(rpcUrl, 'getSignaturesForAddress', [candyMachineAddress, { limit: 40 }]);
  const mintEntries = [];
  const seen = new Set();

  for (const s of signatures || []) {
    if (!s?.signature) continue;
    try {
      const tx = await rpcCall(rpcUrl, 'getTransaction', [
        s.signature,
        { maxSupportedTransactionVersion: 0, encoding: 'json' },
      ]);
      const post = tx?.meta?.postTokenBalances || [];
      const pre = tx?.meta?.preTokenBalances || [];
      const preMints = new Set(pre.map((b) => b?.mint).filter(Boolean));

      const minted = post.find(
        (b) =>
          b?.uiTokenAmount?.decimals === 0 &&
          b?.uiTokenAmount?.amount === '1' &&
          !preMints.has(b?.mint)
      );
      if (!minted?.mint || seen.has(minted.mint)) continue;
      seen.add(minted.mint);
      mintEntries.push({ mint: minted.mint, signature: s.signature });
      if (mintEntries.length >= limit) break;
    } catch (_) {}
  }

  const results = await Promise.all(
    mintEntries.map(({ mint, signature }) =>
      resolveMintDisplay(mint, rpcUrl, metadataApi)
        .then((item) => ({ ...item, signature }))
        .catch(() => null)
    )
  );
  return results.filter(Boolean);
}

function JustMintedCard({ item }) {
  const stateAttr = item.attributes?.find((a) => a.trait_type === 'State');
  const isAwakened = stateAttr?.value === 'Awakened';
  const mediaUrl =
    item.tokenId != null ? getTokenImageUrl(item.tokenId, item.attributes) : item.image;

  return (
    <div className="viewer-result just-minted-item">
      {item.loading ? (
        <div className="mint-gallery-skeleton" aria-hidden="true" />
      ) : mediaUrl ? (
        <img
          src={mediaUrl}
          alt={item.name}
          className="viewer-image"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="mint-gallery-placeholder">Loading…</div>
      )}
      <h3>
        {item.name}
        {item.tokenId ? ` #${item.tokenId}` : ''}
      </h3>
      {stateAttr && (
        <span className={`just-minted-state${isAwakened ? ' just-minted-state-awakened' : ''}`}>
          {stateAttr.value}
        </span>
      )}
    </div>
  );
}

function MintPreview() {
  const [active, setActive] = useState(0);
  const [loaded, setLoaded] = useState(() => new Set());

  React.useEffect(() => {
    const id = setInterval(() => {
      setActive((i) => {
        const next = (i + 1) % PREVIEW_TOKEN_IDS.length;
        return loaded.has(next) ? next : i;
      });
    }, PREVIEW_INTERVAL_MS);
    return () => clearInterval(id);
  }, [loaded]);

  const markLoaded = (i) => setLoaded((prev) => new Set(prev).add(i));
  // Only mount the visible image and the next one, so we don't pull all seven up front.
  const mounted = new Set([active, (active + 1) % PREVIEW_TOKEN_IDS.length]);

  return (
    <div className="mint-preview">
      {!loaded.has(active) && <div className="mint-preview-skeleton" aria-hidden="true" />}
      {PREVIEW_TOKEN_IDS.map((tokenId, i) =>
        mounted.has(i) || loaded.has(i) ? (
          <img
            key={tokenId}
            src={`${METADATA_API}/api/thumb?id=${tokenId}`}
            alt=""
            className={`mint-preview-img${i === active && loaded.has(i) ? ' mint-preview-img-active' : ''}`}
            onLoad={() => markLoaded(i)}
          />
        ) : null
      )}
      <span className="mint-preview-badge">Awakens 3–6 AM &amp; PM EST</span>
    </div>
  );
}

function MintResultModal({ result, gallery, onClose }) {
  React.useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const { minted, failure, requested } = result;
  const items = minted.map(
    (m) => gallery.find((g) => g.mint === m.mint) || { ...m, name: 'Your 333', loading: true }
  );
  const succeeded = items.length > 0;
  const title = succeeded
    ? failure
      ? `Minted ${items.length} of ${requested}`
      : items.length === 1
        ? 'Mint successful!'
        : `You minted ${items.length}!`
    : failure.title;

  return (
    <div className="mint-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className={`mint-modal${succeeded ? '' : ' mint-modal-failed'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mint-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="mint-modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <p className="mint-modal-label">{succeeded ? 'Welcome to 333' : 'Mint did not go through'}</p>
        <h2 id="mint-modal-title" className="mint-modal-title">{title}</h2>

        {succeeded && (
          <>
            <div className={`mint-modal-grid${items.length === 1 ? ' mint-modal-grid-single' : ''}`}>
              {items.map((item) => {
                const mediaUrl =
                  item.tokenId != null ? getTokenImageUrl(item.tokenId, item.attributes) : item.image;
                return (
                  <div key={item.mint || item.signature} className="mint-modal-item">
                    {item.loading || !mediaUrl ? (
                      <div className="mint-gallery-skeleton mint-modal-media" aria-hidden="true" />
                    ) : (
                      <img src={mediaUrl} alt={item.name} className="mint-modal-media" />
                    )}
                    <p className="mint-modal-name">{item.loading ? 'Revealing your 333…' : item.name}</p>
                    <div className="mint-modal-links">
                      <a href={`https://solscan.io/tx/${item.signature}`} target="_blank" rel="noopener noreferrer">
                        Solscan
                      </a>
                      {item.mint && (
                        <a
                          href={`https://magiceden.io/item-details/${item.mint}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Magic Eden
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mint-modal-note">
              It's already in your wallet. Phantom and other wallets can take a few minutes to show new NFTs.
            </p>
          </>
        )}

        {failure && (
          <div className="mint-modal-failure">
            {succeeded && <p className="mint-modal-failure-title">{failure.title}</p>}
            <p className="mint-modal-reason">{failure.reason}</p>
            {failure.charged && <p className="mint-modal-charged">{failure.charged}</p>}
            {failure.signature && (
              <a
                href={`https://solscan.io/tx/${failure.signature}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mint-modal-tx"
              >
                View transaction on Solscan
              </a>
            )}
            {failure.technical && failure.technical !== failure.reason && (
              <details className="mint-modal-details">
                <summary>Technical details</summary>
                <code>{failure.technical}</code>
              </details>
            )}
          </div>
        )}

        <button type="button" className="mint-modal-done" onClick={onClose}>
          {succeeded ? 'Done' : 'Close'}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const { isConnected: phantomConnected, isLoading: phantomLoading } = usePhantom();
  const addresses = useAccounts();
  const { disconnect: phantomDisconnect, isDisconnecting: phantomDisconnecting } = useDisconnect();
  const { connect: phantomConnect, isConnecting: phantomConnecting } = useConnect();
  const { solana, isAvailable } = useSolana();

  const {
    connected: adapterConnected,
    connecting: adapterConnecting,
    publicKey: adapterPublicKey,
    signTransaction: adapterSignTransaction,
    signAllTransactions: adapterSignAllTransactions,
    sendTransaction: adapterSendTransaction,
    disconnect: adapterDisconnect,
  } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();

  const [loading, setLoading] = useState(false);
  const [mintCount, setMintCount] = useState(1);
  const [mintProgress, setMintProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [successTx, setSuccessTx] = useState(null);
  const [mintResult, setMintResult] = useState(null);
  const [supply, setSupply] = useState(null);
  const [mintGallery, setMintGallery] = useState([]);
  const [justMinted, setJustMinted] = useState([]);
  const [justMintedLoading, setJustMintedLoading] = useState(true);
  const [awakeningStats, setAwakeningStats] = useState(null);
  const [awakeningStatsLoading, setAwakeningStatsLoading] = useState(false);
  const [viewId, setViewId] = useState('');
  const [viewMetaList, setViewMetaList] = useState([]);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError, setViewError] = useState('');
  const mintCancelledRef = useRef(false);
  const CANDY_MACHINE_ID = 'EV6FZEwQfr1NdJ9GZ4oSHRPDJZMYgpACCwQy6ipZFNPe';
  const JUST_MINTED_LIMIT = 12;

  // Prefer wallet adapter (Phantom/Solflare/etc); fallback to Phantom SDK (e.g. Google sign-in)
  const isConnected = adapterConnected || phantomConnected;
  const walletAddress =
    (adapterPublicKey && adapterPublicKey.toBase58()) ?? addresses?.[0]?.address ?? null;
  const isConnecting = phantomConnecting;
  const isDisconnecting = phantomDisconnecting;

  const upsertMintGalleryItem = useCallback((wallet, item) => {
    setMintGallery((prev) => {
      const next = [item, ...prev.filter((x) => x.mint !== item.mint)];
      saveMintGallery(wallet, next);
      return next;
    });
    setJustMinted((prev) =>
      [item, ...prev.filter((x) => x.mint !== item.mint)].slice(0, JUST_MINTED_LIMIT)
    );
  }, []);

  const updateMintGalleryItem = useCallback((wallet, mint, patch) => {
    setMintGallery((prev) => {
      const next = prev.map((x) => (x.mint === mint ? { ...x, ...patch } : x));
      saveMintGallery(wallet, next);
      return next;
    });
    if (!patch.loading) {
      setJustMinted((prev) => {
        const item = { mint, ...patch };
        return [item, ...prev.filter((x) => x.mint !== mint)].slice(0, JUST_MINTED_LIMIT);
      });
    }
  }, []);

  const refreshJustMinted = useCallback(() => {
    setJustMintedLoading(true);
    fetchRecentCollectionMints(RPC, METADATA_API, CANDY_MACHINE_ID, JUST_MINTED_LIMIT)
      .then((items) => setJustMinted(items))
      .catch((e) => {
        console.error('Could not load just minted feed:', e);
      })
      .finally(() => setJustMintedLoading(false));
  }, []);

  React.useEffect(() => {
    refreshJustMinted();
    const intervalId = setInterval(refreshJustMinted, 45_000);
    return () => clearInterval(intervalId);
  }, [refreshJustMinted]);

  // itemsRedeemed only grows, so never let a cached response roll back an optimistic update.
  const applySupply = useCallback((itemsRedeemed) => {
    setSupply((prev) => ({ itemsRedeemed: Math.max(prev?.itemsRedeemed ?? 0, itemsRedeemed) }));
  }, []);

  const refreshSupply = useCallback(() => {
    fetch(SUPPLY_API)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        if (Number.isFinite(data?.itemsRedeemed)) applySupply(data.itemsRedeemed);
      })
      .catch((e) => console.error('Could not load supply:', e));
  }, [applySupply]);

  React.useEffect(() => {
    refreshSupply();
    const intervalId = setInterval(refreshSupply, 30_000);
    return () => clearInterval(intervalId);
  }, [refreshSupply]);

  const remaining = supply ? Math.max(0, TOTAL_SUPPLY - supply.itemsRedeemed) : TOTAL_SUPPLY;
  const soldOut = supply != null && remaining === 0;
  const maxMintable = Math.max(1, Math.min(MAX_MINT_BATCH, remaining));

  React.useEffect(() => {
    setMintCount((n) => Math.min(n, maxMintable));
  }, [maxMintable]);

  React.useEffect(() => {
    if (!walletAddress) {
      setMintGallery([]);
      return;
    }
    setMintGallery(loadMintGallery(walletAddress));
  }, [walletAddress]);

  // Record visit when connected during an awakening window (once per window per session)
  React.useEffect(() => {
    const windowId = getAwakeningWindowId();
    if (!walletAddress || !windowId) return;
    hashWalletForTracking(walletAddress).then((walletHash) => {
      recordAwakeningVisit(METADATA_API, walletHash, windowId);
    });
  }, [walletAddress, METADATA_API]);

  const handleView = useCallback(() => {
    const raw = viewId.replace(/,/g, ' ').split(/\s+/).filter(Boolean);
    const ids = [...new Set(raw.map((s) => parseInt(s, 10)).filter((n) => !isNaN(n) && n >= 1 && n <= 333))];
    if (ids.length === 0) {
      setViewError('Enter one or more numbers 1–333 (e.g. 1, 5, 10)');
      return;
    }
    if (ids.length > 50) {
      setViewError('Max 50 tokens when entering numbers. Use "Load from wallet" to see all.');
      return;
    }
    setViewError('');
    setViewMetaList([]);
    setViewLoading(true);
    setTimeout(() => {
      Promise.all(
        ids.map((id) =>
          fetch(`${METADATA_API}/api/token/${id}`)
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Could not load'))))
            .then((data) => ({ id, data }))
        )
      )
        .then((results) => setViewMetaList(results))
        .catch((e) => setViewError(e?.message || 'Failed to load'))
        .finally(() => setViewLoading(false));
    }, 0);
  }, [viewId]);

  const handleLoadFromWallet = useCallback(() => {
    if (!isConnected || !walletAddress) {
      setViewError('Connect your wallet first.');
      return;
    }
    setViewError('');
    setViewMetaList([]);
    setViewLoading(true);
    setTimeout(() => {
      fetchWallet333Tokens(walletAddress, RPC)
        .then((ids) => {
          if (ids.length === 0) {
            setViewError('No 333 tokens in this wallet.');
            return;
          }
          return Promise.all(
            ids.map((id) =>
              fetch(`${METADATA_API}/api/token/${id}`)
                .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Could not load'))))
                .then((data) => ({ id, data }))
            )
          );
        })
        .then((results) => {
          if (Array.isArray(results)) setViewMetaList(results);
        })
        .catch((e) => setViewError(e?.message || 'Failed to load wallet NFTs'))
        .finally(() => setViewLoading(false));
    }, 0);
  }, [isConnected, walletAddress]);

  const handleMint = useCallback(() => {
    if (!isConnected || !walletAddress) {
      setError('Connect your wallet first.');
      return;
    }
    // Use wallet adapter (Phantom/Solflare/etc) or Phantom SDK (Google sign-in) for signing
    const mintAdapter =
      adapterConnected && adapterPublicKey && adapterSignTransaction && adapterSignAllTransactions
        ? {
            publicKey: adapterPublicKey,
            signTransaction: adapterSignTransaction,
            signAllTransactions: adapterSignAllTransactions,
            sendTransaction: adapterSendTransaction,
          }
        : createPhantomSolanaAdapter(solana, walletAddress);
    if (!mintAdapter) {
      setError('Wallet not ready. Try disconnecting and reconnecting.');
      return;
    }
    if (loading) return;
    const requestedCount = Math.min(clampMintCount(mintCount), maxMintable);
    setError('');
    setSuccess('');
    setSuccessTx(null);
    setMintResult(null);
    mintCancelledRef.current = false;
    setLoading(true);
    setMintProgress({ done: 0, total: requestedCount });
    setTimeout(() => {
      (async () => {
        const minted = [];
        let failure = null;
        for (let i = 0; i < requestedCount; i += 1) {
          if (mintCancelledRef.current) break;
          let result;
          try {
            result = await mint(mintAdapter, RPC);
          } catch (e) {
            console.error('Mint failed:', e);
            failure = explainMintError(e);
            break;
          }
          if (mintCancelledRef.current) break;
          const signature = typeof result === 'string' ? result : result?.signature;
          const mintAddress = typeof result === 'object' ? result?.mintAddress : null;
          if (typeof signature === 'string') {
            minted.push({ signature, mint: mintAddress });
            if (mintAddress) {
              enqueueMintGalleryResolve(
                walletAddress,
                mintAddress,
                signature,
                RPC,
                METADATA_API,
                upsertMintGalleryItem,
                updateMintGalleryItem
              );
            }
          }
          setMintProgress({ done: i + 1, total: requestedCount });
          // Small delay helps wallet UX between signature prompts.
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
        return { minted, failure };
      })()
        .then(({ minted, failure }) => {
          if (mintCancelledRef.current) return;
          const signatures = minted.map((m) => m.signature);
          if (signatures.length > 0) {
            setSuccessTx(signatures[signatures.length - 1]);
            setSuccess(
              signatures.length === 1
                ? "You've minted! Check your wallet."
                : `Done! Minted ${signatures.length} NFTs.`
            );
            setSupply((prev) => (prev ? { itemsRedeemed: prev.itemsRedeemed + signatures.length } : prev));
            refreshSupply();
            refreshJustMinted();
          }
          if (failure) setError(`${failure.title}: ${failure.reason}`);
          else if (signatures.length === 0) setError('No mints completed.');
          if (signatures.length > 0 || failure) {
            setMintResult({ minted, failure, requested: requestedCount });
          }
        })
        .finally(() => {
          setLoading(false);
          setMintProgress({ done: 0, total: 0 });
        });
    }, 0);
  }, [isConnected, walletAddress, adapterConnected, adapterPublicKey, adapterSignTransaction, adapterSignAllTransactions, adapterSendTransaction, solana, isAvailable, loading, mintCount, maxMintable, upsertMintGalleryItem, updateMintGalleryItem, refreshJustMinted, refreshSupply]);

  const handleCancelMint = useCallback(() => {
    mintCancelledRef.current = true;
    setLoading(false);
  }, []);

  const closeMintResult = useCallback(() => setMintResult(null), []);

  return (
    <div className="page">
      {mintResult && (
        <MintResultModal result={mintResult} gallery={mintGallery} onClose={closeMintResult} />
      )}
      <a href={MAIN_COLLECTION_URL} className="back-to-collection" rel="noopener noreferrer">
        ← Back to 333 Collection
      </a>
      <header className="hero">
        <p className="top-line">Blood Moon Launch</p>
        <h1 className="title">333</h1>
        <p className="sub">The Collection</p>
        <p className="tagline">333 manifestation tokens on Solana. Each one awakens 3–6 AM and 3–6 PM EST — every day, forever.</p>
      </header>

      <div className="card mint-card">
        <MintPreview />
        <div className="mint-card-body">
          <div className="mint-stats">
            <div>
              <span className="mint-stat-label">Price</span>
              <span className="mint-stat-value">{MINT_PRICE_SOL} SOL</span>
            </div>
            <div className="mint-stat-right">
              <span className="mint-stat-label">Minted</span>
              <span className="mint-stat-value">
                {supply ? supply.itemsRedeemed : '—'}
                <span className="mint-stat-total"> / {TOTAL_SUPPLY}</span>
              </span>
            </div>
          </div>
          <div className="mint-progress" aria-hidden="true">
            <div
              className="mint-progress-fill"
              style={{ width: `${supply ? (supply.itemsRedeemed / TOTAL_SUPPLY) * 100 : 0}%` }}
            />
          </div>

          {isConnected && (
            <div className="mint-wallet">
              <span className="mint-wallet-dot" aria-hidden="true" />
              <span className="mint-wallet-address">
                {walletAddress ? `${walletAddress.slice(0, 4)}…${walletAddress.slice(-4)}` : 'Connected'}
              </span>
              <button
                type="button"
                className="mint-text-btn"
                onClick={async () => {
                  try {
                    if (adapterConnected) adapterDisconnect();
                    else await phantomDisconnect();
                  } catch (e) {
                    console.error('Disconnect failed:', e);
                  }
                }}
                disabled={isDisconnecting}
              >
                {isDisconnecting ? 'Disconnecting…' : 'Disconnect'}
              </button>
            </div>
          )}

          {!soldOut && (
            <div className="mint-order">
              <div className="mint-stepper" aria-label="How many to mint">
                <button
                  type="button"
                  className="mint-stepper-btn"
                  disabled={loading || mintCount <= 1}
                  aria-label="Mint one fewer"
                  onClick={() => setMintCount((n) => clampMintCount(n - 1))}
                >
                  −
                </button>
                <span className="mint-stepper-value" aria-live="polite">{mintCount}</span>
                <button
                  type="button"
                  className="mint-stepper-btn"
                  disabled={loading || mintCount >= maxMintable}
                  aria-label="Mint one more"
                  onClick={() => setMintCount((n) => Math.min(maxMintable, clampMintCount(n + 1)))}
                >
                  +
                </button>
              </div>
              <div className="mint-total">
                <span className="mint-stat-label">Total</span>
                <span className="mint-total-value">{(MINT_PRICE_SOL * mintCount).toFixed(2)} SOL</span>
              </div>
            </div>
          )}

          {soldOut ? (
            <button type="button" className="mint-primary-btn" disabled>
              Sold out
            </button>
          ) : !isConnected ? (
            <button
              type="button"
              className="mint-primary-btn"
              onClick={() => setWalletModalVisible(true)}
              disabled={adapterConnecting}
            >
              {adapterConnecting ? 'Connecting…' : 'Connect wallet'}
            </button>
          ) : (
            <button type="button" className="mint-primary-btn" onClick={handleMint} disabled={loading}>
              {loading
                ? mintProgress.total > 1
                  ? `Minting ${Math.min(mintProgress.done + 1, mintProgress.total)} of ${mintProgress.total}…`
                  : 'Minting…'
                : mintCount > 1
                  ? `Mint ${mintCount}`
                  : 'Mint'}
            </button>
          )}

          {!isConnected && !soldOut && (
            <button
              type="button"
              className="mint-text-btn mint-google-link"
              onClick={async () => {
                try {
                  await phantomConnect({ provider: 'google' });
                } catch (e) {
                  console.error('Google sign-in failed:', e);
                }
              }}
              disabled={adapterConnecting || isConnecting}
            >
              {isConnecting ? 'Connecting…' : 'No wallet? Sign in with Google'}
            </button>
          )}
          {loading && (
            <button type="button" className="mint-text-btn" onClick={handleCancelMint}>
              Cancel
            </button>
          )}

          {error && !loading && <p className="mint-status mint-status-error">{error}</p>}
          {success && !loading && (
            <p className="mint-status mint-status-success">
              {success}
              {successTx && (
                <a href={`https://solscan.io/tx/${successTx}`} target="_blank" rel="noopener noreferrer">
                  View on Solscan
                </a>
              )}
            </p>
          )}
        </div>
      </div>

      <div className="card viewer-card">
        <p className="section-label">Live view</p>
        <h2 className="viewer-heading">View your 333</h2>
        <p className="viewer-desc">See whether each 333 is Awakened or Dormant right now.</p>
        <p className="viewer-notice">
          Phantom and Solflare don't refresh images in time for Awakening (3–6 AM &amp; PM EST) — check here instead.
        </p>
        <div className="viewer-stats">
          <button
            type="button"
            className="mint-text-btn"
            onClick={() => {
              setAwakeningStatsLoading(true);
              fetch(`${METADATA_API}/api/awakening-stats`)
                .then((r) => r.json())
                .then((data) => setAwakeningStats(data))
                .catch(() => setAwakeningStats({ totalUniqueWallets: 0, byWindow: [], message: 'Could not load stats.' }))
                .finally(() => setAwakeningStatsLoading(false));
            }}
            disabled={awakeningStatsLoading}
          >
            {awakeningStatsLoading ? 'Loading…' : 'How many connected during Awakening?'}
          </button>
          {awakeningStats && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#d4d4d4' }}>
              <strong>Unique wallets during Awakening:</strong> {awakeningStats.totalUniqueWallets}
              {awakeningStats.byWindow?.length > 0 && (
                <ul style={{ margin: '0.25rem 0 0 1rem', paddingLeft: 0 }}>
                  {awakeningStats.byWindow.slice(0, 7).map((w) => (
                    <li key={w.windowId}>
                      {w.windowId} — {w.uniqueWallets}
                    </li>
                  ))}
                </ul>
              )}
              {awakeningStats.message && (
                <p style={{ margin: '0.25rem 0 0', color: '#71717a', fontSize: '0.8rem' }}>{awakeningStats.message}</p>
              )}
            </div>
          )}
        </div>
        <div className="viewer-actions">
          <button
            type="button"
            className="viewer-btn viewer-btn-wallet"
            onClick={handleLoadFromWallet}
            disabled={!isConnected || viewLoading}
            aria-label="Load all 333 from wallet"
          >
            {viewLoading ? 'Loading…' : isConnected ? 'Load from wallet' : 'Connect a wallet to load yours'}
          </button>
          <div className="viewer-input">
            <input
              type="text"
              inputMode="numeric"
              placeholder="Or enter numbers: 1, 5, 10"
              value={viewId}
              onChange={(e) => setViewId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleView()}
              aria-label="Token numbers"
            />
            <button
              type="button"
              className="viewer-btn"
              onClick={(e) => { e.preventDefault(); handleView(); }}
              disabled={viewLoading}
              aria-label="View token"
            >
              {viewLoading ? '…' : 'View'}
            </button>
          </div>
        </div>
        {viewError && <div className="error">{viewError}</div>}
        {viewMetaList.length > 0 && (
          <div className="viewer-grid">
            {viewMetaList.map(({ id, data }) => {
              const mediaUrl = getTokenImageUrl(id, data.attributes) || data.image;
              return (
              <div key={id} className="viewer-result">
                <img src={mediaUrl} alt={data.name} className="viewer-image" />
                <h3>{data.name}</h3>
                <div className="viewer-attrs">
                  {data.attributes?.map((a, i) => (
                    <span key={i} className={a.trait_type === 'State' ? 'viewer-state' : ''}>
                      {a.trait_type}: <strong>{a.value}</strong>
                    </span>
                  ))}
                </div>
              </div>
              );
            })}
            <p className="viewer-live viewer-live-grid">Live from the collection — refreshes when you view again.</p>
          </div>
        )}
      </div>

      <div className="card just-minted-card">
        <div className="just-minted-header">
          <div>
            <p className="section-label">Live feed</p>
            <h2 className="viewer-heading">Just minted</h2>
            <p className="viewer-desc">The latest 333s from the collection — visible to everyone.</p>
          </div>
          <button
            type="button"
            onClick={refreshJustMinted}
            disabled={justMintedLoading}
            className="viewer-btn just-minted-refresh"
          >
            {justMintedLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        {justMintedLoading && justMinted.length === 0 ? (
          <div className="viewer-grid">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="viewer-result just-minted-item">
                <div className="mint-gallery-skeleton" aria-hidden="true" />
              </div>
            ))}
          </div>
        ) : justMinted.length > 0 ? (
          <div className="viewer-grid">
            {justMinted.map((item) => (
              <JustMintedCard key={item.mint} item={item} />
            ))}
          </div>
        ) : (
          <p className="just-minted-empty">No mints yet — be the first.</p>
        )}
      </div>

      {mintGallery.length > 0 && (
        <div className="card mint-gallery-card">
          <p className="section-label">Your mints</p>
          <h2 className="viewer-heading">Minted on this page</h2>
          <p className="viewer-desc">Saved for this wallet — stays here after you mint.</p>
          <div className="viewer-grid">
            {mintGallery.map((item) => (
              <div key={item.mint} className="viewer-result mint-gallery-item">
                {item.loading ? (
                  <div className="mint-gallery-skeleton" aria-hidden="true" />
                ) : (item.tokenId != null ? getTokenImageUrl(item.tokenId, item.attributes) : item.image) ? (
                  <img
                    src={item.tokenId != null ? getTokenImageUrl(item.tokenId, item.attributes) : item.image}
                    alt={item.name}
                    className="viewer-image"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="mint-gallery-placeholder">Image loading…</div>
                )}
                <p style={{ marginTop: '0.5rem' }}>
                  <strong>{item.name}</strong>
                  {item.tokenId ? ` (#${item.tokenId})` : ''}
                </p>
                {item.signature && (
                  <a
                    href={`https://solscan.io/tx/${item.signature}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="success-link"
                    style={{ marginLeft: 0, fontSize: '0.8rem' }}
                  >
                    View transaction
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <footer className="site-footer">
        <div className="footer-brand">
          <strong>The 333 Collection</strong>
          <span>Solana · Metaplex · 3/3/2026</span>
        </div>
        <div className="footer-links">
          <span>5% royalties</span>
          <span>·</span>
          <span>Immutable metadata</span>
        </div>
      </footer>
    </div>
  );
}

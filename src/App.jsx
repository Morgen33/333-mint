import React, { useCallback, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { mint } from './doMint';
import './App.css';

const rawRpc = import.meta.env.VITE_RPC_URL || '/api/rpc';
const RPC = rawRpc.startsWith('/')
  ? `${window.location.origin}${rawRpc}`
  : rawRpc;

// API for live metadata (Awakened/Dormant) — use collection API origin
const METADATA_API = import.meta.env.VITE_METADATA_API || 'https://333collection.vercel.app';
// Collection mint for filtering wallet NFTs (must match candy machine collection)
const COLLECTION_MINT = 'DDA9DiC7ahLjiu4eUbvHdsD6Go9j4ar3JQeohegQ7Jzn';

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

export default function App() {
  const { wallet, publicKey: walletPubkey, connected, disconnect } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [successTx, setSuccessTx] = useState(null);
  const mintCancelledRef = useRef(false);

  // View your 333 — live state from API (bypasses wallet cache); can view multiple or load from wallet
  const [viewId, setViewId] = useState('');
  const [viewMetaList, setViewMetaList] = useState([]);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError, setViewError] = useState('');

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
    if (!connected || !walletPubkey) {
      setViewError('Connect your wallet first.');
      return;
    }
    setViewError('');
    setViewMetaList([]);
    setViewLoading(true);
    setTimeout(() => {
      fetchWallet333Tokens(walletPubkey.toBase58(), RPC)
        .then((ids) => {
          if (ids.length === 0) {
            setViewError("No 333 tokens in this wallet.");
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
  }, [connected, walletPubkey]);

  const handleMint = useCallback(() => {
    if (!connected || !walletPubkey || !wallet?.adapter) {
      setError('Connect your wallet first.');
      return;
    }
    if (loading) return;
    setError('');
    setSuccess('');
    setSuccessTx(null);
    mintCancelledRef.current = false;
    setLoading(true);
    setTimeout(() => {
      mint(wallet.adapter, RPC)
        .then((signature) => {
          if (mintCancelledRef.current) return;
          setSuccess("You've minted! Check your wallet.");
          setSuccessTx(typeof signature === 'string' ? signature : null);
        })
        .catch((e) => {
          if (mintCancelledRef.current) return;
          const msg = e?.message || String(e);
          setError(/block height exceeded|expired/i.test(msg) ? 'Transaction expired. Please try Mint again.' : msg);
        })
        .finally(() => setLoading(false));
    }, 0);
  }, [connected, walletPubkey, wallet, loading]);

  const handleCancelMint = useCallback(() => {
    mintCancelledRef.current = true;
    setLoading(false);
  }, []);

  return (
    <div className="page">
      <header className="hero">
        <p className="top-line">Blood Moon Launch</p>
        <h1 className="title">333</h1>
        <p className="sub">The Collection</p>
        <p className="tagline">333 manifestation tokens on Solana. Each one awakens 3–6 AM and 3–6 PM EST — every day, forever.</p>
      </header>

      <div className="card">
        <p className="section-label">Collection</p>
        <h1 className="card-title">The 333 Collection</h1>
        <p className="card-mint-line">0.04 SOL · 333 total</p>
        <div className="wallet wallet-row">
          <WalletMultiButton />
          {connected && (
            <button
              type="button"
              onClick={() => disconnect()}
              className="disconnect-btn"
              aria-label="Disconnect wallet"
            >
              Disconnect
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={handleMint} disabled={!connected || loading}>
            {loading ? 'Minting…' : connected ? 'Mint — 0.04 SOL' : 'Connect wallet to mint'}
          </button>
          {loading && (
            <button
              type="button"
              onClick={handleCancelMint}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: 8,
                border: '1px solid #71717a',
                background: 'transparent',
                color: '#a1a1aa',
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          )}
        </div>
        {error && <div className="error">{error}</div>}
        {success && (
          <div className="success">
            {success}
            {successTx && (
              <a href={`https://solscan.io/tx/${successTx}`} target="_blank" rel="noopener noreferrer" className="success-link">
                View on Solscan
              </a>
            )}
          </div>
        )}
      </div>

      <div className="card viewer-card">
        <p className="section-label">Live view</p>
        <h2 className="viewer-heading">View your 333</h2>
        <p className="viewer-desc">See Awakened or Dormant as the collection sees it — no wallet cache. Load all from your wallet or enter token numbers.</p>
        <p className="viewer-notice">
          To view your NFT during Awakening (3–6 AM and 3–6 PM EST), come here and load your wallet below. Phantom and Solflare do not refresh NFT images in time — this page shows the current state.
        </p>
        <div className="viewer-actions">
          <button
            type="button"
            className="viewer-btn viewer-btn-wallet"
            onClick={handleLoadFromWallet}
            disabled={!connected || viewLoading}
            aria-label="Load all 333 from wallet"
          >
            {viewLoading ? 'Loading…' : connected ? 'Load from wallet' : 'Connect wallet to load'}
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
            {viewMetaList.map(({ id, data }) => (
              <div key={id} className="viewer-result">
                <img src={data.image} alt={data.name} className="viewer-image" />
                <h3>{data.name}</h3>
                <div className="viewer-attrs">
                  {data.attributes?.map((a, i) => (
                    <span key={i} className={a.trait_type === 'State' ? 'viewer-state' : ''}>
                      {a.trait_type}: <strong>{a.value}</strong>
                    </span>
                  ))}
                </div>
              </div>
            ))}
            <p className="viewer-live viewer-live-grid">Live from the collection — refreshes when you view again.</p>
          </div>
        )}
      </div>

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

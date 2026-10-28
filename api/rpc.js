/**
 * RPC proxy for the 333 mint/landing page.
 * "View NFTs in wallet" uses getAssetsByOwner, which only works with Helius (or other DAS RPC).
 * Public Solana RPC does not support it → use RPC_UPSTREAM or HELIUS_RPC_URL in Vercel env.
 */
function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Use only full URLs here. Do NOT use VITE_RPC_URL — it may be "/api/rpc" for the client.
  const upstream = process.env.RPC_UPSTREAM || process.env.HELIUS_RPC_URL || '';
  if (!upstream.startsWith('http')) {
    return res.status(500).json({ error: 'RPC_UPSTREAM / HELIUS_RPC_URL must be a full URL (e.g. https://...)' });
  }

  try {
    const response = await fetch(upstream, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {}),
    });
    const text = await response.text();
    res.status(response.status);
    res.setHeader('Content-Type', 'application/json');
    res.send(text);
  } catch (error) {
    res.status(500).json({ error: error?.message || 'RPC proxy failed' });
  }
}

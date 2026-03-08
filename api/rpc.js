export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const upstream = process.env.RPC_UPSTREAM || 'https://api.mainnet-beta.solana.com';
    const response = await fetch(upstream, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req.body),
    });

    const text = await response.text();
    res.status(response.status);
    res.setHeader('content-type', 'application/json');
    res.send(text);
  } catch (error) {
    res.status(500).json({ error: error?.message || 'RPC proxy failed' });
  }
}

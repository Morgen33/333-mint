/**
 * Fast thumbnail proxy: fetches from arweave.net (ArDrive gateway often 504s).
 * Theme logic matches 333_collection/api/lib/tokenCommon.js
 */
const THEMES = [
  { baseId: 'RKj1g_vqaNV_k_A1smHh1SW9Y_Faa1WWSIxwnOqKVEw', glitchId: 'yaaqLaYlJ0af0YVPKK7qj7XtfgONatYcpHvkEl64IUs' },
  { baseId: 'n1Q6H0oz2i3IRK2GZuT6RE5YRhfY7_ewIJrXe3OdSxU', glitchId: 'Kvx6qV41nW2_93Am5iWNutcideWXbzUZX0q-v9SimBw' },
  { baseId: '5jY9jChPqIlNtNBGsfyXjRyXfl6RvLurBj4uHnPXfFs', glitchId: 'fqt0n3jG5dN8r50TGxO2_ZLkYqAiP42iMrHuHNDNNno' },
  { baseId: '3QGjEhO49isfTWFCLGg2VPLXpfIPl_LFP6MVRs4swKw', glitchId: 'gHsqVQ3iOz6MckZcKzo42RNifadZ0fRvh-5JF3IrVUc' },
  { baseId: 'DM-T6QA9pDpV5NKkwnW0kLgglCJzqwg1jzCO-0cMHPg', glitchId: 'ZiKHBfEqD2qfNN4KeDrc8-yhPUGHBZoW0BafI2ehAEc' },
  { baseId: '-bre7BH9qV8m-ffXLV4OMS6KZymbK_oG_osPmDIONkg', glitchId: 'RCil00YohvfIIKPYOF9YkYNMrzHuPtkHw06wM8F5snE' },
  { baseId: 'EWzBa24EI0BvqAB-GptMEJq6HgnMaANUD595YAu5MVo', glitchId: 'p8NLsBg0hDHWyBYRH3MHrPHQukctbsSpMUsKapepvlw' },
];

function isAwakeningWindow() {
  const now = new Date();
  const hour = parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      hour12: false,
    })
      .formatToParts(now)
      .find((p) => p.type === 'hour').value,
    10
  );
  return (hour >= 3 && hour <= 6) || (hour >= 15 && hour <= 18);
}

function arweaveUrlForTokenId(id) {
  const theme = THEMES[(id - 1) % 7];
  const imageId = isAwakeningWindow() ? theme.glitchId : theme.baseId;
  return `https://arweave.net/${imageId}`;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const id = parseInt(String(req.query?.id || '').trim(), 10);
  if (isNaN(id) || id < 1 || id > 333) {
    res.status(400).json({ error: 'Invalid token id' });
    return;
  }

  res.redirect(302, arweaveUrlForTokenId(id));
}

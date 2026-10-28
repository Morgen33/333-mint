/** Theme image IDs — keep in sync with 333_collection/api/lib/tokenCommon.js */
export const TOKEN_THEMES = [
  {
    theme: 'Strength & Power',
    baseId: 'RKj1g_vqaNV_k_A1smHh1SW9Y_Faa1WWSIxwnOqKVEw',
    glitchId: 'yaaqLaYlJ0af0YVPKK7qj7XtfgONatYcpHvkEl64IUs',
  },
  {
    theme: 'Happy & Joy',
    baseId: 'n1Q6H0oz2i3IRK2GZuT6RE5YRhfY7_ewIJrXe3OdSxU',
    glitchId: 'Kvx6qV41nW2_93Am5iWNutcideWXbzUZX0q-v9SimBw',
  },
  {
    theme: 'Love & Connection',
    baseId: '5jY9jChPqIlNtNBGsfyXjRyXfl6RvLurBj4uHnPXfFs',
    glitchId: 'fqt0n3jG5dN8r50TGxO2_ZLkYqAiP42iMrHuHNDNNno',
  },
  {
    theme: 'Money & Flow',
    baseId: '3QGjEhO49isfTWFCLGg2VPLXpfIPl_LFP6MVRs4swKw',
    glitchId: 'gHsqVQ3iOz6MckZcKzo42RNifadZ0fRvh-5JF3IrVUc',
  },
  {
    theme: 'Wealth & Abundance',
    baseId: 'DM-T6QA9pDpV5NKkwnW0kLgglCJzqwg1jzCO-0cMHPg',
    glitchId: 'ZiKHBfEqD2qfNN4KeDrc8-yhPUGHBZoW0BafI2ehAEc',
  },
  {
    theme: 'Health & Vitality',
    baseId: '-bre7BH9qV8m-ffXLV4OMS6KZymbK_oG_osPmDIONkg',
    glitchId: 'RCil00YohvfIIKPYOF9YkYNMrzHuPtkHw06wM8F5snE',
  },
  {
    theme: 'Home & Peace',
    baseId: 'EWzBa24EI0BvqAB-GptMEJq6HgnMaANUD595YAu5MVo',
    glitchId: 'p8NLsBg0hDHWyBYRH3MHrPHQukctbsSpMUsKapepvlw',
  },
];

export function isAwakeningWindow() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    hour12: false,
  });
  const hour = parseInt(formatter.formatToParts(now).find((p) => p.type === 'hour').value, 10);
  return (hour >= 3 && hour <= 6) || (hour >= 15 && hour <= 18);
}

export function getArweaveImageUrlForTokenId(tokenId, awakened = isAwakeningWindow()) {
  const id = Number(tokenId);
  if (!Number.isFinite(id) || id < 1 || id > 333) return null;
  const theme = TOKEN_THEMES[(id - 1) % 7];
  const imageId = awakened ? theme.glitchId : theme.baseId;
  return `https://arweave.net/${imageId}`;
}

export function getTokenImageUrl(tokenId, attributes) {
  const state = attributes?.find((a) => a.trait_type === 'State')?.value;
  const awakened = state === 'Awakened';
  return getArweaveImageUrlForTokenId(tokenId, awakened);
}

/** ArDrive gateway is often slow/504; the same tx id works on arweave.net. */
export function ardriveUrlToArweave(url) {
  if (!url || typeof url !== 'string') return null;
  const match = /ardrive\.net\/([^/?#]+)/i.exec(url);
  return match ? `https://arweave.net/${match[1]}` : null;
}

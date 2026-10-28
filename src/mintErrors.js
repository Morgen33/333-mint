/**
 * Turns raw wallet / RPC / Candy Machine errors into something a minter can act on.
 *
 * Stages (set on errors thrown from doMint.js):
 *   (none)     – failed while preparing the tx; nothing sent
 *   'simulate' – rejected before the wallet prompt; nothing sent
 *   'sign'     – wallet prompt failed or was declined; nothing sent
 *   'send'     – RPC refused the signed tx; nothing sent
 *   'onchain'  – tx landed but the program failed; only the network fee was charged
 *   'pending'  – tx sent but not confirmed in time; outcome unknown
 */

export class MintError extends Error {
  constructor(message, { stage, signature = null, logs = null, cause } = {}) {
    super(message);
    this.name = 'MintError';
    this.stage = stage;
    this.signature = signature;
    this.logs = logs;
    if (cause) this.cause = cause;
  }
}

const PROGRAM_ERROR_REASONS = {
  CandyMachineEmpty: 'Sold out — all 333 have been minted.',
  MaximumRedeemedAmount: 'Sold out — all 333 have been minted.',
  MintNotLive: "The mint isn't live right now.",
  InvalidMintTime: "The mint isn't open at this time.",
  AfterEndDate: 'The mint has ended.',
  NotEnoughSOL: "Your wallet doesn't have enough SOL to cover the mint price plus network fees.",
  NotEnoughTokens: "Your wallet doesn't have enough of the token required to mint.",
  AddressNotAuthorized: "This wallet isn't allowed to mint.",
  AddressNotFoundInAllowedList: "This wallet isn't on the allow list.",
  AllowedMintLimitReached: 'This wallet has reached its mint limit.',
  AllocationLimitReached: 'The mint limit for this phase has been reached.',
  MissingRequiredSignature: 'A required signature was missing. Please try again.',
  UnauthorizedProgramFound: 'Your wallet added something to the transaction that the mint does not allow. Try again or use a different wallet.',
};

function parseAnchorError(logs) {
  if (!Array.isArray(logs)) return null;
  for (const line of logs) {
    const match = /Error Code: (\w+)\. Error Number: (\d+)\. Error Message: (.+?)\.?$/.exec(line);
    if (match) return { name: match[1], number: Number(match[2]), message: match[3] };
  }
  return null;
}

function isInsufficientFunds(text, logs) {
  const haystack = `${text}\n${(logs || []).join('\n')}`;
  return /insufficient (funds|lamports)|InsufficientFundsForRent|no record of a prior credit/i.test(haystack);
}

function isUserRejection(text) {
  return /user rejected|rejected the request|request rejected|user denied|declined|cancell?ed by user|user cancell?ed/i.test(text);
}

function chargedNote(stage) {
  switch (stage) {
    case undefined: // thrown while preparing the tx, before anything was sent
    case 'simulate':
    case 'sign':
    case 'send':
      return "Nothing was sent, so you weren't charged.";
    case 'onchain':
      return 'The transaction reached Solana but failed, so only the small network fee was charged — no NFT was minted and no mint price was paid.';
    case 'pending':
      return "We couldn't confirm the result yet. Check the transaction on Solscan before minting again.";
    default:
      return null;
  }
}

/** @returns {{ title: string, reason: string, charged: string | null, signature: string | null, technical: string }} */
export function explainMintError(error) {
  const message = error?.message || String(error);
  const stage = error?.stage;
  const logs = error?.logs || null;
  const signature = error?.signature || null;
  const charged = chargedNote(stage);
  const result = (title, reason) => ({ title, reason, charged, signature, technical: message });

  if (stage === 'pending') {
    return result(
      'Still confirming',
      'Your transaction was sent but Solana has not confirmed it yet. It may still go through.'
    );
  }

  if (isUserRejection(message)) {
    return result('Mint cancelled', 'You declined the transaction in your wallet.');
  }

  const programError = parseAnchorError(logs);
  if (programError) {
    const reason = PROGRAM_ERROR_REASONS[programError.name] || `${programError.message}.`;
    return result('Mint failed', reason);
  }

  if (isInsufficientFunds(message, logs)) {
    return result('Not enough SOL', PROGRAM_ERROR_REASONS.NotEnoughSOL);
  }

  if (/block height exceeded|blockhash not found|expired/i.test(message)) {
    return result(
      'Transaction expired',
      'The transaction took too long to approve and expired. Please try again.'
    );
  }

  if (/failed to fetch|network ?error|load failed|timed? ?out|ECONN|503|502|504/i.test(message)) {
    return result(
      'Network problem',
      "We couldn't reach the Solana network. Check your connection and try again."
    );
  }

  if (/wallet not ready|not connected|does not support signing/i.test(message)) {
    return result('Wallet problem', 'Your wallet is not ready. Disconnect, reconnect, and try again.');
  }

  return result('Mint failed', message);
}

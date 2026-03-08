/**
 * Must run before any other app code. Polyfills Node globals used by Solana/Metaplex deps.
 */
import { Buffer } from 'buffer';

if (typeof window !== 'undefined') {
  window.Buffer = Buffer;
  window.global = window.global ?? window;
  window.process = window.process ?? { env: { NODE_ENV: 'production' }, browser: true };
}

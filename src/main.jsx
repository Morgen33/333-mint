import './polyfills.js';
import './wallet-adapter-modal.css';
import React, { useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './ErrorBoundary';
import { PhantomProvider, darkTheme } from '@phantom/react-sdk';
import { AddressType } from '@phantom/react-sdk';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';

const APP_ID = '85950ca1-bdc2-421a-a43a-d4aa9c90afb9';
const REDIRECT_URL =
  typeof window !== 'undefined'
    ? `${window.location.origin}/auth/callback`
    : 'https://333landingpage.vercel.app/auth/callback';

const rawRpc = import.meta.env.VITE_RPC_URL || '/api/rpc';
const rpcEndpoint =
  typeof rawRpc === 'string' && rawRpc.startsWith('http')
    ? rawRpc
    : typeof window !== 'undefined'
      ? `${window.location.origin}${rawRpc.startsWith('/') ? rawRpc : '/api/rpc'}`
      : 'https://api.mainnet-beta.solana.com';

function WalletAdapters({ children }) {
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );
  return (
    <ConnectionProvider endpoint={rpcEndpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <PhantomProvider
        config={{
          providers: ['google', 'apple', 'injected'],
          appId: APP_ID,
          addressTypes: [AddressType.solana],
          authOptions: {
            redirectUrl: REDIRECT_URL,
          },
        }}
        theme={darkTheme}
        appName="333 The Collection"
      >
        <WalletAdapters>
          <App />
        </WalletAdapters>
      </PhantomProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

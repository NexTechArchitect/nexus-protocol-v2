'use client';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, http, fallback } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { defineChain } from 'viem';
import { RainbowKitProvider, darkTheme, getDefaultConfig } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';

const WALLET_CONNECT_PROJECT_ID = '3cf8b03cfbced72866e6a8fbb009a534';

export const polkadotHub = defineChain({
  id: 420420417,
  name: 'Polkadot Hub Testnet',
  nativeCurrency: { name: 'PAS', symbol: 'PAS', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://services.polkadothub-rpc.com/testnet'] },
    public:  { http: ['https://services.polkadothub-rpc.com/testnet'] },
  },
  blockExplorers: {
    default: {
      name: 'Blockscout',
      url: 'https://blockscout-passet-hub.parity-testnet.parity.io',
    },
  },
  testnet: true,
});

const config = getDefaultConfig({
  appName: 'Nexus Perps',
  projectId: WALLET_CONNECT_PROJECT_ID,
  chains: [polkadotHub, sepolia],
  transports: {
    [polkadotHub.id]: http('https://services.polkadothub-rpc.com/testnet'),
    [sepolia.id]: fallback([
      http(process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL || ""),
      http("https://ethereum-sepolia-rpc.publicnode.com"),
      http("https://rpc.sepolia.org"),
    ]),
  },
  ssr: true,
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      gcTime: 10_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export function Web3Provider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme({ accentColor: '#F0B90B' })}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

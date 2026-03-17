'use client';
import { useState, useCallback } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { SUPPORTED_CHAIN_ID } from '@/constants/contracts';

export type LoginStep = 'idle'|'fetching_nonce'|'awaiting_signature'|'verifying'|'deploying_account'|'done'|'error';

export function useNexusAccount() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const [step, setStep] = useState<LoginStep>('idle');
  const [errorMsg, setError] = useState('');

  const isWrongNetwork = isConnected && chainId !== SUPPORTED_CHAIN_ID;
  const isVerified = isConnected && !isWrongNetwork;

  const verifyAndLogin = useCallback(async () => { setStep('done'); }, []);
  const logout = useCallback(async () => { setStep('idle'); }, []);

  const handleNetworkSwitch = useCallback(async () => {
    try {
      await (window as any).ethereum?.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${SUPPORTED_CHAIN_ID.toString(16)}` }],
      });
    } catch (err: any) {
      if (err.code === 4902) {
        await (window as any).ethereum?.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: `0x${SUPPORTED_CHAIN_ID.toString(16)}`,
            chainName: 'Polkadot Hub Testnet',
            nativeCurrency: { name: 'PAS', symbol: 'PAS', decimals: 18 },
            rpcUrls: ['https://services.polkadothub-rpc.com/testnet'],
            blockExplorerUrls: ['https://blockscout-passet-hub.parity-testnet.parity.io'],
          }],
        });
      }
    }
  }, []);

  return {
    isConnected,
    isVerified,
    isWrongNetwork,
    isPredicting: false,
    step,
    errorMsg,
    sessionHoursLeft: 24,
    sessionMinsLeft: 0,
    predictedAddress: address,
    // aliases for backward compatibility
    ownerAddress: address,
    smartAccount: address,
    verifyAndLogin,
    logout,
    handleNetworkSwitch,
  };
}
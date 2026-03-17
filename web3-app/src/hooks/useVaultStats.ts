'use client';

import { useReadContracts, useAccount } from 'wagmi';
import { CONTRACTS } from '@/constants/contracts';
import { formatUnits } from 'viem';

export function useVaultStats() {
  const { address } = useAccount();

  const vaultData = useReadContracts({
    contracts: [
      { address: CONTRACTS.VAULT.address, abi: CONTRACTS.VAULT.abi, functionName: 'totalLiquidity' },
      { address: CONTRACTS.VAULT.address, abi: CONTRACTS.VAULT.abi, functionName: 'totalLpShares' },
    ],
    query: { refetchInterval: 5000 }
  });

  const userData = useReadContracts({
    contracts: [
      { address: CONTRACTS.VAULT.address, abi: CONTRACTS.VAULT.abi, functionName: 'getLpShares', args: address ? [address] : undefined },
      { address: CONTRACTS.USDC.address, abi: [{ name: 'balanceOf', type: 'function', inputs: [{ name: 'a', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' }], functionName: 'balanceOf', args: address ? [address] : undefined },
    ],
    query: { refetchInterval: 5000 }
  });

  // --- PARSING ---
  const totalLiquidity = (vaultData.data?.[0]?.result as bigint) || BigInt(0);
  const totalShares = (vaultData.data?.[1]?.result as bigint) || BigInt(0);
  
  const userShares = (userData.data?.[0]?.result as bigint) || BigInt(0);
  const walletUSDC = (userData.data?.[1]?.result as bigint) || BigInt(0);

  // --- CALCULATIONS ---
  
  let sharePrice = 1.0;
  if (totalShares > BigInt(0)) {
    const liqFloat = parseFloat(formatUnits(totalLiquidity, 18));
    const sharesFloat = parseFloat(formatUnits(totalShares, 18));
    sharePrice = liqFloat / sharesFloat;
  }

  // User Value = Shares * Share Price
  const userValue = parseFloat(formatUnits(userShares, 18)) * sharePrice;

  // Mock APY for now (Real APY requires historical data indexing)
  const apy = totalLiquidity > BigInt(0) ? '12.5%' : '0.00%';

  return {
    raw: {
      totalLiquidity,
      totalShares,
      userShares,
      walletUSDC,
    },
    formatted: {
      tvl: Number(formatUnits(totalLiquidity, 18)).toLocaleString('en-US', { style: 'currency', currency: 'USD' }),
      
      userShares: Number(formatUnits(userShares, 18)).toFixed(4),
      userValue: userValue.toLocaleString('en-US', { style: 'currency', currency: 'USD' }),
      
      walletBalance: Number(formatUnits(walletUSDC, 6)).toLocaleString('en-US', { minimumFractionDigits: 2 }),
      
      sharePrice: sharePrice.toFixed(4),
      apy
    },
    isLoading: vaultData.isLoading || userData.isLoading,
    refetch: () => { vaultData.refetch(); userData.refetch(); }
  };
}
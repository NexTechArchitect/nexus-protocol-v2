'use client';

import { useReadContract, useReadContracts, useAccount } from 'wagmi';
import { CONTRACTS } from '@/constants/contracts';
import { useNexusAccount } from '@/hooks/useNexusAccount';
import { formatUnits } from 'viem';
import { useCallback } from 'react';

// ── Asset config ──────────────────────────────────────────────────────────────
const ASSETS = [
  { symbol: 'BTC', label: 'BTC-USD', address: '0x20e9D3Ef17753EC0a0349eA7e26c8B8fd2B1A119' as `0x${string}`, icon: '₿', color: '#F7931A' },
  { symbol: 'ETH', label: 'ETH-USD', address: '0xE3579516aeB339A4a8624beadaE256619E77F61E' as `0x${string}`, icon: 'Ξ', color: '#627EEA' },
] as const;

// ── Decimal helpers ─────────────────────
const fmt18 = (v: bigint | undefined) => {
  if (!v) return '0.00';
  return Number(formatUnits(v, 18)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmt6 = (v: bigint | undefined) => {
  if (!v) return '0.00';
  return Number(formatUnits(v, 6)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const decodeCollateral = (raw: bigint): number => {
  if (raw === BigInt(0)) return 0;
  if (raw >= BigInt('1000000000000000')) return Number(formatUnits(raw, 18));
  return Number(formatUnits(raw, 6));
};

const decodeLeverage = (raw: bigint): number => {
  const LEV_PRECISION = BigInt('1000000000000000000');
  if (raw >= LEV_PRECISION) return Number(raw / LEV_PRECISION);
  return Number(raw);
};

const calcPnL = (
  isLong: boolean,
  entryPrice: bigint,
  currentPrice: bigint,
  collateralRaw: bigint,
  leverageRaw: bigint,
) => {
  if (entryPrice === BigInt(0) || currentPrice === BigInt(0)) {
    return { value: '0.00', isPositive: true, percent: '0.00', raw: BigInt(0) };
  }

  const collat = decodeCollateral(collateralRaw);
  const lev = decodeLeverage(leverageRaw);
  const size = collat * lev;

  const entry = Number(formatUnits(entryPrice, 18));
  const mark = Number(formatUnits(currentPrice, 18));
  const delta = isLong ? mark - entry : entry - mark;
  const pnl = entry > 0 ? (delta / entry) * size : 0;
  const pct = collat > 0 ? (pnl / collat) * 100 : 0;

  return {
    value: Math.abs(pnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    isPositive: pnl >= 0,
    percent: Math.abs(pct).toFixed(2),
    raw: BigInt(Math.round(pnl * 1e6)), 
  };
};

export interface PortfolioPosition {
  asset: string;
  symbol: string;
  icon: string;
  color: string;
  type: string;
  collateral: string;
  entryPrice: string;
  markPrice: string;
  leverage: string;
  size: string;
  isLong: boolean;
  pnl: { value: string; isPositive: boolean; percent: string };
  liqPrice: string;
  assetAddress: `0x${string}`;
}

export function usePortfolioData() {
  const { address } = useAccount();
  const { smartAccount } = useNexusAccount();

  // ── Wallet USDC balance ───────────────────────────────────────────────────
  const walletQuery = useReadContract({
    address: CONTRACTS.USDC.address,
    abi: [{ name: 'balanceOf', type: 'function', inputs: [{ name: 'a', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' }] as const,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 5000 },
  });

  // ── Vault collateral (18-dec) ─────────────────────────────────────────────
  const vaultQuery = useReadContracts({
    contracts: [
      { address: CONTRACTS.VAULT.address, abi: CONTRACTS.VAULT.abi, functionName: 'getTraderCollateral', args: address ? [address] : undefined },
      { address: CONTRACTS.VAULT.address, abi: CONTRACTS.VAULT.abi, functionName: 'getLockedCollateral',  args: address ? [address] : undefined },
    ],
    query: { enabled: !!address, refetchInterval: 3000 },
  });

  // ── Positions for BTC + ETH ───────────────────────────────────────────────
  const pmAbi = CONTRACTS.POSITION_MANAGER.abi as any;
  const positionsQuery = useReadContracts({
    contracts: ASSETS.map((a) => ({
      address: CONTRACTS.POSITION_MANAGER.address,
      abi: pmAbi,
      functionName: 'getPosition',
      args: address ? [address, a.address] : undefined,
    })) as any,
    query: { enabled: !!address, refetchInterval: 3000 },
  });

  // ── Oracle prices for BTC + ETH ───────────────────────────────────────────
  const pricesQuery = useReadContracts({
    contracts: ASSETS.map((a) => ({
      address: CONTRACTS.POSITION_MANAGER.address,
      abi: pmAbi,
      functionName: 'getCurrentPrice',
      args: [a.address],
    })) as any,
    query: { refetchInterval: 10000, retry: 1 },
  });

  // ── Raw values ────────────────────────────────────────────────────────────
  const walletRaw    = (walletQuery.data as bigint | undefined) ?? BigInt(0);
  const freeCollatRaw = (vaultQuery.data?.[0]?.result as bigint | undefined) ?? BigInt(0);
  const lockedRaw     = (vaultQuery.data?.[1]?.result as bigint | undefined) ?? BigInt(0);
  const totalRaw      = freeCollatRaw + lockedRaw;

  // ── Build open positions list ─────────────────────────────────────────────
  const openPositions: PortfolioPosition[] = [];

  ASSETS.forEach((asset, i) => {
    const pos = positionsQuery.data?.[i]?.result as any;
    if (!pos?.isOpen) return;

    const currentPrice = (pricesQuery.data?.[i]?.result as bigint | undefined) ?? BigInt(0);
    const collat = decodeCollateral(pos.collateral);
    const lev = decodeLeverage(pos.leverage);
    const entry = Number(formatUnits(pos.entryPrice as bigint, 18));
    const mark  = currentPrice > BigInt(0) ? Number(formatUnits(currentPrice, 18)) : entry;
    const size  = collat * lev;
    const pnl   = calcPnL(pos.isLong, pos.entryPrice, currentPrice > BigInt(0) ? currentPrice : pos.entryPrice, pos.collateral, pos.leverage);
    const liqPx = lev > 1 && entry > 0
      ? pos.isLong ? entry * (1 - 1 / lev + 0.005) : entry * (1 + 1 / lev - 0.005)
      : 0;

    const fmtPx = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    openPositions.push({
      asset: asset.label,
      symbol: asset.symbol,
      icon: asset.icon,
      color: asset.color,
      type: pos.mode === 0 ? 'Isolated' : 'Cross',
      collateral: fmtPx(collat),
      entryPrice: fmtPx(entry),
      markPrice:  fmtPx(mark),
      leverage:   lev.toString(),
      size:       fmtPx(size),
      isLong:     pos.isLong,
      pnl,
      liqPrice:   liqPx > 0 ? fmtPx(liqPx) : '—',
      assetAddress: asset.address,
    });
  });

  const refetchAll = useCallback(() => {
    void walletQuery.refetch();
    void vaultQuery.refetch();
    void positionsQuery.refetch();
    void pricesQuery.refetch();
  }, [walletQuery, vaultQuery, positionsQuery, pricesQuery]);

  return {
    smartAccount,
    raw: { wallet: walletRaw, freeCollateral: freeCollatRaw },
    metrics: {
      totalValue:       fmt18(totalRaw),
      freeCollateral:   fmt18(freeCollatRaw),
      lockedCollateral: fmt18(lockedRaw),
      walletBalance:    fmt6(walletRaw),
      buyingPower:      fmt18(freeCollatRaw * BigInt(50)),
    },
    positions: openPositions,          // array of all open positions (BTC + ETH)
    hasPositions: openPositions.length > 0,
    isLoading: walletQuery.isLoading || vaultQuery.isLoading || positionsQuery.isLoading,
    refetch: refetchAll,
  };
}

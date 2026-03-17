'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useNexusAccount } from '@/hooks/useNexusAccount';
import { usePortfolioData } from '@/hooks/usePortfolioData';
import type { PortfolioPosition } from '@/hooks/usePortfolioData';
import { useVaultOperations } from '@/hooks/useVaultOperations';
import { formatUnits } from 'viem';
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi';
import { CONTRACTS } from '@/constants/contracts';

// ─── Toast ────────────────────────────────────────────────────────────────────
const Toast = ({ title, msg, type, hash, onClose }: {
  title: string; msg: string; type: 'loading' | 'success' | 'error'; hash?: string; onClose: () => void;
}) => {
  useEffect(() => { const t = setTimeout(onClose, 6000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div onClick={() => hash && window.open(`https://blockscout-passet-hub.parity-testnet.parity.io/tx/${hash}`, '_blank')}
      className="fixed bottom-6 right-6 z-[200] w-[90%] max-w-sm cursor-pointer"
      style={{ animation: 'slideUp 0.4s cubic-bezier(0.34,1.56,0.64,1)' }}>
      <div className={`px-5 py-4 rounded-2xl shadow-2xl border bg-white flex items-start gap-4 hover:-translate-y-1 transition-transform ${type === 'success' ? 'border-l-4 border-l-[#F0B90B] border-slate-100' : type === 'loading' ? 'border-l-4 border-l-blue-500 border-slate-100' : 'border-l-4 border-l-red-500 border-slate-100'}`}>
        <div className="mt-0.5 flex-shrink-0">
          {type === 'loading' && <div className="w-4 h-4 border-2 border-[#F0B90B]/30 border-t-[#F0B90B] rounded-full animate-spin" />}
          {type === 'success' && <div className="w-5 h-5 bg-[#F0B90B] rounded-full flex items-center justify-center text-[10px] font-black text-white">✓</div>}
          {type === 'error'   && <div className="w-5 h-5 bg-red-500  rounded-full flex items-center justify-center text-[10px] font-black text-white">✕</div>}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-slate-900">{title}</p>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{msg}</p>
        </div>
        <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="text-slate-300 hover:text-slate-600 font-bold flex-shrink-0">✕</button>
      </div>
    </div>
  );
};

// ─── Metric Card ──────────────────────────────────────────────────────────────
const MetricCard = ({ label, val, sub, accent = false }: { label: string; val: string; sub: string; accent?: boolean }) => (
  <div className={`rounded-2xl p-6 border transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 ${accent ? 'bg-[#F0B90B] border-[#D9A10A] shadow-[0_4px_24px_rgba(240,185,11,0.25)]' : 'bg-white border-slate-100 shadow-sm'}`}>
    <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${accent ? 'text-[#7A5800]' : 'text-slate-400'}`}>{label}</p>
    <p className={`text-2xl font-black tracking-tight ${accent ? 'text-white' : 'text-slate-900'}`}>{val}</p>
    <p className={`text-[10px] font-medium mt-1 ${accent ? 'text-[#7A5800]' : 'text-slate-400'}`}>{sub}</p>
  </div>
);

// ─── Position Row ─────────────────────────────────────────────────────────────
const PositionRow = ({ pos, onClose, isClosing }: { pos: PortfolioPosition; onClose: (addr: `0x${string}`) => void; isClosing: boolean }) => (
  <tr className="hover:bg-[#FFFBEB]/60 transition-colors group border-b border-slate-50 last:border-0">
    <td className="px-8 py-6">
      <div className="flex items-center gap-4">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center font-black text-lg shadow-sm group-hover:scale-110 transition-transform" style={{ background: pos.color + '18', border: `1.5px solid ${pos.color}40`, color: pos.color }}>{pos.icon}</div>
        <div>
          <span className="block font-black text-slate-900 text-base">{pos.asset}</span>
          <div className="flex gap-1.5 mt-1">
            <span className="text-[9px] font-black px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 uppercase tracking-wide">{pos.type}</span>
            <span className="text-[9px] font-black px-2 py-0.5 rounded-md bg-[#F0B90B]/15 text-[#92600A] uppercase tracking-wide">{pos.leverage}×</span>
          </div>
        </div>
      </div>
    </td>
    <td className="px-8 py-6"><span className={`text-[10px] font-black px-3 py-1.5 rounded-lg uppercase tracking-wider ${pos.isLong ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{pos.isLong ? '▲ Long' : '▼ Short'}</span></td>
    <td className="px-8 py-6 font-mono font-black text-slate-700">${pos.size}</td>
    <td className="px-8 py-6 font-mono font-bold text-slate-500">${pos.entryPrice}</td>
    <td className="px-8 py-6 font-mono font-bold text-slate-600">${pos.markPrice}</td>
    <td className="px-8 py-6">
      <div className={`font-mono font-black ${pos.pnl.isPositive ? 'text-emerald-600' : 'text-red-500'}`}>{pos.pnl.isPositive ? '+' : '-'}${pos.pnl.value}</div>
      <div className={`text-[10px] font-bold mt-0.5 ${pos.pnl.isPositive ? 'text-emerald-500' : 'text-red-400'}`}>{pos.pnl.isPositive ? '+' : '-'}{pos.pnl.percent}% ROE</div>
    </td>
    <td className="px-8 py-6 font-mono text-sm text-red-400">${pos.liqPrice}</td>
    <td className="px-8 py-6">
      <button disabled={isClosing} onClick={() => onClose(pos.assetAddress)}
        className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300 disabled:opacity-40 disabled:cursor-not-allowed">
        {isClosing ? '…' : 'Close'}
      </button>
    </td>
  </tr>
);

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function PortfolioPage() {
  const { isConnected, ownerAddress } = useNexusAccount();
  const { smartAccount, metrics, positions, hasPositions, raw, refetch, isLoading } = usePortfolioData();
  const { address } = useAccount();

  const [notify, setNotify] = useState<{ title: string; msg: string; type: 'loading' | 'success' | 'error'; hash?: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'POSITIONS' | 'BALANCES'>('POSITIONS');
  const [actionMode, setActionMode] = useState<'DEPOSIT' | 'WITHDRAW' | null>(null);
  const [amount, setAmount] = useState('');
  const [closingAsset, setClosingAsset] = useState<`0x${string}` | null>(null);

  const { handleDeposit, handleWithdraw, getActionState, currentHash, isLoading: vaultLoading, status } =
    useVaultOperations((t, m, type, hash) => setNotify({ title: t, msg: m, type, hash }));

  // Refetch after deposit/withdraw
  useEffect(() => {
    if (status !== 'SUCCESS' || !actionMode) return;
    const refetchAll = () => { void refetch(); };
    refetchAll();
    const t1 = setTimeout(refetchAll, 1500);
    const t2 = setTimeout(refetchAll, 3500);
    const t3 = setTimeout(refetchAll, 6000);
    const tClose = setTimeout(() => { setActionMode(null); setAmount(''); }, 3000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(tClose); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Close position
  const { writeContractAsync } = useWriteContract();
  const [closeHash, setCloseHash] = useState<`0x${string}` | undefined>();
  const { isSuccess: closeSuccess } = useWaitForTransactionReceipt({ hash: closeHash, query: { enabled: !!closeHash } });

  useEffect(() => {
    if (!closeSuccess) return;
    setNotify({ title: 'Position Closed ✓', msg: 'Vault balance updating…', type: 'success', hash: closeHash });
    setClosingAsset(null);
    setCloseHash(undefined);
    void refetch();
    setTimeout(() => { void refetch(); }, 1500);
    setTimeout(() => { void refetch(); }, 4000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeSuccess]);

  const handleClosePosition = useCallback(async (assetAddress: `0x${string}`) => {
    setClosingAsset(assetAddress);
    setNotify({ title: 'Closing position…', msg: 'Confirm transaction in wallet', type: 'loading' });
    try {
      const hash = await writeContractAsync({
        address: CONTRACTS.POSITION_MANAGER.address,
        abi: CONTRACTS.POSITION_MANAGER.abi,
        functionName: 'closePosition',
        args: [assetAddress, BigInt(0)],
      });
      setCloseHash(hash as `0x${string}`);
    } catch (e: unknown) {
      const err = e as { shortMessage?: string };
      setNotify({ title: 'Close Failed', msg: err?.shortMessage ?? 'Transaction rejected', type: 'error' });
      setClosingAsset(null);
    }
  }, [writeContractAsync]);

  const handleMax = () => {
    if (actionMode === 'DEPOSIT') setAmount(formatUnits(raw.wallet, 6));
    else setAmount(formatUnits(raw.freeCollateral, 18));
  };

  const buttonText = () => {
    if (status === 'SUCCESS') return 'Transaction Successful! ✓';
    if (status === 'APPROVING') return 'Step 1/2: Approving USDC…';
    if (status === 'DEPOSITING') return 'Step 2/2: Depositing…';
    if (status === 'WITHDRAWING') return 'Withdrawing…';
    if (actionMode === 'DEPOSIT') return getActionState(amount) === 'NEEDS_APPROVAL' ? 'Approve USDC' : 'Deposit to Vault';
    return 'Withdraw from Vault';
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#FAFAF7]">
        <div className="w-20 h-20 bg-white rounded-3xl shadow-xl flex items-center justify-center mb-6 border border-slate-100"><span className="text-3xl">🔐</span></div>
        <h2 className="text-2xl font-black text-slate-900 tracking-tight">Connect Wallet</h2>
        <p className="text-slate-400 mt-2 text-sm font-medium">Connect your wallet to view portfolio</p>
      </div>
    );
  }

  return (
    <div className="relative w-full min-h-screen pb-24 bg-[#FAFAF7] text-[#0f172a]">
      <style>{`
        @keyframes slideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes blob{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(30px,-50px) scale(1.1)}66%{transform:translate(-20px,20px) scale(0.9)}}
        .animate-blob{animation:blob 8s infinite}.delay-2{animation-delay:2s}.delay-4{animation-delay:4s}
        .stagger-1{animation:fadeIn 0.5s ease both}.stagger-2{animation:fadeIn 0.5s ease 0.1s both}
        .stagger-3{animation:fadeIn 0.5s ease 0.2s both}.stagger-4{animation:fadeIn 0.5s ease 0.3s both}
        ::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-thumb{background:#EAECEF;border-radius:4px}
      `}</style>

      {notify && <Toast {...notify} onClose={() => setNotify(null)} />}

      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-15%] left-[-10%] w-[45vw] h-[45vw] rounded-full bg-[#F0B90B]/10 blur-[120px] animate-blob" />
        <div className="absolute top-[20%] right-[-10%] w-[35vw] h-[35vw] rounded-full bg-emerald-100/60 blur-[100px] animate-blob delay-2" />
        <div className="absolute bottom-[-10%] left-[25%] w-[40vw] h-[40vw] rounded-full bg-slate-100/80 blur-[120px] animate-blob delay-4" />
      </div>

      <main className="max-w-[90rem] mx-auto px-6 pt-28 relative z-10">

        {/* HEADER */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-8 mb-12 stagger-1">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#F0B90B] opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#F0B90B]" />
              </span>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Net Portfolio Value</p>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-6xl lg:text-8xl font-black text-slate-900 tracking-tighter">${metrics.totalValue}</span>
              <span className="text-xl font-bold text-slate-400">USDC</span>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <div className="px-4 py-2 bg-white border border-slate-100 rounded-xl text-[10px] font-bold text-slate-500 font-mono flex items-center gap-2 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                {ownerAddress?.slice(0, 6)}…{ownerAddress?.slice(-4)}
              </div>
              {smartAccount && (
                <div className="px-4 py-2 bg-[#F0B90B]/10 border border-[#F0B90B]/30 rounded-xl text-[10px] font-bold text-[#92600A] font-mono flex items-center gap-2 shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#F0B90B]" />
                  SMART: {smartAccount.slice(0, 6)}…{smartAccount.slice(-4)}
                </div>
              )}
              {hasPositions && (
                <div className="px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-[10px] font-bold text-emerald-700 flex items-center gap-2">
                  <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"/><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"/></span>
                  {positions.length} Active Position{positions.length > 1 ? 's' : ''}
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 w-full lg:w-auto stagger-2">
            <button onClick={() => setActionMode('DEPOSIT')} className="flex-1 lg:flex-none px-8 py-4 bg-[#F0B90B] text-white font-black rounded-2xl shadow-lg hover:shadow-xl hover:bg-[#D9A10A] hover:scale-[1.02] active:scale-95 transition-all text-sm tracking-widest uppercase">Deposit</button>
            <button onClick={() => setActionMode('WITHDRAW')} className="flex-1 lg:flex-none px-8 py-4 bg-white text-slate-900 border border-slate-200 font-black rounded-2xl shadow-sm hover:bg-slate-50 active:scale-95 transition-all text-sm tracking-widest uppercase">Withdraw</button>
            <button onClick={() => { void refetch(); }} className="px-4 py-4 bg-white border border-slate-200 rounded-2xl shadow-sm hover:bg-slate-50 transition-all text-slate-500 font-bold text-lg" title="Refresh">↻</button>
          </div>
        </div>

        {/* ACTION PANEL */}
        {actionMode && (
          <div className="mb-12 bg-white/95 border border-[#F0B90B]/20 rounded-3xl p-8 shadow-2xl stagger-2" style={{ animation: 'fadeIn 0.3s ease' }}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-black text-xl text-slate-900 uppercase tracking-tight">{actionMode} FUNDS</h3>
              <button onClick={() => { setActionMode(null); setAmount(''); }} className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200 transition-all font-bold">✕</button>
            </div>
            <div className="flex flex-col lg:flex-row gap-6">
              <div className="flex-1">
                <div className="flex justify-between mb-3 px-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Amount (USDC)</label>
                  <span className="text-[10px] font-bold text-[#92600A] bg-[#F0B90B]/10 px-3 py-1 rounded-lg">Available: {actionMode === 'DEPOSIT' ? metrics.walletBalance : metrics.freeCollateral}</span>
                </div>
                <div className="relative">
                  <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
                    className="w-full bg-slate-50 border-2 border-slate-100 focus:border-[#F0B90B]/50 rounded-2xl pl-6 pr-24 py-5 font-mono font-black text-3xl text-slate-900 outline-none transition-all shadow-inner" />
                  <button onClick={handleMax} className="absolute right-5 top-1/2 -translate-y-1/2 text-[10px] font-black text-[#92600A] bg-[#F0B90B]/15 hover:bg-[#F0B90B]/25 px-3 py-1.5 rounded-lg transition-colors uppercase tracking-wide">MAX</button>
                </div>
              </div>
              <div className="flex items-end">
                <button onClick={() => actionMode === 'DEPOSIT' ? handleDeposit(amount) : handleWithdraw(amount)}
                  disabled={vaultLoading || !amount || parseFloat(amount) <= 0}
                  className={`h-[84px] w-full lg:w-[240px] font-black rounded-2xl text-base shadow-lg transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-3 uppercase tracking-widest ${status === 'SUCCESS' ? 'bg-emerald-500 text-white' : actionMode === 'DEPOSIT' && getActionState(amount) === 'NEEDS_APPROVAL' ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-[#F0B90B] text-white hover:bg-[#D9A10A]'}`}>
                  {vaultLoading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  {buttonText()}
                </button>
              </div>
            </div>
            {actionMode === 'DEPOSIT' && getActionState(amount) === 'NEEDS_APPROVAL' && (
              <div className="mt-5 flex items-center gap-3 px-1">
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white ${status === 'APPROVING' ? 'bg-amber-500 animate-pulse' : status === 'DEPOSITING' || status === 'SUCCESS' ? 'bg-emerald-500' : 'bg-slate-300'}`}>{status === 'DEPOSITING' || status === 'SUCCESS' ? '✓' : '1'}</div>
                  <span className="text-[10px] font-bold text-slate-500">Approve USDC</span>
                </div>
                <div className="flex-1 h-px bg-slate-200" />
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white ${status === 'DEPOSITING' ? 'bg-[#F0B90B] animate-pulse' : status === 'SUCCESS' ? 'bg-emerald-500' : 'bg-slate-300'}`}>{status === 'SUCCESS' ? '✓' : '2'}</div>
                  <span className="text-[10px] font-bold text-slate-500">Deposit to Vault</span>
                </div>
              </div>
            )}
            <div className="mt-5 flex items-start gap-3 p-4 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-slate-400 text-sm flex-shrink-0 mt-0.5">ℹ</span>
              <p className="text-xs text-slate-500 leading-relaxed">{actionMode === 'DEPOSIT' ? 'Deposited USDC goes into your Nexus Vault as trading margin.' : 'Only free (unlocked) collateral can be withdrawn. Close active positions first.'}</p>
            </div>
          </div>
        )}

        {/* STATS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10 stagger-3">
          <MetricCard label="Net Equity"      val={`$${metrics.totalValue}`}       sub="Vault balance" accent />
          <MetricCard label="Free Collateral" val={`$${metrics.freeCollateral}`}   sub="Available margin" />
          <MetricCard label="Locked Margin"   val={`$${metrics.lockedCollateral}`} sub="In active trades" />
          <MetricCard label="Wallet USDC"     val={metrics.walletBalance}          sub="In MetaMask" />
        </div>

        {/* TABS */}
        <div className="bg-white/80 backdrop-blur-xl border border-slate-100 rounded-3xl overflow-hidden shadow-lg stagger-4">
          <div className="flex border-b border-slate-100 px-8 pt-6 gap-8">
            {(['POSITIONS', 'BALANCES'] as const).map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`pb-4 text-[10px] font-black tracking-[0.2em] transition-all relative uppercase ${activeTab === tab ? 'text-[#92600A]' : 'text-slate-400 hover:text-slate-600'}`}>
                {tab}
                {tab === 'POSITIONS' && hasPositions && <span className="ml-2 text-[9px] bg-[#F0B90B] text-white px-1.5 py-0.5 rounded-full font-black">{positions.length}</span>}
                {activeTab === tab && <div className="absolute bottom-0 left-0 w-full h-[3px] bg-[#F0B90B] rounded-t-full" />}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">

            {/* POSITIONS */}
            {activeTab === 'POSITIONS' && (
              <div className="min-w-[900px]">
                {isLoading ? (
                  <div className="flex items-center justify-center h-64 gap-3">
                    <div className="w-5 h-5 border-2 border-[#F0B90B]/20 border-t-[#F0B90B] rounded-full animate-spin" />
                    <span className="text-slate-400 text-sm font-medium">Loading positions…</span>
                  </div>
                ) : hasPositions ? (
                  <table className="w-full text-left">
                    <thead className="bg-slate-50/70 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                      <tr><th className="px-8 py-5">Market</th><th className="px-8 py-5">Side</th><th className="px-8 py-5">Size</th><th className="px-8 py-5">Entry</th><th className="px-8 py-5">Mark</th><th className="px-8 py-5">PnL</th><th className="px-8 py-5">Liq. Price</th><th className="px-8 py-5">Action</th></tr>
                    </thead>
                    <tbody>{positions.map((pos) => <PositionRow key={pos.assetAddress} pos={pos} onClose={handleClosePosition} isClosing={closingAsset === pos.assetAddress} />)}</tbody>
                  </table>
                ) : (
                  <div className="flex flex-col items-center justify-center h-72 gap-4">
                    <div className="w-20 h-20 bg-[#F0B90B]/10 rounded-full flex items-center justify-center text-3xl border-2 border-[#F0B90B]/20">📊</div>
                    <p className="font-black text-sm uppercase tracking-widest text-slate-400">No Active Positions</p>
                    <p className="text-xs text-slate-400">Open a trade from the Trade page</p>
                  </div>
                )}
              </div>
            )}

            {/* BALANCES */}
            {activeTab === 'BALANCES' && (
              <table className="w-full text-left min-w-[600px]">
                <thead className="bg-slate-50/70 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                  <tr><th className="px-8 py-5">Asset</th><th className="px-8 py-5 text-right">Total Balance</th><th className="px-8 py-5 text-right">Free Margin</th><th className="px-8 py-5 text-right">In Positions</th></tr>
                </thead>
                <tbody>
                  <tr className="hover:bg-[#FFFBEB]/40 transition-colors border-b border-slate-50">
                    <td className="px-8 py-7"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black text-sm shadow-md">U</div><div><span className="block font-black text-slate-900 text-base">USDC</span><span className="text-[10px] text-slate-400 uppercase font-bold">MockUSDC · Polkadot Hub</span></div></div></td>
                    <td className="px-8 py-7 text-right font-mono font-black text-slate-800 text-lg">${metrics.totalValue}</td>
                    <td className="px-8 py-7 text-right font-mono font-black text-emerald-600 text-lg">${metrics.freeCollateral}</td>
                    <td className="px-8 py-7 text-right font-mono font-black text-[#92600A] text-lg">${metrics.lockedCollateral}</td>
                  </tr>
                  <tr className="hover:bg-[#FFFBEB]/40 transition-colors">
                    <td className="px-8 py-5"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center font-black text-sm shadow-sm">💼</div><div><span className="block font-black text-slate-700 text-base">Wallet USDC</span><span className="text-[10px] text-slate-400 uppercase font-bold">MetaMask Balance</span></div></div></td>
                    <td className="px-8 py-5 text-right font-mono font-black text-slate-700 text-lg">{metrics.walletBalance}</td>
                    <td className="px-8 py-5 text-right font-mono text-slate-400">—</td>
                    <td className="px-8 py-5 text-right font-mono text-slate-400">—</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

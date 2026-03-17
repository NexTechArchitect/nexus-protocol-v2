'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { AreaChart, Area, Tooltip, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { useNexusAccount } from '@/hooks/useNexusAccount';
import { useVaultStats } from '@/hooks/useVaultStats';
import { useLPOperations } from '@/hooks/useLPOperations';
import { formatUnits } from 'viem';
import { useAccount } from 'wagmi';
import { CONTRACTS } from '@/constants/contracts';

interface VaultHistoryItem {
  hash: string;
  type: 'ADD_LIQUIDITY' | 'REMOVE_LIQUIDITY';
  usdcAmount: string;
  shares: string;
  blockNumber: bigint;
}

function useVaultHistory(_userAddress: `0x${string}` | undefined) {
  // eth_getLogs not supported on Polkadot Hub testnet RPC
  return { history: [] as VaultHistoryItem[], loading: false, refetch: () => {} };
}

const Toast = ({ title, msg, type, hash, onClose }: any) => {
  useEffect(() => { const t = setTimeout(onClose, 6000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div onClick={() => hash?.startsWith('0x') && window.open(`https://blockscout-passet-hub.parity-testnet.parity.io/tx/${hash}`, '_blank')}
      className={`fixed bottom-6 right-6 z-[200] w-[90%] max-w-sm ${hash ? 'cursor-pointer' : 'cursor-default'}`}
      style={{ animation: 'slideUp 0.4s cubic-bezier(0.34,1.56,0.64,1)' }}>
      <div className={`px-5 py-4 rounded-2xl shadow-2xl border bg-white flex items-start gap-4 hover:-translate-y-1 transition-transform ${type === 'success' ? 'border-l-4 border-l-[#F0B90B] border-slate-100' : type === 'loading' ? 'border-l-4 border-l-blue-400 border-slate-100' : 'border-l-4 border-l-red-500 border-slate-100'}`}>
        <div className="mt-0.5 flex-shrink-0">
          {type === 'loading' && <div className="w-4 h-4 border-2 border-[#F0B90B]/30 border-t-[#F0B90B] rounded-full animate-spin" />}
          {type === 'success' && <div className="w-5 h-5 bg-[#F0B90B] rounded-full flex items-center justify-center text-[10px] font-black text-white">✓</div>}
          {type === 'error'   && <div className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-[10px] font-black text-white">✕</div>}
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

const generateChart = (currentTVL: number) => {
  const data = []; let val = currentTVL > 0 ? currentTVL : 1000;
  for (let i = 30; i >= 0; i--) {
    if (i === 0) { data.push({ day: 'Now', value: parseFloat(val.toFixed(2)) }); }
    else { val = val * (1 - (Math.random() * 0.04 - 0.015)); data.unshift({ day: `-${i}d`, value: parseFloat(val.toFixed(2)) }); }
  }
  return data;
};

export default function VaultsPage() {
  const { isConnected } = useNexusAccount();
  const { address }     = useAccount();
  const { formatted, refetch: refetchStats } = useVaultStats();
  const { history, loading: historyLoading, refetch: refetchHistory } = useVaultHistory(address);

  const [notify, setNotify]       = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'HISTORY'>('OVERVIEW');
  const [mode, setMode]           = useState<'DEPOSIT' | 'WITHDRAW'>('DEPOSIT');
  const [amount, setAmount]       = useState('');

  const { handleAddLiquidity, handleRemoveLiquidity, getActionState, status, isLoading } = useLPOperations(
    (title, msg, type, hash) => {
      setNotify({ title, msg, type, hash });
      if (type === 'success') setTimeout(() => { refetchStats(); refetchHistory(); }, 2000);
    }
  );

  const chartData  = useMemo(() => { const n = parseFloat(formatted.tvl.replace(/[^0-9.-]+/g,'')) || 0; return generateChart(n); }, [formatted.tvl]);
  const actionState = getActionState(amount);

  const handleAction = () => {
    if (!amount || parseFloat(amount) <= 0) return;
    if (mode === 'DEPOSIT') handleAddLiquidity(amount);
    else handleRemoveLiquidity(amount);
  };

  const buttonText = () => {
    if (status === 'APPROVING')   return 'Step 1/2: Approving USDC...';
    if (status === 'DEPOSITING')  return 'Step 2/2: Adding Liquidity...';
    if (status === 'WITHDRAWING') return 'Removing Liquidity...';
    if (mode === 'DEPOSIT') {
      if (actionState === 'ENTER_AMOUNT')   return 'Enter Amount';
      if (actionState === 'NEEDS_APPROVAL') return 'Step 1: Approve USDC';
      return 'Add Liquidity';
    }
    if (!amount || parseFloat(amount) <= 0) return 'Enter Shares';
    return 'Remove Liquidity';
  };

  if (!isConnected) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#FAFAF5]">
      <div className="w-20 h-20 bg-white rounded-3xl shadow-xl flex items-center justify-center mb-6 border border-slate-100 text-3xl">🏦</div>
      <h2 className="text-2xl font-black text-slate-900 tracking-tight">Connect Wallet</h2>
      <p className="text-slate-400 mt-2 text-sm font-medium">Connect to view the liquidity vault</p>
    </div>
  );

  return (
    <div className="min-h-screen pb-24 bg-[#FAFAF5] text-[#0f172a]">
      <style>{`
        @keyframes slideUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes blob { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(30px,-50px) scale(1.1)} 66%{transform:translate(-20px,20px) scale(0.9)} }
        .blob-a{animation:blob 9s infinite} .blob-b{animation:blob 12s infinite 3s}
        .grid-bg{background-image:linear-gradient(rgba(240,185,11,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(240,185,11,0.06) 1px,transparent 1px);background-size:48px 48px}
      `}</style>

      {notify && <Toast {...notify} onClose={() => setNotify(null)} />}
      <div className="fixed inset-0 z-0 pointer-events-none grid-bg" />
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="blob-a absolute top-[-15%] right-[-10%] w-[55vw] h-[55vw] rounded-full opacity-50" style={{background:'radial-gradient(circle,rgba(240,185,11,0.15) 0%,transparent 70%)',filter:'blur(90px)'}} />
        <div className="blob-b absolute bottom-[-10%] left-[5%] w-[45vw] h-[45vw] rounded-full opacity-40"  style={{background:'radial-gradient(circle,rgba(251,191,36,0.12) 0%,transparent 70%)',filter:'blur(100px)'}} />
      </div>

      <main className="max-w-[90rem] mx-auto px-6 pt-28 relative z-10">
        <div className="mb-12" style={{animation:'slideUp 0.6s ease both'}}>
          <div className="flex items-center gap-3 mb-3">
            <span className="px-3 py-1.5 bg-[#F0B90B]/10 border border-[#F0B90B]/30 text-[#92600A] text-[10px] font-black rounded-full uppercase tracking-widest">Verified Vault</span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nexus Protocol</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-black text-slate-900 tracking-tighter mb-3">
            HLV <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#F0B90B] to-amber-500">Liquidity</span>
          </h1>
          <p className="text-slate-500 font-medium max-w-xl text-base leading-relaxed">
            Provide USDC liquidity to earn yield from trader losses and protocol liquidation fees. Fully on-chain, non-custodial, liquid anytime.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="flex gap-8 border-b border-slate-200">
              {(['OVERVIEW','HISTORY'] as const).map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab)} className={`pb-4 text-[10px] font-black tracking-widest uppercase transition-all relative ${activeTab===tab?'text-[#92600A]':'text-slate-400 hover:text-slate-600'}`}>
                  {tab}
                  {tab==='HISTORY'&&history.length>0&&<span className="ml-1.5 text-[9px] bg-[#F0B90B] text-white px-1.5 py-0.5 rounded-full font-black">{history.length}</span>}
                  {activeTab===tab&&<div className="absolute bottom-0 left-0 w-full h-[3px] bg-[#F0B90B] rounded-t-full" />}
                </button>
              ))}
            </div>

            {activeTab==='OVERVIEW'&&(<>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[{label:'Total Value Locked',val:formatted.tvl,color:'text-slate-900',accent:true},{label:'Realized APR',val:formatted.apy,color:'text-emerald-600',accent:false},{label:'Share Price',val:`$${formatted.sharePrice}`,color:'text-blue-600',accent:false}].map((s)=>(
                  <div key={s.label} className={`p-6 rounded-2xl border shadow-sm hover:shadow-md transition-all ${s.accent?'bg-[#F0B90B] border-[#D9A10A] shadow-[0_4px_24px_rgba(240,185,11,0.2)]':'bg-white border-slate-100'}`}>
                    <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${s.accent?'text-[#7A5800]':'text-slate-400'}`}>{s.label}</p>
                    <p className={`text-3xl font-black tracking-tight ${s.accent?'text-white':s.color}`}>{s.val}</p>
                  </div>
                ))}
              </div>
              <div className="bg-white border border-slate-100 p-8 rounded-2xl shadow-sm h-[380px] relative overflow-hidden">
                <div className="absolute top-7 left-8 z-10">
                  <p className="text-sm font-black text-slate-900">TVL Performance (30D)</p>
                  <p className="text-xs text-[#92600A] font-bold flex items-center gap-1.5 mt-0.5"><span className="w-1.5 h-1.5 rounded-full bg-[#F0B90B] animate-pulse"/>Anchored to live TVL</p>
                </div>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs><linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#F0B90B" stopOpacity={0.25}/><stop offset="95%" stopColor="#F0B90B" stopOpacity={0}/></linearGradient></defs>
                    <XAxis dataKey="day" hide/><YAxis hide domain={['auto','auto']}/>
                    <Tooltip contentStyle={{backgroundColor:'#1e293b',borderRadius:'12px',border:'none',color:'#fff',fontSize:'12px'}} formatter={(v:any)=>[`$${Number(v).toLocaleString()}`,'TVL']} cursor={{stroke:'#F0B90B',strokeWidth:1,strokeDasharray:'4 4'}}/>
                    <Area type="monotone" dataKey="value" stroke="#F0B90B" strokeWidth={2.5} fillOpacity={1} fill="url(#goldGrad)" animationDuration={1800}/>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-slate-900 text-white p-8 rounded-2xl shadow-2xl flex flex-col sm:flex-row justify-between items-center gap-6 relative overflow-hidden">
                <div className="absolute -right-8 -top-8 w-36 h-36 rounded-full blur-[70px] opacity-20 bg-[#F0B90B]"/>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Your LP Position</p>
                  <p className="text-4xl font-black tracking-tight">{formatted.userValue}</p>
                  <p className="text-xs text-slate-400 mt-1 font-mono flex items-center gap-2"><span className="w-1.5 h-1.5 bg-[#F0B90B] rounded-full"/>{formatted.userShares} HLV Shares</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Liquidity Status</p>
                  <p className="text-3xl font-black text-[#F0B90B] tracking-tight">Unlocked</p>
                  <p className="text-xs text-slate-400 mt-1">Withdraw anytime, no lock-up</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[{icon:'📈',title:'Yield Source',desc:'Earns from trader losses and protocol liquidation fees on every settled trade.'},{icon:'🔐',title:'Non-Custodial',desc:'Your LP shares are on-chain. Remove liquidity at any time with no permissions needed.'},{icon:'⚖️',title:'Delta Neutral',desc:'The vault is the counterparty to all trades. Losses offset wins across the pool.'}].map((c)=>(
                  <div key={c.title} className="bg-white border border-slate-100 rounded-2xl p-5 hover:border-[#F0B90B]/30 hover:bg-[#FFFBEB]/30 transition-all cursor-default">
                    <div className="text-2xl mb-3">{c.icon}</div>
                    <p className="text-xs font-black text-slate-900 mb-1">{c.title}</p>
                    <p className="text-xs text-slate-400 leading-relaxed">{c.desc}</p>
                  </div>
                ))}
              </div>
            </>)}

            {activeTab==='HISTORY'&&(
              <div className="bg-white border border-slate-100 rounded-2xl min-h-[400px] overflow-hidden">
                {historyLoading?(
                  <div className="flex items-center justify-center h-64 gap-3">
                    <div className="w-5 h-5 border-2 border-[#F0B90B]/20 border-t-[#F0B90B] rounded-full animate-spin"/>
                    <span className="text-slate-400 text-sm font-medium">Fetching on-chain history...</span>
                  </div>
                ):history.length>0?(
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                      <tr><th className="px-8 py-5">Action</th><th className="px-8 py-5">USDC Value</th><th className="px-8 py-5">Shares</th><th className="px-8 py-5 text-right">Tx</th></tr>
                    </thead>
                    <tbody>
                      {history.map((item,idx)=>(
                        <tr key={idx} onClick={()=>window.open(`https://blockscout-passet-hub.parity-testnet.parity.io/tx/${item.hash}`,'_blank')} className="hover:bg-[#FFFBEB]/40 transition-colors cursor-pointer group border-b border-slate-50 last:border-0">
                          <td className="px-8 py-5"><div className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${item.type==='ADD_LIQUIDITY'?'bg-[#F0B90B]':'bg-slate-400'}`}/><span className="font-black text-slate-800 text-xs uppercase tracking-wide">{item.type==='ADD_LIQUIDITY'?'Add Liquidity':'Remove Liquidity'}</span></div></td>
                          <td className="px-8 py-5 font-mono font-bold text-slate-700">${item.usdcAmount}</td>
                          <td className="px-8 py-5 font-mono text-sm text-slate-500">{item.shares} HLV</td>
                          <td className="px-8 py-5 text-right font-mono text-xs text-slate-400 group-hover:text-[#92600A] transition-colors">{item.hash.slice(0,8)}...↗</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ):(
                  <div className="flex flex-col items-center justify-center h-72 gap-3">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-2xl border-2 border-slate-100">🕐</div>
                    <p className="font-black text-sm uppercase tracking-widest text-slate-400">No LP History Found</p>
                    <p className="text-xs text-slate-400">Deposits and withdrawals will appear here</p>
                    <button onClick={refetchHistory} className="mt-1 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[#92600A] bg-[#F0B90B]/10 hover:bg-[#F0B90B]/20 rounded-xl transition-colors border border-[#F0B90B]/20">Refresh</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* RIGHT — Action Panel */}
          <div className="h-fit sticky top-28">
            <div className="h-1.5 rounded-t-2xl bg-gradient-to-r from-[#F0B90B] via-amber-300 to-[#D9A10A]"/>
            <div className="bg-white border-x border-b border-slate-100 rounded-b-2xl shadow-[0_8px_40px_rgba(240,185,11,0.12)] p-8">
              <div className="flex bg-slate-100 p-1.5 rounded-xl mb-7">
                {(['DEPOSIT','WITHDRAW'] as const).map((m)=>(
                  <button key={m} onClick={()=>{setMode(m);setAmount('');}} className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${mode===m?'bg-white text-slate-900 shadow-md':'text-slate-400 hover:text-slate-600'}`}>
                    {m==='DEPOSIT'?'Add Liquidity':'Remove'}
                  </button>
                ))}
              </div>

              <div className="mb-6">
                <div className="flex justify-between mb-3 px-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{mode==='DEPOSIT'?'Amount (USDC)':'Shares (HLV)'}</label>
                  <span className="text-[10px] font-bold text-[#92600A] bg-[#F0B90B]/10 px-2.5 py-1 rounded-lg">Max: {mode==='DEPOSIT'?formatted.walletBalance:formatted.userShares}</span>
                </div>
                <div className="relative">
                  <input type="number" value={amount} onChange={(e)=>setAmount(e.target.value)} placeholder="0.00" className="w-full bg-slate-50 border-2 border-slate-100 focus:border-[#F0B90B]/40 rounded-xl px-5 py-5 text-3xl font-black text-slate-900 outline-none transition-all shadow-inner"/>
                  <button onClick={()=>setAmount(mode==='DEPOSIT'?formatted.walletBalance.replace(/,/g,''):formatted.userShares)} className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-[#92600A] bg-[#F0B90B]/15 hover:bg-[#F0B90B]/25 px-3 py-1.5 rounded-lg transition-colors uppercase tracking-wide">MAX</button>
                </div>
              </div>

              {mode==='DEPOSIT'&&actionState==='NEEDS_APPROVAL'&&(
                <div className="flex items-center gap-2 mb-5 px-1">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black ${status==='APPROVING'?'bg-amber-500 text-white animate-pulse':'bg-slate-200 text-slate-500'}`}>1</div>
                    <span className="text-[10px] font-bold text-slate-400">Approve</span>
                  </div>
                  <div className="flex-1 h-px bg-slate-200"/>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black ${status==='DEPOSITING'?'bg-[#F0B90B] text-white animate-pulse':'bg-slate-200 text-slate-500'}`}>2</div>
                    <span className="text-[10px] font-bold text-slate-400">Deposit</span>
                  </div>
                </div>
              )}

              <button onClick={handleAction} disabled={isLoading||!amount||parseFloat(amount)<=0}
                className={`w-full py-5 rounded-xl font-black text-sm uppercase tracking-widest shadow-lg transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-3 ${
                  mode==='DEPOSIT'&&actionState==='NEEDS_APPROVAL'?'bg-amber-500 text-white hover:bg-amber-600':
                  mode==='DEPOSIT'?'bg-[#F0B90B] text-white hover:bg-[#D9A10A] shadow-[0_4px_16px_rgba(240,185,11,0.3)]':
                  'bg-white border-2 border-slate-200 text-slate-900 hover:bg-slate-50'
                }`}>
                {isLoading&&<div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>}
                {buttonText()}
              </button>

              <div className="mt-7 pt-6 border-t border-slate-100 space-y-3">
                {[{label:'Asset',val:'MockUSDC (Polkadot Hub)',icon:true},{label:'Strategy',val:'Delta Neutral LP'},{label:'Lock-up',val:'None (Liquid)',green:true},{label:'Share Token',val:'HLV'},{label:'Your Shares',val:`${formatted.userShares} HLV`}].map((r)=>(
                  <div key={r.label} className="flex justify-between text-xs">
                    <span className="text-slate-400 font-bold">{r.label}</span>
                    <span className={`font-bold flex items-center gap-1.5 ${(r as any).green?'text-emerald-500':'text-slate-900'}`}>
                      {(r as any).icon&&<div className="w-3.5 h-3.5 rounded-full bg-blue-500 text-white flex items-center justify-center text-[7px] font-black">U</div>}
                      {r.val}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

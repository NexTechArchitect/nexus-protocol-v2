'use client';
import Link from "next/link";
import { useState, useEffect } from "react";
import { useAccount, useChainId, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { CONTRACTS, SUPPORTED_CHAIN_ID } from "@/constants/contracts";

export default function Home() {
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const [mounted, setMounted] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [faucetState, setFaucetState] = useState<'idle'|'pending'|'confirming'|'done'|'error'>('idle');

  const [livePrices, setLivePrices] = useState({
    btc: { price: '—', change: '0.00%', up: true },
    eth: { price: '—', change: '0.00%', up: true }
  });

  useEffect(() => {
    setMounted(true);
    const fetchPrices = async () => {
      try {
        const res = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbols=["BTCUSDT","ETHUSDT"]');
        const data = await res.json();
        const fmt = (coin: { lastPrice: string; priceChangePercent: string }) => {
          const ch = parseFloat(coin.priceChangePercent);
          return {
            price: '$' + parseFloat(coin.lastPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            change: Math.abs(ch).toFixed(2) + '%',
            up: ch >= 0
          };
        };
        const btcData = data.find((d: { symbol: string }) => d.symbol === 'BTCUSDT');
        const ethData = data.find((d: { symbol: string }) => d.symbol === 'ETHUSDT');
        if (btcData && ethData) setLivePrices({ btc: fmt(btcData), eth: fmt(ethData) });
      } catch { /* silent */ }
    };
    fetchPrices();
    const iv = setInterval(fetchPrices, 12000);
    return () => clearInterval(iv);
  }, []);

  const isWrong = mounted && isConnected && chainId !== SUPPORTED_CHAIN_ID;
  const isReady = isConnected && !isWrong;

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isPending) setFaucetState('pending');
    else if (isConfirming) setFaucetState('confirming');
    else if (isSuccess) { setFaucetState('done'); setTimeout(() => setFaucetState('idle'), 6000); }
  }, [isPending, isConfirming, isSuccess]);

  const claimFaucet = () => {
    if (!isReady || faucetState !== 'idle') return;
    writeContract({
      address: CONTRACTS.USDC.address as `0x${string}`,
      abi: [{ name: 'faucet', type: 'function', inputs: [], outputs: [], stateMutability: 'nonpayable' }] as const,
      functionName: 'faucet',
    });
  };

  // ── useSwitchChain from wagmi works uniformly across MetaMask, OKX, Bitget.
  // It automatically calls wallet_addEthereumChain if the chain is not yet added.
  const switchNet = () => switchChain({ chainId: SUPPORTED_CHAIN_ID });

  const tickerItems = [
    { label: 'BTC/USDT', value: livePrices.btc.price, badge: (livePrices.btc.up ? '▲ ' : '▼ ') + livePrices.btc.change, up: livePrices.btc.up, href: null },
    { label: 'ETH/USDT', value: livePrices.eth.price, badge: (livePrices.eth.up ? '▲ ' : '▼ ') + livePrices.eth.change, up: livePrices.eth.up, href: null },
    { label: 'MAX LEV', value: '50×', badge: 'Isolated', up: true, href: null },
    { label: 'NETWORK', value: 'Polkadot Hub', badge: '● Live', up: true, href: null },
    { label: 'MOCK USDC', value: '10,000', badge: 'Free/24h', up: true, href: null },
    { label: 'DOT FAUCET', value: 'Polkadot Token Faucet', badge: '● Get PAS', up: true, href: 'https://faucet.polkadot.io/' },
    { label: 'CHAIN ID', value: '420420417', badge: 'EVM', up: null, href: null },
    { label: 'SETTLEMENT', value: '100% On-Chain', badge: 'Non-Custodial', up: true, href: null },
  ];

  const faucetLabel = faucetState === 'pending' ? 'Confirm in wallet…'
    : faucetState === 'confirming' ? 'Minting USDC…'
    : faucetState === 'done' ? '✓ 10,000 USDC Sent!'
    : '🪙 Get 10K USDC';

  return (
    <div style={{ minHeight: '100vh', background: '#FAFAF8', color: '#111827', fontFamily: "'Sora', 'DM Sans', system-ui, sans-serif", overflowX: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --amber: #C9860A; --amber-light: #F59E0B; --amber-pale: #FEF3C7;
          --ink: #111827; --ink-2: #374151; --ink-3: #6B7280; --ink-4: #9CA3AF;
          --surface: #FFFFFF; --surface-2: #F9FAFB; --surface-3: #F3F4F6;
          --border: #E5E7EB; --border-light: #F0F0EE;
          --green: #059669; --green-pale: #D1FAE5;
          --red: #DC2626; --red-pale: #FEE2E2;
          --radius-sm: 8px; --radius-md: 14px; --radius-lg: 20px; --radius-xl: 28px;
          --shadow-xs: 0 1px 3px rgba(0,0,0,0.06); --shadow-sm: 0 2px 8px rgba(0,0,0,0.06);
          --shadow-md: 0 4px 20px rgba(0,0,0,0.07); --shadow-lg: 0 8px 40px rgba(0,0,0,0.08);
        }
        body::before { content:''; position:fixed; inset:0; pointer-events:none; z-index:0;
          background-image: radial-gradient(circle at 20% 10%, rgba(251,191,36,0.07) 0%, transparent 50%),
                            radial-gradient(circle at 80% 80%, rgba(201,134,10,0.05) 0%, transparent 50%),
                            radial-gradient(circle at 55% 50%, rgba(16,185,129,0.03) 0%, transparent 40%); }
        .ticker-outer { background:#111827; border-bottom:1px solid rgba(255,255,255,0.06); height:40px; overflow:hidden; display:flex; align-items:center; position:relative; z-index:50; }
        .ticker-inner { display:flex; animation:scroll-left 48s linear infinite; width:max-content; align-items:center; }
        .ticker-inner:hover { animation-play-state:paused; }
        @keyframes scroll-left { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        .nav-link { font-size:15px; font-weight:600; color:var(--ink-2); text-decoration:none; padding:8px 4px; transition:color 0.2s; position:relative; white-space:nowrap; }
        .nav-link::after { content:''; position:absolute; bottom:0; left:0; right:0; height:2px; background:var(--amber-light); border-radius:2px; transform:scaleX(0); transition:transform 0.2s; }
        .nav-link:hover { color:var(--ink); }
        .nav-link:hover::after { transform:scaleX(1); }
        .card { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-lg); box-shadow:var(--shadow-sm); transition:box-shadow 0.25s, transform 0.25s, border-color 0.25s; }
        .card:hover { box-shadow:var(--shadow-md); transform:translateY(-3px); border-color:#D1D5DB; }
        .card-amber { background:linear-gradient(135deg,#FFFBEB 0%,#FEF3C7 100%); border-color:rgba(201,134,10,0.2); }
        .card-amber:hover { border-color:rgba(201,134,10,0.4); }
        .btn-primary { display:inline-flex; align-items:center; justify-content:center; gap:8px; background:var(--ink); color:white; font-family:'Sora',sans-serif; font-weight:700; font-size:15px; padding:13px 28px; border-radius:var(--radius-md); text-decoration:none; border:none; cursor:pointer; transition:background 0.2s, transform 0.2s, box-shadow 0.2s; box-shadow:0 4px 14px rgba(17,24,39,0.2); white-space:nowrap; }
        .btn-primary:hover { background:#000; transform:translateY(-2px); box-shadow:0 8px 20px rgba(17,24,39,0.25); }
        .btn-amber { display:inline-flex; align-items:center; justify-content:center; gap:8px; background:linear-gradient(135deg,#C9860A,#F59E0B); color:white; font-family:'Sora',sans-serif; font-weight:700; font-size:15px; padding:13px 28px; border-radius:var(--radius-md); text-decoration:none; border:none; cursor:pointer; transition:filter 0.2s, transform 0.2s, box-shadow 0.2s; box-shadow:0 4px 14px rgba(201,134,10,0.3); white-space:nowrap; }
        .btn-amber:hover:not(:disabled) { filter:brightness(1.08); transform:translateY(-2px); box-shadow:0 8px 24px rgba(201,134,10,0.4); }
        .btn-amber:disabled { opacity:0.55; cursor:not-allowed; transform:none; box-shadow:none; filter:none; }
        .btn-ghost { display:inline-flex; align-items:center; justify-content:center; gap:8px; background:white; color:var(--ink); font-family:'Sora',sans-serif; font-weight:600; font-size:15px; padding:12px 28px; border-radius:var(--radius-md); text-decoration:none; border:1.5px solid var(--border); cursor:pointer; transition:border-color 0.2s, background 0.2s, transform 0.2s; box-shadow:var(--shadow-xs); white-space:nowrap; }
        .btn-ghost:hover { border-color:var(--ink-3); background:#F9FAFB; transform:translateY(-1px); }
        .step-card { background:white; border:1.5px solid var(--border); border-radius:var(--radius-md); padding:20px 22px; display:flex; align-items:flex-start; gap:16px; transition:border-color 0.3s, box-shadow 0.3s; }
        .step-card.active { border-color:rgba(201,134,10,0.4); box-shadow:0 0 0 3px rgba(201,134,10,0.08); }
        .step-card.done { border-color:rgba(5,150,105,0.35); background:#F0FDF4; }
        .step-num { width:32px; height:32px; border-radius:50%; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:13px; color:white; }
        .feat-card { background:white; border:1px solid var(--border-light); border-radius:var(--radius-lg); padding:28px; transition:box-shadow 0.25s, transform 0.25s, border-color 0.25s; }
        .feat-card:hover { box-shadow:0 8px 32px rgba(0,0,0,0.07); transform:translateY(-4px); border-color:#D1D5DB; }
        .stat-badge { background:white; border:1px solid var(--border); border-radius:var(--radius-md); padding:22px 24px; text-align:center; transition:all 0.25s; box-shadow:var(--shadow-xs); }
        .stat-badge:hover { border-color:rgba(201,134,10,0.3); box-shadow:0 4px 16px rgba(201,134,10,0.1); transform:translateY(-2px); }
        .tag { display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:700; padding:5px 12px; border-radius:100px; font-family:'DM Mono',monospace; letter-spacing:0.03em; }
        .tag-green { background:var(--green-pale); color:var(--green); }
        .tag-amber { background:var(--amber-pale); color:var(--amber); }
        .tag-gray  { background:var(--surface-3); color:var(--ink-3); }
        .price-chip { display:inline-flex; align-items:center; gap:10px; background:white; border:1px solid var(--border); border-radius:var(--radius-sm); padding:8px 14px; box-shadow:var(--shadow-xs); transition:border-color 0.2s; }
        .price-chip:hover { border-color:rgba(201,134,10,0.3); }
        .ticker-link { text-decoration:none; transition:opacity 0.2s; }
        .ticker-link:hover { opacity:0.75; }
        .fade-up { animation:fadeUp 0.7s cubic-bezier(0.16,1,0.3,1) both; }
        .d1{animation-delay:0.05s} .d2{animation-delay:0.15s} .d3{animation-delay:0.25s} .d4{animation-delay:0.35s}
        @keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        .spinner { width:15px; height:15px; border-radius:50%; border:2px solid rgba(255,255,255,0.25); border-top-color:white; animation:spin 0.7s linear infinite; }
        .mobile-menu-overlay { position:fixed; inset:0; z-index:200; background:rgba(255,255,255,0.98); backdrop-filter:blur(16px); display:flex; flex-direction:column; padding:28px 24px; transform:translateX(100%); transition:transform 0.35s cubic-bezier(0.16,1,0.3,1); }
        .mobile-menu-overlay.open { transform:translateX(0); }
        .section-divider { height:1px; background:linear-gradient(90deg,transparent,var(--border),transparent); margin:0 auto; max-width:200px; }
        @media (max-width:1100px) { .hero-flex{flex-direction:column!important} .hero-right-col{width:100%!important;max-width:520px;margin:0 auto} .stats-row{grid-template-columns:repeat(2,1fr)!important} }
        @media (max-width:768px) {
          .desktop-only{display:none!important} .mobile-only{display:flex!important}
          .hero-h1{font-size:clamp(2rem,9vw,2.8rem)!important;line-height:1.1!important}
          .feat-grid{grid-template-columns:1fr!important} .stats-row{grid-template-columns:repeat(2,1fr)!important}
          main{padding:32px 16px 64px!important} .hero-flex{gap:36px!important;margin-bottom:48px!important}
          .card{border-radius:18px!important} .step-card{padding:16px!important} .feat-card{padding:20px!important}
          .stat-badge{padding:16px 12px!important} .btn-primary,.btn-amber,.btn-ghost{font-size:14px!important;padding:12px 20px!important}
          .price-chip{padding:6px 10px!important}
        }
        @media (max-width:400px) { .hero-h1{font-size:1.9rem!important} .stats-row{grid-template-columns:repeat(2,1fr)!important;gap:10px!important} main{padding:24px 14px 56px!important} }
        @media (min-width:769px) { .mobile-only{display:none!important} }
      `}</style>

      {isWrong && (
        <div style={{ background:'#FEF2F2', borderBottom:'1px solid #FECACA', padding:'10px 20px', display:'flex', alignItems:'center', justifyContent:'center', gap:16, flexWrap:'wrap', position:'relative', zIndex:60 }}>
          <span style={{ fontSize:13, fontWeight:700, color:'#B91C1C' }}>⚠️ Wrong network — switch to Polkadot Hub Testnet</span>
          <button onClick={switchNet} className="btn-primary" style={{ padding:'7px 16px', fontSize:12, borderRadius:8, boxShadow:'none' }}>Switch Now</button>
        </div>
      )}

      <header style={{ position:'sticky', top:0, zIndex:100, background:'rgba(250,250,248,0.92)', backdropFilter:'blur(20px)', borderBottom:'1px solid var(--border-light)', padding:'0 5%', height:68, display:'flex', alignItems:'center', justifyContent:'space-between', gap:24 }}>
        <Link href="/" style={{ display:'flex', alignItems:'center', gap:10, textDecoration:'none', flexShrink:0 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:'linear-gradient(135deg,#C9860A,#F59E0B)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:16, color:'white', boxShadow:'0 3px 10px rgba(201,134,10,0.3)' }}>N</div>
          <span style={{ fontSize:19, fontWeight:800, color:'var(--ink)', letterSpacing:'-0.02em', lineHeight:1 }}>Nexus<span style={{ color:'var(--amber)' }}>OS</span></span>
        </Link>
        <nav className="desktop-only" style={{ display:'flex', alignItems:'center', gap:36 }}>
          <Link href="/trade" className="nav-link">Trade</Link>
          <Link href="/vaults" className="nav-link">Vaults</Link>
          <Link href="/portfolio" className="nav-link">Portfolio</Link>
          <Link href="/docs" className="nav-link">Docs</Link>
        </nav>
        <div style={{ display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
          <button onClick={claimFaucet} disabled={!isReady || faucetState !== 'idle'} className="desktop-only btn-amber" style={{ padding:'9px 18px', fontSize:13, borderRadius:10, boxShadow:'0 2px 10px rgba(201,134,10,0.2)' }}>
            {faucetState==='pending'||faucetState==='confirming' ? <><div className="spinner"/>&nbsp;Minting…</> : faucetState==='done' ? '✓ USDC Received' : !isReady ? '🪙 USDC Faucet' : '🪙 Get 10K USDC'}
          </button>
          <a href="https://faucet.polkadot.io/" target="_blank" rel="noopener noreferrer" className="desktop-only btn-ghost" style={{ padding:'9px 16px', fontSize:13, borderRadius:10, gap:6, textDecoration:'none' }}>
            🔴 PAS Faucet ↗
          </a>
          <div className="desktop-only"><ConnectButton chainStatus="none" showBalance={false} /></div>
          <button className="mobile-only" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} style={{ background:'none', border:'1px solid var(--border)', borderRadius:8, width:40, height:40, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, cursor:'pointer', color:'var(--ink)', flexShrink:0 }}>
            {isMobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>
      </header>

      <div className={`mobile-menu-overlay ${isMobileMenuOpen ? 'open' : ''}`}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:48 }}>
          <span style={{ fontSize:20, fontWeight:800, color:'var(--ink)' }}>NexusOS</span>
          <button onClick={() => setIsMobileMenuOpen(false)} style={{ background:'none', border:'1px solid var(--border)', borderRadius:8, width:40, height:40, cursor:'pointer', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
          {[['Trade','/trade'],['Vaults','/vaults'],['Portfolio','/portfolio'],['Docs','/docs']].map(([label,href]) => (
            <Link key={href} href={href} onClick={() => setIsMobileMenuOpen(false)} style={{ fontSize:22, fontWeight:700, color:'var(--ink)', textDecoration:'none', padding:'14px 8px', borderBottom:'1px solid var(--border-light)' }}>{label}</Link>
          ))}
        </div>
        <div style={{ marginTop:'auto', display:'flex', flexDirection:'column', gap:12, paddingTop:32 }}>
          <button onClick={claimFaucet} disabled={!isReady || faucetState !== 'idle'} className="btn-amber" style={{ width:'100%', padding:'14px' }}>{faucetLabel}</button>
          <ConnectButton chainStatus="name" showBalance={false} />
        </div>
      </div>

      <div className="ticker-outer">
        <div className="ticker-inner">
          {[...Array(2)].map((_,gi) => tickerItems.map((item,i) => {
            const inner = (
              <div key={`${gi}-${i}`} style={{ display:'flex', alignItems:'center', gap:10, padding:'0 28px', borderRight:'1px solid rgba(255,255,255,0.07)', height:'100%', flexShrink:0 }}>
                <span style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:item.href?'#FCD34D':'rgba(255,255,255,0.45)', letterSpacing:'0.06em', fontWeight:500 }}>{item.label}</span>
                <span style={{ fontFamily:"'DM Mono',monospace", fontSize:12, color:'white', fontWeight:700 }}>{item.value}</span>
                <span style={{ fontFamily:"'DM Mono',monospace", fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:5, background:item.up===null?'rgba(255,255,255,0.08)':item.up?'rgba(16,185,129,0.15)':'rgba(239,68,68,0.15)', color:item.up===null?'rgba(255,255,255,0.45)':item.up?'#34D399':'#F87171' }}>{item.badge}</span>
                {item.href && <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:'#FCD34D', fontWeight:600 }}>↗</span>}
              </div>
            );
            return item.href ? <a key={`${gi}-${i}`} href={item.href} target="_blank" rel="noopener noreferrer" className="ticker-link">{inner}</a> : inner;
          }))}
        </div>
      </div>

      <main style={{ position:'relative', zIndex:10, maxWidth:1240, margin:'0 auto', padding:'clamp(56px,7vw,96px) 5% 96px' }}>
        <div className="hero-flex fade-up d1" style={{ display:'flex', gap:64, alignItems:'center', justifyContent:'space-between', marginBottom:96, flexWrap:'wrap' }}>
          <div style={{ flex:1, minWidth:300 }}>
            <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'6px 14px', borderRadius:100, background:'white', border:'1px solid var(--border)', boxShadow:'var(--shadow-xs)', marginBottom:28 }}>
              <span style={{ width:7, height:7, borderRadius:'50%', background:isReady?'#10B981':'#F59E0B', boxShadow:isReady?'0 0 6px #10B981':'' }} />
              <span style={{ fontFamily:"'DM Mono',monospace", fontSize:12, fontWeight:600, color:'var(--ink-2)', letterSpacing:'0.03em' }}>
                {!mounted?'Initializing…':!isConnected?'Not Connected':isWrong?'Wrong Network':'Polkadot Hub · Live'}
              </span>
            </div>
            <h1 className="hero-h1" style={{ fontSize:'clamp(3rem,5.5vw,5rem)', fontWeight:800, lineHeight:1.06, letterSpacing:'-0.03em', marginBottom:22, color:'var(--ink)' }}>
              Trade Perps.<br />
              <span style={{ background:'linear-gradient(135deg,#C9860A 0%,#F59E0B 60%,#C9860A 100%)', backgroundSize:'200% auto', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', animation:'shimmer 4s linear infinite' }}>Own Your Edge.</span>
            </h1>
            <style>{`@keyframes shimmer{to{background-position:200% center}}`}</style>
            <p style={{ fontSize:'clamp(15px,1.8vw,18px)', lineHeight:1.65, color:'var(--ink-3)', maxWidth:500, marginBottom:40, fontWeight:400 }}>
              Institutional-grade perpetuals on Polkadot Hub. Trade BTC and ETH with up to{' '}
              <strong style={{ color:'var(--ink-2)', fontWeight:700 }}>50× leverage</strong> using strict isolated margin and on-chain settlement.
            </p>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:36 }}>
              {[
                { sym:'BTC', price:livePrices.btc.price, up:livePrices.btc.up, ch:livePrices.btc.change, color:'#F7931A' },
                { sym:'ETH', price:livePrices.eth.price, up:livePrices.eth.up, ch:livePrices.eth.change, color:'#627EEA' },
              ].map(c => (
                <div key={c.sym} className="price-chip">
                  <span style={{ fontFamily:"'DM Mono',monospace", fontSize:11, fontWeight:700, color:c.color }}>{c.sym}</span>
                  <span style={{ fontFamily:"'DM Mono',monospace", fontSize:13, fontWeight:700, color:'var(--ink)' }}>{c.price}</span>
                  <span style={{ fontFamily:"'DM Mono',monospace", fontSize:11, fontWeight:700, color:c.up?'var(--green)':'var(--red)', background:c.up?'var(--green-pale)':'var(--red-pale)', padding:'2px 7px', borderRadius:5 }}>{c.up?'▲ ':'▼ '}{c.ch}</span>
                </div>
              ))}
            </div>
            <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
              <Link href="/trade" className="btn-primary">Start Trading ↗</Link>
              <Link href="/vaults" className="btn-ghost">Provide Liquidity</Link>
            </div>
          </div>

          <div className="hero-right-col" style={{ width:420, flexShrink:0 }}>
            <div className="card" style={{ padding:28, borderRadius:'var(--radius-xl)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
                <h2 style={{ fontSize:18, fontWeight:800, color:'var(--ink)', letterSpacing:'-0.01em' }}>Quick Start</h2>
                <span className="tag tag-amber">3 Steps</span>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

                <div className={`step-card ${isConnected&&!isWrong?'done':!isConnected?'active':''}`}>
                  <div className="step-num" style={{ background:isConnected&&!isWrong?'var(--green)':'var(--ink)' }}>{isConnected&&!isWrong?'✓':'1'}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:'var(--ink)', marginBottom:6 }}>{isConnected&&!isWrong?'Wallet Connected':'Connect Wallet'}</div>
                    {isWrong
                      ? <button onClick={switchNet} className="btn-primary" style={{ padding:'8px 16px', fontSize:12, borderRadius:8, boxShadow:'none', width:'100%' }}>Switch to Polkadot Hub</button>
                      : !isConnected ? <ConnectButton showBalance={false} />
                      : <span style={{ fontFamily:"'DM Mono',monospace", fontSize:12, color:'var(--green)', fontWeight:600 }}>{address?.slice(0,6)}…{address?.slice(-4)}</span>
                    }
                  </div>
                </div>

                <div className={`step-card ${faucetState==='done'?'done':isReady?'active':''}`} style={{ opacity:isReady?1:0.5 }}>
                  <div className="step-num" style={{ background:faucetState==='done'?'var(--green)':'var(--amber)' }}>{faucetState==='done'?'✓':'2'}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:'var(--ink)', marginBottom:2 }}>{faucetState==='done'?'10,000 USDC Received!':'Get Testnet USDC'}</div>
                    <div style={{ fontSize:12, color:'var(--ink-4)', marginBottom:12 }}>Claim 10,000 MockUSDC free every 24h</div>
                    <button onClick={claimFaucet} disabled={!isReady||faucetState!=='idle'} className="btn-amber" style={{ width:'100%', padding:'11px', fontSize:13, borderRadius:10 }}>
                      {faucetState==='pending'||faucetState==='confirming' ? <><div className="spinner"/>&nbsp;{faucetState==='pending'?'Confirm in wallet…':'Minting…'}</> : faucetState==='done'?'✓ USDC Ready!':'🪙 Claim Free USDC'}
                    </button>
                    <a href="https://faucet.polkadot.io/" target="_blank" rel="noopener noreferrer"
                      style={{ marginTop:10, display:'flex', alignItems:'center', justifyContent:'center', gap:8, width:'100%', padding:'10px 14px', borderRadius:10, background:'#FEF3C7', border:'1.5px solid #F59E0B', fontFamily:"'DM Mono',monospace", fontSize:12, fontWeight:700, color:'#92400E', textDecoration:'none' }}>
                      🔴 Need PAS gas? → Get from Polkadot Faucet ↗
                    </a>
                  </div>
                </div>

                <div className="step-card" style={{ opacity:isReady?1:0.4 }}>
                  <div className="step-num" style={{ background:'var(--ink-3)' }}>3</div>
                  <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div>
                      <div style={{ fontSize:14, fontWeight:700, color:'var(--ink)' }}>Open a Position</div>
                      <div style={{ fontSize:12, color:'var(--ink-4)', marginTop:2 }}>BTC or ETH perpetuals</div>
                    </div>
                    <Link href="/trade" className="btn-primary" style={{ padding:'9px 18px', fontSize:13, borderRadius:10, boxShadow:'none' }}>Trade →</Link>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>

        <div className="stats-row fade-up d2" style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:80 }}>
          {[
            { v:'50×', l:'Max Leverage', sub:'Isolated Margin' },
            { v:'BTC · ETH', l:'Markets', sub:'Perpetuals' },
            { v:'0.025%', l:'Trading Fee', sub:'Per Trade' },
            { v:'100%', l:'On-Chain', sub:'Non-Custodial' },
          ].map(s => (
            <div key={s.l} className="stat-badge">
              <div style={{ fontSize:24, fontWeight:800, color:'var(--ink)', letterSpacing:'-0.02em', marginBottom:4 }}>{s.v}</div>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--ink-2)', marginBottom:2 }}>{s.l}</div>
              <div style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:'var(--ink-4)', fontWeight:500 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        <div className="section-divider fade-up" style={{ marginBottom:72 }} />

        <div className="fade-up d3">
          <div style={{ textAlign:'center', marginBottom:52 }}>
            <div className="tag tag-amber" style={{ marginBottom:16 }}>Protocol Features</div>
            <h2 style={{ fontSize:'clamp(1.8rem,3.5vw,2.6rem)', fontWeight:800, color:'var(--ink)', letterSpacing:'-0.025em', lineHeight:1.15, marginBottom:14 }}>Built for Polkadot Hub</h2>
            <p style={{ fontSize:16, color:'var(--ink-3)', maxWidth:520, margin:'0 auto', lineHeight:1.6 }}>Secure, transparent, and completely non-custodial infrastructure for perpetual trading.</p>
          </div>
          <div className="feat-grid" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:20 }}>
            {[
              { icon:'🏦', title:'Non-Custodial Vaults', body:'Funds are locked in audited smart contracts. Earn real yield by providing liquidity and acting as the counterparty.' },
              { icon:'⚡', title:'ERC-4337 Ready', body:'Built with Account Abstraction at its core. Architecting toward a completely gasless trading experience.' },
              { icon:'📡', title:'Tamper-Proof Oracles', body:'Real-time, aggregated price feeds eliminate scam wicks and guarantee fair, transparent liquidations.' },
              { icon:'🛡️', title:'Isolated Risk Engine', body:'Each trade is fully isolated. Maximum loss is strictly capped to the collateral assigned per position.' },
              { icon:'🤖', title:'Keeper Liquidations', body:'Decentralised liquidation engine automatically closes undercollateralised positions to protect LP solvency.' },
              { icon:'🌉', title:'XCM Interoperability', body:"Architected for cross-chain margin deposits using Polkadot's native Cross-Consensus Messaging protocol." },
            ].map(f => (
              <div key={f.title} className="feat-card">
                <div style={{ width:50, height:50, borderRadius:14, background:'var(--surface-2)', border:'1px solid var(--border-light)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, marginBottom:18 }}>{f.icon}</div>
                <h3 style={{ fontSize:16, fontWeight:800, color:'var(--ink)', marginBottom:8, letterSpacing:'-0.01em' }}>{f.title}</h3>
                <p style={{ fontSize:14, lineHeight:1.65, color:'var(--ink-3)', fontWeight:400 }}>{f.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="fade-up d4" style={{ marginTop:80 }}>
          <div className="card card-amber" style={{ padding:'clamp(36px,5vw,56px)', textAlign:'center', borderRadius:'var(--radius-xl)' }}>
            <div className="tag tag-amber" style={{ marginBottom:20 }}>Testnet Live</div>
            <h2 style={{ fontSize:'clamp(1.6rem,3vw,2.4rem)', fontWeight:800, color:'var(--ink)', letterSpacing:'-0.025em', marginBottom:14 }}>Start trading in under 60 seconds</h2>
            <p style={{ fontSize:16, color:'var(--ink-3)', maxWidth:480, margin:'0 auto 32px', lineHeight:1.6 }}>Connect your wallet, claim free USDC from the faucet, and open your first leveraged position on Polkadot Hub.</p>
            <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
              <Link href="/trade" className="btn-primary">Open Trade ↗</Link>
              <button onClick={claimFaucet} disabled={!isReady||faucetState!=='idle'} className="btn-amber">
                {faucetState==='done'?'✓ USDC Ready':'🪙 Get Free USDC'}
              </button>
            </div>
          </div>
        </div>
      </main>

      <footer style={{ position:'relative', zIndex:10, borderTop:'1px solid var(--border-light)', background:'white', padding:'32px 5%' }}>
        <div style={{ maxWidth:1240, margin:'0 auto', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:20 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:30, height:30, borderRadius:8, background:'var(--ink)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:13, color:'white' }}>N</div>
            <span style={{ fontSize:15, fontWeight:800, color:'var(--ink)', letterSpacing:'-0.01em' }}>NEXUS PROTOCOL</span>
          </div>
          <span style={{ fontFamily:"'DM Mono',monospace", fontSize:12, color:'var(--ink-4)', fontWeight:500 }}>Built for Polkadot Hub Hackathon 2026</span>
          <div style={{ display:'flex', gap:24 }}>
            <a href="https://github.com/NexTechArchitect/nexus-protocol-v2" target="_blank" rel="noopener noreferrer" style={{ fontSize:14, fontWeight:600, color:'var(--ink-3)', textDecoration:'none' }}>GitHub</a>
            <Link href="/docs" style={{ fontSize:14, fontWeight:600, color:'var(--ink-3)', textDecoration:'none' }}>Docs</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

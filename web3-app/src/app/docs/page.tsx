'use client';

import {
  useEffect, useRef, useState, useCallback, ReactNode, FC,
} from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface NavItem    { id: string; label: string }
interface NavSection { group: string; items: NavItem[] }
interface Deploy     { name: string; addr: string; tag: string }

/* ─── Icons ──────────────────────────────────────────────────────────────── */
const Svg: FC<{ d: string|string[]; size?: number; sw?: number }> = ({ d, size=18, sw=1.6 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    {Array.isArray(d) ? d.map((p,i) => <path key={i} d={p}/>) : <path d={d}/>}
  </svg>
);
const IC = {
  back:   <Svg d="M19 12H5M12 5l-7 7 7 7" size={15}/>,
  search: <Svg d={['M21 21l-4.35-4.35','M17 11A6 6 0 105 11a6 6 0 0012 0z']} size={15}/>,
  menu:   <Svg d={['M3 6h18','M3 12h18','M3 18h18']} size={20}/>,
  close:  <Svg d={['M18 6L6 18','M6 6l12 12']} size={20}/>,
  copy:   <Svg d={['M8 17.929H6c-1.105 0-2-.912-2-2.036V5.036C4 3.91 4.895 3 6 3h8c1.105 0 2 .911 2 2.036v1.866m-6 .17h8c1.105 0 2 .91 2 2.035v10.857C20 21.09 19.105 22 18 22h-8c-1.105 0-2-.911-2-2.036V9.107c0-1.124.895-2.036 2-2.036z']} size={13}/>,
  check:  <Svg d="M20 6L9 17l-5-5" size={13}/>,
  ext:    <Svg d={['M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6','M15 3h6v6','M10 14L21 3']} size={13}/>,
  db:     <Svg d={['M12 2C6.48 2 2 4.24 2 7s4.48 5 10 5 10-2.24 10-5-4.48-5-10-5z','M2 7v5c0 2.76 4.48 5 10 5s10-2.24 10-5V7','M2 12v5c0 2.76 4.48 5 10 5s10-2.24 10-5v-5']}/>,
  shield: <Svg d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>,
  trend:  <Svg d="M22 7l-8.5 8.5-5-5L2 17"/>,
  pulse:  <Svg d="M22 12h-4l-3 9L9 3l-3 9H2"/>,
  globe:  <Svg d={['M12 22a10 10 0 100-20 10 10 0 000 20z','M2 12h20','M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20']}/>,
  calc:   <Svg d={['M4 2h16a2 2 0 012 2v16a2 2 0 01-2 2H4a2 2 0 01-2-2V4a2 2 0 012-2z','M8 6h8M8 10h2M12 10h2M8 14h2M12 14h2M16 14h2M8 18h2M12 18h2M16 18h2']}/>,
  repeat: <Svg d={['M17 1l4 4-4 4','M3 11V9a4 4 0 014-4h14','M7 23l-4-4 4-4','M21 13v2a4 4 0 01-4 4H3']}/>,
  warn:   <Svg d={['M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z','M12 9v4','M12 17h.01']}/>,
  net:    <Svg d={['M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2v-4M9 21H5a2 2 0 01-2-2v-4m0 0h18']}/>,
};

/* ─── Nav data ───────────────────────────────────────────────────────────── */
const NAV: NavSection[] = [
  { group:'Overview', items:[
    { id:'overview',     label:'Protocol Overview' },
    { id:'architecture', label:'Architecture' },
    { id:'deployments',  label:'Contract Addresses' },
  ]},
  { group:'Vault Layer', items:[
    { id:'perps-vault',      label:'PerpsVault' },
    { id:'vault-lp',         label:'LP Liquidity Engine' },
    { id:'vault-collateral', label:'Trader Collateral' },
    { id:'vault-settlement', label:'Trade Settlement' },
  ]},
  { group:'Trading Engine', items:[
    { id:'position-manager', label:'PositionManager' },
    { id:'margin-modes',     label:'Margin Modes' },
    { id:'market-orders',    label:'Market Orders' },
    { id:'limit-orders',     label:'Limit Orders' },
    { id:'ccip-trades',      label:'Cross-Chain Trades' },
  ]},
  { group:'Risk Engine', items:[
    { id:'liquidation-engine', label:'LiquidationEngine' },
    { id:'batch-liquidation',  label:'Batch Processing' },
    { id:'keeper-system',      label:'Keeper Rewards' },
  ]},
  { group:'Oracles & Math', items:[
    { id:'price-oracle',   label:'PriceOracle' },
    { id:'pnl-calculator', label:'PnLCalculator' },
    { id:'perps-errors',   label:'PerpsErrors' },
  ]},
  { group:'Cross-Chain', items:[
    { id:'cross-chain-router', label:'CrossChainRouter' },
    { id:'message-receiver',   label:'MessageReceiver' },
  ]},
  { group:'Infrastructure', items:[
    { id:'test-suite',     label:'Test Suite' },
    { id:'security',       label:'Security Model' },
    { id:'local-setup',    label:'Local Setup' },
    { id:'frontend-stack', label:'Frontend Stack' },
  ]},
];

// ETH Feed and BTC Feed removed — not in .env
const DEPLOYS: Deploy[] = [
  { name:'MockWETH',          addr:'0xE3579516aeB339A4a8624beadaE256619E77F61E', tag:'Asset' },
  { name:'MockWBTC',          addr:'0x20e9D3Ef17753EC0a0349eA7e26c8B8fd2B1A119', tag:'Asset' },
  { name:'MockUSDC',          addr:'0xDFdb18430C5C5C1EB4F9Abd69a78952f9BC3Afab', tag:'Collateral' },
  { name:'PriceOracle',       addr:'0x7C002F51B8D4F06275D43cFD1F15EcbFE7A52803', tag:'Oracle' },
  { name:'PriceKeeper',       addr:'0x481EC593F7bD9aB4219a0d0A185C16F2687871C2', tag:'Oracle' },
  { name:'PerpsVault',        addr:'0x9495fE47049a7aFe8180E9e8Aee743D533c67173', tag:'Core' },
  { name:'PositionManager',   addr:'0xd16150d0B2a04ECb1Aa09f840556347D5251fB53', tag:'Core' },
  { name:'LiquidationEngine', addr:'0x01721d6502547faFD3049BE60b1485B12407f58B', tag:'Core' },
  { name:'CrossChainRouter',  addr:'0x8768d7470681a81caeA781285c9478dFDD7312e9', tag:'CCIP' },
  { name:'MessageReceiver',   addr:'0xdcd169ca4Ab081C1B926Dc56430ADa8fE1E10A64', tag:'CCIP' },
];

/* ─── Animation helpers ──────────────────────────────────────────────────── */
const Rise: FC<{ children:ReactNode; delay?:number }> = ({ children, delay=0 }) => {
  const ref = useRef(null);
  const ok  = useInView(ref, { once:true, margin:'-28px' });
  return (
    <motion.div ref={ref}
      initial={{ opacity:0, y:20 }}
      animate={ok ? { opacity:1, y:0 } : {}}
      transition={{ duration:0.6, ease:[0.22,1,0.36,1], delay }}>
      {children}
    </motion.div>
  );
};

/* ─── Atoms ──────────────────────────────────────────────────────────────── */
const tagColors: Record<string,{bg:string;color:string;border:string}> = {
  Core:       { bg:'rgba(30,64,175,0.07)',  color:'#1E40AF', border:'rgba(30,64,175,0.18)' },
  Oracle:     { bg:'rgba(6,95,70,0.07)',    color:'#065F46', border:'rgba(6,95,70,0.18)' },
  CCIP:       { bg:'rgba(91,33,182,0.07)',  color:'#5B21B6', border:'rgba(91,33,182,0.18)' },
  Asset:      { bg:'rgba(55,65,81,0.07)',   color:'#374151', border:'rgba(55,65,81,0.16)' },
  Collateral: { bg:'rgba(146,64,14,0.07)', color:'#92400E', border:'rgba(146,64,14,0.18)' },
};

const Badge: FC<{ tag:string }> = ({ tag }) => {
  const s = tagColors[tag] ?? tagColors.Asset;
  return (
    <span style={{ ...s, display:'inline-flex', alignItems:'center', padding:'2px 8px',
      borderRadius:99, fontSize:9.5, fontWeight:700, letterSpacing:'0.08em',
      textTransform:'uppercase', fontFamily:"'JetBrains Mono',monospace",
      whiteSpace:'nowrap' }}>{tag}</span>
  );
};

const Pill: FC<{ children:ReactNode; color?:'amber'|'green'|'blue'|'purple' }> = ({ children, color='amber' }) => {
  const map = {
    amber:  { bg:'rgba(146,64,14,0.07)',  color:'#92400E', bd:'rgba(146,64,14,0.18)' },
    green:  { bg:'rgba(6,95,70,0.07)',    color:'#065F46', bd:'rgba(6,95,70,0.2)' },
    blue:   { bg:'rgba(30,64,175,0.07)', color:'#1E40AF', bd:'rgba(30,64,175,0.18)' },
    purple: { bg:'rgba(91,33,182,0.07)', color:'#5B21B6', bd:'rgba(91,33,182,0.18)' },
  }[color];
  return (
    <span style={{ background:map.bg, color:map.color, border:`1px solid ${map.bd}`,
      display:'inline-flex', alignItems:'center', padding:'3px 9px', borderRadius:7,
      fontSize:10.5, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase',
      fontFamily:"'JetBrains Mono',monospace", whiteSpace:'nowrap' }}>{children}</span>
  );
};

const M: FC<{ children:string }> = ({ children }) => (
  <code style={{ fontFamily:"'JetBrains Mono','Fira Code',monospace", fontSize:12.5,
    background:'rgba(146,64,14,0.07)', padding:'2px 7px', borderRadius:5,
    color:'#92400E', border:'1px solid rgba(146,64,14,0.15)', fontWeight:500 }}>{children}</code>
);

const P: FC<{ children:ReactNode }> = ({ children }) => (
  <p style={{ color:'#374151', fontSize:15.5, lineHeight:1.9, marginBottom:16 }}>{children}</p>
);

/* ─── Code block ─────────────────────────────────────────────────────────── */
const Code: FC<{ title:string; lang?:string; children:string }> = ({ title, lang='SOL', children }) => {
  const [ok, setOk] = useState(false);
  return (
    <Rise>
      <div style={{ borderRadius:14, overflow:'hidden', margin:'20px 0',
        boxShadow:'0 2px 4px rgba(0,0,0,0.06),0 12px 36px rgba(0,0,0,0.09)',
        border:'1px solid rgba(0,0,0,0.06)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'10px 16px', background:'#1C1917',
          borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ display:'flex', gap:5 }}>
              {['#FF5F56','#FFBD2E','#27C93F'].map(c=>(
                <div key={c} style={{ width:10, height:10, borderRadius:'50%', background:c, opacity:0.85 }}/>
              ))}
            </div>
            <span style={{ fontSize:11.5, color:'rgba(255,255,255,0.3)',
              fontFamily:"'JetBrains Mono',monospace" }}>{title}</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:9, color:'#F59E0B', fontFamily:"'JetBrains Mono',monospace",
              letterSpacing:'0.14em', opacity:0.75 }}>{lang}</span>
            <motion.button
              onClick={()=>{ navigator.clipboard.writeText(children); setOk(true); setTimeout(()=>setOk(false),2000); }}
              whileTap={{ scale:0.9 }}
              style={{ display:'flex', alignItems:'center', gap:5,
                background: ok ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.07)',
                border:`1px solid ${ok ? 'rgba(16,185,129,0.28)' : 'rgba(255,255,255,0.1)'}`,
                color: ok ? '#6EE7B7' : 'rgba(255,255,255,0.38)',
                borderRadius:7, padding:'4px 9px', cursor:'pointer',
                fontSize:11, fontFamily:"'JetBrains Mono',monospace", transition:'all 0.2s' }}>
              {ok ? <>{IC.check}&nbsp;Copied</> : <>{IC.copy}&nbsp;Copy</>}
            </motion.button>
          </div>
        </div>
        <pre style={{ background:'#0C0A09', margin:0, padding:'20px',
          overflowX:'auto', fontSize:13, lineHeight:1.9,
          fontFamily:"'JetBrains Mono','Fira Code',monospace",
          color:'#D6D3D1', letterSpacing:'0.01em' }}>
          <code>{children}</code>
        </pre>
      </div>
    </Rise>
  );
};

/* ─── Alert ──────────────────────────────────────────────────────────────── */
const Alert: FC<{ kind?:'warn'|'sec'|'info'; title:string; children:ReactNode }> = ({ kind='warn', title, children }) => {
  const cfg = {
    warn: { left:'#D97706', bg:'rgba(217,119,6,0.05)',  tc:'#92400E', icon:'⚡' },
    sec:  { left:'#DC2626', bg:'rgba(220,38,38,0.05)',  tc:'#991B1B', icon:'🛡' },
    info: { left:'#2563EB', bg:'rgba(37,99,235,0.05)',  tc:'#1E40AF', icon:'ℹ️' },
  }[kind];
  return (
    <Rise>
      <div style={{ background:cfg.bg, borderLeft:`3px solid ${cfg.left}`,
        borderRadius:'0 12px 12px 0', padding:'14px 20px', margin:'20px 0',
        border:`1px solid ${cfg.left}18`, borderLeftWidth:3 }}>
        <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:8 }}>
          <span style={{ fontSize:13 }}>{cfg.icon}</span>
          <span style={{ fontSize:10, fontWeight:800, color:cfg.tc, textTransform:'uppercase',
            letterSpacing:'0.12em', fontFamily:"'JetBrains Mono',monospace" }}>{title}</span>
        </div>
        <div style={{ fontSize:14, color:'#374151', lineHeight:1.8 }}>{children}</div>
      </div>
    </Rise>
  );
};

/* ─── Section heading ────────────────────────────────────────────────────── */
const SHead: FC<{ icon:ReactNode; title:string; sub?:string }> = ({ icon, title, sub }) => (
  <Rise>
    <div style={{ display:'flex', alignItems:'flex-start', gap:13, marginBottom:30,
      paddingBottom:22, borderBottom:'1px solid rgba(0,0,0,0.06)' }}>
      <div style={{ flexShrink:0, width:42, height:42, borderRadius:11,
        background:'rgba(146,64,14,0.07)', border:'1px solid rgba(146,64,14,0.16)',
        color:'#92400E', display:'flex', alignItems:'center', justifyContent:'center' }}>
        {icon}
      </div>
      <div>
        <h2 style={{ fontSize:'clamp(18px,3vw,22px)', fontWeight:800, color:'#0C0A09',
          letterSpacing:'-0.035em', margin:'0 0 4px',
          fontFamily:"'Plus Jakarta Sans',sans-serif" }}>{title}</h2>
        {sub && <p style={{ fontSize:11.5, color:'#9CA3AF', margin:0,
          fontFamily:"'JetBrains Mono',monospace" }}>{sub}</p>}
      </div>
    </div>
  </Rise>
);

const Sub: FC<{ n?:string; title:string; children:ReactNode }> = ({ n, title, children }) => (
  <div style={{ marginBottom:52 }}>
    <Rise>
      <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:20 }}>
        {n && <span style={{ fontSize:10, fontWeight:700, color:'#92400E',
          background:'rgba(146,64,14,0.07)', padding:'3px 9px', borderRadius:6,
          fontFamily:"'JetBrains Mono',monospace",
          border:'1px solid rgba(146,64,14,0.14)' }}>{n}</span>}
        <h3 style={{ fontSize:'clamp(15px,2.5vw,17px)', fontWeight:700, color:'#111827',
          margin:0, letterSpacing:'-0.02em',
          fontFamily:"'Plus Jakarta Sans',sans-serif" }}>{title}</h3>
      </div>
    </Rise>
    {children}
  </div>
);

const SEC: React.CSSProperties = { paddingTop:72, paddingBottom:72, borderBottom:'1px solid rgba(0,0,0,0.05)' };

/* ─── Sidebar ────────────────────────────────────────────────────────────── */
const Sidebar: FC<{
  active:string; q:string; setQ:(v:string)=>void;
  nav:NavSection[]; go:(id:string)=>void;
}> = ({ active, q, setQ, nav, go }) => (
  <div style={{ height:'100%', display:'flex', flexDirection:'column',
    background:'rgba(255,255,255,0.95)', backdropFilter:'blur(20px)',
    borderRight:'1px solid rgba(0,0,0,0.07)' }}>

    <div style={{ padding:'24px 18px 18px', borderBottom:'1px solid rgba(0,0,0,0.05)', flexShrink:0 }}>
      {/* back */}
      <motion.a href="/trade" whileHover={{ x:-2 }}
        style={{ display:'inline-flex', alignItems:'center', gap:7, fontSize:12.5, fontWeight:600,
          color:'#6B7280', textDecoration:'none', marginBottom:24, padding:'7px 13px',
          borderRadius:9, background:'#F9FAFB', border:'1px solid rgba(0,0,0,0.08)',
          minHeight:38, transition:'color 0.15s' }}>
        {IC.back} Return to App
      </motion.a>

      {/* brand */}
      <div style={{ display:'flex', alignItems:'center', gap:11, marginBottom:18 }}>
        <div style={{ width:38, height:38, borderRadius:10, flexShrink:0,
          background:'linear-gradient(135deg,#B45309,#D97706)',
          display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow:'0 4px 12px rgba(180,83,9,0.25)' }}>
          <span style={{ color:'#fff', fontWeight:900, fontSize:17,
            fontFamily:"'Plus Jakarta Sans',sans-serif" }}>N</span>
        </div>
        <div>
          <p style={{ fontWeight:700, fontSize:14.5, color:'#111827', margin:'0 0 3px',
            fontFamily:"'Plus Jakarta Sans',sans-serif", letterSpacing:'-0.02em' }}>Nexus Protocol</p>
          <div style={{ display:'flex', alignItems:'center', gap:5 }}>
            <span style={{ width:5, height:5, borderRadius:'50%', background:'#10B981',
              display:'inline-block', flexShrink:0,
              animation:'pdot 2s ease-in-out infinite',
              boxShadow:'0 0 6px #10B98170' }}/>
            <span style={{ fontSize:10.5, color:'#9CA3AF',
              fontFamily:"'JetBrains Mono',monospace" }}>Polkadot Hub Testnet</span>
          </div>
        </div>
      </div>

      {/* search */}
      <div style={{ position:'relative' }}>
        <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)',
          color:'#9CA3AF', display:'flex', pointerEvents:'none', zIndex:1 }}>{IC.search}</span>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search docs…"
          style={{ width:'100%', boxSizing:'border-box', padding:'9px 12px 9px 33px',
            background:'#F9FAFB', border:'1.5px solid rgba(0,0,0,0.09)', borderRadius:10,
            fontSize:13, color:'#111827', outline:'none', fontFamily:'inherit',
            transition:'all 0.2s' }}
          onFocus={e=>{ e.currentTarget.style.borderColor='rgba(146,64,14,0.35)'; e.currentTarget.style.background='#fff'; e.currentTarget.style.boxShadow='0 0 0 3px rgba(146,64,14,0.08)'; }}
          onBlur={e=>{ e.currentTarget.style.borderColor='rgba(0,0,0,0.09)'; e.currentTarget.style.background='#F9FAFB'; e.currentTarget.style.boxShadow='none'; }}/>
      </div>
    </div>

    {/* nav */}
    <nav style={{ flex:1, overflowY:'auto', padding:'12px 10px 24px' }}>
      {nav.length===0 && (
        <p style={{ fontSize:13, color:'#9CA3AF', textAlign:'center', padding:'24px 12px', fontStyle:'italic' }}>
          No results for &ldquo;{q}&rdquo;
        </p>
      )}
      {nav.map((sec,i) => (
        <div key={i} style={{ marginBottom:22 }}>
          <p style={{ fontSize:9, fontWeight:800, color:'#B45309', textTransform:'uppercase',
            letterSpacing:'0.2em', padding:'0 10px', marginBottom:4,
            fontFamily:"'JetBrains Mono',monospace" }}>{sec.group}</p>
          {sec.items.map(item => {
            const on = active===item.id;
            return (
              <motion.button key={item.id} onClick={()=>go(item.id)}
                whileHover={!on ? { x:3 } : {}}
                whileTap={{ scale:0.97 }}
                style={{ display:'flex', alignItems:'center', gap:8, width:'100%', textAlign:'left',
                  padding:'7px 10px', borderRadius:8, marginBottom:1, minHeight:36,
                  fontSize:13.5, fontWeight: on ? 700 : 500,
                  color: on ? '#92400E' : '#6B7280',
                  background: on ? 'rgba(146,64,14,0.07)' : 'transparent',
                  border:`1px solid ${on ? 'rgba(146,64,14,0.16)' : 'transparent'}`,
                  cursor:'pointer', fontFamily:'inherit', transition:'all 0.14s' }}>
                {on && <span style={{ width:5, height:5, borderRadius:'50%',
                  background:'#B45309', flexShrink:0, display:'inline-block' }}/>}
                {item.label}
              </motion.button>
            );
          })}
        </div>
      ))}
    </nav>

    <div style={{ padding:'12px 16px', borderTop:'1px solid rgba(0,0,0,0.05)',
      display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
      <span style={{ fontSize:10.5, color:'#9CA3AF', fontFamily:"'JetBrains Mono',monospace" }}>v1.0 · 420420417</span>
      <Pill color="green">● Live</Pill>
    </div>
  </div>
);

/* ─── Page content ───────────────────────────────────────────────────────── */
const Content: FC = () => {
  const [cp, setCp] = useState('');
  const copy = (a:string) => { navigator.clipboard.writeText(a); setCp(a); setTimeout(()=>setCp(''),2000); };

  return (
    <div style={{ maxWidth:760, margin:'0 auto', padding:'0 clamp(16px,5vw,48px) 120px' }}>

      {/* ══ OVERVIEW ══════════════════════════════════════════════════════ */}
      <section id="overview" style={SEC}>
        {/* pill */}
        <Rise>
          <div style={{ display:'inline-flex', alignItems:'center', gap:7,
            padding:'5px 14px', borderRadius:99,
            background:'rgba(146,64,14,0.07)', border:'1px solid rgba(146,64,14,0.18)',
            marginBottom:28 }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background:'#10B981',
              display:'inline-block', flexShrink:0,
              animation:'pdot 2s ease-in-out infinite',
              boxShadow:'0 0 7px #10B98170' }}/>
            <span style={{ fontSize:10.5, fontWeight:700, color:'#92400E',
              textTransform:'uppercase', letterSpacing:'0.14em',
              fontFamily:"'JetBrains Mono',monospace" }}>
              Live · Polkadot Hub Testnet
            </span>
          </div>
        </Rise>

        {/* hero heading */}
        <Rise delay={0.04}>
          <h1 style={{ fontSize:'clamp(2.6rem,6.5vw,4.2rem)', fontWeight:900, color:'#0C0A09',
            margin:'0 0 8px', letterSpacing:'-0.05em', lineHeight:1.04,
            fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
            Nexus
            <span style={{ position:'relative', display:'inline' }}>
              &nbsp;Protocol
              <motion.span
                initial={{ scaleX:0 }} animate={{ scaleX:1 }}
                transition={{ duration:0.8, delay:0.6, ease:[0.22,1,0.36,1] }}
                style={{ position:'absolute', bottom:-3, left:8, right:0, height:3,
                  background:'linear-gradient(90deg,#B45309,rgba(180,83,9,0))',
                  borderRadius:2, transformOrigin:'left', display:'block' }}/>
            </span>
          </h1>
        </Rise>

        <Rise delay={0.08}>
          <p style={{ fontSize:13, color:'#9CA3AF', fontFamily:"'JetBrains Mono',monospace",
            marginBottom:44, lineHeight:1.6 }}>
            Technical Documentation · v1.0 · Chain ID 420420417
          </p>
        </Rise>

        {/* intro card */}
        <Rise delay={0.1}>
          <motion.div whileHover={{ y:-3, boxShadow:'0 14px 44px rgba(0,0,0,0.09)' }}
            transition={{ duration:0.2 }}
            style={{ background:'linear-gradient(135deg,#fff,#FFFBEB)',
              borderRadius:20, border:'1px solid rgba(146,64,14,0.14)',
              padding:'clamp(20px,4vw,30px)', marginBottom:22,
              boxShadow:'0 2px 4px rgba(0,0,0,0.04),0 16px 40px rgba(146,64,14,0.05)',
              cursor:'default' }}>
            <p style={{ fontSize:16, color:'#111827', lineHeight:1.9, marginBottom:12, fontWeight:500 }}>
              Nexus is a fully on-chain perpetuals exchange on{' '}
              <strong style={{ color:'#B45309' }}>Polkadot Hub Testnet</strong>.
              Trade BTC and ETH up to <strong>50× leverage</strong> — no off-chain order books, no trusted operators.
            </p>
            <p style={{ fontSize:14.5, color:'#6B7280', lineHeight:1.9, margin:0 }}>
              Five layers:{' '}
              <strong style={{ color:'#374151' }}>Vault</strong> for capital ·{' '}
              <strong style={{ color:'#374151' }}>Trading Engine</strong> for positions ·{' '}
              <strong style={{ color:'#374151' }}>Risk Engine</strong> for liquidations ·{' '}
              <strong style={{ color:'#374151' }}>Oracle</strong> for prices ·{' '}
              <strong style={{ color:'#374151' }}>Cross-Chain</strong> via CCIP.
            </p>
          </motion.div>
        </Rise>

        {/* network grid */}
        <Rise delay={0.13}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(148px,1fr))', gap:9, marginBottom:26 }}>
            {[
              { k:'Network',  v:'Polkadot Hub Testnet' },
              { k:'Chain ID', v:'420420417' },
              { k:'RPC',      v:'polkadothub-rpc.com' },
              { k:'Explorer', v:'blockscout-passet-hub' },
            ].map(({ k, v }) => (
              <div key={k} style={{ background:'#fff', border:'1px solid rgba(0,0,0,0.07)',
                borderRadius:12, padding:'12px 14px', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
                <p style={{ fontSize:9, color:'#B45309', textTransform:'uppercase', letterSpacing:'0.16em',
                  fontFamily:"'JetBrains Mono',monospace", fontWeight:800, marginBottom:6 }}>{k}</p>
                <p style={{ fontSize:11.5, color:'#6B7280', fontFamily:"'JetBrains Mono',monospace",
                  margin:0, wordBreak:'break-all', lineHeight:1.5 }}>{v}</p>
              </div>
            ))}
          </div>
        </Rise>

        {/* feature cards */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(168px,1fr))', gap:9 }}>
          {[
            { e:'🏦', t:'Single-Vault',    d:'All LP liquidity and trader collateral in PerpsVault.' },
            { e:'⚡', t:'Open Keepers',    d:'Any address calls batchLiquidate and earns 10% reward.' },
            { e:'🔗', t:'Polkadot Native', d:'Deployed on Polkadot Hub EVM-compatible parachain.' },
            { e:'📊', t:'Live Prices',     d:'Oracle auto-updated every 2 min via Binance WebSocket.' },
            { e:'🔐', t:'18-Dec Math',     d:'DECIMALS_SCALAR normalises USDC (6 dec) to 1e18.' },
            { e:'⛓️', t:'Cross-Chain',     d:'CrossChainRouter + MessageReceiver for full CCIP.' },
          ].map(({ e, t, d }, i) => (
            <Rise key={t} delay={0.04*i}>
              <motion.div
                whileHover={{ y:-5, borderColor:'rgba(146,64,14,0.2)',
                  boxShadow:'0 16px 32px rgba(0,0,0,0.07)' }}
                transition={{ duration:0.18 }}
                style={{ background:'#fff', borderRadius:15,
                  border:'1px solid rgba(0,0,0,0.07)', padding:'17px',
                  boxShadow:'0 1px 4px rgba(0,0,0,0.04)', height:'100%', cursor:'default' }}>
                <span style={{ fontSize:22, display:'block', marginBottom:10 }}>{e}</span>
                <p style={{ fontSize:13, fontWeight:700, color:'#111827', marginBottom:5, letterSpacing:'-0.01em' }}>{t}</p>
                <p style={{ fontSize:12, color:'#9CA3AF', lineHeight:1.65, margin:0 }}>{d}</p>
              </motion.div>
            </Rise>
          ))}
        </div>
      </section>

      {/* ══ ARCHITECTURE ════════════════════════════════════════════════════ */}
      <section id="architecture" style={SEC}>
        <SHead icon={IC.net} title="System Architecture" sub="Five-layer composable design" />
        <Rise><P>Capital deposits into <M>PerpsVault</M>, locking on position open via <M>PositionManager</M>.
          <M>PriceOracle</M> validates freshness every call. <M>PnLCalculator</M> checks position health.
          Below liquidation threshold, <M>LiquidationEngine</M> is open to any caller in the world.</P></Rise>

        <Rise delay={0.05}>
          <div style={{ background:'#fff', borderRadius:16, border:'1px solid rgba(0,0,0,0.07)',
            overflow:'hidden', marginBottom:24, boxShadow:'0 2px 12px rgba(0,0,0,0.04)' }}>
            <div style={{ padding:'11px 20px', background:'#FAFAF8',
              borderBottom:'1px solid rgba(0,0,0,0.05)' }}>
              <p style={{ fontSize:9, fontWeight:800, color:'#B45309', textTransform:'uppercase',
                letterSpacing:'0.2em', margin:0, fontFamily:"'JetBrains Mono',monospace" }}>Core Invariants</p>
            </div>
            {[
              ['No off-chain trust',   'Price, execution, liquidation, settlement — all fully on-chain.'],
              ['18-decimal precision', 'DECIMALS_SCALAR = 10^(18−tokenDecimals) normalises USDC to 1e18.'],
              ['Vault solvency',       '128 runs × 50 calls = 6,400 state mutations, zero reverts.'],
              ['Isolated default',     'Cross-margin uses _calculateGlobalPnL across all positions.'],
            ].map(([t,d],i,arr) => (
              <motion.div key={t} whileHover={{ background:'#FFFBEB' }} transition={{ duration:0.12 }}
                style={{ display:'flex', gap:20, padding:'12px 20px',
                  borderBottom: i<arr.length-1 ? '1px solid rgba(0,0,0,0.04)' : 'none',
                  background: i%2===0 ? '#fff' : '#FAFAF8', flexWrap:'wrap',
                  transition:'background 0.12s' }}>
                <span style={{ fontSize:11.5, fontFamily:"'JetBrains Mono',monospace",
                  fontWeight:700, color:'#B45309', minWidth:168, flexShrink:0 }}>{t}</span>
                <span style={{ fontSize:13.5, color:'#6B7280', lineHeight:1.75, flex:1 }}>{d}</span>
              </motion.div>
            ))}
          </div>
        </Rise>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(188px,1fr))', gap:9 }}>
          {[
            { g:'Vault Layer',    c:'#D97706', items:['PerpsVault.sol','LP Shares','Collateral Lock','settleTrade'] },
            { g:'Trading Engine', c:'#7C3AED', items:['PositionManager.sol','ISOLATED / CROSS','Market + Limit','Cross-Chain'] },
            { g:'Risk Engine',    c:'#DC2626', items:['LiquidationEngine.sol','Batch (max 20)','Keeper Rewards','Rescue Guard'] },
            { g:'Oracle & Math',  c:'#059669', items:['PriceOracle.sol','PnLCalculator.sol','MockAggregatorV3','Heartbeat Guard'] },
            { g:'Cross-Chain',    c:'#2563EB', items:['CrossChainRouter.sol','MessageReceiver.sol','CCIP Pipeline','Nonce Dedup'] },
            { g:'Price Keeper',   c:'#B45309', items:['PriceKeeper.sol','Binance feed','Auto 2-min push','60s cooldown'] },
          ].map(({ g, c, items },i) => (
            <motion.div key={g}
              initial={{ opacity:0, y:14 }} whileInView={{ opacity:1, y:0 }}
              viewport={{ once:true }} transition={{ delay:i*0.05 }}
              whileHover={{ y:-4, boxShadow:`0 14px 32px ${c}15` }}
              style={{ background:'#fff', border:`1px solid ${c}1E`, borderRadius:13,
                padding:'16px', boxShadow:'0 1px 4px rgba(0,0,0,0.04)', transition:'all 0.2s' }}>
              <p style={{ fontSize:9, fontWeight:800, color:c, textTransform:'uppercase',
                letterSpacing:'0.15em', marginBottom:10, fontFamily:"'JetBrains Mono',monospace" }}>{g}</p>
              {items.map((it,j) => (
                <p key={j} style={{ fontSize:11.5, fontFamily:"'JetBrains Mono',monospace",
                  color: j===0 ? '#111827' : '#9CA3AF',
                  marginBottom: j<items.length-1 ? 4 : 0, fontWeight: j===0 ? 600 : 400 }}>
                  {j===0 ? it : `└─ ${it}`}
                </p>
              ))}
            </motion.div>
          ))}
        </div>
      </section>

      {/* ══ DEPLOYMENTS ═════════════════════════════════════════════════════ */}
      <section id="deployments" style={SEC}>
        <SHead icon={IC.globe} title="Contract Addresses" sub="Polkadot Hub Testnet · Chain ID 420420417" />
        <Rise>
          <div style={{ background:'#fff', borderRadius:16, border:'1px solid rgba(0,0,0,0.07)',
            overflow:'hidden', boxShadow:'0 2px 12px rgba(0,0,0,0.04)' }}>
            {DEPLOYS.map((d,i) => (
              <motion.div key={d.addr} whileHover={{ background:'#FFFBEB' }}
                transition={{ duration:0.12 }}
                style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                  padding:'clamp(10px,2vw,13px) clamp(14px,3vw,20px)',
                  borderBottom: i<DEPLOYS.length-1 ? '1px solid rgba(0,0,0,0.04)' : 'none',
                  background: i%2===0 ? '#fff' : '#FAFAF8',
                  gap:12, flexWrap:'wrap', transition:'background 0.12s' }}>
                <div style={{ display:'flex', alignItems:'center', gap:9, minWidth:140 }}>
                  <span style={{ fontSize:13.5, fontWeight:600, color:'#111827' }}>{d.name}</span>
                  <Badge tag={d.tag}/>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                  <span style={{ fontSize:11, fontFamily:"'JetBrains Mono',monospace", color:'#9CA3AF' }}>
                    {d.addr.slice(0,10)}…{d.addr.slice(-6)}
                  </span>
                  <motion.button onClick={()=>copy(d.addr)}
                    whileHover={{ scale:1.04 }} whileTap={{ scale:0.95 }}
                    style={{ background: cp===d.addr ? 'rgba(5,150,105,0.08)' : 'rgba(146,64,14,0.07)',
                      border:`1px solid ${cp===d.addr ? 'rgba(5,150,105,0.22)' : 'rgba(146,64,14,0.18)'}`,
                      color: cp===d.addr ? '#065F46' : '#92400E',
                      cursor:'pointer', borderRadius:7, fontSize:10.5, fontWeight:700,
                      fontFamily:"'JetBrains Mono',monospace", padding:'4px 11px',
                      transition:'all 0.18s', letterSpacing:'0.06em', minHeight:30 }}>
                    {cp===d.addr ? '✓ COPIED' : 'COPY'}
                  </motion.button>
                </div>
              </motion.div>
            ))}
          </div>
        </Rise>
        <Alert kind="info" title="Block Explorer">
          <M>blockscout-passet-hub.parity-testnet.parity.io</M> — all contracts verified on-chain.
        </Alert>
      </section>

      {/* ══ VAULT ═══════════════════════════════════════════════════════════ */}
      <section id="perps-vault" style={SEC}>
        <SHead icon={IC.db} title="PerpsVault" sub="The capital layer — all funds live here" />
        <Rise><P><M>PerpsVault.sol</M> holds every dollar — LP liquidity and trader margin. Single vault, dual accounting, auditable solvency from one slot. LP funds cannot silently cover trader losses.</P></Rise>
        <Rise delay={0.05}>
          <div style={{ display:'flex', flexWrap:'wrap', gap:7, marginTop:14 }}>
            {['Ownable','ReentrancyGuard','Pausable'].map(t=>(
              <span key={t} style={{ display:'inline-flex', alignItems:'center', padding:'3px 10px',
                borderRadius:8, fontSize:11, fontWeight:600, background:'#F3F4F6',
                color:'#374151', border:'1px solid rgba(0,0,0,0.09)',
                fontFamily:"'JetBrains Mono',monospace" }}>{t}</span>
            ))}
            <Pill>MINIMUM_LIQUIDITY = 1000</Pill>
            <Pill>DECIMALS_SCALAR = 1e12</Pill>
          </div>
        </Rise>
      </section>

      <section id="vault-lp" style={SEC}>
        <Sub n="01" title="LP Liquidity Engine">
          <Rise><P>LPs call <M>addLiquidity()</M>. Formula: <M>shares = (amount × totalSupply) / totalAssets</M>. First deposit permanently burns <M>MINIMUM_LIQUIDITY (1,000)</M> to <M>address(0)</M> — blocks share-price inflation attacks forever.</P></Rise>
          <Code title="PerpsVault.sol — addLiquidity">{`function addLiquidity(uint256 amount) external nonReentrant whenNotPaused {
  uint256 normalised = amount * DECIMALS_SCALAR;
  uint256 supply     = totalLpShares;

  uint256 shares = supply == 0
    ? normalised - MINIMUM_LIQUIDITY   // genesis: burn 1000 permanently
    : (normalised * supply) / totalLiquidity;

  lpShares[msg.sender] += shares;
  totalLpShares        += shares;
  totalLiquidity       += normalised;
}`}</Code>
        </Sub>
      </section>

      <section id="vault-collateral" style={SEC}>
        <Sub n="02" title="Trader Collateral">
          <Rise><P>Traders call <M>deposit()</M>. USDC scaled to 18 dec via <M>DECIMALS_SCALAR</M>. All margin checks happen in <M>PositionManager</M> before any capital moves.</P></Rise>
          <Alert kind="sec" title="onlyPositionManager">
            <M>lockCollateral</M>, <M>unlockCollateral</M>, <M>settleTrade</M>, <M>transferByManager</M> — all gated. No backdoor exists.
          </Alert>
        </Sub>
      </section>

      <section id="vault-settlement" style={SEC}>
        <Sub n="03" title="Trade Settlement">
          <Rise><P><M>settleTrade(trader, locked, pnl)</M> atomically applies PnL and returns net payout. LP absorbs losses, pays profits — zero-sum, single transaction.</P></Rise>
          <Code title="PerpsVault.sol — settleTrade">{`function settleTrade(address user, uint256 amountLocked, int256 pnl)
  external onlyPositionManager nonReentrant
{
  uint256 payout = amountLocked;
  if (pnl >= 0) {
    payout         += uint256(pnl);
    totalLiquidity -= uint256(pnl);   // LP pays profit
  } else {
    uint256 loss    = uint256(-pnl);
    if (loss > amountLocked) loss = amountLocked;
    payout         -= loss;
    totalLiquidity += loss;           // LP collects loss
  }
  lockedCollateral[user] -= amountLocked;
  traderCollateral[user] += payout;
}`}</Code>
          <Alert kind="warn" title="Dust Withdrawal Patched">
            <M>scaledAmount % DECIMALS_SCALAR != 0</M> reverts on every withdrawal path. Eliminates fractional-wei drain exploits from the 6→18 decimal boundary.
          </Alert>
        </Sub>
      </section>

      {/* ══ POSITION MANAGER ════════════════════════════════════════════════ */}
      <section id="position-manager" style={SEC}>
        <SHead icon={IC.trend} title="PositionManager" sub="Sole contract with vault write access" />
        <Rise><P>Every trader action routes here. Position struct: collateral, leverage, entryPrice, isLong, isOpen, isCrossChain, marginMode.</P></Rise>
        <Rise delay={0.06}>
          <div style={{ display:'flex', flexWrap:'wrap', gap:7, marginTop:14 }}>
            {['Ownable','ReentrancyGuard','Pausable'].map(t=>(
              <span key={t} style={{ display:'inline-flex', padding:'3px 10px', borderRadius:8,
                fontSize:11, fontWeight:600, background:'#F3F4F6', color:'#374151',
                border:'1px solid rgba(0,0,0,0.09)', fontFamily:"'JetBrains Mono',monospace" }}>{t}</span>
            ))}
            <Pill>liquidationThresholdBps = 8000</Pill>
            <Pill color="green">maxLeverage = 50×</Pill>
          </div>
        </Rise>
      </section>

      <section id="margin-modes" style={SEC}>
        <Sub n="01" title="Margin Modes">
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:9, marginBottom:20 }}>
            {[
              { l:'ISOLATED', c:'#D97706', d:"Each position's margin is ring-fenced. Only that position is at risk on liquidation." },
              { l:'CROSS',    c:'#2563EB', d:'All free collateral shared across positions — higher leverage, cascade risk.' },
            ].map(({ l, c, d }) => (
              <motion.div key={l} whileHover={{ scale:1.02, y:-2 }}
                transition={{ duration:0.16 }}
                style={{ background:'#fff', border:`1.5px solid ${c}28`, borderRadius:13,
                  padding:'18px', boxShadow:'0 2px 8px rgba(0,0,0,0.04)' }}>
                <p style={{ fontSize:9.5, fontWeight:800, color:c, textTransform:'uppercase',
                  letterSpacing:'0.16em', marginBottom:9, fontFamily:"'JetBrains Mono',monospace" }}>{l}</p>
                <p style={{ fontSize:13.5, color:'#6B7280', lineHeight:1.75, margin:0 }}>{d}</p>
              </motion.div>
            ))}
          </div>
        </Sub>
      </section>

      <section id="market-orders" style={SEC}>
        <Sub n="02" title="Market Orders">
          <Rise><P><M>openPosition(token, collateral, leverage, isLong, mode)</M> — queries oracle, validates leverage, locks collateral, writes Position struct — all atomic and nonReentrant.</P></Rise>
          <Code title="PositionManager.sol — openPosition">{`function openPosition(
  address _token, uint256 _collateralDelta,
  uint256 _leverage, bool _isLong,
  IPerpsCore.MarginMode _mode
) external nonReentrant whenNotPaused {
  if (!whitelistedOracles[_token])  revert PerpsErrors.InvalidAsset();
  if (positions[msg.sender][_token].isOpen)
    revert PerpsErrors.PositionAlreadyExists();

  uint256 price = _getOraclePrice(_token);
  if (price == 0) revert PerpsErrors.InvalidPrice();

  VAULT.lockCollateral(msg.sender, _collateralDelta);
  _storePosition(msg.sender, _token, _collateralDelta,
    _leverage, _isLong, price, false, _mode);
}`}</Code>
        </Sub>
      </section>

      <section id="limit-orders" style={SEC}>
        <Sub n="03" title="Limit Orders">
          <Rise><P><M>placeLimitOrder()</M> locks full collateral immediately — no unfunded orders possible. Any caller executes at target price and earns <strong style={{ color:'#374151' }}>0.1% of collateral</strong> as keeper incentive.</P></Rise>
        </Sub>
      </section>

      <section id="ccip-trades" style={SEC}>
        <Sub n="04" title="Cross-Chain Execution">
          <Rise><P><M>executeCrossChainTrade()</M> gated to <M>crossChainReceiver</M>. If open fails after collateral arrives, full amount credited to trader's free balance — funds never silently lost.</P></Rise>
        </Sub>
      </section>

      {/* ══ LIQUIDATION ═════════════════════════════════════════════════════ */}
      <section id="liquidation-engine" style={SEC}>
        <SHead icon={IC.shield} title="LiquidationEngine" sub="Open keeper model — any address, 10% reward" />
        <Rise><P>No privileged admin. Any address calls <M>batchLiquidate()</M> and earns <strong style={{ color:'#111827' }}>10% per successful liquidation</strong>. Competitive keeper market, no single point of failure.</P></Rise>
      </section>

      <section id="batch-liquidation" style={SEC}>
        <Sub n="01" title="Batch Processing">
          <Code title="LiquidationEngine.sol">{`for (uint i = 0; i < _traders.length; i++) {
  IPerpsCore.Position memory pos =
    POSITION_MANAGER.getPosition(_traders[i], _tokens[i]);
  if (!pos.isOpen) {
    emit LiquidationFailed(_traders[i], _tokens[i], "not open");
    continue;  // never block the batch
  }
  try POSITION_MANAGER.liquidate(_traders[i], _tokens[i]) {
    successfulLiquidations++;
  } catch Error(string memory reason) {
    emit LiquidationFailed(_traders[i], _tokens[i], reason);
  }
}
if (successfulLiquidations > 0) _transferRewardsToKeeper();`}</Code>
        </Sub>
      </section>

      <section id="keeper-system" style={SEC}>
        <Sub n="02" title="Keeper Rewards">
          <Rise><P>Rewards forwarded atomically at batch end — no intermediate custodian.</P></Rise>
          <Alert kind="sec" title="PROTOCOL_ASSET Guard">
            <M>rescueTokens()</M> reverts unconditionally for <M>PROTOCOL_ASSET</M> — even a compromised owner cannot drain rewards.
          </Alert>
        </Sub>
      </section>

      {/* ══ ORACLE ══════════════════════════════════════════════════════════ */}
      <section id="price-oracle" style={SEC}>
        <SHead icon={IC.pulse} title="PriceOracle + PriceKeeper" sub="Mock feeds auto-synced via Binance" />
        <Rise><P><M>PriceOracle.sol</M> wraps <M>MockAggregatorV3</M> for 18-decimal prices with staleness guards.
          <M>PriceKeeper</M> auto-pushes Binance prices on-chain every 2 minutes from the frontend — no server needed.</P></Rise>
        <Code title="PriceOracle.sol — getPrice">{`function getPrice(address _token) external view returns (uint256) {
  AggregatorV3Interface feed = feeds[_token];
  if (address(feed) == address(0)) revert PerpsErrors.InvalidAsset();

  (, int256 rawPrice,, uint256 updatedAt,) = feed.latestRoundData();
  if (rawPrice <= 0) revert PerpsErrors.InvalidPrice();
  if (block.timestamp - updatedAt > heartbeats[_token])
    revert PerpsErrors.StalePrice();        // default: 2-hour window

  uint8 dec = feed.decimals();              // 8 → scale to 18
  return uint256(rawPrice) * (10 ** (TARGET_DECIMALS - dec));
}`}</Code>
      </section>

      <section id="pnl-calculator" style={SEC}>
        <SHead icon={IC.calc} title="PnLCalculator" sub="Pure library — no state, no ownership" />
        <Rise><P>Stateless pure library. Centralised arithmetic prevents rounding divergence between <M>PositionManager</M> and <M>LiquidationEngine</M>. All inputs validated before multiplication.</P></Rise>
        <Alert kind="warn" title="Overflow Safety">
          Both operands range-checked before multiplication. An unchecked overflow silently bypasses all health checks.
        </Alert>
      </section>

      <section id="perps-errors" style={SEC}>
        <SHead icon={IC.warn} title="PerpsErrors" sub="Centralised custom error registry" />
        <Rise>
          <div style={{ background:'#fff', borderRadius:16, border:'1px solid rgba(0,0,0,0.07)',
            overflow:'hidden', boxShadow:'0 2px 12px rgba(0,0,0,0.04)' }}>
            {([
              ['InvalidAsset',          'Token not whitelisted in oracle registry'],
              ['ZeroAmount',            'Deposit, withdrawal, or order amount is zero'],
              ['InsufficientCollateral','Margin below minimum to open position'],
              ['InvalidLeverage',       'Exceeds asset maximum (50×)'],
              ['PositionAlreadyExists', 'Open position already exists for this token'],
              ['NoPositionFound',       'Position does not exist in storage'],
              ['PositionHealthy',       'Health above liquidation threshold — cannot liquidate'],
              ['StalePrice',            'Oracle not updated within heartbeat window'],
              ['InvalidPrice',          'Oracle returned zero, negative, or malformed price'],
              ['Unauthorized',          'Caller is not registered PositionManager'],
            ] as [string,string][]).map(([err,desc],i,arr) => (
              <motion.div key={err} whileHover={{ background:'#FFFBEB' }}
                transition={{ duration:0.12 }}
                style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                  padding:'clamp(10px,2vw,12px) clamp(14px,3vw,20px)',
                  borderBottom: i<arr.length-1 ? '1px solid rgba(0,0,0,0.04)' : 'none',
                  background: i%2===0 ? '#fff' : '#FAFAF8',
                  gap:14, flexWrap:'wrap', transition:'background 0.12s' }}>
                <span style={{ fontSize:12, fontFamily:"'JetBrains Mono',monospace",
                  fontWeight:700, color:'#B45309', flexShrink:0 }}>{err}</span>
                <span style={{ fontSize:13, color:'#6B7280', flex:1 }}>{desc}</span>
              </motion.div>
            ))}
          </div>
        </Rise>
      </section>

      {/* ══ CROSS-CHAIN ═════════════════════════════════════════════════════ */}
      <section id="cross-chain-router" style={SEC}>
        <SHead icon={IC.repeat} title="CrossChainRouter" sub="Source chain — initiates trade flow" />
        <Rise><P>Encodes trade params + collateral into CCIP message, validates target chain allowlist, sends to <M>MessageReceiver</M>.</P></Rise>
      </section>

      <section id="message-receiver" style={SEC}>
        <SHead icon={IC.repeat} title="MessageReceiver" sub="Executes on Polkadot Hub" />
        <Rise><P>Decodes payload → deposits USDC → calls <M>executeCrossChainTrade</M>. Sender allowlist keyed by <M>(sourceChain, senderAddress)</M>.</P></Rise>
        <Alert kind="sec" title="Sender Allowlist Critical">
          Skipping this check allows arbitrary trade execution from any source chain address.
        </Alert>
      </section>

      {/* ══ TEST SUITE ══════════════════════════════════════════════════════ */}
      <section id="test-suite" style={SEC}>
        <SHead icon={IC.check} title="Test Suite" sub="95 tests · 0 failures · Foundry" />
        <Rise>
          <div style={{ background:'#fff', borderRadius:16, border:'1px solid rgba(0,0,0,0.07)',
            overflow:'hidden', marginBottom:20, boxShadow:'0 2px 12px rgba(0,0,0,0.04)' }}>
            <div style={{ display:'grid', gridTemplateColumns:'2fr 2fr 1fr 1fr 1fr',
              padding:'10px 20px', background:'#FAFAF8',
              fontSize:9, fontFamily:"'JetBrains Mono',monospace",
              fontWeight:800, color:'#9CA3AF', textTransform:'uppercase',
              letterSpacing:'0.1em', gap:10, borderBottom:'1px solid rgba(0,0,0,0.05)' }}>
              <span>Contract</span><span>Selector</span>
              <span style={{ textAlign:'right' }}>Calls</span>
              <span style={{ textAlign:'right' }}>Reverts</span>
              <span style={{ textAlign:'right' }}>Discards</span>
            </div>
            {[
              ['PositionHandler','changeOraclePrice','1,541','0','0'],
              ['PositionHandler','createTrader',     '1,603','0','1'],
              ['PositionHandler','openRandomPosition','1,659','0','0'],
              ['PositionHandler','tryLiquidation',   '1,598','0','0'],
            ].map(([c,s,calls,rev,dis],i) => (
              <motion.div key={s} whileHover={{ background:'#FFFBEB' }}
                transition={{ duration:0.12 }}
                style={{ display:'grid', gridTemplateColumns:'2fr 2fr 1fr 1fr 1fr',
                  padding:'10px 20px', gap:10, alignItems:'center',
                  background: i%2===0 ? '#fff' : '#FAFAF8',
                  borderBottom: i<3 ? '1px solid rgba(0,0,0,0.04)' : 'none',
                  transition:'background 0.12s' }}>
                <span style={{ fontSize:11.5, fontFamily:"'JetBrains Mono',monospace", color:'#374151', fontWeight:600 }}>{c}</span>
                <span style={{ fontSize:11.5, fontFamily:"'JetBrains Mono',monospace", color:'#B45309', fontWeight:600 }}>{s}</span>
                <span style={{ fontSize:11.5, fontFamily:"'JetBrains Mono',monospace", color:'#9CA3AF', textAlign:'right' }}>{calls}</span>
                <span style={{ fontSize:11.5, fontFamily:"'JetBrains Mono',monospace", color:'#059669', textAlign:'right', fontWeight:700 }}>{rev}</span>
                <span style={{ fontSize:11.5, fontFamily:"'JetBrains Mono',monospace", color:'#9CA3AF', textAlign:'right' }}>{dis}</span>
              </motion.div>
            ))}
          </div>
        </Rise>
        <Code title="Terminal" lang="SHELL">{`forge test        # 95 tests, ~3 seconds
forge coverage    # detailed coverage report
forge test -vvv   # full call traces`}</Code>
      </section>

      {/* ══ SECURITY ════════════════════════════════════════════════════════ */}
      <section id="security" style={SEC}>
        <SHead icon={IC.shield} title="Security Model" sub="Defense-in-depth on every surface" />
        <Rise>
          <div style={{ background:'#fff', borderRadius:16, border:'1px solid rgba(0,0,0,0.07)',
            overflow:'hidden', boxShadow:'0 2px 12px rgba(0,0,0,0.04)' }}>
            {[
              ['Oracle manipulation',    'Auto-updated every 2 min. Staleness heartbeat reverts stale reads.'],
              ['Reentrancy',             'ReentrancyGuard on settleTrade, transferByManager, batchLiquidate, deposit, withdraw.'],
              ['LP inflation attack',    'MINIMUM_LIQUIDITY = 1000 permanently burned to address(0) on genesis deposit.'],
              ['Dust sweep / drain',     'scaledAmount % DECIMALS_SCALAR != 0 reverts on every withdrawal path.'],
              ['Unauthorised mutations', 'onlyPositionManager blocks all direct vault state changes from other callers.'],
              ['Over-withdrawal',        'lockedCollateral tracking prevents withdrawing margin from open positions.'],
              ['Keeper rug pull',        'rescueTokens() reverts unconditionally for PROTOCOL_ASSET address.'],
              ['Wrong decimal prices',   'All prices normalised to 18-dec. Feed decimals validated on whitelist.'],
            ].map(([att,mit],i,arr) => (
              <motion.div key={att} whileHover={{ background:'#FFFBEB' }}
                transition={{ duration:0.12 }}
                style={{ display:'flex', gap:18, padding:'12px 20px',
                  background: i%2===0 ? '#fff' : '#FAFAF8',
                  borderBottom: i<arr.length-1 ? '1px solid rgba(0,0,0,0.04)' : 'none',
                  flexWrap:'wrap', transition:'background 0.12s' }}>
                <span style={{ fontSize:13, fontWeight:700, color:'#111827', minWidth:195, flexShrink:0 }}>{att}</span>
                <span style={{ fontSize:13.5, color:'#6B7280', lineHeight:1.75, flex:1 }}>{mit}</span>
              </motion.div>
            ))}
          </div>
        </Rise>
        <Alert kind="warn" title="No External Audit">
          No formal audit. Polkadot Hub testnet only — testnet assets, zero real-world value.
        </Alert>
      </section>

      {/* ══ LOCAL SETUP ═════════════════════════════════════════════════════ */}
      <section id="local-setup" style={SEC}>
        <SHead icon={IC.pulse} title="Local Setup" sub="Foundry + Next.js 16" />
        <Sub title="Smart Contracts">
          <Code title="Terminal" lang="SHELL">{`git clone https://github.com/NexTechArchitect/nexus-protocol-v2.git
cd nexus-protocol-v2 && forge install && forge test -vv

# Deploy — fill PRIVATE_KEY in .env
forge script script/deploy/01_DeployMocks.s.sol  --rpc-url polkadot-testnet --broadcast --legacy
forge script script/deploy/02_DeployOracle.s.sol --rpc-url polkadot-testnet --broadcast --legacy
forge script script/deploy/03_DeployVault.s.sol  --rpc-url polkadot-testnet --broadcast --legacy
forge script script/deploy/04_DeployCore.s.sol   --rpc-url polkadot-testnet --broadcast --legacy`}</Code>
        </Sub>
        <Sub title="Frontend">
          <Code title="Terminal" lang="SHELL">{`cd web3-app && npm install --legacy-peer-deps
npm run dev   # → http://localhost:3000`}</Code>
        </Sub>
        <Sub title="Network config">
          <Code title="foundry.toml" lang="TOML">{`[rpc_endpoints]
polkadot-testnet = "https://services.polkadothub-rpc.com/testnet"

[etherscan]
polkadot-testnet = { key = "no-key",
  url = "https://blockscout-passet-hub.parity-testnet.parity.io/api" }`}</Code>
        </Sub>
      </section>

      {/* ══ FRONTEND ════════════════════════════════════════════════════════ */}
      <section id="frontend-stack" style={SEC}>
        <SHead icon={IC.globe} title="Frontend Stack" sub="Next.js 16 · zero backend reads" />
        <Rise>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:9 }}>
            {[
              { l:'Framework',  v:'Next.js 16 · App Router' },
              { l:'Blockchain', v:'Wagmi v2 · Viem' },
              { l:'Wallet UI',  v:'RainbowKit · MetaMask · OKX' },
              { l:'Charts',     v:'TradingView · Binance WS' },
              { l:'Animations', v:'Framer Motion · CSS' },
              { l:'Network',    v:'Polkadot Hub (420420417)' },
            ].map(({ l, v }) => (
              <motion.div key={l}
                whileHover={{ y:-4, borderColor:'rgba(146,64,14,0.2)',
                  boxShadow:'0 12px 24px rgba(0,0,0,0.07)' }}
                transition={{ duration:0.18 }}
                style={{ background:'#fff', borderRadius:12,
                  border:'1px solid rgba(0,0,0,0.07)', padding:'15px 16px',
                  boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
                <p style={{ fontSize:9, fontWeight:800, color:'#B45309', textTransform:'uppercase',
                  letterSpacing:'0.18em', marginBottom:6, fontFamily:"'JetBrains Mono',monospace" }}>{l}</p>
                <p style={{ fontSize:13.5, color:'#111827', margin:0, fontWeight:600 }}>{v}</p>
              </motion.div>
            ))}
          </div>
        </Rise>
      </section>

      {/* ══ FOOTER ══════════════════════════════════════════════════════════ */}
      <footer style={{ paddingTop:80, textAlign:'center' }}>
        <Rise>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:12, marginBottom:14 }}>
            <div style={{ width:38, height:38, background:'linear-gradient(135deg,#B45309,#D97706)',
              borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center',
              boxShadow:'0 4px 14px rgba(180,83,9,0.28)' }}>
              <span style={{ color:'#fff', fontWeight:900, fontSize:18,
                fontFamily:"'Plus Jakarta Sans',sans-serif" }}>N</span>
            </div>
            <span style={{ fontSize:17, fontWeight:800, color:'#0C0A09', letterSpacing:'-0.03em',
              fontFamily:"'Plus Jakarta Sans',sans-serif" }}>NEXUS PROTOCOL</span>
            <Pill color="green">● Polkadot Hub</Pill>
          </div>
          <p style={{ fontSize:14.5, color:'#9CA3AF', maxWidth:400, margin:'0 auto 44px', lineHeight:1.8 }}>
            Deterministic perpetuals. Auto price feeds.<br/>Open-keeper liquidations. Built for Polkadot 2026.
          </p>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:24,
            borderTop:'1px solid rgba(0,0,0,0.07)', paddingTop:24, flexWrap:'wrap' }}>
            <span style={{ fontSize:12, fontFamily:"'JetBrains Mono',monospace", color:'#9CA3AF' }}>
              © 2026 Nexus Protocol · MIT
            </span>
            {[
              { label:'GitHub',   href:'https://github.com/NexTechArchitect/nexus-protocol-v2' },
              { label:'Live App', href:'https://nexus-protocol-v2.vercel.app' },
              { label:'DoraHacks',href:'https://dorahacks.io' },
            ].map(({ label, href }) => (
              <motion.a key={label} href={href} target="_blank" rel="noreferrer"
                whileHover={{ y:-1, color:'#B45309' }}
                style={{ display:'flex', alignItems:'center', gap:5, fontSize:13,
                  fontWeight:600, color:'#6B7280', textDecoration:'none',
                  transition:'color 0.15s' }}>
                {label} {IC.ext}
              </motion.a>
            ))}
          </div>
        </Rise>
      </footer>
    </div>
  );
};

/* ─── Root ───────────────────────────────────────────────────────────────── */
export default function NexusDocs() {
  const ref      = useRef<HTMLDivElement>(null);
  const [active, setActive]     = useState('overview');
  const [prog,   setProg]       = useState(0);
  const [mob,    setMob]        = useState(false);
  const [q,      setQ]          = useState('');

  useEffect(() => { document.title = 'Nexus Protocol — Docs'; }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fn = () => setProg(el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight) * 100);
    el.addEventListener('scroll', fn, { passive:true });
    return () => el.removeEventListener('scroll', fn);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      es => es.forEach(e => { if (e.isIntersecting) setActive(e.target.id); }),
      { root:el, threshold:0.22 },
    );
    el.querySelectorAll('section[id]').forEach(s => obs.observe(s));
    return () => obs.disconnect();
  }, []);

  const go = useCallback((id:string) => {
    const c = ref.current;
    if (!c) return;
    const t = c.querySelector(`#${id}`) as HTMLElement|null;
    if (!t) return;
    c.scrollTo({ top: t.getBoundingClientRect().top - c.getBoundingClientRect().top + c.scrollTop - 24, behavior:'smooth' });
    setMob(false);
  }, []);

  const nav: NavSection[] = NAV.map(s => ({
    ...s,
    items: s.items.filter(it =>
      !q || it.label.toLowerCase().includes(q.toLowerCase()) || s.group.toLowerCase().includes(q.toLowerCase())
    ),
  })).filter(s => s.items.length > 0);

  return (
    <div style={{ display:'flex', height:'100vh', background:'#FAFAF8',
      overflow:'hidden', fontFamily:"'DM Sans',-apple-system,sans-serif" }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&display=swap');
        *,*::before,*::after { box-sizing:border-box; margin:0; padding:0; }

        ::-webkit-scrollbar { width:4px; height:4px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:rgba(180,83,9,0.2); border-radius:99px; }
        ::-webkit-scrollbar-thumb:hover { background:rgba(180,83,9,0.42); }

        @keyframes pdot {
          0%,100% { opacity:1; box-shadow:0 0 7px #10B98180; }
          50%      { opacity:0.5; box-shadow:0 0 3px #10B98130; }
        }

        .sb { display:flex; flex-direction:column; }
        .mn { margin-left:280px; }
        .tb { display:none; }
        .gp { height:0; }

        @media (max-width:900px) {
          .sb { display:none !important; }
          .mn { margin-left:0 !important; }
          .tb { display:flex !important; }
          .gp { height:56px !important; }
        }
      `}</style>

      {/* progress */}
      <div style={{ position:'fixed', top:0, right:0, width:2, height:'100vh',
        background:'rgba(180,83,9,0.06)', zIndex:200 }}>
        <motion.div
          style={{ width:'100%', background:'linear-gradient(to bottom,#B45309,#D97706)',
            boxShadow:'0 0 8px rgba(180,83,9,0.4)' }}
          animate={{ height:`${prog}%` }}
          transition={{ duration:0.1 }}/>
      </div>

      {/* mobile top bar */}
      <div className="tb" style={{ position:'fixed', top:0, left:0, right:0, zIndex:120,
        alignItems:'center', justifyContent:'space-between', padding:'0 16px', height:56,
        background:'rgba(250,250,248,0.97)', backdropFilter:'blur(20px)',
        borderBottom:'1px solid rgba(0,0,0,0.07)',
        boxShadow:'0 1px 10px rgba(0,0,0,0.06)' }}>
        <motion.a href="/trade" whileHover={{ x:-2 }}
          style={{ display:'flex', alignItems:'center', gap:6, fontSize:12.5, fontWeight:600,
            color:'#6B7280', textDecoration:'none', padding:'7px 12px', minHeight:38,
            borderRadius:9, background:'#fff', border:'1px solid rgba(0,0,0,0.08)' }}>
          {IC.back} App
        </motion.a>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:28, height:28, borderRadius:8, flexShrink:0,
            background:'linear-gradient(135deg,#B45309,#D97706)',
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:'0 2px 8px rgba(180,83,9,0.3)' }}>
            <span style={{ color:'#fff', fontWeight:900, fontSize:14,
              fontFamily:"'Plus Jakarta Sans',sans-serif" }}>N</span>
          </div>
          <span style={{ fontWeight:700, fontSize:15, color:'#111827', letterSpacing:'-0.02em',
            fontFamily:"'Plus Jakarta Sans',sans-serif" }}>Nexus Docs</span>
        </div>
        <motion.button onClick={()=>setMob(v=>!v)} whileTap={{ scale:0.93 }}
          style={{ background:'#fff', border:'1px solid rgba(0,0,0,0.08)',
            borderRadius:9, width:38, height:38, cursor:'pointer', color:'#374151',
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:'0 1px 4px rgba(0,0,0,0.05)' }}>
          {mob ? IC.close : IC.menu}
        </motion.button>
      </div>

      {/* mobile drawer */}
      <AnimatePresence>
        {mob && (
          <>
            <motion.div key="ov"
              initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
              transition={{ duration:0.2 }}
              onClick={()=>setMob(false)}
              style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.22)',
                zIndex:130, backdropFilter:'blur(4px)' }}/>
            <motion.div key="dr"
              initial={{ x:-284 }} animate={{ x:0 }} exit={{ x:-284 }}
              transition={{ type:'spring', stiffness:380, damping:38 }}
              style={{ position:'fixed', top:0, left:0, height:'100%', width:280,
                zIndex:140, paddingTop:56,
                boxShadow:'6px 0 36px rgba(0,0,0,0.1)' }}>
              <Sidebar active={active} q={q} setQ={setQ} nav={nav} go={go}/>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* desktop sidebar */}
      <aside className="sb"
        style={{ position:'fixed', top:0, left:0, height:'100vh', width:280, zIndex:30 }}>
        <Sidebar active={active} q={q} setQ={setQ} nav={nav} go={go}/>
      </aside>

      {/* main */}
      <main ref={ref} className="mn"
        style={{ flex:1, height:'100vh', overflowY:'auto', position:'relative' }}>
        <div className="gp"/>
        <Content/>
      </main>
    </div>
  );
}

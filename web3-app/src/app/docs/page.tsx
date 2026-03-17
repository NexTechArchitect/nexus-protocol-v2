'use client';

import { useEffect, useRef, useState, useCallback, ReactNode, FC } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';

// ─── Types ────────────────────────────────────────────────────────────────────
type AlertType  = 'warning' | 'security' | 'info';
type TagVariant = 'default' | 'amber' | 'green' | 'red' | 'blue';
interface NavItem    { id: string; title: string; }
interface NavSection { label: string; items: NavItem[]; }
interface Deploy     { label: string; addr: string; }
type IconFn = FC;

// ─── Icons ────────────────────────────────────────────────────────────────────
const Ico: FC<{ d: string | string[]; s?: number; w?: number }> = ({ d, s = 18, w = 1.6 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p}/>) : <path d={d}/>}
  </svg>
);
const I = {
  DB:     () => <Ico d={['M12 2C6.48 2 2 4.24 2 7s4.48 5 10 5 10-2.24 10-5-4.48-5-10-5z','M2 7v5c0 2.76 4.48 5 10 5s10-2.24 10-5V7','M2 12v5c0 2.76 4.48 5 10 5s10-2.24 10-5v-5']}/>,
  Shield: () => <Ico d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>,
  Trend:  () => <Ico d="M22 7l-8.5 8.5-5-5L2 17"/>,
  Repeat: () => <Ico d={['M17 1l4 4-4 4','M3 11V9a4 4 0 014-4h14','M7 23l-4-4 4-4','M21 13v2a4 4 0 01-4 4H3']}/>,
  Calc:   () => <Ico d={['M4 2h16a2 2 0 012 2v16a2 2 0 01-2 2H4a2 2 0 01-2-2V4a2 2 0 012-2z','M8 6h8M8 10h2M12 10h2M8 14h2M12 14h2M16 14h2M8 18h2M12 18h2M16 18h2']}/>,
  Net:    () => <Ico d={['M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2v-4M9 21H5a2 2 0 01-2-2v-4m0 0h18']}/>,
  Globe:  () => <Ico d={['M12 22a10 10 0 100-20 10 10 0 000 20z','M2 12h20','M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20']}/>,
  Pulse:  () => <Ico d="M22 12h-4l-3 9L9 3l-3 9H2"/>,
  Search: () => <Ico d={['M21 21l-4.35-4.35','M17 11A6 6 0 105 11a6 6 0 0012 0z']} s={15}/>,
  Check:  () => <Ico d="M20 6L9 17l-5-5" s={14}/>,
  Warn:   () => <Ico d={['M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z','M12 9v4','M12 17h.01']}/>,
  Copy:   () => <Ico d={['M8 17.929H6c-1.105 0-2-.912-2-2.036V5.036C4 3.91 4.895 3 6 3h8c1.105 0 2 .911 2 2.036v1.866m-6 .17h8c1.105 0 2 .91 2 2.035v10.857C20 21.09 19.105 22 18 22h-8c-1.105 0-2-.911-2-2.036V9.107c0-1.124.895-2.036 2-2.036z']} s={13}/>,
  Back:   () => <Ico d="M19 12H5M12 5l-7 7 7 7" s={15}/>,
  Ext:    () => <Ico d={['M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6','M15 3h6v6','M10 14L21 3']} s={13}/>,
  Menu:   () => <Ico d={['M3 12h18','M3 6h18','M3 18h18']} s={21}/>,
  X:      () => <Ico d={['M18 6L6 18','M6 6l12 12']} s={21}/>,
  Chev:   () => <Ico d="M9 18l6-6-6-6" s={13}/>,
};

// ─── Design Tokens ────────────────────────────────────────────────────────────
const C = {
  amber:   '#B45309',
  amberBg: 'rgba(180,83,9,0.07)',
  amberBd: 'rgba(180,83,9,0.16)',
  amberLt: '#D97706',
  text:    '#111827',
  text2:   '#374151',
  muted:   '#6B7280',
  muted2:  '#9CA3AF',
  border:  'rgba(17,24,39,0.08)',
  border2: 'rgba(17,24,39,0.04)',
  surface: 'rgba(255,255,255,0.9)',
  green:   '#059669',
  blue:    '#2563EB',
  red:     '#DC2626',
};

// ─── Navigation Data ──────────────────────────────────────────────────────────
const NAV: NavSection[] = [
  { label: 'Genesis', items: [
    { id: 'overview',     title: 'Protocol Overview' },
    { id: 'architecture', title: 'System Architecture' },
    { id: 'deployments',  title: 'Contract Addresses' },
  ]},
  { label: 'Vault Layer', items: [
    { id: 'perps-vault',      title: 'PerpsVault' },
    { id: 'vault-lp',         title: 'LP Liquidity Engine' },
    { id: 'vault-collateral', title: 'Trader Collateral' },
    { id: 'vault-settlement', title: 'Trade Settlement' },
  ]},
  { label: 'Trading Engine', items: [
    { id: 'position-manager', title: 'PositionManager' },
    { id: 'margin-modes',     title: 'Margin Modes' },
    { id: 'market-orders',    title: 'Market Orders' },
    { id: 'limit-orders',     title: 'Limit Orders' },
    { id: 'ccip-trades',      title: 'Cross-Chain Trades' },
  ]},
  { label: 'Risk Engine', items: [
    { id: 'liquidation-engine', title: 'LiquidationEngine' },
    { id: 'batch-liquidation',  title: 'Batch Processing' },
    { id: 'keeper-system',      title: 'Keeper Rewards' },
  ]},
  { label: 'Oracles & Math', items: [
    { id: 'price-oracle',   title: 'PriceOracle' },
    { id: 'pnl-calculator', title: 'PnLCalculator' },
    { id: 'perps-errors',   title: 'PerpsErrors' },
  ]},
  { label: 'Cross-Chain', items: [
    { id: 'cross-chain-router', title: 'CrossChainRouter' },
    { id: 'message-receiver',   title: 'MessageReceiver' },
  ]},
  { label: 'Infrastructure', items: [
    { id: 'test-suite',     title: 'Test Suite' },
    { id: 'security',       title: 'Security Model' },
    { id: 'local-setup',    title: 'Local Setup' },
    { id: 'frontend-stack', title: 'Frontend Stack' },
  ]},
];

const DEPLOYS: Deploy[] = [
  { label: 'MockWETH',          addr: '0xE3579516aeB339A4a8624beadaE256619E77F61E' },
  { label: 'MockWBTC',          addr: '0x20e9D3Ef17753EC0a0349eA7e26c8B8fd2B1A119' },
  { label: 'MockUSDC',          addr: '0xDFdb18430C5C5C1EB4F9Abd69a78952f9BC3Afab' },
  { label: 'PriceOracle',       addr: '0x7C002F51B8D4F06275D43cFD1F15EcbFE7A52803' },
  { label: 'PriceKeeper',       addr: '0x481EC593F7bD9aB4219a0d0A185C16F2687871C2' },
  { label: 'ETH Feed (Mock)',    addr: '0xCbE91D0b302d4eD146eE0CFfbe0d23E93e655d94' },
  { label: 'BTC Feed (Mock)',    addr: '0xf3878A726cF855EDF11C8aCbA38bEBd817fa9F23' },
  { label: 'PerpsVault',        addr: '0x9495fE47049a7aFe8180E9e8Aee743D533c67173' },
  { label: 'PositionManager',   addr: '0xd16150d0B2a04ECb1Aa09f840556347D5251fB53' },
  { label: 'LiquidationEngine', addr: '0x01721d6502547faFD3049BE60b1485B12407f58B' },
  { label: 'CrossChainRouter',  addr: '0x8768d7470681a81caeA781285c9478dFDD7312e9' },
  { label: 'MessageReceiver',   addr: '0xdcd169ca4Ab081C1B926Dc56430ADa8fE1E10A64' },
];

// ─── Primitives ───────────────────────────────────────────────────────────────
const FadeUp: FC<{ children: ReactNode; delay?: number }> = ({ children, delay = 0 }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-20px' });
  return (
    <motion.div ref={ref}
      initial={{ opacity: 0, y: 14 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay }}>
      {children}
    </motion.div>
  );
};

const Tag: FC<{ children: ReactNode; v?: TagVariant; dot?: string }> = ({ children, v = 'default', dot }) => {
  const map: Record<TagVariant, { bg: string; color: string; border: string }> = {
    default: { bg: 'rgba(17,24,39,0.05)', color: C.muted,  border: C.border },
    amber:   { bg: C.amberBg,             color: C.amber,  border: C.amberBd },
    green:   { bg: 'rgba(5,150,105,0.07)', color: '#065F46', border: 'rgba(5,150,105,0.18)' },
    red:     { bg: 'rgba(220,38,38,0.07)', color: '#991B1B', border: 'rgba(220,38,38,0.16)' },
    blue:    { bg: 'rgba(37,99,235,0.07)', color: '#1E40AF', border: 'rgba(37,99,235,0.16)' },
  };
  const s = map[v];
  return (
    <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 6, fontSize: 10.5, fontWeight: 700,
      letterSpacing: '0.07em', textTransform: 'uppercase',
      fontFamily: "'IBM Plex Mono',monospace", whiteSpace: 'nowrap' }}>
      {dot && <span style={{ width: 5, height: 5, borderRadius: '50%', background: dot,
        flexShrink: 0, boxShadow: `0 0 5px ${dot}` }} />}
      {children}
    </span>
  );
};

const Mono: FC<{ children: string }> = ({ children }) => (
  <code style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12.5,
    background: C.amberBg, padding: '2px 7px', borderRadius: 5,
    color: C.amber, border: `1px solid ${C.amberBd}`, fontWeight: 500 }}>
    {children}
  </code>
);

const Para: FC<{ children: ReactNode }> = ({ children }) => (
  <p style={{ color: C.muted, fontSize: 15.5, lineHeight: 1.85, marginBottom: 14, fontWeight: 400 }}>{children}</p>
);

const CodeBlock: FC<{ title: string; children: string; lang?: string }> = ({ title, children, lang = 'SOLIDITY' }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(children); setCopied(true); setTimeout(() => setCopied(false), 2200); };
  return (
    <FadeUp>
      <div style={{ borderRadius: 16, overflow: 'hidden', margin: '20px 0',
        boxShadow: '0 2px 4px rgba(0,0,0,0.04), 0 16px 40px rgba(0,0,0,0.1)' }}>
        {/* titlebar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '11px 18px', background: '#181D2A',
          borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {['#FF5F56','#FFBD2E','#27C93F'].map(col => (
                <div key={col} style={{ width: 11, height: 11, borderRadius: '50%', background: col, opacity: 0.85 }} />
              ))}
            </div>
            <span style={{ fontSize: 12, color: 'rgba(148,163,184,0.6)', fontFamily: "'IBM Plex Mono',monospace" }}>{title}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 9.5, color: '#F59E0B', fontFamily: "'IBM Plex Mono',monospace", opacity: 0.7, letterSpacing: '0.12em' }}>{lang}</span>
            <button onClick={copy}
              style={{ background: copied ? 'rgba(5,150,105,0.2)' : 'rgba(255,255,255,0.08)',
                border: `1px solid ${copied ? 'rgba(5,150,105,0.4)' : 'rgba(255,255,255,0.12)'}`,
                cursor: 'pointer', borderRadius: 7, color: copied ? '#34D399' : 'rgba(148,163,184,0.5)',
                padding: '5px 8px', display: 'flex', transition: 'all 0.2s' }}>
              {copied ? <I.Check /> : <I.Copy />}
            </button>
          </div>
        </div>
        {/* code */}
        <pre style={{ background: '#0D1117', padding: '22px 20px', margin: 0, overflowX: 'auto',
          fontSize: 13, lineHeight: 1.9, color: '#C9D1D9',
          fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.01em' }}>
          <code>{children}</code>
        </pre>
      </div>
    </FadeUp>
  );
};

const AlertBox: FC<{ type?: AlertType; title: string; children: ReactNode }> = ({ type = 'warning', title, children }) => {
  const cfg = {
    warning:  { bc: '#D97706', bg: 'rgba(217,119,6,0.05)',  tc: '#92400E', icon: '⚡' },
    security: { bc: '#DC2626', bg: 'rgba(220,38,38,0.05)',  tc: '#991B1B', icon: '🛡' },
    info:     { bc: '#2563EB', bg: 'rgba(37,99,235,0.05)',  tc: '#1E40AF', icon: 'ℹ️' },
  }[type];
  return (
    <FadeUp>
      <div style={{ background: cfg.bg, borderLeft: `3px solid ${cfg.bc}`,
        border: `1px solid ${cfg.bc}22`, borderLeftWidth: 3,
        borderRadius: '0 14px 14px 0', padding: '16px 22px', margin: '20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span>{cfg.icon}</span>
          <span style={{ fontSize: 10.5, fontWeight: 800, color: cfg.tc, textTransform: 'uppercase',
            letterSpacing: '0.1em', fontFamily: "'IBM Plex Mono',monospace" }}>{title}</span>
        </div>
        <div style={{ fontSize: 14, color: C.text2, lineHeight: 1.8 }}>{children}</div>
      </div>
    </FadeUp>
  );
};

const STitle: FC<{ icon: IconFn; title: string; sub?: string; badge?: string }> = ({ icon: Ic, title, sub, badge }) => (
  <FadeUp>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 36,
      paddingBottom: 28, borderBottom: `1px solid ${C.border2}` }}>
      <div style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 13,
        background: 'linear-gradient(135deg,rgba(180,83,9,0.09),rgba(245,158,11,0.06))',
        border: `1.5px solid ${C.amberBd}`, color: C.amber,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 4px 14px ${C.amberBg}` }}>
        <Ic />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: sub ? 6 : 0 }}>
          <h2 style={{ fontSize: 'clamp(18px,3vw,22px)', fontWeight: 700, color: C.text,
            letterSpacing: '-0.025em', margin: 0,
            fontFamily: "'Fraunces','Georgia',serif" }}>{title}</h2>
          {badge && <Tag v="amber">{badge}</Tag>}
        </div>
        {sub && <p style={{ fontSize: 12.5, color: C.muted2, margin: 0, fontFamily: "'IBM Plex Mono',monospace" }}>{sub}</p>}
      </div>
    </div>
  </FadeUp>
);

const SubSection: FC<{ n?: string; title: string; children: ReactNode }> = ({ n, title, children }) => (
  <div style={{ marginBottom: 52 }}>
    <FadeUp>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
        {n && <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, fontWeight: 700,
          color: C.amber, background: C.amberBg, padding: '3px 8px', borderRadius: 6,
          border: `1px solid ${C.amberBd}` }}>{n}</span>}
        <h3 style={{ fontSize: 'clamp(15px,2.5vw,17px)', fontWeight: 700, color: C.text, margin: 0,
          letterSpacing: '-0.015em', fontFamily: "'Fraunces','Georgia',serif" }}>{title}</h3>
      </div>
    </FadeUp>
    {children}
  </div>
);

const SD: React.CSSProperties = { paddingTop: 68, paddingBottom: 68, borderBottom: `1px solid ${C.border2}` };

// ─── Sidebar ──────────────────────────────────────────────────────────────────
const Sidebar: FC<{
  active: string; search: string;
  setSearch: (v: string) => void;
  scrollTo: (id: string) => void;
  filteredNav: NavSection[];
}> = ({ active, search, setSearch, scrollTo, filteredNav }) => (
  <div style={{ display: 'flex', flexDirection: 'column', height: '100%',
    background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(28px) saturate(160%)',
    borderRight: `1px solid ${C.border}` }}>

    {/* Header */}
    <div style={{ padding: '26px 20px 18px', borderBottom: `1px solid ${C.border2}`, flexShrink: 0 }}>
      {/* Back button */}
      <a href="/trade"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600,
          color: C.muted, textDecoration: 'none', marginBottom: 26, padding: '8px 14px',
          borderRadius: 10, background: 'white', border: `1px solid ${C.border}`,
          transition: 'all 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.03)' }}
        onMouseEnter={e => { const el = e.currentTarget as HTMLAnchorElement; el.style.color = C.text; el.style.borderColor = C.amberBd; el.style.background = C.amberBg; }}
        onMouseLeave={e => { const el = e.currentTarget as HTMLAnchorElement; el.style.color = C.muted; el.style.borderColor = C.border; el.style.background = 'white'; }}>
        <I.Back /> Return to App
      </a>

      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0,
          background: 'linear-gradient(135deg,#C9860A,#F59E0B)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 14px rgba(201,134,10,0.28)' }}>
          <span style={{ color: '#fff', fontWeight: 900, fontSize: 18, lineHeight: 1,
            fontFamily: "'Fraunces',Georgia,serif", fontStyle: 'italic' }}>N</span>
        </div>
        <div>
          <p style={{ fontWeight: 700, fontSize: 15, color: C.text, margin: '0 0 4px',
            letterSpacing: '-0.01em', fontFamily: "'Fraunces',Georgia,serif" }}>Nexus Protocol</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.green,
              boxShadow: `0 0 7px ${C.green}`, display: 'inline-block' }} />
            <span style={{ fontSize: 11, color: C.muted2, fontFamily: "'IBM Plex Mono',monospace" }}>Polkadot Hub Testnet</span>
          </div>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
          color: C.muted2, display: 'flex', pointerEvents: 'none' }}>
          <I.Search />
        </span>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search docs…"
          style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(249,250,251,0.9)',
            border: `1.5px solid ${C.border}`, borderRadius: 11,
            padding: '9px 12px 9px 34px', fontSize: 13, color: C.text,
            outline: 'none', fontFamily: 'inherit', transition: 'all 0.2s',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}
          onFocus={e => { e.currentTarget.style.borderColor = C.amberBd; e.currentTarget.style.background = 'white'; e.currentTarget.style.boxShadow = `0 0 0 3px ${C.amberBg}`; }}
          onBlur={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = 'rgba(249,250,251,0.9)'; e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0,0,0,0.02)'; }} />
      </div>
    </div>

    {/* Nav links */}
    <nav style={{ flex: 1, overflowY: 'auto', padding: '14px 12px 28px' }}>
      {filteredNav.length === 0 && (
        <p style={{ fontSize: 13, color: C.muted2, textAlign: 'center', padding: '28px 12px',
          fontStyle: 'italic', lineHeight: 1.6 }}>
          No results for &ldquo;{search}&rdquo;
        </p>
      )}
      {filteredNav.map((sec, i) => (
        <div key={i} style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 9.5, fontWeight: 800, color: C.amber, textTransform: 'uppercase',
            letterSpacing: '0.18em', padding: '0 10px', marginBottom: 5,
            fontFamily: "'IBM Plex Mono',monospace" }}>
            {sec.label}
          </p>
          {sec.items.map(item => {
            const on = active === item.id;
            return (
              <button key={item.id} onClick={() => scrollTo(item.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left',
                  padding: '8px 10px', borderRadius: 9, marginBottom: 1,
                  fontSize: 13.5, fontWeight: on ? 700 : 500,
                  color: on ? C.amber : C.muted,
                  background: on ? C.amberBg : 'transparent',
                  border: `1px solid ${on ? C.amberBd : 'transparent'}`,
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.16s',
                  lineHeight: 1.4 }}
                onMouseEnter={e => { if (!on) { const el = e.currentTarget as HTMLButtonElement; el.style.color = C.text; el.style.background = 'rgba(17,24,39,0.04)'; }}}
                onMouseLeave={e => { if (!on) { const el = e.currentTarget as HTMLButtonElement; el.style.color = C.muted; el.style.background = 'transparent'; }}}>
                {on && <span style={{ flexShrink: 0, opacity: 0.6 }}><I.Chev /></span>}
                {item.title}
              </button>
            );
          })}
        </div>
      ))}
    </nav>

    {/* Version strip */}
    <div style={{ padding: '12px 18px', borderTop: `1px solid ${C.border2}`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
      <span style={{ fontSize: 10.5, color: C.muted2, fontFamily: "'IBM Plex Mono',monospace" }}>v1.0 · Chain 420420417</span>
      <Tag v="green" dot={C.green}>Live</Tag>
    </div>
  </div>
);

// ─── Page Content ─────────────────────────────────────────────────────────────
const Content: FC = () => {
  const [copied, setCopied] = useState('');
  const cp = (addr: string) => { navigator.clipboard.writeText(addr); setCopied(addr); setTimeout(() => setCopied(''), 2200); };

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 clamp(16px,5%,48px) 120px' }}>

      {/* ── OVERVIEW ─────────────────────────────────────────────────────────── */}
      <section id="overview" style={SD}>
        <FadeUp>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px',
            borderRadius: 99, background: C.amberBg, border: `1px solid ${C.amberBd}`, marginBottom: 28 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.green,
              boxShadow: `0 0 9px ${C.green}`, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: C.amber, textTransform: 'uppercase',
              letterSpacing: '0.14em', fontFamily: "'IBM Plex Mono',monospace" }}>
              Live · Polkadot Hub Testnet
            </span>
          </div>

          <h1 style={{ fontSize: 'clamp(2.4rem,6vw,4rem)', fontWeight: 400, color: C.text,
            margin: '0 0 12px', letterSpacing: '-0.04em', lineHeight: 1.06,
            fontFamily: "'Fraunces','Georgia',serif" }}>
            Nexus&nbsp;<em style={{ color: C.amberLt, fontStyle: 'italic' }}>Protocol</em>
          </h1>
          <p style={{ fontSize: 13.5, color: C.muted2, fontFamily: "'IBM Plex Mono',monospace",
            marginBottom: 44, lineHeight: 1.6 }}>
            Technical Documentation · v1.0 · Chain ID 420420417
          </p>
        </FadeUp>

        {/* Intro card */}
        <FadeUp delay={0.07}>
          <div style={{ background: 'linear-gradient(135deg,rgba(255,255,255,0.98),rgba(255,251,235,0.75))',
            borderRadius: 20, border: `1px solid ${C.amberBd}`,
            padding: 'clamp(20px,4vw,32px)', marginBottom: 28,
            boxShadow: '0 2px 4px rgba(0,0,0,0.03), 0 20px 50px rgba(180,83,9,0.05)' }}>
            <p style={{ fontSize: 16, color: C.text, lineHeight: 1.85, marginBottom: 14, fontWeight: 500 }}>
              Nexus is a fully on-chain perpetuals exchange deployed on{' '}
              <strong style={{ color: C.amberLt }}>Polkadot Hub Testnet</strong>.
              Trade BTC and ETH with up to <strong>50× leverage</strong> — no off-chain order books, no trusted operators, zero custody risk.
            </p>
            <p style={{ fontSize: 14.5, color: C.muted, lineHeight: 1.85, margin: 0 }}>
              Five composable layers: <strong style={{ color: C.text2 }}>Vault Layer</strong> for capital and solvency,{' '}
              <strong style={{ color: C.text2 }}>Trading Engine</strong> for position management,{' '}
              <strong style={{ color: C.text2 }}>Risk Engine</strong> for open-keeper liquidations,{' '}
              <strong style={{ color: C.text2 }}>Oracle Layer</strong> for tamper-resistant prices,
              and <strong style={{ color: C.text2 }}>Cross-Chain Layer</strong> for multi-chain execution via CCIP.
            </p>
          </div>
        </FadeUp>

        {/* Network info */}
        <FadeUp delay={0.11}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(155px,1fr))', gap: 10, marginBottom: 32 }}>
            {[
              { label: 'Network',  value: 'Polkadot Hub Testnet' },
              { label: 'Chain ID', value: '420420417' },
              { label: 'RPC',      value: 'polkadothub-rpc.com' },
              { label: 'Explorer', value: 'blockscout-passet-hub' },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: 'white', border: `1px solid ${C.border}`,
                borderRadius: 13, padding: '14px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.025)' }}>
                <p style={{ fontSize: 9.5, color: C.amber, textTransform: 'uppercase', letterSpacing: '0.15em',
                  fontFamily: "'IBM Plex Mono',monospace", fontWeight: 800, marginBottom: 7 }}>{label}</p>
                <p style={{ fontSize: 12, color: C.muted, fontFamily: "'IBM Plex Mono',monospace",
                  margin: 0, wordBreak: 'break-all', lineHeight: 1.5 }}>{value}</p>
              </div>
            ))}
          </div>
        </FadeUp>

        {/* Feature cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(175px,1fr))', gap: 10 }}>
          {[
            { e: '🏦', t: 'Single-Vault Design',  d: 'All LP liquidity and trader collateral in one PerpsVault.' },
            { e: '⚡', t: 'Open Keeper Model',    d: 'Any address calls batchLiquidate and earns a 10% liquidation fee.' },
            { e: '🔗', t: 'Polkadot Native',      d: 'Deployed on Polkadot Hub — EVM-compatible parachain.' },
            { e: '📊', t: 'Live Price Feeds',     d: 'Frontend auto-updates oracle prices every 2 minutes via Binance.' },
            { e: '🔐', t: '18-Dec Precision',     d: 'DECIMALS_SCALAR normalises USDC (6 dec) to 1e18 internally.' },
            { e: '⛓️', t: 'Cross-Chain Ready',    d: 'CrossChainRouter + MessageReceiver for full multi-chain execution.' },
          ].map(({ e, t, d }, i) => (
            <FadeUp key={t} delay={0.04 * i}>
              <motion.div whileHover={{ y: -4, borderColor: C.amberBd, boxShadow: `0 12px 28px rgba(180,83,9,0.09)` }}
                transition={{ duration: 0.2 }}
                style={{ background: 'white', borderRadius: 16, border: `1px solid ${C.border}`,
                  padding: '18px', boxShadow: '0 2px 8px rgba(0,0,0,0.025)', height: '100%' }}>
                <span style={{ fontSize: 22, display: 'block', marginBottom: 10 }}>{e}</span>
                <p style={{ fontSize: 13.5, fontWeight: 700, color: C.text, marginBottom: 6 }}>{t}</p>
                <p style={{ fontSize: 12.5, color: C.muted2, lineHeight: 1.65, margin: 0 }}>{d}</p>
              </motion.div>
            </FadeUp>
          ))}
        </div>
      </section>

      {/* ── ARCHITECTURE ──────────────────────────────────────────────────────── */}
      <section id="architecture" style={SD}>
        <STitle icon={I.Net} title="System Architecture" sub="Five-layer composable design" />
        <FadeUp>
          <Para>Capital flows uni-directionally: USDC deposits into <Mono>PerpsVault</Mono>, minting an internal balance scaled to 18 decimals.
            Opening a position through <Mono>PositionManager</Mono> atomically locks collateral.
            <Mono>PriceOracle</Mono> validates feed freshness on every operation; <Mono>PnLCalculator</Mono> checks position health.
            Below the liquidation threshold, <Mono>LiquidationEngine</Mono> is callable by any address in the world.</Para>
        </FadeUp>

        <FadeUp delay={0.05}>
          <div style={{ background: 'white', borderRadius: 18, border: `1px solid ${C.border}`,
            overflow: 'hidden', marginBottom: 28, boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
            <div style={{ padding: '12px 22px', background: 'rgba(249,250,251,0.8)', borderBottom: `1px solid ${C.border2}` }}>
              <p style={{ fontSize: 9.5, fontWeight: 800, color: C.amber, textTransform: 'uppercase',
                letterSpacing: '0.18em', margin: 0, fontFamily: "'IBM Plex Mono',monospace" }}>Core Design Invariants</p>
            </div>
            {[
              ['No off-chain trust',      'Price discovery, execution, liquidation, and settlement are all fully on-chain.'],
              ['18-decimal precision',    'DECIMALS_SCALAR = 10^(18−tokenDecimals) normalises USDC (6 dec) to 1e18 throughout.'],
              ['Vault solvency proven',   '128 fuzzing runs × 50 calls = 6,400 randomised state mutations, zero reverts.'],
              ['Isolated margin default', 'Cross-margin mode uses _calculateGlobalPnL, iterating all active positions atomically.'],
            ].map(([t, d], i, arr) => (
              <div key={t} style={{ display: 'flex', gap: 20, padding: '13px 22px',
                borderBottom: i < arr.length - 1 ? `1px solid ${C.border2}` : 'none',
                background: i % 2 === 0 ? 'white' : 'rgba(249,250,251,0.5)', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700,
                  color: C.amber, minWidth: 180, flexShrink: 0 }}>{t}</span>
                <span style={{ fontSize: 14, color: C.muted, lineHeight: 1.75, flex: 1 }}>{d}</span>
              </div>
            ))}
          </div>
        </FadeUp>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
          {[
            { l: 'Vault Layer',    col: '#D97706', items: ['PerpsVault.sol','ERC-20 Collateral','LP Share Tokens','Lock / Release API'] },
            { l: 'Trading Engine', col: '#7C3AED', items: ['PositionManager.sol','ISOLATED / CROSS','Market + Limit Orders','Cross-Chain flow'] },
            { l: 'Risk Engine',    col: '#DC2626', items: ['LiquidationEngine.sol','Batch Liquidate (20)','Keeper Rewards','Emergency Rescue'] },
            { l: 'Oracle & Math',  col: '#059669', items: ['PriceOracle.sol','PnLCalculator.sol','MockAggregatorV3','int256 safe math'] },
            { l: 'Cross-Chain',    col: '#2563EB', items: ['CrossChainRouter.sol','MessageReceiver.sol','Multi-chain positions','USDC bridging'] },
            { l: 'Price Keeper',   col: '#D97706', items: ['PriceKeeper.sol','Binance feed','Auto 2-min updates','On-chain storage'] },
          ].map(({ l, col, items }, i) => (
            <motion.div key={l}
              initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ delay: i * 0.04 }}
              whileHover={{ y: -3, boxShadow: `0 10px 28px ${col}1A` }}
              style={{ background: 'white', border: `1px solid ${col}22`, borderRadius: 15,
                padding: '18px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)', transition: 'all 0.2s' }}>
              <p style={{ fontSize: 9.5, fontWeight: 800, color: col, textTransform: 'uppercase',
                letterSpacing: '0.14em', marginBottom: 12, fontFamily: "'IBM Plex Mono',monospace" }}>{l}</p>
              {items.map((item, j) => (
                <p key={j} style={{ fontSize: 12, fontFamily: "'IBM Plex Mono',monospace",
                  color: j === 0 ? C.text : C.muted2, marginBottom: j < items.length - 1 ? 5 : 0,
                  fontWeight: j === 0 ? 600 : 400 }}>
                  {j === 0 ? item : `└─ ${item}`}
                </p>
              ))}
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── DEPLOYMENTS ───────────────────────────────────────────────────────── */}
      <section id="deployments" style={SD}>
        <STitle icon={I.Globe} title="Contract Addresses" sub="Polkadot Hub Testnet · Chain ID 420420417" />
        <FadeUp>
          <div style={{ background: 'white', borderRadius: 18, border: `1px solid ${C.border}`,
            overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.025)' }}>
            {DEPLOYS.map((d, i) => (
              <div key={d.addr} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: 'clamp(10px,2vw,14px) clamp(14px,3vw,22px)',
                borderBottom: i < DEPLOYS.length - 1 ? `1px solid ${C.border2}` : 'none',
                background: i % 2 === 0 ? 'white' : 'rgba(249,250,251,0.5)',
                gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: C.text, minWidth: 140 }}>{d.label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11.5, fontFamily: "'IBM Plex Mono',monospace", color: C.muted2 }}>
                    {d.addr.slice(0, 10)}…{d.addr.slice(-6)}
                  </span>
                  <motion.button onClick={() => cp(d.addr)} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                    style={{ background: copied === d.addr ? 'rgba(5,150,105,0.08)' : C.amberBg,
                      border: `1px solid ${copied === d.addr ? 'rgba(5,150,105,0.22)' : C.amberBd}`,
                      cursor: 'pointer', borderRadius: 7, color: copied === d.addr ? C.green : C.amber,
                      fontSize: 11, fontWeight: 700, fontFamily: "'IBM Plex Mono',monospace",
                      padding: '4px 11px', transition: 'all 0.2s', letterSpacing: '0.05em' }}>
                    {copied === d.addr ? '✓ COPIED' : 'COPY'}
                  </motion.button>
                </div>
              </div>
            ))}
          </div>
        </FadeUp>
        <AlertBox type="info" title="Block Explorer">
          View all transactions at <Mono>blockscout-passet-hub.parity-testnet.parity.io</Mono> — all contracts are verified on-chain.
        </AlertBox>
      </section>

      {/* ── PERPS VAULT ───────────────────────────────────────────────────────── */}
      <section id="perps-vault" style={SD}>
        <STitle icon={I.DB} title="PerpsVault" sub="The capital layer — all funds live here" />
        <FadeUp><Para><Mono>PerpsVault.sol</Mono> is the financial backbone of the entire Nexus protocol. Every dollar —
          whether it comes from an LP depositing yield-bearing liquidity or a trader posting margin — lives here.
          A single vault eliminates capital fragmentation and makes solvency auditable from one storage slot at any time.</Para></FadeUp>
        <FadeUp delay={0.05}><Para>Two separate internal accounting pools exist: the <strong style={{ color: C.text2 }}>LP pool</strong> for
          passive liquidity providers earning yield, and the <strong style={{ color: C.text2 }}>collateral pool</strong> for active traders.
          LP funds cannot be silently consumed to cover trader losses — every debit and credit is explicit.</Para></FadeUp>
        <FadeUp delay={0.1}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
            <Tag>Ownable</Tag><Tag>ReentrancyGuard</Tag><Tag>Pausable</Tag>
            <Tag v="amber">MINIMUM_LIQUIDITY = 1000</Tag>
            <Tag v="amber">DECIMALS_SCALAR = 1e12</Tag>
          </div>
        </FadeUp>
      </section>

      <section id="vault-lp" style={SD}>
        <SubSection n="01" title="LP Liquidity Engine">
          <FadeUp><Para>LPs call <Mono>addLiquidity(uint256 amount)</Mono> to deposit USDC and receive proportional shares.
            The formula is <Mono>shares = (amount × totalSupply) / totalAssets</Mono>.
            The very first deposit permanently burns <Mono>MINIMUM_LIQUIDITY (1,000)</Mono> shares to <Mono>address(0)</Mono> —
            this one-time action permanently prevents the classic share-price inflation attack vector.</Para></FadeUp>
          <CodeBlock title="PerpsVault.sol — LP share minting">{`function addLiquidity(uint256 amount) external nonReentrant whenNotPaused {
  uint256 normalised = amount * DECIMALS_SCALAR;
  uint256 supply     = totalLpShares;

  uint256 shares = supply == 0
    ? normalised - MINIMUM_LIQUIDITY   // genesis: burn 1000
    : (normalised * supply) / totalLiquidity;

  lpShares[msg.sender] += shares;
  totalLpShares        += shares;
  totalLiquidity       += normalised;
  // USDC transferred in via ERC-20 safeTransferFrom before this call
}`}</CodeBlock>
        </SubSection>
      </section>

      <section id="vault-collateral" style={SD}>
        <SubSection n="02" title="Trader Collateral">
          <FadeUp><Para>Traders call <Mono>deposit(uint256 amount)</Mono> to fund their internal vault balance.
            USDC (6 decimals) is immediately scaled to 18 decimals via <Mono>DECIMALS_SCALAR (1e12)</Mono>.
            All margin validation and leverage checks occur inside <Mono>PositionManager</Mono> before any capital ever moves.</Para></FadeUp>
          <FadeUp delay={0.05}><Para><Mono>lockCollateral</Mono> transitions funds from the free balance into locked state on position open.
            A normal close triggers <Mono>settleTrade</Mono>; a liquidation event triggers the same path via <Mono>LiquidationEngine</Mono>.
            The locked amount is always tracked separately to prevent double-accounting.</Para></FadeUp>
          <AlertBox type="security" title="Access Control — onlyPositionManager">
            <Mono>lockCollateral</Mono>, <Mono>unlockCollateral</Mono>, <Mono>settleTrade</Mono>,
            and <Mono>transferByManager</Mono> all enforce the <Mono>onlyPositionManager</Mono> modifier.
            No backdoor path exists for draining user collateral, even for the contract owner.
          </AlertBox>
        </SubSection>
      </section>

      <section id="vault-settlement" style={SD}>
        <SubSection n="03" title="Trade Settlement">
          <FadeUp><Para><Mono>settleTrade(address trader, uint256 amountLocked, int256 pnl)</Mono> is the atomic heart of every trade close.
            It applies realised PnL to the locked collateral and returns the net payout to the trader&apos;s free balance in a single transaction.
            The LP pool directly absorbs trader losses and pays out trader profits — creating a zero-sum system.</Para></FadeUp>
          <CodeBlock title="PerpsVault.sol — settleTrade core">{`function settleTrade(address user, uint256 amountLocked, int256 pnl)
  external onlyPositionManager nonReentrant whenNotPaused
{
  uint256 payout = amountLocked;

  if (pnl >= 0) {
    payout         += uint256(pnl);
    totalLiquidity -= uint256(pnl);   // LP absorbs trader profit
  } else {
    uint256 loss    = uint256(-pnl);
    if (loss > amountLocked) loss = amountLocked;
    payout         -= loss;
    totalLiquidity += loss;           // LP collects trader loss
  }

  lockedCollateral[user] -= amountLocked;
  traderCollateral[user] += payout;   // return net to free balance
}`}</CodeBlock>
          <AlertBox type="warning" title="Dust Withdrawal — Patched">
            Every withdrawal path enforces <Mono>scaledAmount % DECIMALS_SCALAR == 0</Mono>, reverting if not.
            This eliminates repeated fractional-wei drain exploits that arise from the 6→18 decimal conversion boundary.
          </AlertBox>
        </SubSection>
      </section>

      {/* ── POSITION MANAGER ──────────────────────────────────────────────────── */}
      <section id="position-manager" style={SD}>
        <STitle icon={I.Trend} title="PositionManager" sub="The trading engine — all position lifecycle logic" />
        <FadeUp><Para><Mono>PositionManager.sol</Mono> is the sole contract with write access to vault collateral.
          Every trader action — open, close, liquidate, limit order — routes through here.
          The Position struct stores: collateral, leverage, entryPrice, isLong, isOpen, isCrossChain, marginMode.</Para></FadeUp>
        <FadeUp delay={0.1}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
            <Tag>Ownable</Tag><Tag>ReentrancyGuard</Tag><Tag>Pausable</Tag>
            <Tag v="amber">liquidationThresholdBps = 8000</Tag>
            <Tag v="amber">liquidatorFeeBps = 1000</Tag>
            <Tag v="green">maxLeverage = 50×</Tag>
          </div>
        </FadeUp>
      </section>

      <section id="margin-modes" style={SD}>
        <SubSection n="01" title="Margin Modes: ISOLATED vs CROSS">
          <FadeUp>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 12, marginBottom: 22 }}>
              {[
                { l: 'ISOLATED', col: '#D97706', d: "Each position has its own ring-fenced collateral pool. Only that position's margin is at risk on liquidation — other positions are completely unaffected." },
                { l: 'CROSS',    col: '#2563EB', d: 'All free collateral counts as shared margin across every cross-margin position, enabling higher effective leverage but introducing cascade liquidation risk.' },
              ].map(({ l, col, d }) => (
                <motion.div key={l} whileHover={{ scale: 1.015 }}
                  style={{ background: 'white', border: `1px solid ${col}28`, borderRadius: 15,
                    padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                  <p style={{ fontSize: 10.5, fontWeight: 800, color: col, textTransform: 'uppercase',
                    letterSpacing: '0.16em', marginBottom: 10, fontFamily: "'IBM Plex Mono',monospace" }}>{l}</p>
                  <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.75, margin: 0 }}>{d}</p>
                </motion.div>
              ))}
            </div>
          </FadeUp>
        </SubSection>
      </section>

      <section id="market-orders" style={SD}>
        <SubSection n="02" title="Market Orders">
          <FadeUp><Para><Mono>openPosition(token, collateralDelta, leverage, isLong, mode)</Mono> opens a position at the current oracle price.
            It queries <Mono>PriceOracle</Mono>, validates leverage against the asset maximum, locks the specified collateral,
            and writes the Position struct — all atomically within a single <Mono>nonReentrant</Mono> call.</Para></FadeUp>
          <FadeUp delay={0.05}><Para><Mono>closePosition(token, price)</Mono> accepts an optional caller-supplied price or falls back to the oracle.
            It calculates realised PnL via <Mono>PnLCalculator</Mono>, then calls <Mono>settleTrade</Mono>.
            LP pool exposure changes by exactly the trade PnL — no rounding drift, no hidden fees.</Para></FadeUp>
          <CodeBlock title="PositionManager.sol — openPosition core">{`function openPosition(
  address _token,
  uint256 _collateralDelta,
  uint256 _leverage,
  bool    _isLong,
  IPerpsCore.MarginMode _mode
) external nonReentrant whenNotPaused {
  if (!whitelistedOracles[_token])
    revert PerpsErrors.InvalidAsset();
  if (positions[msg.sender][_token].isOpen)
    revert PerpsErrors.PositionAlreadyExists();

  uint256 currentPrice = _getOraclePrice(_token);
  if (currentPrice == 0) revert PerpsErrors.InvalidPrice();

  VAULT.lockCollateral(msg.sender, _collateralDelta);
  _storePosition(
    msg.sender, _token, _collateralDelta,
    _leverage, _isLong, currentPrice, false, _mode
  );
}`}</CodeBlock>
        </SubSection>
      </section>

      <section id="limit-orders" style={SD}>
        <SubSection n="03" title="Limit Orders">
          <FadeUp><Para><Mono>placeLimitOrder(token, collateral, leverage, targetPrice, isLong, mode)</Mono> immediately locks
            the full collateral on-chain at the time of placement. This design choice prevents griefing attacks where traders
            could flood the order book with unfunded orders, degrading protocol throughput.</Para></FadeUp>
          <FadeUp delay={0.05}><Para>Any address can call <Mono>executeLimitOrder(trader, token, orderId)</Mono> once the oracle
            price crosses the <Mono>targetPrice</Mono>. The executing keeper earns <strong style={{ color: C.text2 }}>0.1% of the position collateral</strong> as an incentive fee.
            Traders call <Mono>cancelLimitOrder</Mono> at any time to reclaim their full collateral.</Para></FadeUp>
        </SubSection>
      </section>

      <section id="ccip-trades" style={SD}>
        <SubSection n="04" title="Cross-Chain Trade Execution">
          <FadeUp><Para><Mono>executeCrossChainTrade(trader, token, isLong, margin, leverage)</Mono> opens a position identically
            to <Mono>openPosition</Mono> but is restricted to calls from the registered <Mono>crossChainReceiver</Mono> address.
            This separation keeps the cross-chain entry path auditable and isolated from direct trader access.</Para></FadeUp>
          <FadeUp delay={0.05}><Para>If the position-open logic reverts after the bridged collateral has already arrived on Polkadot Hub,
            <Mono>MessageReceiver</Mono> automatically credits the full collateral to the trader&apos;s free vault balance.
            Bridged funds are never silently lost under any failure mode.</Para></FadeUp>
        </SubSection>
      </section>

      {/* ── LIQUIDATION ENGINE ────────────────────────────────────────────────── */}
      <section id="liquidation-engine" style={SD}>
        <STitle icon={I.Shield} title="LiquidationEngine" sub="The risk engine — open, permissionless, keeper model" />
        <FadeUp><Para><Mono>LiquidationEngine.sol</Mono> replaces the traditional privileged-admin liquidation pattern with a fully open-keeper model.
          Any Ethereum address can call <Mono>batchLiquidate</Mono> and earn a <strong style={{ color: C.text2 }}>10% fee on every successful liquidation</strong>.
          A competitive keeper market ensures rapid response to price dislocations with no single point of failure.</Para></FadeUp>
      </section>

      <section id="batch-liquidation" style={SD}>
        <SubSection n="01" title="Batch Processing Architecture">
          <FadeUp><Para><Mono>batchLiquidate(address[] traders, address[] tokens)</Mono> accepts up to <Mono>maxBatchSize (20)</Mono> pairs per call.
            Each individual liquidation attempt is wrapped in a <Mono>try/catch</Mono> block — one revert never cancels the entire batch,
            making the system resilient to partial failures during market stress periods.</Para></FadeUp>
          <CodeBlock title="LiquidationEngine.sol — batch with per-item isolation">{`for (uint i = 0; i < _traders.length; i++) {
  IPerpsCore.Position memory pos =
    POSITION_MANAGER.getPosition(_traders[i], _tokens[i]);

  if (!pos.isOpen) {
    emit LiquidationFailed(_traders[i], _tokens[i], "not open");
    continue;
  }

  try POSITION_MANAGER.liquidate(_traders[i], _tokens[i]) {
    successfulLiquidations++;
  } catch Error(string memory reason) {
    emit LiquidationFailed(_traders[i], _tokens[i], reason);
  }
}

if (successfulLiquidations > 0) _transferRewardsToKeeper();`}</CodeBlock>
        </SubSection>
      </section>

      <section id="keeper-system" style={SD}>
        <SubSection n="02" title="Keeper Reward System">
          <FadeUp><Para>The fee flow is: locked collateral → <Mono>settleTrade</Mono> → <Mono>LiquidationEngine</Mono> → keeper wallet.
            The <Mono>liquidatorFeeBps (10%)</Mono> is forwarded in bulk at the end of each successful batch via <Mono>_transferRewardsToKeeper()</Mono>.
            Rewards accumulate in the vault and are withdrawn atomically — no intermediate custodian.</Para></FadeUp>
          <AlertBox type="security" title="PROTOCOL_ASSET Rescue Guard">
            <Mono>rescueTokens(address token, uint256 amount)</Mono> reverts unconditionally when
            <Mono>token == PROTOCOL_ASSET</Mono>. Even a fully compromised owner private key cannot drain keeper reward balances through this path.
          </AlertBox>
        </SubSection>
      </section>

      {/* ── PRICE ORACLE ──────────────────────────────────────────────────────── */}
      <section id="price-oracle" style={SD}>
        <STitle icon={I.Pulse} title="PriceOracle + PriceKeeper" sub="Mock Chainlink feeds auto-updated via Binance" />
        <FadeUp><Para><Mono>PriceOracle.sol</Mono> wraps a <Mono>MockAggregatorV3Interface</Mono> to serve 18-decimal normalised prices
          for all whitelisted assets. On Polkadot Hub, real Chainlink feeds are unavailable — so <Mono>PriceKeeper</Mono>
          polls Binance every 2 minutes from the frontend and pushes updates directly to the mock aggregators on-chain.</Para></FadeUp>
        <CodeBlock title="PriceOracle.sol — getPrice with staleness guard">{`function getPrice(address _token)
  external view override returns (uint256)
{
  AggregatorV3Interface feed = feeds[_token];
  if (address(feed) == address(0))
    revert PerpsErrors.InvalidAsset();

  (, int256 rawPrice,, uint256 updatedAt,) = feed.latestRoundData();

  if (rawPrice <= 0)
    revert PerpsErrors.InvalidPrice();
  if (block.timestamp - updatedAt > heartbeats[_token])
    revert PerpsErrors.StalePrice();          // default: 2-hour window

  uint8 feedDecimals = feed.decimals();
  // Feeds return 8 dec → multiply to reach TARGET_DECIMALS (18)
  return uint256(rawPrice) * (10 ** (TARGET_DECIMALS - feedDecimals));
}`}</CodeBlock>
      </section>

      {/* ── PNL CALCULATOR ────────────────────────────────────────────────────── */}
      <section id="pnl-calculator" style={SD}>
        <STitle icon={I.Calc} title="PnLCalculator" sub="Pure math library — no storage, no ownership" />
        <FadeUp><Para>A stateless pure library. Centralising all PnL arithmetic here ensures that <Mono>PositionManager</Mono>
          and <Mono>LiquidationEngine</Mono> never duplicate formulas or diverge on rounding behaviour across different code paths.
          All inputs are validated before any multiplication to avoid precision overflow.</Para></FadeUp>
        <AlertBox type="warning" title="int256 Overflow Safety">
          Both <Mono>currentPrice</Mono> and <Mono>position.collateral × leverage</Mono> are range-checked before multiplication.
          An unchecked overflow here would produce an enormous false profit or loss figure, silently bypassing all health checks
          and allowing insolvency exploitation.
        </AlertBox>
      </section>

      {/* ── PERPS ERRORS ──────────────────────────────────────────────────────── */}
      <section id="perps-errors" style={SD}>
        <STitle icon={I.Warn} title="PerpsErrors" sub="Centralised custom error registry" />
        <FadeUp>
          <div style={{ background: 'white', borderRadius: 18, border: `1px solid ${C.border}`,
            overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.025)' }}>
            {([
              ['InvalidAsset',           'Token is not whitelisted in PositionManager oracle registry'],
              ['ZeroAmount',             'Deposit, withdrawal, or order amount is zero'],
              ['InsufficientCollateral', 'Available margin is below the minimum required to open the position'],
              ['InvalidLeverage',        'Requested leverage exceeds the asset maximum (50×)'],
              ['PositionAlreadyExists',  'The caller already has an open position for this token'],
              ['NoPositionFound',        'The referenced positionId does not exist in storage'],
              ['PositionHealthy',        'Position health ratio is above the liquidation threshold (80%)'],
              ['StalePrice',             'Oracle price feed has not been updated within the heartbeat window'],
              ['InvalidPrice',           'Oracle returned a zero, negative, or otherwise malformed price'],
              ['Unauthorized',           'Caller is not the registered PositionManager address'],
            ] as [string, string][]).map(([err, desc], i, arr) => (
              <div key={err} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: 'clamp(10px,2vw,13px) clamp(14px,3vw,22px)',
                borderBottom: i < arr.length - 1 ? `1px solid ${C.border2}` : 'none',
                background: i % 2 === 0 ? 'white' : 'rgba(249,250,251,0.5)',
                gap: 16, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12.5, fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700,
                  color: C.amber, flexShrink: 0 }}>{err}</span>
                <span style={{ fontSize: 13, color: C.muted }}>{desc}</span>
              </div>
            ))}
          </div>
        </FadeUp>
      </section>

      {/* ── CROSS-CHAIN ───────────────────────────────────────────────────────── */}
      <section id="cross-chain-router" style={SD}>
        <STitle icon={I.Repeat} title="CrossChainRouter" sub="Source chain — initiates cross-chain trade flow" />
        <FadeUp><Para><Mono>CrossChainRouter.sol</Mono> lives on the source chain. The user approves USDC and calls
          <Mono>openCrossChainPosition</Mono>. The router validates the target chain is approved, encodes trade parameters
          and collateral into a cross-chain message, then forwards it to <Mono>MessageReceiver</Mono> on the destination chain.</Para></FadeUp>
        <FadeUp delay={0.05}><Para>On Polkadot Hub testnet, both router and receiver are deployed at known addresses.
          The router enforces a per-chain allowlist before sending any funds, preventing accidental or malicious
          routing to unapproved destination chains.</Para></FadeUp>
      </section>

      <section id="message-receiver" style={SD}>
        <STitle icon={I.Repeat} title="MessageReceiver" sub="Destination — executes trades on Polkadot Hub" />
        <FadeUp><Para>On <Mono>receiveMessage</Mono>: the contract decodes the payload, deposits USDC into <Mono>PerpsVault</Mono>,
          then calls <Mono>PositionManager.executeCrossChainTrade</Mono>. It maintains a strict sender allowlist
          keyed by <Mono>(sourceChainId, senderAddress)</Mono> to prevent spoofed messages.</Para></FadeUp>
        <AlertBox type="security" title="Sender Allowlist is Critical">
          Always verify the message sender matches an approved <Mono>CrossChainRouter</Mono> before trusting decoded trade parameters.
          Skipping this check would allow any source-chain address to execute arbitrary trades on behalf of any user.
        </AlertBox>
      </section>

      {/* ── TEST SUITE ────────────────────────────────────────────────────────── */}
      <section id="test-suite" style={SD}>
        <STitle icon={I.Check} title="Test Suite & Coverage" sub="95 tests · 0 failures · 14 test suites" badge="Foundry" />
        <FadeUp>
          <div style={{ background: 'white', borderRadius: 18, border: `1px solid ${C.border}`,
            overflow: 'hidden', marginBottom: 24, boxShadow: '0 4px 20px rgba(0,0,0,0.025)' }}>
            {/* header row */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr',
              padding: 'clamp(8px,2vw,11px) clamp(14px,3vw,22px)',
              background: 'rgba(249,250,251,0.9)', fontSize: 10, fontFamily: "'IBM Plex Mono',monospace",
              fontWeight: 800, color: C.muted2, textTransform: 'uppercase', letterSpacing: '0.1em',
              gap: 10, borderBottom: `1px solid ${C.border}` }}>
              <span>Contract</span><span>Selector</span>
              <span style={{ textAlign: 'right' }}>Calls</span>
              <span style={{ textAlign: 'right' }}>Reverts</span>
              <span style={{ textAlign: 'right' }}>Discards</span>
            </div>
            {[
              ['PositionHandler','changeOraclePrice','1,541','0','0'],
              ['PositionHandler','createTrader','1,603','0','1'],
              ['PositionHandler','openRandomPosition','1,659','0','0'],
              ['PositionHandler','tryLiquidation','1,598','0','0'],
            ].map(([con, sel, calls, rev, dis], i) => (
              <div key={sel} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr',
                padding: 'clamp(8px,2vw,11px) clamp(14px,3vw,22px)',
                background: i % 2 === 0 ? 'white' : 'rgba(249,250,251,0.5)',
                borderBottom: i < 3 ? `1px solid ${C.border2}` : 'none', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontFamily: "'IBM Plex Mono',monospace", color: C.text, fontWeight: 600 }}>{con}</span>
                <span style={{ fontSize: 12, fontFamily: "'IBM Plex Mono',monospace", color: C.amber, fontWeight: 600 }}>{sel}</span>
                <span style={{ fontSize: 12, fontFamily: "'IBM Plex Mono',monospace", color: C.muted2, textAlign: 'right' }}>{calls}</span>
                <span style={{ fontSize: 12, fontFamily: "'IBM Plex Mono',monospace", color: C.green, textAlign: 'right', fontWeight: 700 }}>{rev}</span>
                <span style={{ fontSize: 12, fontFamily: "'IBM Plex Mono',monospace", color: C.muted2, textAlign: 'right' }}>{dis}</span>
              </div>
            ))}
          </div>
        </FadeUp>
        <CodeBlock title="Terminal" lang="SHELL">{`forge test          # run all 95 tests (~3 seconds)
forge coverage      # generate detailed coverage report
forge test -vvv     # verbose output with full call traces
forge test --match-contract PositionManager  # filter by contract`}</CodeBlock>
      </section>

      {/* ── SECURITY ──────────────────────────────────────────────────────────── */}
      <section id="security" style={SD}>
        <STitle icon={I.Shield} title="Security Model" sub="Defense-in-depth across every attack surface" />
        <FadeUp>
          <div style={{ background: 'white', borderRadius: 18, border: `1px solid ${C.border}`,
            overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.025)' }}>
            {[
              ['Oracle manipulation',      'Mock feeds auto-updated every 2 min by frontend. Staleness heartbeat reverts stale reads.'],
              ['Reentrancy attacks',        'ReentrancyGuard on settleTrade, transferByManager, batchLiquidate, deposit, and withdraw.'],
              ['LP inflation attack',       'MINIMUM_LIQUIDITY = 1000 permanently burned to address(0) on the genesis LP deposit.'],
              ['Dust sweep / precision drain', 'scaledAmount % DECIMALS_SCALAR != 0 reverts on every single withdrawal call path.'],
              ['Unauthorised liquidation',  'onlyPositionManager modifier blocks all direct vault mutations from any other caller.'],
              ['Margin over-withdrawal',    'lockedCollateral accounting prevents withdrawing margin from currently open positions.'],
              ['Keeper reward rug pull',    'rescueTokens() unconditionally reverts for PROTOCOL_ASSET address, even for the owner.'],
              ['Wrong decimal prices',      'All prices normalised to 18-dec before storage. Feed decimals validated on whitelisting.'],
            ].map(([att, mit], i, arr) => (
              <div key={att} style={{ display: 'flex', gap: 18, padding: 'clamp(10px,2vw,14px) clamp(14px,3vw,22px)',
                background: i % 2 === 0 ? 'white' : 'rgba(249,250,251,0.5)',
                borderBottom: i < arr.length - 1 ? `1px solid ${C.border2}` : 'none', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text, minWidth: 200, flexShrink: 0 }}>{att}</span>
                <span style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.75, flex: 1 }}>{mit}</span>
              </div>
            ))}
          </div>
        </FadeUp>
        <AlertBox type="warning" title="No External Audit">
          No formal third-party security audit has been conducted. This project is deployed on Polkadot Hub testnet
          with testnet assets only. Do not use with real funds under any circumstances.
        </AlertBox>
      </section>

      {/* ── LOCAL SETUP ───────────────────────────────────────────────────────── */}
      <section id="local-setup" style={SD}>
        <STitle icon={I.Pulse} title="Local Setup" sub="Foundry smart contracts + Next.js 16 frontend" />
        <SubSection title="Clone & Test">
          <CodeBlock title="Terminal" lang="SHELL">{`git clone https://github.com/NexTechArchitect/nexus-protocol-v2.git
cd nexus-protocol-v2

# Install Foundry dependencies
forge install

# Run full test suite (95 tests, ~3s)
forge test -vv

# Deploy to Polkadot Hub Testnet
cp .env.example .env
# Fill in: PRIVATE_KEY, POLKADOT_HUB_RPC

forge script script/deploy/01_DeployMocks.s.sol  --rpc-url polkadot-testnet --broadcast --legacy
forge script script/deploy/02_DeployOracle.s.sol --rpc-url polkadot-testnet --broadcast --legacy
forge script script/deploy/03_DeployVault.s.sol  --rpc-url polkadot-testnet --broadcast --legacy
forge script script/deploy/04_DeployCore.s.sol   --rpc-url polkadot-testnet --broadcast --legacy
forge script script/deploy/05_DeployCCIP.s.sol   --rpc-url polkadot-testnet --broadcast --legacy`}</CodeBlock>
        </SubSection>
        <SubSection title="Frontend (Next.js 16)">
          <CodeBlock title="Terminal" lang="SHELL">{`cd web3-app
npm install --legacy-peer-deps
npm run dev   # → http://localhost:3000

# Oracle prices update automatically every 2 minutes
# via the connected wallet — no separate script needed`}</CodeBlock>
        </SubSection>
        <SubSection title="Network Config">
          <CodeBlock title="foundry.toml" lang="TOML">{`[rpc_endpoints]
polkadot-testnet = "https://services.polkadothub-rpc.com/testnet"

[etherscan]
polkadot-testnet = {
  key = "no-key",
  url = "https://blockscout-passet-hub.parity-testnet.parity.io/api"
}`}</CodeBlock>
        </SubSection>
      </section>

      {/* ── FRONTEND STACK ────────────────────────────────────────────────────── */}
      <section id="frontend-stack" style={SD}>
        <STitle icon={I.Globe} title="Frontend Stack" sub="Next.js 16 App Router · zero backend reads" />
        <FadeUp>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 10 }}>
            {[
              { l: 'Framework',    v: 'Next.js 16 · App Router · Turbopack' },
              { l: 'Blockchain',   v: 'Wagmi v2 · Viem · ethers.js' },
              { l: 'Wallet UI',    v: 'RainbowKit · MetaMask · OKX · Bitget' },
              { l: 'Charts',       v: 'TradingView iframe · WebSocket feeds' },
              { l: 'Animations',   v: 'Framer Motion · CSS keyframes' },
              { l: 'Network',      v: 'Polkadot Hub Testnet (420420417)' },
            ].map(({ l, v }) => (
              <motion.div key={l} whileHover={{ scale: 1.02, y: -2 }}
                style={{ background: 'white', borderRadius: 14, border: `1px solid ${C.border}`,
                  padding: '17px 18px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)', transition: 'all 0.2s' }}>
                <p style={{ fontSize: 9.5, fontWeight: 800, color: C.amber, textTransform: 'uppercase',
                  letterSpacing: '0.16em', marginBottom: 7, fontFamily: "'IBM Plex Mono',monospace" }}>{l}</p>
                <p style={{ fontSize: 14, color: C.text, margin: 0, fontWeight: 600 }}>{v}</p>
              </motion.div>
            ))}
          </div>
        </FadeUp>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────────────── */}
      <footer style={{ paddingTop: 80, textAlign: 'center' }}>
        <FadeUp>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ width: 40, height: 40, background: 'linear-gradient(135deg,#C9860A,#F59E0B)',
              borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(201,134,10,0.3)' }}>
              <span style={{ color: '#fff', fontWeight: 900, fontSize: 19,
                fontFamily: "'Fraunces',Georgia,serif", fontStyle: 'italic' }}>N</span>
            </div>
            <span style={{ fontSize: 18, fontWeight: 600, color: C.text, letterSpacing: '-0.025em',
              fontFamily: "'Fraunces',Georgia,serif" }}>NEXUS PROTOCOL</span>
            <Tag v="amber" dot={C.green}>Polkadot Hub</Tag>
          </div>

          <p style={{ fontSize: 15, color: C.muted2, maxWidth: 420, margin: '0 auto 44px', lineHeight: 1.8 }}>
            Deterministic perpetuals. Auto price feeds. Open-keeper liquidations.<br />
            Built for the Polkadot Solidity Hackathon 2026.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28,
            borderTop: `1px solid ${C.border}`, paddingTop: 28, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontFamily: "'IBM Plex Mono',monospace", color: C.muted2 }}>© 2026 Nexus Protocol · MIT License</span>
            <a href="https://github.com/NexTechArchitect/nexus-protocol-v2" target="_blank" rel="noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600,
                color: C.muted, textDecoration: 'none', transition: 'color 0.2s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = C.text; }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = C.muted; }}>
              GitHub <I.Ext />
            </a>
            <a href="https://dorahacks.io" target="_blank" rel="noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600,
                color: C.muted, textDecoration: 'none', transition: 'color 0.2s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = C.amber; }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = C.muted; }}>
              DoraHacks <I.Ext />
            </a>
          </div>
        </FadeUp>
      </footer>
    </div>
  );
};

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function NexusDocs() {
  const contentRef  = useRef<HTMLDivElement>(null);
  const [active,     setActive]     = useState('overview');
  const [progress,   setProgress]   = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search,     setSearch]     = useState('');

  useEffect(() => { document.title = 'Nexus Protocol — Technical Docs'; }, []);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const fn = () => setProgress((el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight)) * 100);
    el.addEventListener('scroll', fn, { passive: true });
    return () => el.removeEventListener('scroll', fn);
  }, []);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      es => es.forEach(e => { if (e.isIntersecting) setActive(e.target.id); }),
      { root: el, threshold: 0.18 },
    );
    el.querySelectorAll('section[id]').forEach(s => obs.observe(s));
    return () => obs.disconnect();
  }, []);

  const scrollTo = useCallback((id: string) => {
    const container = contentRef.current;
    if (!container) return;
    const target = container.querySelector(`#${id}`) as HTMLElement | null;
    if (!target) return;
    container.scrollTo({
      top: target.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 28,
      behavior: 'smooth',
    });
    setMobileOpen(false);
  }, []);

  const filteredNav: NavSection[] = NAV.map(sec => ({
    ...sec,
    items: sec.items.filter(item =>
      search === '' ||
      item.title.toLowerCase().includes(search.toLowerCase()) ||
      sec.label.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter(sec => sec.items.length > 0);

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#FAFAF8',
      overflow: 'hidden', fontFamily: "'DM Sans',-apple-system,sans-serif", position: 'relative' }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,400;1,9..144,600&family=IBM+Plex+Mono:wght@400;500;600;700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(180,83,9,0.2); border-radius: 99px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(180,83,9,0.42); }

        /* Aurora animations */
        @keyframes blob1 { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(80px,-55px) scale(1.1)} 66%{transform:translate(-45px,75px) scale(0.95)} }
        @keyframes blob2 { 0%,100%{transform:translate(0,0) scale(1)} 40%{transform:translate(-65px,85px) scale(1.06)} 70%{transform:translate(55px,-65px) scale(1.08)} }
        @keyframes blob3 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-45px,-42px) scale(1.08)} }
        @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:0.4} }

        /* Layout helpers */
        .sdbar { display:flex; flex-direction:column; }
        .main  { margin-left:290px; }
        .mbar  { display:none; }
        .mspc  { height:0; }

        /* Mobile overrides */
        @media (max-width: 900px) {
          .sdbar { display:none !important; }
          .main  { margin-left:0 !important; }
          .mbar  { display:flex !important; }
          .mspc  { height:58px !important; }
        }

        /* Ensure touch targets on mobile */
        @media (max-width: 600px) {
          button, a { min-height: 40px; }
        }
      `}</style>

      {/* ── Soft White Aurora Background ─────────────────────────────────────── */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        {/* Primary gold aurora — top left */}
        <div style={{ position: 'absolute', width: '60vw', height: '60vw', borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(251,191,36,0.13) 0%, rgba(217,119,6,0.07) 40%, transparent 70%)',
          top: '-20%', left: '-15%', filter: 'blur(60px)',
          animation: 'blob1 26s ease-in-out infinite' }} />
        {/* Warm cream — right side */}
        <div style={{ position: 'absolute', width: '50vw', height: '50vw', borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(253,230,138,0.1) 0%, rgba(251,191,36,0.05) 50%, transparent 70%)',
          top: '10%', right: '-12%', filter: 'blur(70px)',
          animation: 'blob2 32s ease-in-out infinite' }} />
        {/* Soft green tint — bottom */}
        <div style={{ position: 'absolute', width: '42vw', height: '42vw', borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(16,185,129,0.06) 0%, transparent 65%)',
          bottom: '-15%', left: '22%', filter: 'blur(80px)',
          animation: 'blob3 22s ease-in-out infinite' }} />
        {/* Warm white vignette top */}
        <div style={{ position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse 130% 80% at 50% 0%, rgba(255,251,235,0.3) 0%, transparent 55%)' }} />
        {/* Ultra-subtle grain */}
        <div style={{ position: 'absolute', inset: 0, opacity: 0.25,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E")`,
          backgroundSize: '200px' }} />
      </div>

      {/* ── Read Progress Rail ────────────────────────────────────────────────── */}
      <div style={{ position: 'fixed', top: 0, right: 0, width: 3, height: '100vh',
        background: 'rgba(180,83,9,0.07)', zIndex: 200 }}>
        <div style={{ width: '100%', height: `${progress}%`,
          background: 'linear-gradient(to bottom,#C9860A,#F59E0B,#FCD34D)',
          boxShadow: '0 0 10px rgba(201,134,10,0.4)', transition: 'height 0.1s linear' }} />
      </div>

      {/* ── Mobile Top Bar ────────────────────────────────────────────────────── */}
      <div className="mbar" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 110,
        alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', height: 58,
        background: 'rgba(250,250,248,0.95)', backdropFilter: 'blur(24px)',
        borderBottom: `1px solid ${C.border}`,
        boxShadow: '0 2px 16px rgba(0,0,0,0.04)' }}>
        {/* Back button */}
        <a href="/trade" style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600,
          color: C.muted, textDecoration: 'none', padding: '8px 13px', minHeight: 40,
          borderRadius: 9, background: 'white', border: `1px solid ${C.border}` }}>
          <I.Back /> App
        </a>
        {/* Brand center */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9,
            background: 'linear-gradient(135deg,#C9860A,#F59E0B)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 10px rgba(201,134,10,0.3)' }}>
            <span style={{ color: '#fff', fontWeight: 900, fontSize: 15,
              fontFamily: "'Fraunces',Georgia,serif", fontStyle: 'italic' }}>N</span>
          </div>
          <span style={{ fontWeight: 600, fontSize: 15.5, color: C.text, letterSpacing: '-0.01em',
            fontFamily: "'Fraunces',Georgia,serif" }}>Nexus Docs</span>
        </div>
        {/* Hamburger */}
        <button onClick={() => setMobileOpen(v => !v)}
          style={{ background: 'white', border: `1px solid ${C.border}`,
            borderRadius: 9, width: 40, height: 40, cursor: 'pointer', color: C.text2,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          {mobileOpen ? <I.X /> : <I.Menu />}
        </button>
      </div>

      {/* ── Mobile Drawer ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div key="overlay"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              onClick={() => setMobileOpen(false)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.3)',
                zIndex: 120, backdropFilter: 'blur(8px)' }} />
            <motion.div key="drawer"
              initial={{ x: -295 }} animate={{ x: 0 }} exit={{ x: -295 }}
              transition={{ type: 'spring', stiffness: 360, damping: 36 }}
              style={{ position: 'fixed', top: 0, left: 0, height: '100%', width: 290,
                zIndex: 130, paddingTop: 58,
                boxShadow: '8px 0 48px rgba(180,83,9,0.1)' }}>
              <Sidebar active={active} search={search} setSearch={setSearch}
                scrollTo={scrollTo} filteredNav={filteredNav} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Desktop Sidebar ───────────────────────────────────────────────────── */}
      <aside className="sdbar"
        style={{ position: 'fixed', top: 0, left: 0, height: '100vh', width: 290, zIndex: 30 }}>
        <Sidebar active={active} search={search} setSearch={setSearch}
          scrollTo={scrollTo} filteredNav={filteredNav} />
      </aside>

      {/* ── Main Content ──────────────────────────────────────────────────────── */}
      <main ref={contentRef} className="main"
        style={{ flex: 1, height: '100vh', overflowY: 'auto', position: 'relative', zIndex: 10 }}>
        <div className="mspc" />
        <Content />
      </main>
    </div>
  );
}

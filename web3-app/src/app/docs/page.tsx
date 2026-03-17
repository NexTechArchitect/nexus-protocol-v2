'use client';

import { useEffect, useRef, useState, useCallback, ReactNode, FC } from 'react';
import { motion, AnimatePresence, useInView, useScroll, useTransform } from 'framer-motion';

// ─── Types ────────────────────────────────────────────────────────────────────
type AlertType  = 'warning' | 'security' | 'info';
type TagVariant = 'default' | 'amber' | 'green' | 'red' | 'blue';
interface NavItem    { id: string; title: string; }
interface NavSection { label: string; items: NavItem[]; }
interface Deploy     { label: string; addr: string; }
type IconFn = FC;

// ─── Tiny Icon Engine ─────────────────────────────────────────────────────────
const Ico: FC<{ d: string | string[]; s?: number; w?: number }> = ({ d, s = 18, w = 1.65 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p}/>) : <path d={d}/>}
  </svg>
);
const I = {
  DB:    () => <Ico d={['M12 2C6.48 2 2 4.24 2 7s4.48 5 10 5 10-2.24 10-5-4.48-5-10-5z','M2 7v5c0 2.76 4.48 5 10 5s10-2.24 10-5V7','M2 12v5c0 2.76 4.48 5 10 5s10-2.24 10-5v-5']}/>,
  Shield:() => <Ico d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>,
  Trend: () => <Ico d="M22 7l-8.5 8.5-5-5L2 17"/>,
  Repeat:() => <Ico d={['M17 1l4 4-4 4','M3 11V9a4 4 0 014-4h14','M7 23l-4-4 4-4','M21 13v2a4 4 0 01-4 4H3']}/>,
  Calc:  () => <Ico d={['M4 2h16a2 2 0 012 2v16a2 2 0 01-2 2H4a2 2 0 01-2-2V4a2 2 0 012-2z','M8 6h8M8 10h2M12 10h2M8 14h2M12 14h2M16 14h2M8 18h2M12 18h2M16 18h2']}/>,
  Net:   () => <Ico d={['M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2v-4M9 21H5a2 2 0 01-2-2v-4m0 0h18']}/>,
  Globe: () => <Ico d={['M12 22a10 10 0 100-20 10 10 0 000 20z','M2 12h20','M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20']}/>,
  Pulse: () => <Ico d="M22 12h-4l-3 9L9 3l-3 9H2"/>,
  Search:() => <Ico d={['M21 21l-4.35-4.35','M17 11A6 6 0 105 11a6 6 0 0012 0z']} s={16}/>,
  Check: () => <Ico d="M20 6L9 17l-5-5" s={14}/>,
  Warn:  () => <Ico d={['M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z','M12 9v4','M12 17h.01']}/>,
  Copy:  () => <Ico d={['M8 17.929H6c-1.105 0-2-.912-2-2.036V5.036C4 3.91 4.895 3 6 3h8c1.105 0 2 .911 2 2.036v1.866m-6 .17h8c1.105 0 2 .91 2 2.035v10.857C20 21.09 19.105 22 18 22h-8c-1.105 0-2-.911-2-2.036V9.107c0-1.124.895-2.036 2-2.036z']} s={13}/>,
  Back:  () => <Ico d="M19 12H5M12 5l-7 7 7 7" s={15}/>,
  Ext:   () => <Ico d={['M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6','M15 3h6v6','M10 14L21 3']} s={12}/>,
  Menu:  () => <Ico d={['M3 12h18','M3 6h18','M3 18h18']} s={20}/>,
  X:     () => <Ico d={['M18 6L6 18','M6 6l12 12']} s={20}/>,
  Chev:  () => <Ico d="M9 18l6-6-6-6" s={13}/>,
};

// ─── Tokens ───────────────────────────────────────────────────────────────────
const A = '#B45309'; // amber text
const AB = 'rgba(180,83,9,0.09)'; // amber bg
const ABO = 'rgba(180,83,9,0.18)'; // amber border

// ─── Nav Data ─────────────────────────────────────────────────────────────────
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
const FadeUp: FC<{ children: ReactNode; delay?: number; once?: boolean }> = ({ children, delay = 0, once = true }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once, margin: '-24px' });
  return (
    <motion.div ref={ref}
      initial={{ opacity: 0, y: 16 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay }}>
      {children}
    </motion.div>
  );
};

const Tag: FC<{ children: ReactNode; v?: TagVariant; dot?: string }> = ({ children, v = 'default', dot }) => {
  const map: Record<TagVariant, { bg: string; color: string; border: string }> = {
    default: { bg: 'rgba(15,23,42,0.06)', color: '#475569', border: 'rgba(15,23,42,0.1)' },
    amber:   { bg: AB,                    color: A,          border: ABO },
    green:   { bg: 'rgba(5,150,105,0.08)', color: '#065F46', border: 'rgba(5,150,105,0.2)' },
    red:     { bg: 'rgba(220,38,38,0.07)', color: '#991B1B', border: 'rgba(220,38,38,0.18)' },
    blue:    { bg: 'rgba(37,99,235,0.07)', color: '#1E40AF', border: 'rgba(37,99,235,0.18)' },
  };
  const s = map[v];
  return (
    <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 6, fontSize: 10.5, fontWeight: 700,
      letterSpacing: '0.07em', textTransform: 'uppercase',
      fontFamily: "'JetBrains Mono','Fira Code',monospace", whiteSpace: 'nowrap' }}>
      {dot && <span style={{ width: 5, height: 5, borderRadius: '50%', background: dot, flexShrink: 0, boxShadow: `0 0 5px ${dot}` }} />}
      {children}
    </span>
  );
};

const C: FC<{ children: string }> = ({ children }) => (
  <code style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 12.5,
    background: AB, padding: '2px 7px', borderRadius: 5,
    color: A, border: `1px solid ${ABO}`, fontWeight: 500 }}>
    {children}
  </code>
);

const Para: FC<{ children: ReactNode }> = ({ children }) => (
  <p style={{ color: '#64748B', fontSize: 15, lineHeight: 1.9, marginBottom: 14 }}>{children}</p>
);

const CodeBlock: FC<{ title: string; children: string; lang?: string }> = ({ title, children, lang = 'SOLIDITY' }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(children); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <FadeUp>
      <div style={{ borderRadius: 16, overflow: 'hidden', margin: '20px 0',
        boxShadow: '0 2px 4px rgba(0,0,0,0.04), 0 16px 40px rgba(0,0,0,0.1)',
        border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '11px 18px', background: '#1A1F2E',
          borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {['#FF5F56','#FFBD2E','#27C93F'].map(c => (
                <div key={c} style={{ width: 11, height: 11, borderRadius: '50%', background: c, opacity: 0.9 }} />
              ))}
            </div>
            <span style={{ fontSize: 12, color: 'rgba(148,163,184,0.65)', fontFamily: "'JetBrains Mono',monospace" }}>{title}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 10, color: '#F59E0B', fontFamily: "'JetBrains Mono',monospace", opacity: 0.7, letterSpacing: '0.1em' }}>{lang}</span>
            <button onClick={copy} style={{ background: copied ? 'rgba(5,150,105,0.18)' : 'rgba(255,255,255,0.08)',
              border: `1px solid ${copied ? 'rgba(5,150,105,0.35)' : 'rgba(255,255,255,0.12)'}`,
              cursor: 'pointer', borderRadius: 7, color: copied ? '#34D399' : 'rgba(148,163,184,0.55)',
              padding: '5px 8px', display: 'flex', transition: 'all 0.2s' }}>
              {copied ? <I.Check /> : <I.Copy />}
            </button>
          </div>
        </div>
        <pre style={{ background: '#0F1117', padding: '22px 20px', margin: 0, overflowX: 'auto',
          fontSize: 13, lineHeight: 1.9, color: '#CBD5E1',
          fontFamily: "'JetBrains Mono','Fira Code',monospace", letterSpacing: '0.01em' }}>
          <code>{children}</code>
        </pre>
      </div>
    </FadeUp>
  );
};

const Alert: FC<{ type?: AlertType; title: string; children: ReactNode }> = ({ type = 'warning', title, children }) => {
  const cfg = {
    warning:  { bc: '#D97706', bg: 'rgba(217,119,6,0.05)',   tc: '#92400E', icon: '⚡' },
    security: { bc: '#DC2626', bg: 'rgba(220,38,38,0.05)',   tc: '#991B1B', icon: '🛡' },
    info:     { bc: '#2563EB', bg: 'rgba(37,99,235,0.05)',   tc: '#1E40AF', icon: 'ℹ️' },
  }[type];
  return (
    <FadeUp>
      <div style={{ background: cfg.bg, borderLeft: `3px solid ${cfg.bc}`,
        border: `1px solid ${cfg.bc}28`, borderLeftWidth: 3, borderLeftColor: cfg.bc,
        borderRadius: '0 14px 14px 0', padding: '16px 22px', margin: '20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 14 }}>{cfg.icon}</span>
          <span style={{ fontSize: 10.5, fontWeight: 800, color: cfg.tc, textTransform: 'uppercase',
            letterSpacing: '0.1em', fontFamily: "'JetBrains Mono',monospace" }}>{title}</span>
        </div>
        <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.8 }}>{children}</div>
      </div>
    </FadeUp>
  );
};

const STitle: FC<{ icon: IconFn; title: string; sub?: string; badge?: string }> = ({ icon: Ic, title, sub, badge }) => (
  <FadeUp>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 36,
      paddingBottom: 28, borderBottom: '1px solid rgba(15,23,42,0.06)' }}>
      <div style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 13,
        background: 'linear-gradient(135deg,rgba(180,83,9,0.1),rgba(245,158,11,0.07))',
        border: `1.5px solid ${ABO}`, color: A,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 4px 14px ${AB}` }}>
        <Ic />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: sub ? 6 : 0 }}>
          <h2 style={{ fontSize: 22, fontWeight: 600, color: '#0F172A',
            letterSpacing: '-0.025em', margin: 0, fontFamily: "'Playfair Display','Georgia',serif" }}>{title}</h2>
          {badge && <Tag v="amber">{badge}</Tag>}
        </div>
        {sub && <p style={{ fontSize: 12.5, color: '#94A3B8', margin: 0, fontFamily: "'JetBrains Mono',monospace" }}>{sub}</p>}
      </div>
    </div>
  </FadeUp>
);

const Sub: FC<{ n?: string; title: string; children: ReactNode }> = ({ n, title, children }) => (
  <div style={{ marginBottom: 52 }}>
    <FadeUp>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
        {n && <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 700,
          color: A, background: AB, padding: '3px 8px', borderRadius: 6, border: `1px solid ${ABO}` }}>{n}</span>}
        <h3 style={{ fontSize: 17, fontWeight: 600, color: '#1E293B', margin: 0,
          letterSpacing: '-0.015em', fontFamily: "'Playfair Display','Georgia',serif" }}>{title}</h3>
      </div>
    </FadeUp>
    {children}
  </div>
);

// ─── Section Style ─────────────────────────────────────────────────────────────
const SD: React.CSSProperties = { paddingTop: 72, paddingBottom: 72, borderBottom: '1px solid rgba(15,23,42,0.05)' };

// ─── Sidebar ──────────────────────────────────────────────────────────────────
const Sidebar: FC<{
  active: string; search: string;
  setSearch: (v: string) => void;
  scrollTo: (id: string) => void;
  filteredNav: NavSection[];
}> = ({ active, search, setSearch, scrollTo, filteredNav }) => (
  <div style={{ display: 'flex', flexDirection: 'column', height: '100%',
    background: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(28px) saturate(180%)',
    borderRight: '1px solid rgba(15,23,42,0.07)' }}>

    {/* Top */}
    <div style={{ padding: '28px 20px 20px', borderBottom: '1px solid rgba(15,23,42,0.05)', flexShrink: 0 }}>
      {/* Return to Dashboard */}
      <a href="/trade"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700,
          color: '#64748B', textDecoration: 'none', marginBottom: 28, padding: '8px 14px',
          borderRadius: 10, background: 'white', border: '1px solid rgba(15,23,42,0.08)',
          transition: 'all 0.2s', letterSpacing: '0.01em',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
        onMouseEnter={e => { const el = e.currentTarget as HTMLAnchorElement; el.style.color = '#0F172A'; el.style.borderColor = ABO; el.style.background = AB; }}
        onMouseLeave={e => { const el = e.currentTarget as HTMLAnchorElement; el.style.color = '#64748B'; el.style.borderColor = 'rgba(15,23,42,0.08)'; el.style.background = 'white'; }}>
        <I.Back /> Return to Dashboard
      </a>

      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12,
          background: 'linear-gradient(135deg, #D97706, #F59E0B)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(217,119,6,0.3)', flexShrink: 0 }}>
          <span style={{ color: '#fff', fontWeight: 900, fontSize: 18, lineHeight: 1,
            fontFamily: "'Playfair Display',Georgia,serif", fontStyle: 'italic' }}>N</span>
        </div>
        <div>
          <p style={{ fontWeight: 700, fontSize: 15, color: '#0F172A', margin: '0 0 4px',
            letterSpacing: '-0.01em', fontFamily: "'Playfair Display',Georgia,serif" }}>Nexus Protocol</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981',
              boxShadow: '0 0 7px #10B981', display: 'inline-block', flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: '#94A3B8', fontFamily: "'JetBrains Mono',monospace" }}>Polkadot Hub Testnet</span>
          </div>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
          color: '#CBD5E1', display: 'flex', pointerEvents: 'none' }}>
          <I.Search />
        </span>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search docs…"
          style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(248,250,252,0.9)',
            border: '1.5px solid rgba(15,23,42,0.08)', borderRadius: 11,
            padding: '9px 12px 9px 34px', fontSize: 13, color: '#1E293B', outline: 'none',
            fontFamily: 'inherit', transition: 'all 0.2s',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}
          onFocus={e => { e.currentTarget.style.borderColor = ABO; e.currentTarget.style.background = 'white'; e.currentTarget.style.boxShadow = `0 0 0 3px ${AB}`; }}
          onBlur={e => { e.currentTarget.style.borderColor = 'rgba(15,23,42,0.08)'; e.currentTarget.style.background = 'rgba(248,250,252,0.9)'; e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0,0,0,0.02)'; }} />
      </div>
    </div>

    {/* Nav */}
    <nav style={{ flex: 1, overflowY: 'auto', padding: '16px 12px 32px' }}>
      {filteredNav.length === 0 && (
        <p style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: '28px 12px', fontStyle: 'italic', lineHeight: 1.6 }}>
          No results for &ldquo;{search}&rdquo;
        </p>
      )}
      {filteredNav.map((sec, i) => (
        <div key={i} style={{ marginBottom: 26 }}>
          <p style={{ fontSize: 9.5, fontWeight: 800, color: A, textTransform: 'uppercase',
            letterSpacing: '0.18em', padding: '0 10px', marginBottom: 5,
            fontFamily: "'JetBrains Mono',monospace" }}>
            {sec.label}
          </p>
          {sec.items.map(item => {
            const on = active === item.id;
            return (
              <button key={item.id} onClick={() => scrollTo(item.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left',
                  padding: '7.5px 10px', borderRadius: 9, marginBottom: 1,
                  fontSize: 13.5, fontWeight: on ? 700 : 500,
                  color: on ? A : '#64748B',
                  background: on ? AB : 'transparent',
                  border: `1px solid ${on ? ABO : 'transparent'}`,
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.18s' }}
                onMouseEnter={e => { if (!on) { const el = e.currentTarget as HTMLButtonElement; el.style.color = '#1E293B'; el.style.background = 'rgba(15,23,42,0.04)'; }}}
                onMouseLeave={e => { if (!on) { const el = e.currentTarget as HTMLButtonElement; el.style.color = '#64748B'; el.style.background = 'transparent'; }}}>
                {on && <span style={{ flexShrink: 0, opacity: 0.6 }}><I.Chev /></span>}
                {item.title}
              </button>
            );
          })}
        </div>
      ))}
    </nav>

    {/* Bottom version strip */}
    <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(15,23,42,0.05)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
      <span style={{ fontSize: 10.5, color: '#CBD5E1', fontFamily: "'JetBrains Mono',monospace" }}>v1.0 · Chain 420420417</span>
      <Tag v="green" dot="#10B981">Live</Tag>
    </div>
  </div>
);

// ─── Main Content ─────────────────────────────────────────────────────────────
const Content: FC = () => {
  const [copied, setCopied] = useState('');
  const cp = (addr: string) => { navigator.clipboard.writeText(addr); setCopied(addr); setTimeout(() => setCopied(''), 2000); };

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 6% 120px' }}>

      {/* ── OVERVIEW ────────────────────────────────────────────────────────── */}
      <section id="overview" style={SD}>
        <FadeUp>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px',
            borderRadius: 99, background: AB, border: `1px solid ${ABO}`, marginBottom: 32 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10B981',
              boxShadow: '0 0 10px #10B981', display: 'inline-block', flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: A, textTransform: 'uppercase',
              letterSpacing: '0.14em', fontFamily: "'JetBrains Mono',monospace" }}>
              Live · Polkadot Hub Testnet
            </span>
          </div>

          <h1 style={{ fontSize: 'clamp(2.6rem,5vw,4.2rem)', fontWeight: 400, color: '#0F172A',
            margin: '0 0 12px', letterSpacing: '-0.04em', lineHeight: 1.06,
            fontFamily: "'Playfair Display','Georgia',serif" }}>
            Nexus&nbsp;<em style={{ color: '#D97706', fontStyle: 'italic' }}>Protocol</em>
          </h1>
          <p style={{ fontSize: 14, color: '#94A3B8', fontFamily: "'JetBrains Mono',monospace",
            marginBottom: 48, lineHeight: 1.6 }}>
            Technical Documentation · v1.0 · Chain ID 420420417
          </p>
        </FadeUp>

        {/* Hero card */}
        <FadeUp delay={0.07}>
          <div style={{ background: 'linear-gradient(135deg,rgba(255,255,255,0.95),rgba(255,251,235,0.8))',
            borderRadius: 20, border: `1px solid ${ABO}`,
            padding: '30px 34px', marginBottom: 32,
            boxShadow: '0 2px 4px rgba(0,0,0,0.03), 0 20px 50px rgba(180,83,9,0.06)' }}>
            <p style={{ fontSize: 16.5, color: '#0F172A', lineHeight: 1.8, marginBottom: 14, fontWeight: 500 }}>
              Nexus is a fully on-chain perpetuals exchange on{' '}
              <strong style={{ color: '#D97706' }}>Polkadot Hub Testnet</strong>.
              Trade BTC and ETH with up to <strong>50× leverage</strong> — no off-chain order books, no trusted operators.
            </p>
            <p style={{ fontSize: 14.5, color: '#64748B', lineHeight: 1.8, margin: 0 }}>
              Five composable layers: <strong style={{ color: '#374151' }}>Vault Layer</strong> for capital,{' '}
              <strong style={{ color: '#374151' }}>Trading Engine</strong> for positions,{' '}
              <strong style={{ color: '#374151' }}>Risk Engine</strong> for liquidations,{' '}
              <strong style={{ color: '#374151' }}>Oracle Layer</strong> for prices,
              and <strong style={{ color: '#374151' }}>Cross-Chain Layer</strong> for multi-chain execution.
            </p>
          </div>
        </FadeUp>

        {/* Network pills */}
        <FadeUp delay={0.11}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12, marginBottom: 36 }}>
            {[
              { label: 'Network',  value: 'Polkadot Hub Testnet' },
              { label: 'Chain ID', value: '420420417' },
              { label: 'RPC',      value: 'polkadothub-rpc.com' },
              { label: 'Explorer', value: 'blockscout-passet-hub' },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: 'white', border: '1px solid rgba(15,23,42,0.07)',
                borderRadius: 14, padding: '15px 18px', boxShadow: '0 2px 10px rgba(0,0,0,0.025)' }}>
                <p style={{ fontSize: 9.5, color: A, textTransform: 'uppercase', letterSpacing: '0.15em',
                  fontFamily: "'JetBrains Mono',monospace", fontWeight: 800, marginBottom: 7 }}>{label}</p>
                <p style={{ fontSize: 12, color: '#64748B', fontFamily: "'JetBrains Mono',monospace",
                  margin: 0, wordBreak: 'break-all', lineHeight: 1.5 }}>{value}</p>
              </div>
            ))}
          </div>
        </FadeUp>

        {/* Feature grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(188px,1fr))', gap: 12 }}>
          {[
            { e: '🏦', t: 'Single-Vault Design',  d: 'All LP liquidity and trader collateral in one PerpsVault.' },
            { e: '⚡', t: 'Open Keeper Model',    d: 'Any address calls batchLiquidate and earns 10% fee.' },
            { e: '🔗', t: 'Polkadot Native',      d: 'Deployed on Polkadot Hub — EVM-compatible parachain.' },
            { e: '📊', t: 'Real Prices',          d: 'PriceKeeper auto-updates from Binance every 2 min.' },
            { e: '🔐', t: '18-Dec Precision',     d: 'DECIMALS_SCALAR normalises USDC to 1e18 internally.' },
            { e: '⛓️', t: 'Cross-Chain Ready',    d: 'CrossChainRouter + MessageReceiver for multi-chain.' },
          ].map(({ e, t, d }, i) => (
            <FadeUp key={t} delay={0.04 * i}>
              <motion.div whileHover={{ y: -4, borderColor: ABO, boxShadow: `0 12px 32px rgba(180,83,9,0.1)` }}
                transition={{ duration: 0.22 }}
                style={{ background: 'white', borderRadius: 16, border: '1px solid rgba(15,23,42,0.07)',
                  padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.025)', height: '100%' }}>
                <span style={{ fontSize: 24, display: 'block', marginBottom: 12 }}>{e}</span>
                <p style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', marginBottom: 7, letterSpacing: '-0.01em' }}>{t}</p>
                <p style={{ fontSize: 12.5, color: '#94A3B8', lineHeight: 1.65, margin: 0 }}>{d}</p>
              </motion.div>
            </FadeUp>
          ))}
        </div>
      </section>

      {/* ── ARCHITECTURE ─────────────────────────────────────────────────────── */}
      <section id="architecture" style={SD}>
        <STitle icon={I.Net} title="System Architecture" sub="Five-layer composable design" />
        <FadeUp>
          <Para>Capital flows uni-directionally: USDC deposits into <C>PerpsVault</C>, minting an internal balance.
            Opening a position through <C>PositionManager</C> atomically locks collateral.
            <C>PriceOracle</C> validates feed freshness; <C>PnLCalculator</C> checks health.
            Below threshold, <C>LiquidationEngine</C> is callable by any keeper.</Para>
        </FadeUp>

        <FadeUp delay={0.05}>
          <div style={{ background: 'white', borderRadius: 18, border: '1px solid rgba(15,23,42,0.07)',
            overflow: 'hidden', marginBottom: 28, boxShadow: '0 4px 20px rgba(0,0,0,0.025)' }}>
            <div style={{ padding: '13px 22px', background: 'rgba(248,250,252,0.8)', borderBottom: '1px solid rgba(15,23,42,0.05)' }}>
              <p style={{ fontSize: 10, fontWeight: 800, color: A, textTransform: 'uppercase',
                letterSpacing: '0.18em', margin: 0, fontFamily: "'JetBrains Mono',monospace" }}>Core Design Invariants</p>
            </div>
            {[
              ['No off-chain trust',      'Price discovery, execution, liquidation, settlement — all fully on-chain.'],
              ['18-decimal precision',    'DECIMALS_SCALAR = 10^(18−tokenDecimals) normalises USDC (6 dec) to 1e18.'],
              ['Vault solvency',          '128 runs × 50 calls = 6,400 randomised state mutations, zero reverts.'],
              ['Isolated margin default', 'Cross-margin mode uses _calculateGlobalPnL iterating all active positions.'],
            ].map(([t, d], i, arr) => (
              <div key={t} style={{ display: 'flex', gap: 20, padding: '14px 22px',
                borderBottom: i < arr.length - 1 ? '1px solid rgba(15,23,42,0.04)' : 'none',
                background: i % 2 === 0 ? 'white' : 'rgba(248,250,252,0.5)', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
                  color: A, minWidth: 185, flexShrink: 0, paddingTop: 1 }}>{t}</span>
                <span style={{ fontSize: 14, color: '#64748B', lineHeight: 1.75, flex: 1 }}>{d}</span>
              </div>
            ))}
          </div>
        </FadeUp>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(205px,1fr))', gap: 14 }}>
          {[
            { l: 'Vault Layer',    c: '#D97706', items: ['PerpsVault.sol','ERC-20 Collateral','LP Share Tokens','Lock / Release API'] },
            { l: 'Trading Engine', c: '#7C3AED', items: ['PositionManager.sol','ISOLATED / CROSS','Market + Limit Orders','Cross-Chain flow'] },
            { l: 'Risk Engine',    c: '#DC2626', items: ['LiquidationEngine.sol','Batch Liquidate (20)','Keeper Rewards','Emergency Rescue'] },
            { l: 'Oracle & Math',  c: '#059669', items: ['PriceOracle.sol','PnLCalculator.sol','MockAggregatorV3','int256 safe math'] },
            { l: 'Cross-Chain',    c: '#2563EB', items: ['CrossChainRouter.sol','MessageReceiver.sol','Multi-chain positions','USDC bridging'] },
            { l: 'Price Keeper',   c: '#D97706', items: ['PriceKeeper.sol','Binance feed','Auto 2-min updates','On-chain storage'] },
          ].map(({ l, c, items }, i) => (
            <motion.div key={l}
              initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ delay: i * 0.045 }}
              whileHover={{ y: -4, boxShadow: `0 12px 32px ${c}22` }}
              style={{ background: 'white', border: `1px solid ${c}22`, borderRadius: 16,
                padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)', transition: 'all 0.22s' }}>
              <p style={{ fontSize: 10, fontWeight: 800, color: c, textTransform: 'uppercase',
                letterSpacing: '0.14em', marginBottom: 14, fontFamily: "'JetBrains Mono',monospace" }}>{l}</p>
              {items.map((item, j) => (
                <p key={j} style={{ fontSize: 12.5, fontFamily: "'JetBrains Mono',monospace",
                  color: j === 0 ? '#1E293B' : '#94A3B8', marginBottom: j < items.length - 1 ? 5 : 0, fontWeight: j === 0 ? 600 : 400 }}>
                  {j === 0 ? item : `└─ ${item}`}
                </p>
              ))}
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── DEPLOYMENTS ──────────────────────────────────────────────────────── */}
      <section id="deployments" style={SD}>
        <STitle icon={I.Globe} title="Contract Addresses" sub="Polkadot Hub Testnet · Chain ID 420420417" />
        <FadeUp>
          <div style={{ background: 'white', borderRadius: 18, border: '1px solid rgba(15,23,42,0.07)',
            overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.03)' }}>
            {DEPLOYS.map((d, i) => (
              <div key={d.addr} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '13px 22px', borderBottom: i < DEPLOYS.length - 1 ? '1px solid rgba(15,23,42,0.04)' : 'none',
                background: i % 2 === 0 ? 'white' : 'rgba(248,250,252,0.5)', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: '#1E293B', minWidth: 145 }}>{d.label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono',monospace", color: '#94A3B8' }}>
                    {d.addr.slice(0, 10)}…{d.addr.slice(-6)}
                  </span>
                  <motion.button onClick={() => cp(d.addr)} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                    style={{ background: copied === d.addr ? 'rgba(5,150,105,0.08)' : AB,
                      border: `1px solid ${copied === d.addr ? 'rgba(5,150,105,0.25)' : ABO}`,
                      cursor: 'pointer', borderRadius: 7, color: copied === d.addr ? '#059669' : A,
                      fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace",
                      padding: '4px 11px', transition: 'all 0.2s', letterSpacing: '0.05em' }}>
                    {copied === d.addr ? '✓ COPIED' : 'COPY'}
                  </motion.button>
                </div>
              </div>
            ))}
          </div>
        </FadeUp>
        <Alert type="info" title="Block Explorer">
          View all transactions at <C>blockscout-passet-hub.parity-testnet.parity.io</C>. All contracts verified on-chain.
        </Alert>
      </section>

      {/* ── PERPS VAULT ──────────────────────────────────────────────────────── */}
      <section id="perps-vault" style={SD}>
        <STitle icon={I.DB} title="PerpsVault" sub="The capital layer — all funds live here" />
        <FadeUp><Para><C>PerpsVault.sol</C> is the financial backbone of Nexus. Every dollar — LP
          deposits or trader margin — lives here. A single vault eliminates capital fragmentation
          and makes solvency auditable from one storage slot.</Para></FadeUp>
        <FadeUp delay={0.05}><Para>Two pools: the <strong style={{ color: '#1E293B' }}>LP pool</strong> for
          passive liquidity providers, and the <strong style={{ color: '#1E293B' }}>collateral pool</strong> for active traders.</Para></FadeUp>
        <FadeUp delay={0.1}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
            <Tag>Ownable</Tag><Tag>ReentrancyGuard</Tag><Tag>Pausable</Tag>
            <Tag v="amber">MINIMUM_LIQUIDITY = 1000</Tag>
            <Tag v="amber">DECIMALS_SCALAR = 1e12</Tag>
          </div>
        </FadeUp>
      </section>

      <section id="vault-lp" style={SD}>
        <Sub n="01" title="LP Liquidity Engine">
          <FadeUp><Para>LPs call <C>addLiquidity(uint256 amount)</C> receiving shares via
            <C>shares = (amount × totalSupply) / totalAssets</C>. The first deposit permanently burns
            <C>MINIMUM_LIQUIDITY (1,000)</C> to <C>address(0)</C> — preventing share-price inflation.</Para></FadeUp>
          <CodeBlock title="PerpsVault.sol — LP share minting">{`function addLiquidity(uint256 amount) external nonReentrant whenNotPaused {
  uint256 normalised = amount * DECIMALS_SCALAR;
  uint256 supply     = totalLpShares;

  uint256 shares = supply == 0
    ? normalised - MINIMUM_LIQUIDITY
    : (normalised * supply) / totalLiquidity;

  lpShares[msg.sender] += shares;
  totalLpShares        += shares;
  totalLiquidity       += normalised;
}`}</CodeBlock>
        </Sub>
      </section>

      <section id="vault-collateral" style={SD}>
        <Sub n="02" title="Trader Collateral">
          <FadeUp><Para>Traders call <C>deposit(uint256 amount)</C> to fund their vault balance.
            USDC is scaled to 18 decimals via <C>DECIMALS_SCALAR (1e12)</C>. All margin checks
            occur in <C>PositionManager</C> before any capital moves.</Para></FadeUp>
          <Alert type="security" title="Access Control — onlyPositionManager">
            <C>lockCollateral</C>, <C>unlockCollateral</C>, <C>settleTrade</C>,
            and <C>transferByManager</C> all carry the <C>onlyPositionManager</C> modifier.
          </Alert>
        </Sub>
      </section>

      <section id="vault-settlement" style={SD}>
        <Sub n="03" title="Trade Settlement">
          <FadeUp><Para><C>settleTrade(address trader, uint256 amountLocked, int256 pnl)</C> atomically
            applies realised PnL to locked collateral and returns net payout to the trader&apos;s free balance.</Para></FadeUp>
          <CodeBlock title="PerpsVault.sol — settleTrade core">{`function settleTrade(address user, uint256 amountLocked, int256 pnl)
  external onlyPositionManager nonReentrant whenNotPaused
{
  uint256 payout = amountLocked;
  if (pnl >= 0) {
    payout         += uint256(pnl);
    totalLiquidity -= uint256(pnl);   // LP pays profit
  } else {
    uint256 loss    = uint256(-pnl);
    if (loss > amountLocked) loss = amountLocked;
    payout         -= loss;
    totalLiquidity += loss;            // LP collects loss
  }
  lockedCollateral[user] -= amountLocked;
  traderCollateral[user] += payout;
}`}</CodeBlock>
          <Alert type="warning" title="Dust Withdrawal — Patched">
            <C>scaledAmount % DECIMALS_SCALAR != 0</C> reverts on every withdrawal call.
          </Alert>
        </Sub>
      </section>

      {/* ── POSITION MANAGER ─────────────────────────────────────────────────── */}
      <section id="position-manager" style={SD}>
        <STitle icon={I.Trend} title="PositionManager" sub="The trading engine — all position logic" />
        <FadeUp><Para><C>PositionManager.sol</C> is the only contract allowed to mutate vault collateral.
          Position struct: collateral, leverage, entryPrice, isLong, isOpen, isCrossChain, mode.</Para></FadeUp>
        <FadeUp delay={0.1}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
            <Tag>Ownable</Tag><Tag>ReentrancyGuard</Tag><Tag>Pausable</Tag>
            <Tag v="amber">liquidationThresholdBps = 8000</Tag>
            <Tag v="green">maxLeverage = 50×</Tag>
          </div>
        </FadeUp>
      </section>

      <section id="margin-modes" style={SD}>
        <Sub n="01" title="Margin Modes: ISOLATED vs CROSS">
          <FadeUp>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14, marginBottom: 24 }}>
              {[
                { l: 'ISOLATED', c: '#D97706', d: "Each position has its own ring-fenced collateral. Only that position's margin is at risk." },
                { l: 'CROSS',    c: '#2563EB', d: 'All free collateral counts as margin across every cross position — cascade liquidation risk.' },
              ].map(({ l, c, d }) => (
                <motion.div key={l} whileHover={{ scale: 1.015 }}
                  style={{ background: 'white', border: `1px solid ${c}28`, borderRadius: 16, padding: '22px',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
                  <p style={{ fontSize: 11, fontWeight: 800, color: c, textTransform: 'uppercase',
                    letterSpacing: '0.16em', marginBottom: 10, fontFamily: "'JetBrains Mono',monospace" }}>{l}</p>
                  <p style={{ fontSize: 14, color: '#64748B', lineHeight: 1.75, margin: 0 }}>{d}</p>
                </motion.div>
              ))}
            </div>
          </FadeUp>
        </Sub>
      </section>

      <section id="market-orders" style={SD}>
        <Sub n="02" title="Market Orders">
          <FadeUp><Para><C>openPosition(token, collateralDelta, leverage, isLong, mode)</C> opens at current
            oracle price. Queries <C>PriceOracle</C>, validates leverage, locks collateral — all atomic.</Para></FadeUp>
          <CodeBlock title="PositionManager.sol — openPosition core">{`function openPosition(
  address _token, uint256 _collateralDelta,
  uint256 _leverage, bool _isLong, IPerpsCore.MarginMode _mode
) external nonReentrant whenNotPaused {
  if (!whitelistedOracles[_token])          revert PerpsErrors.InvalidAsset();
  if (positions[msg.sender][_token].isOpen) revert PerpsErrors.PositionAlreadyExists();

  uint256 currentPrice = _getOraclePrice(_token);
  if (currentPrice == 0) revert PerpsErrors.InvalidPrice();

  VAULT.lockCollateral(msg.sender, _collateralDelta);
  _storePosition(msg.sender, _token, _collateralDelta,
    _leverage, _isLong, currentPrice, false, _mode);
}`}</CodeBlock>
        </Sub>
      </section>

      <section id="limit-orders" style={SD}>
        <Sub n="03" title="Limit Orders">
          <FadeUp><Para><C>placeLimitOrder()</C> immediately locks collateral on-chain. No position opened yet —
            prevents griefing. Anyone calls <C>executeLimitOrder()</C> once oracle crosses target, earning <strong style={{ color: '#1E293B' }}>0.1% fee</strong>.</Para></FadeUp>
        </Sub>
      </section>

      <section id="ccip-trades" style={SD}>
        <Sub n="04" title="Cross-Chain Trade Execution">
          <FadeUp><Para><C>executeCrossChainTrade()</C> opens a position identically to <C>openPosition</C>.
            If it fails after collateral arrived, <C>MessageReceiver</C> credits the trader&apos;s free balance — funds never lost.</Para></FadeUp>
        </Sub>
      </section>

      {/* ── LIQUIDATION ──────────────────────────────────────────────────────── */}
      <section id="liquidation-engine" style={SD}>
        <STitle icon={I.Shield} title="LiquidationEngine" sub="The risk engine — open-keeper model" />
        <FadeUp><Para>Replaces the privileged-admin pattern with an open-keeper model paying
          a <strong style={{ color: '#1E293B' }}>10% fee to any caller</strong>.</Para></FadeUp>
      </section>

      <section id="batch-liquidation" style={SD}>
        <Sub n="01" title="Batch Processing Architecture">
          <CodeBlock title="LiquidationEngine.sol — batch with isolation">{`for (uint i = 0; i < _traders.length; i++) {
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
        </Sub>
      </section>

      <section id="keeper-system" style={SD}>
        <Sub n="02" title="Keeper Reward System">
          <FadeUp><Para>Fee flow: locked collateral → <C>settleTrade</C> → <C>LiquidationEngine</C> → keeper wallet.</Para></FadeUp>
          <Alert type="security" title="PROTOCOL_ASSET Rescue Guard">
            <C>rescueTokens()</C> reverts unconditionally if <C>token == PROTOCOL_ASSET</C> — even a compromised owner cannot drain rewards.
          </Alert>
        </Sub>
      </section>

      {/* ── ORACLE ───────────────────────────────────────────────────────────── */}
      <section id="price-oracle" style={SD}>
        <STitle icon={I.Pulse} title="PriceOracle + PriceKeeper" sub="Mock feeds with auto-update via Binance" />
        <FadeUp><Para><C>PriceOracle.sol</C> wraps <C>MockAggregatorV3Interface</C> to serve 18-decimal prices.
          <C>PriceKeeper</C> fetches Binance prices every 2 minutes automatically from the frontend.</Para></FadeUp>
        <CodeBlock title="PriceOracle.sol — getPrice with staleness check">{`function getPrice(address _token) external view override returns (uint256) {
  AggregatorV3Interface feed = feeds[_token];
  if (address(feed) == address(0)) revert PerpsErrors.InvalidAsset();

  (, int256 rawPrice,, uint256 updatedAt,) = feed.latestRoundData();
  if (rawPrice <= 0) revert PerpsErrors.InvalidPrice();
  if (block.timestamp - updatedAt > heartbeats[_token])
    revert PerpsErrors.StalePrice();

  uint8 decimals = feed.decimals();
  return uint256(rawPrice) * (10 ** (TARGET_DECIMALS - decimals));
}`}</CodeBlock>
      </section>

      <section id="pnl-calculator" style={SD}>
        <STitle icon={I.Calc} title="PnLCalculator" sub="Pure math library — no storage" />
        <FadeUp><Para>A pure library — no storage, no ownership. Centralising PnL math ensures
          <C>PositionManager</C> and <C>LiquidationEngine</C> never duplicate formulas.</Para></FadeUp>
        <Alert type="warning" title="int256 Overflow Safety">
          Both <C>currentPrice</C> and <C>collateral × leverage</C> are checked before multiplication.
          An unchecked wrap would produce enormous false profit bypassing all health checks.
        </Alert>
      </section>

      <section id="perps-errors" style={SD}>
        <STitle icon={I.Warn} title="PerpsErrors" sub="Centralised custom error registry" />
        <FadeUp>
          <div style={{ background: 'white', borderRadius: 18, border: '1px solid rgba(15,23,42,0.07)',
            overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.025)' }}>
            {([
              ['InvalidAsset',           'Token not whitelisted in PositionManager'],
              ['ZeroAmount',             'Deposit or withdrawal of zero value'],
              ['InsufficientCollateral', 'Margin below minimum to open position'],
              ['InvalidLeverage',        'Leverage exceeds asset maxLeverage (50×)'],
              ['PositionAlreadyExists',  'User already has open position for this token'],
              ['NoPositionFound',        'positionId does not exist in storage'],
              ['PositionHealthy',        'Position health above liquidation threshold'],
              ['StalePrice',             'Oracle price outside heartbeat window'],
              ['InvalidPrice',           'Oracle returned zero or negative price'],
              ['Unauthorized',           'Caller is not the registered PositionManager'],
            ] as [string, string][]).map(([err, desc], i, arr) => (
              <div key={err} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 22px', borderBottom: i < arr.length - 1 ? '1px solid rgba(15,23,42,0.04)' : 'none',
                background: i % 2 === 0 ? 'white' : 'rgba(248,250,252,0.5)', gap: 16, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12.5, fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: A, flexShrink: 0 }}>{err}</span>
                <span style={{ fontSize: 13, color: '#64748B' }}>{desc}</span>
              </div>
            ))}
          </div>
        </FadeUp>
      </section>

      {/* ── CROSS-CHAIN ───────────────────────────────────────────────────────── */}
      <section id="cross-chain-router" style={SD}>
        <STitle icon={I.Repeat} title="CrossChainRouter" sub="Source chain — initiates cross-chain trades" />
        <FadeUp><Para><C>CrossChainRouter.sol</C> encodes trade params and collateral into a message
          and forwards to <C>MessageReceiver</C> on the destination chain.</Para></FadeUp>
      </section>

      <section id="message-receiver" style={SD}>
        <STitle icon={I.Repeat} title="MessageReceiver" sub="Destination — executes on Polkadot Hub" />
        <FadeUp><Para>On <C>receiveMessage</C>: decodes payload → deposits USDC → calls <C>executeCrossChainTrade</C>.
          Maintains a sender allowlist keyed by <C>(sourceChain, senderAddress)</C>.</Para></FadeUp>
        <Alert type="security" title="Sender Allowlist is Critical">
          Always verify sender matches an approved <C>CrossChainRouter</C> before trusting decoded parameters.
        </Alert>
      </section>

      {/* ── TEST SUITE ────────────────────────────────────────────────────────── */}
      <section id="test-suite" style={SD}>
        <STitle icon={I.Check} title="Test Suite & Coverage" sub="95 tests · 0 failures · 14 test suites" badge="Foundry" />
        <FadeUp>
          <div style={{ background: 'white', borderRadius: 18, border: '1px solid rgba(15,23,42,0.07)',
            overflow: 'hidden', marginBottom: 24, boxShadow: '0 4px 20px rgba(0,0,0,0.025)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr', padding: '11px 22px',
              background: 'rgba(248,250,252,0.8)', fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
              fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em',
              gap: 10, borderBottom: '1px solid rgba(15,23,42,0.05)' }}>
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
            ].map(([c, s, calls, rev, dis], i) => (
              <div key={s} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr',
                padding: '11px 22px', background: i % 2 === 0 ? 'white' : 'rgba(248,250,252,0.5)',
                borderBottom: i < 3 ? '1px solid rgba(15,23,42,0.04)' : 'none', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono',monospace", color: '#1E293B', fontWeight: 600 }}>{c}</span>
                <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono',monospace", color: A, fontWeight: 600 }}>{s}</span>
                <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono',monospace", color: '#94A3B8', textAlign: 'right' }}>{calls}</span>
                <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono',monospace", color: '#059669', textAlign: 'right', fontWeight: 700 }}>{rev}</span>
                <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono',monospace", color: '#94A3B8', textAlign: 'right' }}>{dis}</span>
              </div>
            ))}
          </div>
        </FadeUp>
        <CodeBlock title="Terminal" lang="SHELL">{`forge test        # run all 95 tests (~3s)
forge coverage    # generate coverage report
forge test -vvv   # verbose output with traces`}</CodeBlock>
      </section>

      {/* ── SECURITY ──────────────────────────────────────────────────────────── */}
      <section id="security" style={SD}>
        <STitle icon={I.Shield} title="Security Model" sub="Defense-in-depth for every attack surface" />
        <FadeUp>
          <div style={{ background: 'white', borderRadius: 18, border: '1px solid rgba(15,23,42,0.07)',
            overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.025)' }}>
            {[
              ['Oracle manipulation',     'Mock feeds auto-updated by frontend every 2 min. Staleness reverts after heartbeat.'],
              ['Reentrancy',              'ReentrancyGuard on settleTrade, transferByManager, batchLiquidate, deposit, withdraw.'],
              ['LP inflation attack',     'MINIMUM_LIQUIDITY = 1000 permanently burned on genesis deposit.'],
              ['Dust sweep / drain',      'scaledAmount % DECIMALS_SCALAR != 0 reverts on every withdrawal call.'],
              ['Unauthorised liquidation','onlyPositionManager blocks direct vault mutations from any other caller.'],
              ['Over-withdrawal',         'lockedCollateral tracking blocks withdrawing margin from open positions.'],
              ['Keeper reward rug pull',  'rescueTokens() unconditionally reverts for PROTOCOL_ASSET address.'],
              ['Wrong decimal prices',    'All prices normalised to 18-dec before storage. Feed decimals validated.'],
            ].map(([att, mit], i, arr) => (
              <div key={att} style={{ display: 'flex', gap: 20, padding: '14px 22px',
                background: i % 2 === 0 ? 'white' : 'rgba(248,250,252,0.5)',
                borderBottom: i < arr.length - 1 ? '1px solid rgba(15,23,42,0.04)' : 'none', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', minWidth: 210, flexShrink: 0 }}>{att}</span>
                <span style={{ fontSize: 13.5, color: '#64748B', lineHeight: 1.75, flex: 1 }}>{mit}</span>
              </div>
            ))}
          </div>
        </FadeUp>
        <Alert type="warning" title="No External Audit">
          No formal security audit has been conducted. Testnet only — do not use with real funds.
        </Alert>
      </section>

      {/* ── LOCAL SETUP ───────────────────────────────────────────────────────── */}
      <section id="local-setup" style={SD}>
        <STitle icon={I.Pulse} title="Local Setup" sub="Foundry + Next.js 16" />
        <Sub title="Smart Contracts">
          <CodeBlock title="Terminal" lang="SHELL">{`git clone https://github.com/NexTechArchitect/nexus-polka-perps.git
cd nexus-polka-perps && forge install
forge test -vv

# Deploy to Polkadot Hub Testnet
cp .env.example .env
forge script script/deploy/01_DeployMocks.s.sol  --rpc-url polkadot-testnet --broadcast --legacy
forge script script/deploy/02_DeployOracle.s.sol --rpc-url polkadot-testnet --broadcast --legacy
forge script script/deploy/03_DeployVault.s.sol  --rpc-url polkadot-testnet --broadcast --legacy
forge script script/deploy/04_DeployCore.s.sol   --rpc-url polkadot-testnet --broadcast --legacy`}</CodeBlock>
        </Sub>
        <Sub title="Frontend">
          <CodeBlock title="Terminal" lang="SHELL">{`cd web3-app && npm install --legacy-peer-deps
npm run dev   # → http://localhost:3000
# Oracle updates automatically every 2 min via connected wallet`}</CodeBlock>
        </Sub>
        <Sub title="foundry.toml">
          <CodeBlock title="foundry.toml" lang="TOML">{`[rpc_endpoints]
polkadot-testnet = "https://services.polkadothub-rpc.com/testnet"

[etherscan]
polkadot-testnet = { key = "no-key", url = "https://blockscout-passet-hub.parity-testnet.parity.io/api" }`}</CodeBlock>
        </Sub>
      </section>

      {/* ── FRONTEND STACK ────────────────────────────────────────────────────── */}
      <section id="frontend-stack" style={SD}>
        <STitle icon={I.Globe} title="Frontend Stack" sub="Next.js 16 App Router · zero backend reads" />
        <FadeUp>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
            {[
              { l: 'Framework',  v: 'Next.js 16 · App Router' },
              { l: 'Blockchain', v: 'Wagmi v2 · Viem' },
              { l: 'Wallet UI',  v: 'RainbowKit · MetaMask' },
              { l: 'Charts',     v: 'TradingView iframe · WS' },
              { l: 'Styling',    v: 'Framer Motion · Inline CSS' },
              { l: 'Network',    v: 'Polkadot Hub (420420417)' },
            ].map(({ l, v }) => (
              <motion.div key={l} whileHover={{ scale: 1.025, y: -2 }}
                style={{ background: 'white', borderRadius: 14, border: '1px solid rgba(15,23,42,0.07)',
                  padding: '18px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)', transition: 'all 0.2s' }}>
                <p style={{ fontSize: 9.5, fontWeight: 800, color: A, textTransform: 'uppercase',
                  letterSpacing: '0.16em', marginBottom: 8, fontFamily: "'JetBrains Mono',monospace" }}>{l}</p>
                <p style={{ fontSize: 14, color: '#1E293B', margin: 0, fontWeight: 600 }}>{v}</p>
              </motion.div>
            ))}
          </div>
        </FadeUp>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────────────── */}
      <footer style={{ paddingTop: 80, textAlign: 'center' }}>
        <FadeUp>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ width: 40, height: 40, background: 'linear-gradient(135deg,#D97706,#F59E0B)',
              borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(217,119,6,0.32)' }}>
              <span style={{ color: '#fff', fontWeight: 900, fontSize: 19,
                fontFamily: "'Playfair Display',Georgia,serif", fontStyle: 'italic' }}>N</span>
            </div>
            <span style={{ fontSize: 19, fontWeight: 600, color: '#0F172A', letterSpacing: '-0.025em',
              fontFamily: "'Playfair Display',Georgia,serif" }}>NEXUS PROTOCOL</span>
            <Tag v="amber" dot="#10B981">Polkadot Hub</Tag>
          </div>

          <p style={{ fontSize: 14.5, color: '#94A3B8', maxWidth: 440, margin: '0 auto 44px', lineHeight: 1.8 }}>
            Deterministic perpetuals. Auto price feeds. Open-keeper liquidations.<br />
            Built for the Polkadot Solidity Hackathon 2026.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32,
            borderTop: '1px solid rgba(15,23,42,0.07)', paddingTop: 28, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono',monospace", color: '#CBD5E1' }}>© 2026 Nexus Protocol · MIT</span>
            <a href="https://github.com/NexTechArchitect/nexus-polka-perps" target="_blank" rel="noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600,
                color: '#94A3B8', textDecoration: 'none', transition: 'color 0.2s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = '#1E293B'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = '#94A3B8'; }}>
              GitHub <I.Ext />
            </a>
            <a href="https://dorahacks.io" target="_blank" rel="noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600,
                color: '#94A3B8', textDecoration: 'none', transition: 'color 0.2s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = A; }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = '#94A3B8'; }}>
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

  useEffect(() => { document.title = 'Nexus Protocol — Docs'; }, []);

  // Progress bar
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const fn = () => setProgress((el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight)) * 100);
    el.addEventListener('scroll', fn, { passive: true });
    return () => el.removeEventListener('scroll', fn);
  }, []);

  // Active section tracker
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
      top: target.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 30,
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
    <div style={{ display: 'flex', height: '100vh', background: '#F8F7F4',
      overflow: 'hidden', fontFamily: "'DM Sans','Inter',-apple-system,sans-serif", position: 'relative' }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400;1,600&family=JetBrains+Mono:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        /* Scrollbars */
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(180,83,9,0.22); border-radius: 99px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(180,83,9,0.45); }

        /* Aurora keyframes */
        @keyframes blob1 { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(70px,-50px) scale(1.12)} 66%{transform:translate(-40px,70px) scale(0.93)} }
        @keyframes blob2 { 0%,100%{transform:translate(0,0) scale(1)} 40%{transform:translate(-60px,80px) scale(1.07)} 70%{transform:translate(50px,-60px) scale(1.1)} }
        @keyframes blob3 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-50px,-40px) scale(1.09)} }
        @keyframes shimmer { 0%{opacity:0.3} 50%{opacity:0.6} 100%{opacity:0.3} }

        /* Layout */
        .sidebar-d { display: flex; flex-direction: column; }
        .main-d    { margin-left: 295px; }
        .mob-bar   { display: none; }
        @media (max-width: 900px) {
          .sidebar-d { display: none !important; }
          .main-d    { margin-left: 0 !important; }
          .mob-bar   { display: flex !important; }
          .mob-spc   { height: 58px; }
        }
      `}</style>

      {/* ── Aurora Background ── */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        {/* Gold aurora — top left */}
        <div style={{ position: 'absolute', width: '65vw', height: '65vw', borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(217,119,6,0.12) 0%, rgba(245,158,11,0.07) 40%, transparent 68%)',
          top: '-22%', left: '-18%', filter: 'blur(50px)',
          animation: 'blob1 24s ease-in-out infinite' }} />
        {/* Warm cream — center right */}
        <div style={{ position: 'absolute', width: '50vw', height: '50vw', borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(251,191,36,0.08) 0%, rgba(252,211,77,0.04) 50%, transparent 68%)',
          top: '15%', right: '-12%', filter: 'blur(60px)',
          animation: 'blob2 30s ease-in-out infinite' }} />
        {/* Green tint — bottom */}
        <div style={{ position: 'absolute', width: '45vw', height: '45vw', borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(16,185,129,0.06) 0%, transparent 65%)',
          bottom: '-18%', left: '20%', filter: 'blur(70px)',
          animation: 'blob3 20s ease-in-out infinite' }} />
        {/* Subtle warm vignette */}
        <div style={{ position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse 120% 100% at 50% 0%, rgba(254,243,199,0.22) 0%, transparent 60%)' }} />
        {/* Grain texture */}
        <div style={{ position: 'absolute', inset: 0, opacity: 0.35,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`,
          backgroundSize: '160px' }} />
      </div>

      {/* ── Progress rail ── */}
      <div style={{ position: 'fixed', top: 0, right: 0, width: 3, height: '100vh',
        background: 'rgba(180,83,9,0.07)', zIndex: 200 }}>
        <div style={{ width: '100%', height: `${progress}%`,
          background: 'linear-gradient(to bottom,#D97706,#F59E0B,#FCD34D)',
          boxShadow: '0 0 10px rgba(217,119,6,0.35)', transition: 'height 0.1s linear' }} />
      </div>

      {/* ── Mobile Top Bar ── */}
      <div className="mob-bar" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 110,
        alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', height: 58,
        background: 'rgba(248,247,244,0.94)', backdropFilter: 'blur(22px)',
        borderBottom: '1px solid rgba(15,23,42,0.07)',
        boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>
        <a href="/trade" style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700,
          color: '#64748B', textDecoration: 'none', padding: '7px 13px',
          borderRadius: 9, background: 'white', border: '1px solid rgba(15,23,42,0.08)' }}>
          <I.Back /> App
        </a>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9,
            background: 'linear-gradient(135deg,#D97706,#F59E0B)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 10px rgba(217,119,6,0.32)' }}>
            <span style={{ color: '#fff', fontWeight: 900, fontSize: 15,
              fontFamily: "'Playfair Display',Georgia,serif", fontStyle: 'italic' }}>N</span>
          </div>
          <span style={{ fontWeight: 600, fontSize: 16, color: '#0F172A', letterSpacing: '-0.01em',
            fontFamily: "'Playfair Display',Georgia,serif" }}>Nexus Docs</span>
        </div>
        <button onClick={() => setMobileOpen(v => !v)}
          style={{ background: 'white', border: '1px solid rgba(15,23,42,0.08)',
            borderRadius: 9, width: 38, height: 38, cursor: 'pointer', color: '#374151',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          {mobileOpen ? <I.X /> : <I.Menu />}
        </button>
      </div>

      {/* ── Mobile Drawer ── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div key="ov" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }} onClick={() => setMobileOpen(false)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.28)',
                zIndex: 120, backdropFilter: 'blur(8px)' }} />
            <motion.div key="dr" initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }}
              transition={{ type: 'spring', stiffness: 350, damping: 34 }}
              style={{ position: 'fixed', top: 0, left: 0, height: '100%', width: 295,
                zIndex: 130, paddingTop: 58,
                boxShadow: '8px 0 48px rgba(180,83,9,0.1)' }}>
              <Sidebar active={active} search={search} setSearch={setSearch}
                scrollTo={scrollTo} filteredNav={filteredNav} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Desktop Sidebar ── */}
      <aside className="sidebar-d"
        style={{ position: 'fixed', top: 0, left: 0, height: '100vh', width: 295, zIndex: 30 }}>
        <Sidebar active={active} search={search} setSearch={setSearch}
          scrollTo={scrollTo} filteredNav={filteredNav} />
      </aside>

      {/* ── Main Content ── */}
      <main ref={contentRef} className="main-d"
        style={{ flex: 1, height: '100vh', overflowY: 'auto', position: 'relative', zIndex: 10 }}>
        <div className="mob-spc" />
        <Content />
      </main>
    </div>
  );
}

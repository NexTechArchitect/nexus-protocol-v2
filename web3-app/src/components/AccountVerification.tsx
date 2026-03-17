'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAccount, useDisconnect } from 'wagmi';
import { useNexusAccount, LoginStep } from '@/hooks/useNexusAccount';

// ─── Constants ────────────────────────────────────────────────────────────────
const STEP_ORDER: LoginStep[] = [
  'idle','fetching_nonce','awaiting_signature','verifying','deploying_account','done',
];
const stepIdx = (s: LoginStep) => STEP_ORDER.indexOf(s);

const STEPS: { key: LoginStep; label: string }[] = [
  { key: 'fetching_nonce',     label: 'Nonce'   },
  { key: 'awaiting_signature', label: 'Sign'    },
  { key: 'verifying',          label: 'Verify'  },
  { key: 'deploying_account',  label: 'Account' },
  { key: 'done',               label: 'Done'    },
];

const STEP_MSG: Record<LoginStep, string> = {
  idle:               'Gasless · ERC-4337 · 24h session',
  fetching_nonce:     'Generating one-time nonce…',
  awaiting_signature: 'Check your wallet…',
  verifying:          'Verifying signature…',
  deploying_account:  'Preparing smart account…',
  done:               'Authenticated',
  error:              'Authentication failed',
};

// ─── Injected CSS ─────────────────────────────────────────────────────────────
const CSS = `
  @keyframes av-slide { 0%{left:-45%} 100%{left:145%} }
  @keyframes av-ring  { 0%{transform:scale(1);opacity:.8} 65%{transform:scale(1.75);opacity:0} 100%{opacity:0} }
  @keyframes av-spin  { to{transform:rotate(360deg)} }
  @keyframes av-shim  { 0%{transform:translateX(-100%)} 100%{transform:translateX(220%)} }
  @keyframes av-pop   { 0%{transform:scale(.95);opacity:0} 100%{transform:scale(1);opacity:1} }
  @keyframes av-copied { 0%{opacity:0;transform:translateY(4px)} 15%{opacity:1;transform:translateY(0)} 85%{opacity:1;transform:translateY(0)} 100%{opacity:0;transform:translateY(-4px)} }
`;

// ─── Micro components ─────────────────────────────────────────────────────────
const Spinner = ({ c = '#92600A' }: { c?: string }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
    style={{ animation:'av-spin .85s linear infinite', flexShrink:0 }}>
    <circle cx="12" cy="12" r="10" stroke={c} strokeWidth="3" strokeOpacity=".2"/>
    <path d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" fill={c}/>
  </svg>
);

const Timer = ({ h, m }: { h: number; m: number }) => (
  <span className="tabular-nums" style={{ fontFamily:'monospace' }}>
    {String(h).padStart(2,'0')}h {String(m).padStart(2,'0')}m
  </span>
);

// ─── Animated top bar ─────────────────────────────────────────────────────────
const TopBar = ({ color, moving }: { color: string; moving: boolean }) => (
  <div style={{ height:3, position:'relative', overflow:'hidden', background:`${color}1a` }}>
    {moving
      ? <div style={{
          position:'absolute', inset:'0 auto 0 0', height:'100%', width:'40%',
          background:`linear-gradient(90deg,transparent,${color},transparent)`,
          animation:'av-slide 1.3s ease-in-out infinite',
        }}/>
      : <div style={{
          height:'100%', width:'100%',
          background:`linear-gradient(90deg,transparent,${color},transparent)`,
        }}/>
    }
  </div>
);

// ─── Shared styles ────────────────────────────────────────────────────────────
const S = {
  card: (border: string): React.CSSProperties => ({
    width:'100%', borderRadius:16, overflow:'hidden',
    background:'#fff', border:`1px solid ${border}`,
    boxShadow:'0 2px 16px rgba(0,0,0,.05)',
  }),
  body: { padding:'13px 13px 15px', display:'flex', flexDirection:'column', gap:11 } as React.CSSProperties,
  row:  { display:'flex', alignItems:'center', gap:10 } as React.CSSProperties,
  orb: (bg: string, bd: string): React.CSSProperties => ({
    width:32, height:32, borderRadius:9, flexShrink:0,
    display:'flex', alignItems:'center', justifyContent:'center',
    background:bg, border:`1px solid ${bd}`,
  }),
  h: { fontSize:12, fontWeight:800, color:'#0f172a', lineHeight:1.3, margin:0 } as React.CSSProperties,
  p: { fontSize:10, fontWeight:500, color:'#94a3b8', lineHeight:1.45, margin:'2px 0 0' } as React.CSSProperties,
};

// ─── Address Row Component ────────────────────────────────────────────────────
const AddressRow = ({ address }: { address: string }) => {
  const [copied, setCopied] = useState(false);

  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // fallback for older browsers
      const el = document.createElement('textarea');
      el.value = address;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }, [address]);

  return (
    <button
      onClick={copy}
      title="Copy address"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        borderRadius: 10,
        border: '1px solid rgba(0,0,0,.07)',
        background: 'rgba(0,0,0,.025)',
        cursor: 'pointer',
        transition: 'all .15s',
        width: '100%',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(240,185,11,.06)';
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(240,185,11,.25)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,.025)';
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(0,0,0,.07)';
      }}
    >
      {/* Wallet dot */}
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: 'linear-gradient(135deg,#F0B90B,#f59e0b)',
        flexShrink: 0,
        boxShadow: '0 0 0 2px rgba(240,185,11,.18)',
      }} />

      {/* Address */}
      <span style={{
        fontFamily: 'monospace',
        fontSize: 11,
        fontWeight: 700,
        color: '#334155',
        letterSpacing: '.02em',
        flex: 1,
        textAlign: 'left',
      }}>
        {short}
      </span>

      {/* Copy icon / tick */}
      {copied ? (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
          stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ flexShrink: 0, animation: 'av-pop .2s ease both' }}>
          <path d="M5 13l4 4L19 7"/>
        </svg>
      ) : (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
          stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ flexShrink: 0 }}>
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
        </svg>
      )}

      {/* Copied toast */}
      {copied && (
        <span style={{
          position: 'absolute',
          right: 8,
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: 9,
          fontWeight: 800,
          color: '#16a34a',
          letterSpacing: '.1em',
          pointerEvents: 'none',
          animation: 'av-copied 1.8s ease forwards',
        }}>
          COPIED
        </span>
      )}
    </button>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
export const AccountVerification: React.FC = () => {
  const {
    isConnected, isVerified, isWrongNetwork, isPredicting,
    step, errorMsg, sessionHoursLeft, sessionMinsLeft,
    verifyAndLogin, logout, handleNetworkSwitch,
  } = useNexusAccount();

  // Get raw wallet address + wagmi disconnect
  const { address } = useAccount();
  const { disconnect } = useDisconnect();

  const [hover, setHover]           = useState(false);
  const [disconnecting, setDisconn] = useState(false);
  const [, tick]                    = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Full disconnect: clear session + wagmi disconnect
  const handleDisconnect = useCallback(async () => {
    setDisconn(true);
    try {
      await logout();       // clears nexus session / jwt
    } catch { /* ignore */ }
    disconnect();           // wagmi: clears connector state
    setDisconn(false);
  }, [logout, disconnect]);

  if (!isConnected) return null;

  const loading = !['idle','done','error'].includes(step);
  const isErr   = step === 'error';
  const curIdx  = stepIdx(step);

  // ── Wrong network ────────────────────────────────────────────────────────
  if (isWrongNetwork) return (
    <>
      <style>{CSS}</style>
      <div style={S.card('rgba(239,68,68,.18)')}>
        <TopBar color="#ef4444" moving={false} />
        <div style={S.body}>
          <div style={S.row}>
            <div style={S.orb('rgba(239,68,68,.07)','rgba(239,68,68,.2)')}>
              <span style={{ fontSize:12 }}>⚠️</span>
            </div>
            <div>
              <p style={S.h}>Wrong Network</p>
              <p style={S.p}>Switch to Ethereum Sepolia</p>
            </div>
          </div>
          <button onClick={handleNetworkSwitch} style={{
            width:'100%', padding:'10px', borderRadius:12, border:'none',
            fontWeight:800, fontSize:12, letterSpacing:'.03em',
            background:'#ef4444', color:'#fff', cursor:'pointer',
            boxShadow:'0 4px 14px rgba(239,68,68,.28)', transition:'opacity .15s',
          }}
            onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.opacity='.88'}}
            onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.opacity='1'}}
          >
            Switch Network
          </button>
        </div>
      </div>
    </>
  );

  // ── Verified / session active ────────────────────────────────────────────
  if (isVerified) return (
    <>
      <style>{CSS}</style>
      <div style={{ ...S.card('rgba(34,197,94,.18)'), animation:'av-pop .3s ease both' }}>
        <TopBar color="#22c55e" moving={false} />
        <div style={S.body}>

          {/* Status row */}
          <div style={S.row}>
            <div style={S.orb('rgba(34,197,94,.08)','rgba(34,197,94,.2)')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 13l4 4L19 7"/>
              </svg>
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <p style={S.h}>Session Active</p>
              <p style={S.p}>Expires in <Timer h={sessionHoursLeft} m={sessionMinsLeft} /></p>
            </div>
          </div>

          {/* Address copy row */}
          {address && <AddressRow address={address} />}

          {/* Thin divider */}
          <div style={{ height:1, background:'rgba(34,197,94,.1)' }} />

          {/* Pills */}
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {[['⛽','Gas-Free'],['🔑','Self-Custody'],['⚡','ERC-4337']].map(([ic, lb]) => (
              <span key={lb} style={{
                fontSize:9, fontWeight:800, letterSpacing:'.12em', textTransform:'uppercase',
                padding:'4px 9px', borderRadius:8,
                background:'rgba(34,197,94,.07)', color:'#166534',
                border:'1px solid rgba(34,197,94,.16)',
              }}>
                {ic} {lb}
              </span>
            ))}
          </div>

          {/* Disconnect button */}
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            style={{
              width: '100%',
              padding: '9px',
              borderRadius: 11,
              border: '1px solid rgba(239,68,68,.18)',
              background: disconnecting ? 'rgba(239,68,68,.04)' : 'rgba(239,68,68,.05)',
              color: '#ef4444',
              fontWeight: 800,
              fontSize: 11,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              cursor: disconnecting ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              transition: 'all .15s',
              opacity: disconnecting ? .6 : 1,
            }}
            onMouseEnter={e => {
              if (!disconnecting) {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,.1)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(239,68,68,.35)';
              }
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,.05)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(239,68,68,.18)';
            }}
          >
            {disconnecting ? (
              <Spinner c="#ef4444" />
            ) : (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            )}
            {disconnecting ? 'Disconnecting…' : 'Disconnect Wallet'}
          </button>

        </div>
      </div>
    </>
  );

  // ── Login / loading / error ──────────────────────────────────────────────
  return (
    <>
      <style>{CSS}</style>
      <div style={S.card(isErr ? 'rgba(239,68,68,.18)' : 'rgba(240,185,11,.18)')}>
        <TopBar color={isErr ? '#ef4444' : '#F0B90B'} moving={loading} />
        <div style={S.body}>

          {/* Icon + status */}
          <div style={S.row}>
            <div style={{ position:'relative', width:32, height:32, flexShrink:0,
                          display:'flex', alignItems:'center', justifyContent:'center' }}>
              {loading && (
                <span style={{
                  position:'absolute', inset:0, borderRadius:'50%',
                  border:'1.5px solid #F0B90B',
                  animation:'av-ring 1.65s ease-out infinite',
                  pointerEvents:'none',
                }}/>
              )}
              <div style={S.orb(
                isErr ? 'rgba(239,68,68,.07)' : 'rgba(240,185,11,.09)',
                isErr ? 'rgba(239,68,68,.2)'  : 'rgba(240,185,11,.24)',
              )}>
                {loading
                  ? <Spinner c="#F0B90B" />
                  : isErr
                  ? <span style={{ fontSize:11, color:'#ef4444', lineHeight:1 }}>✕</span>
                  : <span style={{ fontSize:13, color:'#F0B90B', lineHeight:1 }}>⚡</span>
                }
              </div>
            </div>

            <div style={{ flex:1, minWidth:0 }}>
              <p style={S.h}>
                {loading ? STEP_MSG[step] : isErr ? 'Auth Failed' : 'Smart Account Login'}
              </p>
              <p style={S.p}>
                {isErr && errorMsg ? errorMsg : STEP_MSG['idle']}
              </p>
            </div>
          </div>

          {/* Progress steps */}
          {loading && (
            <div style={{ display:'flex', gap:4, alignItems:'flex-start' }}>
              {STEPS.map((s, i) => {
                const si     = stepIdx(s.key);
                const done   = curIdx > si;
                const active = curIdx === si;
                return (
                  <React.Fragment key={s.key}>
                    <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                      <div style={{
                        width:'100%', height:3, borderRadius:99, transition:'background .4s',
                        background: done   ? '#F0B90B'
                                  : active ? 'rgba(240,185,11,.38)'
                                  :          'rgba(0,0,0,.06)',
                      }}/>
                      <span style={{
                        fontSize:8, fontWeight:700, letterSpacing:'.1em',
                        color: done||active ? '#92600A' : '#d1d5db',
                      }}>
                        {s.label}
                      </span>
                    </div>
                    {i < STEPS.length-1 && (
                      <div style={{ width:1, height:10, background:'rgba(0,0,0,.06)', marginTop:1, flexShrink:0 }}/>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          )}

          {/* CTA */}
          <button
            onClick={loading ? undefined : verifyAndLogin}
            disabled={loading || isPredicting}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{
              width:'100%', padding:'10px 14px', borderRadius:12,
              border: isErr   ? '1px solid rgba(239,68,68,.2)'
                    : loading ? '1px solid rgba(240,185,11,.2)'
                    : 'none',
              cursor: loading ? 'default' : 'pointer',
              fontWeight:800, fontSize:12, letterSpacing:'.03em',
              position:'relative', overflow:'hidden',
              transition:'all .17s',
              opacity: loading||isPredicting ? .6 : 1,
              background: isErr
                ? 'rgba(239,68,68,.06)'
                : loading
                ? 'rgba(240,185,11,.08)'
                : hover ? '#e0ab00' : '#F0B90B',
              color: isErr ? '#b91c1c' : loading ? '#92600A' : '#fff',
              boxShadow: !loading&&!isErr
                ? hover
                  ? '0 8px 22px rgba(240,185,11,.42)'
                  : '0 4px 14px rgba(240,185,11,.3)'
                : 'none',
              transform: !loading&&!isErr&&hover ? 'translateY(-1px)' : 'none',
            }}
          >
            {/* Shimmer on hover */}
            {hover && !loading && !isErr && (
              <span style={{
                position:'absolute', inset:0, pointerEvents:'none',
                background:'linear-gradient(105deg,transparent 40%,rgba(255,255,255,.18) 50%,transparent 60%)',
                animation:'av-shim .5s ease forwards',
              }}/>
            )}

            <span style={{ position:'relative', display:'flex', alignItems:'center', justifyContent:'center', gap:7 }}>
              {loading && <Spinner c={isErr?'#b91c1c':'#92600A'} />}
              {loading
                ? STEP_MSG[step]
                : isErr
                ? '↺  Retry'
                : <>
                    Login with Smart Account
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      style={{ transition:'transform .17s', transform: hover?'translateX(2px)':'none' }}>
                      <path d="M13 7l5 5-5 5M6 12h12"/>
                    </svg>
                  </>
              }
            </span>
          </button>

        </div>
      </div>
    </>
  );
};

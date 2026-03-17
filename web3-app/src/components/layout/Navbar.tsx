'use client';

import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';

export const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navLinks = [
    { name: 'Trade',     path: '/trade'     },
    { name: 'Vaults',    path: '/vaults'    },
    { name: 'Portfolio', path: '/portfolio' },
    { name: 'Docs',      path: '/docs'      },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=Space+Mono:wght@400;700&display=swap');

        .nav-root {
          font-family: 'Syne', sans-serif;
          transition: background 0.3s, box-shadow 0.3s, border-color 0.3s;
        }
        .nav-scrolled {
          background: rgba(250,250,245,0.96) !important;
          box-shadow: 0 1px 0 rgba(240,185,11,0.1), 0 8px 32px rgba(0,0,0,0.07) !important;
        }
        .nav-link {
          position: relative;
          font-family: 'Syne', sans-serif;
          font-weight: 700;
          transition: color 0.2s, background 0.2s;
          letter-spacing: 0.02em;
        }
        .nav-link::after {
          content: '';
          position: absolute;
          bottom: 4px;
          left: 50%;
          transform: translateX(-50%) scaleX(0);
          width: 16px;
          height: 2px;
          border-radius: 2px;
          background: #F0B90B;
          transition: transform 0.2s cubic-bezier(0.16,1,0.3,1);
        }
        .nav-link:hover::after, .nav-link-active::after {
          transform: translateX(-50%) scaleX(1);
        }
        .nav-link-active {
          color: #92600A !important;
          background: rgba(240,185,11,0.1) !important;
          border-color: rgba(240,185,11,0.22) !important;
        }

        .logo-text { font-family: 'Syne', sans-serif; font-weight: 800; letter-spacing: -0.03em; }
        .mono-text { font-family: 'Space Mono', monospace; }

        .pas-faucet-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 14px;
          border-radius: 12px;
          background: white;
          border: 1.5px solid #E5E7EB;
          font-family: 'Syne', sans-serif;
          font-size: 13px;
          font-weight: 700;
          color: #374151;
          text-decoration: none;
          transition: border-color 0.2s, background 0.2s, transform 0.2s;
          white-space: nowrap;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06);
        }
        .pas-faucet-btn:hover {
          border-color: #C9860A;
          background: #FFFBEB;
          transform: translateY(-1px);
        }

        [data-rk] button[data-testid="rk-connect-button"] {
          background: linear-gradient(135deg, #F0B90B 0%, #f59e0b 100%) !important;
          color: white !important;
          font-family: 'Syne', sans-serif !important;
          font-weight: 700 !important;
          font-size: 14px !important;
          letter-spacing: 0.02em !important;
          border-radius: 14px !important;
          padding: 10px 22px !important;
          border: none !important;
          box-shadow: 0 4px 16px rgba(240,185,11,0.38), inset 0 1px 0 rgba(255,255,255,0.2) !important;
          transition: all 0.2s cubic-bezier(0.16,1,0.3,1) !important;
        }
        [data-rk] button[data-testid="rk-connect-button"]:hover {
          transform: translateY(-2px) !important;
          box-shadow: 0 8px 24px rgba(240,185,11,0.5), inset 0 1px 0 rgba(255,255,255,0.2) !important;
        }

        .mobile-menu-enter {
          animation: slideDown 0.28s cubic-bezier(0.16,1,0.3,1) both;
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .ham-line {
          display: block;
          width: 20px;
          height: 2px;
          background: #475569;
          border-radius: 2px;
          transition: transform 0.25s, opacity 0.25s;
          transform-origin: center;
        }
        .ham-open .ham-l1 { transform: translateY(6px) rotate(45deg); }
        .ham-open .ham-l2 { opacity: 0; transform: scaleX(0); }
        .ham-open .ham-l3 { transform: translateY(-6px) rotate(-45deg); }

        .mobile-nav-item {
          font-family: 'Syne', sans-serif;
          font-weight: 700;
          transition: all 0.18s;
        }
        .mobile-nav-item:active { transform: scale(0.97); }
      `}</style>

      <nav className={`nav-root fixed top-0 w-full z-50 border-b border-[#F0B90B]/12 bg-[#FAFAF5]/88 backdrop-blur-2xl ${scrolled ? 'nav-scrolled' : ''}`}>
        <div className="max-w-[90rem] mx-auto px-4 sm:px-8 lg:px-12">
          <div className="flex justify-between items-center" style={{ height: '60px' }}>

            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5 group flex-shrink-0">
              <div className="w-8 h-8 sm:w-9 sm:h-9 bg-[#F0B90B] rounded-xl flex items-center justify-center transition-transform group-hover:scale-105"
                style={{ boxShadow: '0 2px 12px rgba(240,185,11,0.45)' }}>
                <span className="text-white font-black text-sm leading-none" style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800 }}>N</span>
              </div>
              <span className="logo-text text-lg sm:text-xl text-slate-900">
                NEXUS<span className="text-[#F0B90B]">.</span>
              </span>
            </Link>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-0.5">
              {navLinks.map((item) => {
                const active = pathname === item.path;
                return (
                  <Link key={item.name} href={item.path}
                    className={`nav-link px-4 py-2 rounded-xl text-[14px] border ${
                      active
                        ? 'nav-link-active border-[#F0B90B]/22 text-[#92600A] bg-[#F0B90B]/10'
                        : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-[#F0B90B]/05'
                    }`}>
                    {item.name}
                  </Link>
                );
              })}
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2">

              {/* PAS Faucet link — replaces Polkadot Hub badge */}
              <a
                href="https://faucet.polkadot.io/"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex pas-faucet-btn"
              >
                🔴 <span>PAS Faucet</span> <span style={{ fontSize: 11, opacity: 0.6 }}>↗</span>
              </a>

              {/* Connect — desktop */}
              <div className="hidden md:block">
                <ConnectButton label="Connect" accountStatus="avatar" chainStatus="none" />
              </div>

              {/* Hamburger — mobile */}
              <button onClick={() => setIsOpen(!isOpen)}
                className={`md:hidden p-2.5 rounded-xl bg-white border border-slate-100 shadow-sm active:scale-95 transition-all ${isOpen ? 'ham-open' : ''}`}>
                <span className="flex flex-col gap-[4px] w-5">
                  <span className="ham-line ham-l1" />
                  <span className="ham-line ham-l2" />
                  <span className="ham-line ham-l3" />
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {isOpen && (
          <div className="md:hidden mobile-menu-enter bg-[#FAFAF5]/98 border-t border-[#F0B90B]/10 backdrop-blur-3xl shadow-xl">
            <div className="max-w-[90rem] mx-auto px-4 pt-3 pb-6 flex flex-col gap-2">

              {navLinks.map((item) => {
                const active = pathname === item.path;
                return (
                  <Link key={item.name} href={item.path} onClick={() => setIsOpen(false)}
                    className={`mobile-nav-item flex items-center justify-between px-5 py-4 rounded-2xl text-[15px] border ${
                      active
                        ? 'bg-[#F0B90B]/10 text-[#92600A] border-[#F0B90B]/25'
                        : 'bg-white/80 text-slate-700 border-slate-100 hover:border-[#F0B90B]/15'
                    }`}>
                    <span>{item.name}</span>
                    {active && <span className="w-2 h-2 rounded-full bg-[#F0B90B]" />}
                  </Link>
                );
              })}

              {/* PAS Faucet in mobile menu */}
              <a
                href="https://faucet.polkadot.io/"
                target="_blank"
                rel="noopener noreferrer"
                className="mobile-nav-item flex items-center justify-between px-5 py-4 rounded-2xl text-[15px] border bg-amber-50 text-amber-800 border-amber-200"
              >
                <span>🔴 PAS Faucet</span>
                <span style={{ fontSize: 13 }}>↗</span>
              </a>

              {/* Connect button */}
              <div className="pt-2 border-t border-slate-100 flex justify-center">
                <ConnectButton label="Connect Wallet" accountStatus="full" chainStatus="none" />
              </div>
            </div>
          </div>
        )}
      </nav>
    </>
  );
};

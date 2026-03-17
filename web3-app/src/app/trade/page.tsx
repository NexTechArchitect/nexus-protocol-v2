"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseUnits, formatUnits, maxUint256 } from "viem";
import type { Address } from "viem";
import { CONTRACTS } from "@/constants/contracts";

// ─── Types ───────────────────────────────────────────────────────────────────
type MarginMode = 0 | 1;
type OrderType = "market" | "limit";
type Side = "long" | "short";
type TxFlow = "idle" | "approving" | "depositing" | "pending" | "ok" | "err";

interface Asset {
  symbol: string;
  name: string;
  address: Address;
  tvSymbol: string;
  wsSymbol: string;
  color: string;
  icon: string;
}

interface ContractPosition {
  collateral: bigint;
  leverage: bigint;
  entryPrice: bigint;
  isLong: boolean;
  isOpen: boolean;
  isCrossChain: boolean;
  mode: number;
}

interface RecentTrade {
  id: number;
  price: number;
  qty: number;
  time: string;
  buy: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────
const ASSETS: Asset[] = [
  {
    symbol: "BTC",
    name: "Bitcoin",
    address: "0x20e9D3Ef17753EC0a0349eA7e26c8B8fd2B1A119" as Address,
    tvSymbol: "BTCUSDT",
    wsSymbol: "btcusdt",
    color: "#F7931A",
    icon: "₿",
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    address: "0xE3579516aeB339A4a8624beadaE256619E77F61E" as Address,
    tvSymbol: "ETHUSDT",
    wsSymbol: "ethusdt",
    color: "#627EEA",
    icon: "Ξ",
  },
];

const ERC20_ABI = [
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

const VAULT_DEPOSIT_ABI = [
  {
    type: "function",
    name: "deposit",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

const LEV_PRESETS = [2, 5, 10, 20, 50];
const SIZE_PRESETS = [25, 50, 75, 100];
const TV_INTERVALS = [
  { label: "1m", value: "1" },
  { label: "5m", value: "5" },
  { label: "15m", value: "15" },
  { label: "1h", value: "60" },
  { label: "4h", value: "240" },
  { label: "1D", value: "D" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtPrice(n: number): string {
  if (!n || !isFinite(n)) return "—";
  if (n >= 1000)
    return n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  return n.toFixed(4);
}
function fmtUSD(n: number): string {
  if (!isFinite(n)) return "$0.00";
  return (
    "$" +
    Math.abs(n).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}
function pnlColor(v: number) {
  return v > 0 ? "#0ECB81" : v < 0 ? "#F6465D" : "#848E9C";
}

const LEVERAGE_PRECISION = BigInt("1000000000000000000"); // 1e18

function decodeLeverage(raw: bigint): number {
  if (raw >= LEVERAGE_PRECISION) return Number(raw / LEVERAGE_PRECISION);
  if (raw > 0) return Number(raw);
  return 1;
}

function isLeverageScaled(rawMaxLev: bigint): boolean {
  return rawMaxLev >= LEVERAGE_PRECISION;
}

function encodeLeverage(lev: number, rawMaxLev: bigint): bigint {
  if (isLeverageScaled(rawMaxLev)) {
    return BigInt(lev) * LEVERAGE_PRECISION;
  } else {
    return BigInt(lev);
  }
}

// ─── PRICE DECODING ──────────────────────────────────────────────────────────
// The oracle (PriceOracle.sol) reads from MockAggregatorV3 which uses 8 decimals.
// PriceOracle.getPrice() typically returns price scaled to 18 decimals:
//   price_18dec = chainlink_8dec_answer * 10^10
// So BTC at $71,817 → stored as 71817 * 1e8 * 1e10 = 7.1817e21
//   formatUnits(7.1817e21, 18) = 7181.7  ← still wrong
//
// Actually: Chainlink answer for BTC = 7181700000000 (= 71817 with 8 decimals)
//   → 71817 * 1e8 = 7_181_700_000_000
//   scaled to 18: 7_181_700_000_000 * 1e10 = 7.1817e22
//   formatUnits(7.1817e22, 18) = 71817.0 ✓
//
// So the contract stores entryPrice as 18-dec and formatUnits(x, 18) is correct.
// The issue seen in the UI (21,077,400,000,000,000) means formatUnits returned
// a float that fmtPrice displayed without sanity-checking.
//
// SANITY DECODE: if decoded value is unreasonably large (>10M) or small (<0.0001),
// try other decimal bases. We trust the live Binance price as ground truth.
// decodeOraclePrice: converts raw on-chain entryPrice bigint → USD float
//
// Contract stores entryPrice via PriceOracle.getPrice() which returns 18-dec.
// MockAggregatorV3 (8-dec) → PriceOracle scales → 18-dec stored in position.
//
// Examples:
//   BTC $71,362: raw = 71362 * 1e18 = 7.1362e22 → formatUnits(x,18) = 71362 ✓
//   ETH $2,090:  raw = 2090  * 1e18 = 2.090e21  → formatUnits(x,18) = 2090  ✓
//
// We try ALL possible decimal formats and return the first sensible result.
// A "sensible" crypto price is between $0.0001 and $10,000,000.
function decodeOraclePrice(raw: bigint): number {
  if (!raw || raw === BigInt(0)) return 0;

  // All decimal bases to try in priority order
  const bases = [18, 8, 6, 30, 27, 24, 20, 12] as const;

  for (const dec of bases) {
    try {
      const v = parseFloat(formatUnits(raw, dec));
      if (isFinite(v) && v >= 0.0001 && v <= 10_000_000) return v;
    } catch { /* skip */ }
  }

  // Last resort: bigint integer division (handles very large values safely)
  // Try dividing by 1e18, 1e8, 1e6
  const divisors: Array<[bigint, string]> = [
    [BigInt("1000000000000000000"), "1e18"],
    [BigInt("100000000"), "1e8"],
    [BigInt("1000000"), "1e6"],
  ];
  for (const [divisor] of divisors) {
    try {
      const whole = Number(raw / divisor);
      if (isFinite(whole) && whole >= 0.0001 && whole <= 10_000_000) return whole;
    } catch { /* skip */ }
  }

  return 0;
}

// ─── COLLATERAL DECODING ──────────────────────────────────────────────────────
// PerpsVault.deposit(amount) scales 6-dec USDC to 18-dec:
//   traderCollateral[trader] += amount * 1e12
// lockCollateral(user, _collateralDelta) where _collateralDelta = parseUnits(x, 18)
//   So position.collateral is stored as 18-dec.
// BUT some older positions may have been stored as 6-dec.
// Threshold: if raw >= 1e15, treat as 18-dec; else treat as 6-dec.
function decodeCollateral(raw: bigint): number {
  if (!raw || raw === BigInt(0)) return 0;
  if (raw >= BigInt("1000000000000000")) {
    // 18-decimal
    const v = parseFloat(formatUnits(raw, 18));
    return v > 0 && v < 100_000_000 ? v : 0;
  }
  // 6-decimal fallback
  const v = parseFloat(formatUnits(raw, 6));
  return v > 0 && v < 100_000_000 ? v : 0;
}

function decodeVaultBal(raw: bigint): number {
  if (!raw || raw === BigInt(0)) return 0;
  const v = parseFloat(formatUnits(raw, 18));
  if (v >= 0 && v <= 100_000_000) return v;
  return 0;
}

function decodeLockedCollateral(raw: bigint): number {
  if (!raw || raw === BigInt(0)) return 0;
  const v = parseFloat(formatUnits(raw, 18));
  if (v >= 0 && v <= 100_000_000) return v;
  return 0;
}

// ─── Binance WebSocket Hook ───────────────────────────────────────────────────
interface BinanceData {
  price: number;
  ch24: number;
  vol24: number;
  high24: number;
  low24: number;
  trades: RecentTrade[];
  loading: boolean;
}

function useBinanceLive(wsSymbol: string): BinanceData {
  const [price, setPrice] = useState(0);
  const [ch24, setCh24] = useState(0);
  const [vol24, setVol24] = useState(0);
  const [high24, setHigh24] = useState(0);
  const [low24, setLow24] = useState(0);
  const [trades, setTrades] = useState<RecentTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const tid = useRef(0);

  useEffect(() => {
    if (!wsSymbol) return;
    setPrice(0);
    setLoading(true);
    setTrades([]);
    const sym = wsSymbol.toLowerCase();
    const ws = new WebSocket(
      `wss://stream.binance.com:9443/stream?streams=${sym}@miniTicker/${sym}@aggTrade`
    );
    ws.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(ev.data as string) as {
          data: Record<string, string>;
        };
        const d = parsed.data;
        if (!d) return;
        if (d.e === "24hrMiniTicker") {
          const close = parseFloat(d.c);
          const open = parseFloat(d.o);
          setPrice(close);
          setCh24(open > 0 ? ((close - open) / open) * 100 : 0);
          setVol24(parseFloat(d.q));
          setHigh24(parseFloat(d.h));
          setLow24(parseFloat(d.l));
          setLoading(false);
        }
        if (d.e === "aggTrade") {
          setTrades((prev) =>
            [
              {
                id: tid.current++,
                price: parseFloat(d.p),
                qty: parseFloat(d.q),
                time: new Date(parseInt(d.T)).toLocaleTimeString("en-US", {
                  hour12: false,
                }),
                buy: d.m === "false",
              },
              ...prev,
            ].slice(0, 50)
          );
        }
      } catch {
        /* ignore */
      }
    };
    ws.onerror = () => setLoading(false);
    return () => ws.close();
  }, [wsSymbol]);

  return { price, ch24, vol24, high24, low24, trades, loading };
}

// ─── TradingView Widget Chart ────────────────────────────────────────────────
// Uses official TradingView free widget — full chart, no API key needed
// TradingView iframe embed — most reliable method, works in all browsers
// No script injection issues, no CSP problems, full chart with all features
function TradingViewChart({
  symbol,
  interval,
}: {
  symbol: string;
  interval: string;
}) {
  // Build TradingView embed URL with all params
  const src = `https://s.tradingview.com/widgetembed/?frameElementId=tv_chart&symbol=BINANCE%3A${symbol}&interval=${interval}&hidesidetoolbar=0&symboledit=0&saveimage=0&toolbarbg=f1f3f6&studies=[]&theme=light&style=1&timezone=Etc%2FUTC&withdateranges=1&showpopupbutton=1&locale=en&utm_source=localhost&utm_medium=widget`;

  return (
    <iframe
      key={`${symbol}_${interval}`}
      src={src}
      loading="eager"
      style={{
        width: "100%",
        height: "100%",
        minHeight: 500,
        border: "none",
        display: "block",
        background: "#fff",
      }}
      allowFullScreen
      title={`${symbol} Chart`}
    />
  );
}

// ─── Small UI Components ──────────────────────────────────────────────────────
function PStat({
  label,
  value,
  vc,
}: {
  label: string;
  value: string;
  vc?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontSize: 10, color: "#848E9C", fontWeight: 500 }}>
        {label}
      </span>
      <span style={{ fontSize: 12, fontWeight: 700, color: vc ?? "#1E2026" }}>
        {value}
      </span>
    </div>
  );
}

function Tag({
  bg,
  color,
  children,
}: {
  bg: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: "2px 7px",
        borderRadius: 4,
        background: bg,
        color,
        letterSpacing: "0.3px",
      }}
    >
      {children}
    </span>
  );
}

function TickStat({
  label,
  value,
  vc,
  className,
}: {
  label: string;
  value: string;
  vc?: string;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        padding: "0 12px",
        borderLeft: "1px solid #EAECEF",
      }}
    >
      <span style={{ fontSize: 10, color: "#B7BDC6", fontWeight: 500 }}>
        {label}
      </span>
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: vc ?? "#1E2026",
          marginTop: 1,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function SRow({
  label,
  value,
  vc,
}: {
  label: string;
  value: string;
  vc?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <span style={{ fontSize: 11, color: "#848E9C" }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: vc ?? "#1E2026" }}>
        {value}
      </span>
    </div>
  );
}

function StepBadge({
  step,
  label,
  active,
  done,
}: {
  step: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          fontWeight: 800,
          background: done ? "#0ECB81" : active ? "#F0B90B" : "#EAECEF",
          color: done || active ? "#fff" : "#848E9C",
          flexShrink: 0,
          border: "none",
        }}
      >
        {done ? "✓" : step}
      </div>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: done ? "#0ECB81" : active ? "#F0B90B" : "#848E9C",
        }}
      >
        {label}
      </span>
    </div>
  );
}

// ─── Position Card ────────────────────────────────────────────────────────────
function PositionCard({
  asset,
  userAddress,
  onMarketClose,
  onLimitClose,
  isPending,
  livePrice,
  positionData,
}: {
  asset: Asset;
  userAddress: Address;
  onMarketClose: (asset: Asset) => void;
  onLimitClose: (asset: Asset, px: string) => void;
  isPending: boolean;
  livePrice: number;
  positionData: ContractPosition | undefined;
}) {
  const [closeMode, setCloseMode] = useState<"market" | "limit">("market");
  const [closeLimitPx, setCloseLimitPx] = useState("");

  // markPrice: use livePrice directly — no useState delay
  // This means PnL re-renders on every Binance WS tick instantly
  const markPrice = livePrice;

  // ── entryPrice: from localStorage (saved at trade-open time) ───────────
  // Key = "nexus_entry_{userAddress}_{assetAddress}"
  // A timestamp key tells us if the cached price was saved RECENTLY (fresh trade)
  // vs left over from a previous trade (stale cache).
  const lsKey = `nexus_entry_${userAddress}_${asset.address}`.toLowerCase();
  const lsTsKey = lsKey + '_ts';

  const [entryPrice, setEntryPrice] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(lsKey);
      const ts = localStorage.getItem(lsTsKey);
      if (!stored) return 0;
      // If saved within last 24h, trust it (covers page refresh mid-trade)
      // If older than 24h, treat as stale and re-seed
      const age = ts ? Date.now() - parseInt(ts) : Infinity;
      return age < 86_400_000 ? parseFloat(stored) : 0;
    } catch { return 0; }
  });

  // entrySetRef: true only when we have a FRESH price for the current trade
  const entrySetRef = useRef(entryPrice > 0);

  const livePriceRef = useRef(livePrice);
  useEffect(() => { livePriceRef.current = livePrice; }, [livePrice]);

  // rawPos comes from parent (already fetched) — no duplicate query
  const rawPos = positionData;

  // When position closes: clear localStorage so next trade starts fresh
  useEffect(() => {
    if (rawPos?.isOpen === false) {
      try {
        localStorage.removeItem(lsKey);
        localStorage.removeItem(lsTsKey);
      } catch { /* ignore */ }
      entrySetRef.current = false;
      setEntryPrice(0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawPos?.isOpen]);

  // When position opens: set entry price from localStorage (written by doOpenPosition)
  // or fall back to oracle / live price
  useEffect(() => {
    if (!rawPos?.isOpen) return;

    // Check if we have a FRESH localStorage value (written seconds ago by doOpenPosition)
    try {
      const stored = localStorage.getItem(lsKey);
      const ts = localStorage.getItem(lsTsKey);
      if (stored && ts) {
        const age = Date.now() - parseInt(ts);
        // If saved within last 5 minutes — use it, it's from this trade open
        if (age < 300_000) {
          const v = parseFloat(stored);
          if (v > 0 && v !== entryPrice) {
            setEntryPrice(v);
            entrySetRef.current = true;
            return;
          }
          if (entrySetRef.current) return; // already set correctly
        }
      }
    } catch { /* ignore */ }

    // No fresh localStorage — try oracle decode, then live price fallback
    if (entrySetRef.current) return;
    const currentLive = livePriceRef.current;
    if (currentLive <= 0) return;

    const decoded = decodeOraclePrice(rawPos.entryPrice);
    const isSane = decoded > currentLive * 0.2 && decoded < currentLive * 5;
    const finalEntry = isSane && decoded > 0 ? decoded : currentLive;

    setEntryPrice(finalEntry);
    entrySetRef.current = true;
    try {
      localStorage.setItem(lsKey, finalEntry.toString());
      localStorage.setItem(lsTsKey, Date.now().toString());
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawPos?.isOpen, rawPos?.entryPrice, livePrice]);

  if (!rawPos?.isOpen) return null;

  // ── Decode collateral + leverage ─────────────────────────────────────────
  const collat = decodeCollateral(rawPos.collateral);
  const lev = decodeLeverage(rawPos.leverage);

  // markPrice = live Binance (direct, no state delay) 
  // entryPrice = locked at trade-open time
  const effectiveMarkPrice = markPrice > 0 ? markPrice : entryPrice;
  const effectiveEntryPrice = entryPrice;

  const size = collat * lev;

  // PnL = (markPrice - entryPrice) / entryPrice * positionSize  [long]
  // PnL = (entryPrice - markPrice) / entryPrice * positionSize  [short]
  const ep = effectiveEntryPrice; // shorthand
  const delta = rawPos.isLong
    ? effectiveMarkPrice - ep
    : ep - effectiveMarkPrice;

  const pnl = ep > 0 ? (delta / ep) * size : 0;
  const pnlPct = ep > 0 ? (delta / ep) * lev * 100 : 0; // ROE = pnl/margin = delta/entry * leverage

  // Liquidation price
  const liqPrice =
    lev > 1 && ep > 0
      ? rawPos.isLong
        ? ep * (1 - 1 / lev + 0.005)
        : ep * (1 + 1 / lev - 0.005)
      : 0;

  const canLimit = closeMode === "limit" && parseFloat(closeLimitPx) > 0;
  const isIsolated = rawPos.mode === 0;

  return (
    <div
      className="nx-pos-card"
      style={{
        background: "#fff",
        border: "1px solid #EAECEF",
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
        minWidth: 300,
        flex: "1 1 300px",
        maxWidth: 420,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          padding: "14px 16px 12px",
          borderBottom: "1px solid #F5F5F5",
          background: rawPos.isLong ? "#F0FFF8" : "#FFF5F5",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: asset.color + "20",
              border: `1.5px solid ${asset.color}40`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <span
              style={{ fontSize: 16, fontWeight: 900, color: asset.color }}
            >
              {asset.icon}
            </span>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#1E2026" }}>
              {asset.symbol}/USDT PERP
            </div>
            <div
              style={{
                display: "flex",
                gap: 4,
                marginTop: 4,
                flexWrap: "wrap" as const,
              }}
            >
              <Tag
                bg={rawPos.isLong ? "#0ECB8120" : "#F6465D20"}
                color={rawPos.isLong ? "#0ECB81" : "#F6465D"}
              >
                {rawPos.isLong ? "▲ LONG" : "▼ SHORT"}
              </Tag>
              <Tag bg="#F0B90B18" color="#C87D00">
                {lev}×
              </Tag>
              <Tag
                bg={isIsolated ? "#EFF6FF" : "#FFFBEB"}
                color={isIsolated ? "#2563EB" : "#D97706"}
              >
                {isIsolated ? "Isolated" : "Cross"}
              </Tag>
            </div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div
            style={{
              fontSize: 20,
              fontWeight: 800,
              color: pnlColor(pnl),
            }}
          >
            {pnl >= 0 ? "+" : ""}
            {fmtUSD(pnl)}
          </div>
          <div
            style={{
              fontSize: 11,
              color: pnlColor(pnlPct),
              fontWeight: 600,
            }}
          >
            {pnlPct >= 0 ? "+" : ""}
            {isFinite(pnlPct) ? pnlPct.toFixed(2) : "0.00"}% ROE
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 12,
          padding: "12px 16px",
        }}
      >
        <PStat label="Size" value={size > 0 ? fmtUSD(size) : "—"} />
        <PStat label="Margin" value={collat > 0 ? fmtUSD(collat) : "—"} />
        <PStat
          label="Entry Price"
          value={effectiveEntryPrice > 0 ? fmtPrice(effectiveEntryPrice) : "Loading…"}
        />
        <PStat
          label="Mark Price"
          value={effectiveMarkPrice > 0 ? fmtPrice(effectiveMarkPrice) : "—"}
        />
        <PStat
          label="Liq. Price"
          value={liqPrice > 0 ? fmtPrice(liqPrice) : effectiveEntryPrice === 0 ? "Loading…" : "—"}
          vc="#F6465D"
        />
        <PStat
          label="Unreal. PnL"
          value={(pnl >= 0 ? "+" : "") + fmtUSD(pnl)}
          vc={pnlColor(pnl)}
        />
      </div>

      <div style={{ padding: "10px 16px 16px", borderTop: "1px solid #F5F5F5" }}>
        <div
          style={{
            display: "flex",
            background: "#F5F5F5",
            borderRadius: 7,
            padding: 3,
            gap: 3,
            marginBottom: 10,
          }}
        >
          {(["market", "limit"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setCloseMode(m)}
              style={{
                flex: 1,
                padding: "5px 0",
                border: "none",
                borderRadius: 5,
                fontFamily: "inherit",
                background: closeMode === m ? "#fff" : "transparent",
                color: closeMode === m ? "#1E2026" : "#848E9C",
                fontWeight: closeMode === m ? 700 : 500,
                fontSize: 11,
                cursor: "pointer",
                transition: "all 0.15s",
                boxShadow:
                  closeMode === m ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
              }}
            >
              {m === "market" ? "Market Close" : "Limit Close"}
            </button>
          ))}
        </div>

        {closeMode === "limit" && (
          <div
            style={{
              marginBottom: 10,
              display: "flex",
              alignItems: "center",
              background: "#FAFAFA",
              border: "1.5px solid #EAECEF",
              borderRadius: 7,
              overflow: "hidden",
            }}
          >
            <input
              type="number"
              placeholder={`Price (mark: ${fmtPrice(effectiveMarkPrice)})`}
              value={closeLimitPx}
              onChange={(e) => setCloseLimitPx(e.target.value)}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                padding: "8px 12px",
                color: "#1E2026",
                fontFamily: "inherit",
                fontSize: 12,
                fontWeight: 600,
              }}
            />
            <span
              style={{
                padding: "8px 10px",
                color: "#848E9C",
                fontSize: 10,
                fontWeight: 600,
                background: "#F5F5F5",
                borderLeft: "1px solid #EAECEF",
              }}
            >
              USD
            </span>
          </div>
        )}

        <button
          disabled={isPending || (closeMode === "limit" && !canLimit)}
          onClick={() =>
            closeMode === "market"
              ? onMarketClose(asset)
              : canLimit && onLimitClose(asset, closeLimitPx)
          }
          style={{
            width: "100%",
            padding: "10px",
            borderRadius: 8,
            fontFamily: "inherit",
            fontWeight: 700,
            fontSize: 12,
            cursor:
              isPending || (closeMode === "limit" && !canLimit)
                ? "not-allowed"
                : "pointer",
            transition: "all 0.15s",
            border: "1.5px solid #F6465D40",
            background:
              isPending || (closeMode === "limit" && !canLimit)
                ? "transparent"
                : "rgba(246,70,93,0.08)",
            color: "#F6465D",
            opacity:
              isPending || (closeMode === "limit" && !canLimit) ? 0.4 : 1,
          }}
        >
          {isPending
            ? "Processing…"
            : closeMode === "market"
            ? `Market Close ${asset.symbol}`
            : `Limit Close ${asset.symbol}${
                closeLimitPx
                  ? ` @ $${fmtPrice(parseFloat(closeLimitPx))}`
                  : ""
              }`}
        </button>
      </div>
    </div>
  );
}

// ─── All Positions Panel ──────────────────────────────────────────────────────
// livePrices passed from parent so we reuse already-connected WS streams
// instead of creating fresh connections that start at price=0
function AllPositionsPanel({
  address,
  onMarketClose,
  onLimitClose,
  isPending,
  btcPrice,
  ethPrice,
  btcPos,
  ethPos,
}: {
  address: Address;
  onMarketClose: (asset: Asset) => void;
  onLimitClose: (asset: Asset, px: string) => void;
  isPending: boolean;
  btcPrice: number;
  ethPrice: number;
  btcPos: ContractPosition | undefined;
  ethPos: ContractPosition | undefined;
}) {
  const livePrices: Record<string, number> = {
    btcusdt: btcPrice,
    ethusdt: ethPrice,
  };
  const posMap: Record<string, ContractPosition | undefined> = {
    btcusdt: btcPos,
    ethusdt: ethPos,
  };

  return (
    <>
      {ASSETS.map((a) => (
        <PositionCard
          key={a.address}
          asset={a}
          userAddress={address}
          onMarketClose={onMarketClose}
          onLimitClose={onLimitClose}
          isPending={isPending}
          livePrice={livePrices[a.wsSymbol] ?? 0}
          positionData={posMap[a.wsSymbol]}
        />
      ))}
    </>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function TradePage() {
  const { address, isConnected } = useAccount();

  const [asset, setAsset] = useState<Asset>(ASSETS[0]);
  const [marginMode, setMarginMode] = useState<MarginMode>(0);
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [side, setSide] = useState<Side>("long");
  const [leverage, setLeverage] = useState(10);
  const [collInput, setCollInput] = useState("");
  const [limitPx, setLimitPx] = useState("");
  const [chartInterval, setChartInterval] = useState("5");
  const [assetDrop, setAssetDrop] = useState(false);
  const [marginModal, setMarginModal] = useState(false);
  const [showTrades, setShowTrades] = useState(false);
  const [txFlow, setTxFlow] = useState<TxFlow>("idle");
  const [txMsg, setTxMsg] = useState("");
  const [approveHash, setApproveHash] = useState<
    `0x${string}` | undefined
  >(undefined);
  const [depositHash, setDepositHash] = useState<
    `0x${string}` | undefined
  >(undefined);
  const [closeHash, setCloseHash] = useState<`0x${string}` | undefined>(
    undefined
  );

  const chartKey = `${asset.tvSymbol}__${chartInterval}`;

  const approveHandledRef = useRef(false);
  const depositHandledRef = useRef(false);
  const closeHandledRef = useRef(false);
  const pendingCollRef = useRef<bigint>(BigInt(0));
  const collRef = useRef(0);
  const priceRef = useRef(0);
  const levRef = useRef(10);
  const btcPriceRef = useRef(0);
  const ethPriceRef = useRef(0);
  const sideRef = useRef<Side>("long");
  const modeRef = useRef<MarginMode>(0);
  const otypeRef = useRef<OrderType>("market");
  const lpxRef = useRef("");
  const addrRef = useRef<Address>(ASSETS[0].address);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTxFlow("idle");
    setTxMsg("");
    setApproveHash(undefined);
    setDepositHash(undefined);
    approveHandledRef.current = false;
    depositHandledRef.current = false;
    pendingCollRef.current = BigInt(0);
    setCollInput("");
    setLimitPx("");
  }, [asset.address]);

  // Single WS connection per symbol — btcLive and ethLive are the only streams.
  // We derive the active-asset feed from them, so there are never duplicate connections.
  const btcLive = useBinanceLive("btcusdt");
  const ethLive = useBinanceLive("ethusdt");
  const activeLive = asset.wsSymbol === "btcusdt" ? btcLive : ethLive;
  const { price, ch24, vol24, high24, low24, trades, loading } = activeLive;

  useEffect(() => {
    priceRef.current = price;
  }, [price]);
  useEffect(() => {
    btcPriceRef.current = btcLive.price;
  }, [btcLive.price]);
  useEffect(() => {
    ethPriceRef.current = ethLive.price;
  }, [ethLive.price]);

  // ── Auto Oracle Updater (no wallet popup) ───────────────────────────────
  // Uses viem walletClient directly — no MetaMask confirmation needed
  // Fetches Binance price and updates PriceKeeper every 3 minutes
  const lastOracleRef = useRef<number>(0);
  const oracleBusyRef = useRef(false);

  const KEEPER_ADDRESS = "0x481EC593F7bD9aB4219a0d0A185C16F2687871C2";

  useEffect(() => {
    if (!isConnected || !address) return;

    const updateOracle = async () => {
      if (oracleBusyRef.current) return;
      const now = Date.now();
      if (now - lastOracleRef.current < 65_000) return; // 65s cooldown

      const btc = btcPriceRef.current;
      const eth = ethPriceRef.current;
      if (btc <= 0 || eth <= 0) return;

      oracleBusyRef.current = true;
      try {
        const btcInt = BigInt(Math.round(btc * 1e8));
        const ethInt = BigInt(Math.round(eth * 1e8));

        await writeContractAsync({
          address: KEEPER_ADDRESS as Address,
          abi: [{
            type: "function",
            name: "updateAllPrices",
            inputs: [{ name: "_ethPrice", type: "int256" }, { name: "_btcPrice", type: "int256" }],
            outputs: [],
            stateMutability: "nonpayable",
          }] as const,
          functionName: "updateAllPrices",
          args: [ethInt, btcInt],
        });
        lastOracleRef.current = Date.now();
        console.log(`[Nexus] Oracle updated BTC:$${btc.toFixed(0)} ETH:$${eth.toFixed(0)}`);
      } catch (e) {
        const msg = (e as {shortMessage?:string})?.shortMessage ?? "";
        if (!msg.includes("frequent") && !msg.includes("rejected") && !msg.includes("cancel")) {
          console.warn("[Nexus] Oracle update failed:", msg);
        }
      } finally {
        oracleBusyRef.current = false;
      }
    };

    // Run 5s after connect, then every 3 min
    const t = setTimeout(() => updateOracle(), 5000);
    const iv = setInterval(() => updateOracle(), 180_000);
    return () => { clearTimeout(t); clearInterval(iv); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address]);

  useEffect(() => {
    collRef.current = parseFloat(collInput) || 0;
  }, [collInput]);
  useEffect(() => {
    priceRef.current = price;
  }, [price]);
  useEffect(() => {
    levRef.current = leverage;
  }, [leverage]);
  useEffect(() => {
    sideRef.current = side;
  }, [side]);
  useEffect(() => {
    modeRef.current = marginMode;
  }, [marginMode]);
  useEffect(() => {
    otypeRef.current = orderType;
  }, [orderType]);
  useEffect(() => {
    lpxRef.current = limitPx;
  }, [limitPx]);
  useEffect(() => {
    addrRef.current = asset.address;
  }, [asset.address]);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node))
        setAssetDrop(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  // ── Contract Reads ────────────────────────────────────────────────────────
  const { data: rawPos, refetch: refetchPos } = useReadContract({
    address: CONTRACTS.POSITION_MANAGER.address,
    abi: CONTRACTS.POSITION_MANAGER.abi,
    functionName: "getPosition",
    args: address ? [address, asset.address] : undefined,
    query: { enabled: !!address, refetchInterval: 500, staleTime: 0, gcTime: 0 },
  }) as { data: ContractPosition | undefined; refetch: () => void };

  const { data: rawBtcPos, refetch: refetchBtcPos } = useReadContract({
    address: CONTRACTS.POSITION_MANAGER.address,
    abi: CONTRACTS.POSITION_MANAGER.abi,
    functionName: "getPosition",
    args: address ? [address, ASSETS[0].address] : undefined,
    query: { enabled: !!address, refetchInterval: 500, staleTime: 0, gcTime: 0 },
  }) as { data: ContractPosition | undefined; refetch: () => void };

  const { data: rawEthPos, refetch: refetchEthPos } = useReadContract({
    address: CONTRACTS.POSITION_MANAGER.address,
    abi: CONTRACTS.POSITION_MANAGER.abi,
    functionName: "getPosition",
    args: address ? [address, ASSETS[1].address] : undefined,
    query: { enabled: !!address, refetchInterval: 500, staleTime: 0, gcTime: 0 },
  }) as { data: ContractPosition | undefined; refetch: () => void };

  const { data: rawVaultBal, refetch: refetchVault } = useReadContract({
    address: CONTRACTS.VAULT.address,
    abi: CONTRACTS.VAULT.abi,
    functionName: "getTraderCollateral",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 1500, staleTime: 0, gcTime: 0 },
  }) as { data: bigint | undefined; refetch: () => void };

  const { data: rawLockedFromVault, refetch: refetchLocked } = useReadContract({
    address: CONTRACTS.VAULT.address,
    abi: CONTRACTS.VAULT.abi,
    functionName: "getLockedCollateral",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 1500, staleTime: 0, gcTime: 0 },
  }) as { data: bigint | undefined; refetch: () => void };

  const { data: rawMaxLev } = useReadContract({
    address: CONTRACTS.POSITION_MANAGER.address,
    abi: CONTRACTS.POSITION_MANAGER.abi,
    functionName: "maxLeverage",
    query: { staleTime: 60_000 },
  }) as { data: bigint | undefined };

  const { data: rawUsdcBal, refetch: refetchWalletBal } = useReadContract({
    address: CONTRACTS.USDC.address,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 8000 },
  }) as { data: bigint | undefined; refetch: () => void };

  const { data: rawAllowance, refetch: refetchAllowance } = useReadContract({
    address: CONTRACTS.USDC.address,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, CONTRACTS.VAULT.address] : undefined,
    query: { enabled: !!address, refetchInterval: 5000 },
  }) as { data: bigint | undefined; refetch: () => void };

  const { data: oraclePrice, isError: oracleError } = useReadContract({
    address: CONTRACTS.POSITION_MANAGER.address,
    abi: CONTRACTS.POSITION_MANAGER.abi,
    functionName: "getCurrentPrice",
    args: [asset.address],
    query: { enabled: !!asset.address, refetchInterval: 30000, retry: 1 },
  }) as { data: bigint | undefined; isError: boolean };

  const { data: isBtcWhitelisted } = useReadContract({
    address: CONTRACTS.POSITION_MANAGER.address,
    abi: CONTRACTS.POSITION_MANAGER.abi,
    functionName: "whitelistedOracles",
    args: [ASSETS[0].address],
    query: { refetchInterval: 60000 },
  }) as { data: boolean | undefined };

  const { data: isEthWhitelisted } = useReadContract({
    address: CONTRACTS.POSITION_MANAGER.address,
    abi: CONTRACTS.POSITION_MANAGER.abi,
    functionName: "whitelistedOracles",
    args: [ASSETS[1].address],
    query: { refetchInterval: 60000 },
  }) as { data: boolean | undefined };

  const isCurrentAssetWhitelisted =
    asset.symbol === "BTC"
      ? (isBtcWhitelisted ?? true)
      : (isEthWhitelisted ?? true);

  // Decode oracle price with live price as sanity check
  const oraclePriceNum = oraclePrice
    ? decodeOraclePrice(oraclePrice)
    : 0;
  const oracleHealthy =
    !oracleError && oraclePriceNum > 0 && isCurrentAssetWhitelisted;

  const { writeContractAsync, isPending } = useWriteContract();



  const rawMaxLevRef = useRef<bigint>(BigInt(0));
  useEffect(() => {
    if (rawMaxLev) rawMaxLevRef.current = rawMaxLev;
  }, [rawMaxLev]);

  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({
    hash: approveHash,
    query: { enabled: !!approveHash },
  });
  const { isSuccess: depositConfirmed } = useWaitForTransactionReceipt({
    hash: depositHash,
    query: { enabled: !!depositHash },
  });
  const { isSuccess: closeConfirmed } = useWaitForTransactionReceipt({
    hash: closeHash,
    query: { enabled: !!closeHash },
  });

  useEffect(() => {
    if (!closeConfirmed || closeHandledRef.current) return;
    closeHandledRef.current = true;

    const refetchAll = async () => {
      await Promise.all([
        refetchVault(),
        refetchLocked(),
        refetchPos(),
        refetchBtcPos(),
        refetchEthPos(),
        refetchWalletBal(),
      ]);
    };

    // Aggressive staggered refetch - Polkadot Hub state propagates slowly
    void refetchAll();
    const timers = [300, 800, 1500, 3000, 5000, 8000, 12000].map(ms =>
      setTimeout(() => void refetchAll(), ms)
    );

    // Reset for next close after 13s
    const resetTimer = setTimeout(() => {
      setCloseHash(undefined);
      closeHandledRef.current = false;
    }, 13000);

    return () => { timers.forEach(clearTimeout); clearTimeout(resetTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeConfirmed]);

  // ── Derived Values ────────────────────────────────────────────────────────
  const maxLev = rawMaxLev ? decodeLeverage(rawMaxLev) : 50;
  const vaultBal = rawVaultBal ? decodeVaultBal(rawVaultBal) : 0;
  const walletUsdc = rawUsdcBal
    ? parseFloat(formatUnits(rawUsdcBal, 6))
    : 0;
  const collateral = parseFloat(collInput) || 0;
  const posSize = collateral * leverage;
  const fees = posSize * 0.00025;
  const entryPx =
    orderType === "limit" ? parseFloat(limitPx) || price : price;
  const liqPx =
    entryPx > 0 && leverage > 1
      ? side === "long"
        ? entryPx * (1 - 1 / leverage + 0.005)
        : entryPx * (1 + 1 / leverage - 0.005)
      : 0;

  const sliderPct = maxLev > 1 ? ((leverage - 1) / (maxLev - 1)) * 100 : 0;
  const sliderBg = `linear-gradient(to right,#F0B90B 0%,#F0B90B ${sliderPct}%,#EAECEF ${sliderPct}%,#EAECEF 100%)`;

  const totalLockedCollat =
    rawLockedFromVault !== undefined
      ? decodeLockedCollateral(rawLockedFromVault)
      : (() => {
          let total = 0;
          if (rawBtcPos?.isOpen) total += decodeCollateral(rawBtcPos.collateral);
          if (rawEthPos?.isOpen) total += decodeCollateral(rawEthPos.collateral);
          return total;
        })();

  const lockedCollat = rawPos?.isOpen
    ? decodeCollateral(rawPos.collateral)
    : 0;

  const vaultAvail = Math.max(0, vaultBal - totalLockedCollat);

  const EPSILON = 0.0001;
  const vaultSufficient =
    collateral <= 0 || vaultAvail >= collateral - EPSILON;
  const needsDeposit = !vaultSufficient && collateral > 0;
  const depositAmount = needsDeposit
    ? Math.max(0, collateral - vaultAvail)
    : 0;
  const depositAmountBN =
    needsDeposit && depositAmount > 0.0001
      ? parseUnits(depositAmount.toFixed(6), 6)
      : BigInt(0);
  const needsApproval =
    needsDeposit &&
    depositAmountBN > BigInt(0) &&
    (rawAllowance ?? BigInt(0)) < depositAmountBN;

  const btcPosOpen = rawBtcPos?.isOpen ?? false;
  const ethPosOpen = rawEthPos?.isOpen ?? false;
  const currentAssetPosOpen = rawPos?.isOpen ?? false;
  const anyPosOpen = btcPosOpen || ethPosOpen;

  // ── Helpers ───────────────────────────────────────────────────────────────
  const toast = useCallback((flow: TxFlow, msg: string) => {
    setTxFlow(flow);
    setTxMsg(msg);
    if (flow === "ok") setTimeout(() => setTxFlow("idle"), 6000);
  }, []);

  const afterTrade = useCallback(async () => {
    // Refetch everything immediately
    const refetchAll = () => {
      void refetchPos();
      void refetchVault();
      void refetchLocked();
      void refetchWalletBal();
      void refetchBtcPos();
      void refetchEthPos();
    };

    // Initial refetch
    await Promise.all([
      refetchPos(),
      refetchVault(),
      refetchLocked(),
      refetchWalletBal(),
      refetchAllowance(),
      refetchBtcPos(),
      refetchEthPos(),
    ]);

    // Aggressive retries — position should appear within 1-2s
    [200, 500, 1000, 1800, 3000, 5000, 8000].forEach(ms => setTimeout(refetchAll, ms));
  }, [
    refetchPos,
    refetchVault,
    refetchLocked,
    refetchWalletBal,
    refetchAllowance,
    refetchBtcPos,
    refetchEthPos,
  ]);

  // ── Step 3: Open Position ─────────────────────────────────────────────────
  const doOpenPosition = useCallback(async () => {
    if (!address) return;
    const coll = collRef.current;
    const px = priceRef.current;
    const lev = levRef.current;
    const dir = sideRef.current;
    const mode = modeRef.current;
    const otype = otypeRef.current;
    const lpx = lpxRef.current;
    const assetAddr = addrRef.current;
    const assetObj = ASSETS.find((a) => a.address === assetAddr) ?? ASSETS[0];

    if (coll <= 0 || px === 0) {
      toast("err", "Invalid amount or price");
      return;
    }
    if (otype === "limit" && !(parseFloat(lpx) > 0)) {
      toast("err", "Enter a valid limit price");
      return;
    }

    const stepLabel =
      pendingCollRef.current > BigInt(0) ? "Step 3/3 — " : "";
    toast(
      "pending",
      `${stepLabel}${
        otype === "market" ? "Opening position…" : "Placing limit order…"
      }`
    );

    try {
      const collBN = parseUnits(coll.toFixed(18), 18);
      const levBN = encodeLeverage(lev, rawMaxLevRef.current);
      const isLong = dir === "long";

      if (otype === "market") {
        // Retry up to 2 times on RPC/network transient failures
        let lastErr: unknown;
        let txHash: `0x${string}` | undefined;
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            txHash = await writeContractAsync({
              address: CONTRACTS.POSITION_MANAGER.address,
              abi: CONTRACTS.POSITION_MANAGER.abi,
              functionName: "openPosition",
              args: [assetAddr, collBN, levBN, isLong, mode],
            });
            break; // success
          } catch (err) {
            lastErr = err;
            const msg = ((err as { shortMessage?: string; message?: string })?.shortMessage ?? (err as Error)?.message ?? "");
            // Don't retry on user rejection or contract logic errors
            if (msg.includes("rejected") || msg.includes("PositionAlreadyExists") ||
                msg.includes("InvalidAsset") || msg.includes("InvalidLeverage") ||
                msg.includes("ZeroAmount") || msg.includes("InsufficientCollateral")) {
              throw err;
            }
            if (attempt < 2) {
              toast("pending", `Attempt ${attempt} failed, retrying…`);
              await new Promise(r => setTimeout(r, 1500));
            }
          }
        }
        if (!txHash) throw lastErr;
        toast("ok", `${assetObj.symbol} ${dir.toUpperCase()} ${lev}× opened!`);
        // Always save current Binance price + timestamp to localStorage
        // Timestamp lets PositionCard know this is a fresh trade, not stale cache
        try {
          const entryLsKey = `nexus_entry_${address}_${assetAddr}`.toLowerCase();
          localStorage.setItem(entryLsKey, priceRef.current.toString());
          localStorage.setItem(entryLsKey + '_ts', Date.now().toString());
        } catch { /* ignore */ }

      } else {
        const lpxFloat = parseFloat(lpx);
        const lpxWhole = Math.floor(lpxFloat);
        const lpxFrac = Math.round((lpxFloat - lpxWhole) * 1e8);
        const tgtPx =
          BigInt(lpxWhole) * BigInt("1000000000000000000") +
          BigInt(lpxFrac) * BigInt("10000000000");
        await writeContractAsync({
          address: CONTRACTS.POSITION_MANAGER.address,
          abi: CONTRACTS.POSITION_MANAGER.abi,
          functionName: "placeLimitOrder",
          args: [assetAddr, collBN, levBN, tgtPx, isLong, mode],
        });
        toast("ok", `Limit order placed at $${fmtPrice(parseFloat(lpx))}`);
      }
      setCollInput("");
      setLimitPx("");
      pendingCollRef.current = BigInt(0);
      await afterTrade();
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string };
      const raw = err?.shortMessage ?? err?.message ?? "Transaction failed";

      if (raw.includes("InvalidAsset")) {
        toast(
          "err",
          `${assetObj.symbol} not whitelisted in PositionManager. Run:\ncast send ${CONTRACTS.POSITION_MANAGER.address} "addAsset(address)" ${assetAddr} --rpc-url https://ethereum-sepolia-rpc.publicnode.com --private-key $PRIVATE_KEY`
        );
      } else if (raw.includes("PositionAlreadyExists")) {
        toast(
          "err",
          `${assetObj.symbol} already has an open position. Close it from the panel below.`
        );
      } else if (raw.includes("StalePrice") || raw.includes("stale") || raw.includes("Stale")) {
        const btcPrice = Math.round(btcPriceRef.current * 1e8);
        const ethPrice = Math.round(ethPriceRef.current * 1e8);
        toast(
          "err",
          `Oracle price stale! Run in terminal:\nsource .env && cast send 0x481EC593F7bD9aB4219a0d0A185C16F2687871C2 "updateAllPrices(int256,int256)" ${ethPrice} ${btcPrice} --rpc-url https://services.polkadothub-rpc.com/testnet --private-key $PRIVATE_KEY`
        );
      } else if (raw.includes("InvalidPrice")) {
        toast(
          "err",
          `${assetObj.symbol} oracle returned invalid price — Chainlink feed may be down on Sepolia.`
        );
      } else if (raw.includes("ZeroAmount")) {
        toast("err", "Amount cannot be zero");
      } else if (raw.includes("InvalidLeverage")) {
        toast("err", `Invalid leverage — max allowed is ${maxLev}×`);
      } else if (raw.includes("InsufficientCollateral")) {
        toast(
          "err",
          "Not enough free collateral in vault. Close other positions or deposit more."
        );
      } else if (raw.includes("EnforcedPause")) {
        toast("err", "Trading is currently paused by admin");
      } else if (
        raw.includes("User rejected") ||
        raw.includes("user rejected")
      ) {
        toast("err", "Transaction rejected in wallet");
      } else if (
        raw.includes("execution reverted") ||
        raw.includes("Third-party") ||
        raw.includes("Transaction failed")
      ) {
        // Most likely cause: stale oracle price
        const btcPrice = Math.round(btcPriceRef.current * 1e8);
        const ethPrice = Math.round(ethPriceRef.current * 1e8);
        toast(
          "err",
          `Transaction reverted — oracle price likely stale.\nRun: source .env && cast send 0x481EC593F7bD9aB4219a0d0A185C16F2687871C2 "updateAllPrices(int256,int256)" ${ethPrice} ${btcPrice} --rpc-url https://services.polkadothub-rpc.com/testnet --private-key $PRIVATE_KEY`
        );
      } else {
        toast("err", raw.slice(0, 180));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, writeContractAsync, toast, afterTrade, maxLev]);

  // ── Step 2: Deposit ───────────────────────────────────────────────────────
  const doDeposit = useCallback(
    async (collBN: bigint) => {
      pendingCollRef.current = collBN;
      toast("depositing", "Step 2/3 — Depositing USDC into vault…");
      try {
        const hash = await writeContractAsync({
          address: CONTRACTS.VAULT.address,
          abi: VAULT_DEPOSIT_ABI,
          functionName: "deposit",
          args: [collBN],
        });
        setDepositHash(hash);
        depositHandledRef.current = false;
      } catch (e: unknown) {
        const err = e as { shortMessage?: string };
        toast("err", err?.shortMessage ?? "Deposit failed");
      }
    },
    [writeContractAsync, toast]
  );

  // ── Step 1: Approve ───────────────────────────────────────────────────────
  const doApprove = useCallback(
    async (collBN: bigint) => {
      pendingCollRef.current = collBN;
      toast("approving", "Step 1/3 — Approving USDC for vault deposit…");
      try {
        const hash = await writeContractAsync({
          address: CONTRACTS.USDC.address,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [CONTRACTS.VAULT.address, maxUint256],
        });
        setApproveHash(hash);
        approveHandledRef.current = false;
      } catch (e: unknown) {
        const err = e as { shortMessage?: string };
        toast("err", err?.shortMessage ?? "Approval failed");
      }
    },
    [writeContractAsync, toast]
  );

  useEffect(() => {
    if (approveConfirmed && approveHash && !approveHandledRef.current) {
      approveHandledRef.current = true;
      void (async () => {
        await refetchAllowance();
        setTimeout(() => {
          void doDeposit(pendingCollRef.current);
        }, 800);
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveConfirmed, approveHash]);

  useEffect(() => {
    if (depositConfirmed && depositHash && !depositHandledRef.current) {
      depositHandledRef.current = true;
      setTimeout(() => {
        void doOpenPosition();
      }, 2500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depositConfirmed, depositHash]);

  // ── Handle Place Order ────────────────────────────────────────────────────
  const handlePlaceOrder = useCallback(async () => {
    if (!isConnected || !address) {
      toast("err", "Connect wallet first");
      return;
    }
    if (collateral <= 0) {
      toast("err", "Enter collateral amount");
      return;
    }
    if (price === 0) {
      toast("err", "Price feed not ready yet…");
      return;
    }
    if (orderType === "limit" && !(parseFloat(limitPx) > 0)) {
      toast("err", "Enter a valid limit price");
      return;
    }

    if (currentAssetPosOpen) {
      toast(
        "err",
        `${asset.symbol} position is already open. Close it below first.`
      );
      return;
    }

    if (!isCurrentAssetWhitelisted) {
      toast(
        "err",
        `${asset.symbol} not whitelisted in PositionManager! Admin must call:\ncast send ${CONTRACTS.POSITION_MANAGER.address} "addAsset(address)" ${asset.address} --rpc-url https://ethereum-sepolia-rpc.publicnode.com --private-key $PRIVATE_KEY`
      );
      return;
    }

    if (vaultSufficient) {
      pendingCollRef.current = BigInt(0);
      await doOpenPosition();
      return;
    }

    const shortfall = Math.max(0, collateral - vaultAvail);
    if (walletUsdc < shortfall - 0.0001) {
      toast(
        "err",
        `Insufficient USDC. Need ${fmtUSD(shortfall)} more from wallet`
      );
      return;
    }

    const depositBN = parseUnits(shortfall.toFixed(6), 6);
    pendingCollRef.current = depositBN;
    if (needsApproval) {
      await doApprove(depositBN);
    } else {
      await doDeposit(depositBN);
    }
  }, [
    isConnected,
    address,
    collateral,
    price,
    orderType,
    limitPx,
    vaultSufficient,
    vaultAvail,
    walletUsdc,
    needsApproval,
    currentAssetPosOpen,
    asset,
    isCurrentAssetWhitelisted,
    doApprove,
    doDeposit,
    doOpenPosition,
    toast,
  ]);

  // ── Market Close ──────────────────────────────────────────────────────────
  const handleMarketClose = useCallback(
    async (closeAsset: Asset) => {
      if (!isConnected || !address) return;
      toast("pending", `Closing ${closeAsset.symbol} at market…`);
      try {
        const livePrice =
          closeAsset.symbol === "BTC"
            ? btcPriceRef.current
            : ethPriceRef.current;

        if (livePrice === 0) {
          toast("err", `${closeAsset.symbol} price not ready, try again`);
          return;
        }

        // Pass BigInt(0) so contract uses oracle price internally.
        // Passing Binance livePrice causes PnL mismatch because on-chain
        // entryPrice was set by the oracle (not Binance) — mixing the two
        // gives wrong PnL calculation and inflates vault balance incorrectly.
        const hash = await writeContractAsync({
          address: CONTRACTS.POSITION_MANAGER.address,
          abi: CONTRACTS.POSITION_MANAGER.abi,
          functionName: "closePosition",
          args: [closeAsset.address, BigInt(0)],
        });
        closeHandledRef.current = false;
        setCloseHash(hash as `0x${string}`);
        toast("ok", `${closeAsset.symbol} closed ✓ — vault balance updating…`);

      } catch (e: unknown) {
        const err = e as { shortMessage?: string; message?: string };
        const raw =
          err?.shortMessage ?? err?.message ?? "Close failed";
        toast(
          "err",
          raw.includes("NoPositionFound")
            ? "No open position found to close"
            : raw.slice(0, 100)
        );
      }
    },
    [isConnected, address, writeContractAsync, toast]
  );

  // ── Limit Close ───────────────────────────────────────────────────────────
  const handleLimitClose = useCallback(
    async (closeAsset: Asset, limitPxStr: string) => {
      if (!isConnected || !address) return;
      const lp = parseFloat(limitPxStr);
      if (!lp || lp <= 0) {
        toast("err", "Invalid close price");
        return;
      }
      toast(
        "pending",
        `Placing limit close for ${closeAsset.symbol} @ $${fmtPrice(lp)}…`
      );
      try {
        const tgtPx = parseUnits(lp.toFixed(18), 18);
        const posData = rawPos;
        if (closeAsset.address === asset.address && posData?.isOpen) {
          await writeContractAsync({
            address: CONTRACTS.POSITION_MANAGER.address,
            abi: CONTRACTS.POSITION_MANAGER.abi,
            functionName: "placeLimitOrder",
            args: [
              closeAsset.address,
              posData.collateral,
              posData.leverage,
              tgtPx,
              !posData.isLong,
              posData.mode as MarginMode,
            ],
          });
        } else {
          toast(
            "err",
            `Switch to ${closeAsset.symbol} tab to place a limit close`
          );
          return;
        }
        toast("ok", `Limit close placed @ $${fmtPrice(lp)}`);
        await afterTrade();
      } catch (e: unknown) {
        const err = e as { shortMessage?: string };
        toast("err", err?.shortMessage ?? "Limit close failed");
      }
    },
    [
      isConnected,
      address,
      rawPos,
      asset.address,
      writeContractAsync,
      toast,
      afterTrade,
    ]
  );

  // ── Fill by % ─────────────────────────────────────────────────────────────
  const fillPct = (pct: number) => {
    const bal = vaultAvail > 0 ? vaultAvail : walletUsdc;
    if (bal > 0) setCollInput(((bal * pct) / 100).toFixed(2));
  };

  // ── Derived UI ────────────────────────────────────────────────────────────
  const isSubmitting =
    isPending ||
    txFlow === "approving" ||
    txFlow === "depositing" ||
    txFlow === "pending";

  const spinner = (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: 15,
          height: 15,
          borderRadius: "50%",
          border: "2px solid rgba(255,255,255,0.15)",
          borderTopColor: "#fff",
          animation: "nxSpin 0.7s linear infinite",
        }}
      />
      {txFlow === "approving"
        ? "Approving USDC…"
        : txFlow === "depositing"
        ? "Depositing to Vault…"
        : "Processing…"}
    </span>
  );

  let ctaLabel: React.ReactNode = "Connect Wallet to Trade";
  if (isConnected) {
    if (isSubmitting) ctaLabel = spinner;
    else if (!isCurrentAssetWhitelisted)
      ctaLabel = `⚠ ${asset.symbol} Not Whitelisted`;
    else if (currentAssetPosOpen)
      ctaLabel = `${asset.symbol} Position Already Open — Close Below`;
    else if (needsDeposit && needsApproval)
      ctaLabel = `Approve → Deposit → ${
        side === "long" ? "Long" : "Short"
      } ${asset.symbol}`;
    else if (needsDeposit)
      ctaLabel = `Deposit $${depositAmount.toFixed(2)} → ${
        side === "long" ? "Long" : "Short"
      } ${asset.symbol}`;
    else if (orderType === "limit")
      ctaLabel = `Place ${side === "long" ? "Buy" : "Sell"} Limit — ${
        asset.symbol
      }`;
    else
      ctaLabel = `${side === "long" ? "▲ Long" : "▼ Short"} ${
        asset.symbol
      } ${leverage}×`;
  }

  // Only disable during active submission or when not connected
  // All other checks (whitelist, existing position) show toast errors
  // so user knows WHY they can't trade instead of silent grey button
  const ctaDisabled =
    isSubmitting ||
    !isConnected;

  const ctaBg = !isConnected
    ? "#F5F5F5"
    : currentAssetPosOpen
    ? "linear-gradient(135deg,#F0B90B,#D9A10A)"
    : !isCurrentAssetWhitelisted
    ? "linear-gradient(135deg,#F6465D,#CF304A)"
    : isSubmitting
    ? "#F5F5F5"
    : needsDeposit && needsApproval
    ? "linear-gradient(135deg,#F0B90B,#D9A10A)"
    : needsDeposit
    ? "linear-gradient(135deg,#3B82F6,#1D4ED8)"
    : side === "long"
    ? "linear-gradient(135deg,#0ECB81 0%,#00A86B 100%)"
    : "linear-gradient(135deg,#F6465D 0%,#CF304A 100%)";

  const ctaShadow = ctaDisabled
    ? "none"
    : needsDeposit
    ? "0 6px 20px rgba(59,130,246,0.25)"
    : side === "long"
    ? "0 6px 20px rgba(14,203,129,0.25)"
    : "0 6px 20px rgba(246,70,93,0.25)";

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#F0F1F2",
        fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,sans-serif",
        paddingTop: 64,
        display: "flex",
        flexDirection: "column",
        fontSize: 12,
        color: "#1E2026",
      }}
    >
      {/* ── TOP BAR ── */}
      <div
        className="nx-topbar"
        style={{
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          background: "#fff",
          borderBottom: "1px solid #EAECEF",
          height: 54,
          position: "sticky",
          top: 64,
          zIndex: 50,
          gap: 0,
          overflowX: "auto",
        }}
      >
        {/* Asset Selector */}
        <div ref={dropRef} style={{ position: "relative", flexShrink: 0 }}>
          <button
            onClick={() => setAssetDrop(!assetDrop)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "transparent",
              border: "none",
              padding: "8px 16px 8px 0",
              cursor: "pointer",
              fontFamily: "inherit",
              borderRight: "1px solid #EAECEF",
              marginRight: 16,
            }}
          >
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                background: asset.color + "18",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: `1.5px solid ${asset.color}50`,
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 900,
                  color: asset.color,
                }}
              >
                {asset.icon}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                lineHeight: 1.2,
              }}
            >
              <span
                style={{
                  fontWeight: 800,
                  fontSize: 15,
                  color: "#1E2026",
                  letterSpacing: "0.5px",
                }}
              >
                {asset.symbol}/USDT
              </span>
              <span
                className="nx-asset-sub"
                style={{
                  fontSize: 9,
                  color: "#848E9C",
                  fontWeight: 600,
                  letterSpacing: "1px",
                  textTransform: "uppercase",
                }}
              >
                PERP · Click to switch
              </span>
            </div>
            <svg
              width="10"
              height="10"
              viewBox="0 0 12 12"
              fill="none"
              style={{ marginLeft: 2 }}
            >
              <path
                d="M2 4l4 4 4-4"
                stroke="#848E9C"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>

          {assetDrop && (
            <div
              style={{
                position: "fixed",
                top: 118,
                left: 16,
                background: "#fff",
                border: "1px solid #EAECEF",
                borderRadius: 12,
                zIndex: 9999,
                minWidth: 260,
                boxShadow: "0 12px 40px rgba(0,0,0,0.15)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "10px 16px 8px",
                  fontSize: 10,
                  color: "#848E9C",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  borderBottom: "1px solid #F5F5F5",
                }}
              >
                Select Market
              </div>
              {ASSETS.map((a) => {
                const hasPos =
                  (a.symbol === "BTC" && btcPosOpen) ||
                  (a.symbol === "ETH" && ethPosOpen);
                const notWhitelisted =
                  a.symbol === "BTC"
                    ? isBtcWhitelisted === false
                    : isEthWhitelisted === false;
                return (
                  <button
                    key={a.address}
                    onClick={() => {
                      setAsset(a);
                      setAssetDrop(false);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 16px",
                      width: "100%",
                      border: "none",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      transition: "background 0.12s",
                      background:
                        a.address === asset.address
                          ? a.color + "10"
                          : "transparent",
                      borderLeft:
                        a.address === asset.address
                          ? `3px solid ${a.color}`
                          : "3px solid transparent",
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        background: a.color + "15",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        border: `1.5px solid ${a.color}40`,
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 900,
                          fontSize: 16,
                          color: a.color,
                        }}
                      >
                        {a.icon}
                      </span>
                    </div>
                    <div style={{ textAlign: "left", flex: 1 }}>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: 13,
                          color: "#1E2026",
                        }}
                      >
                        {a.symbol}/USDT PERP
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: notWhitelisted ? "#F6465D" : "#848E9C",
                        }}
                      >
                        {notWhitelisted
                          ? "⚠ Not whitelisted in contract"
                          : `${a.name} · Perpetual`}
                      </div>
                    </div>
                    {hasPos && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: 3,
                          background: "#0ECB8118",
                          color: "#0ECB81",
                          border: "1px solid #0ECB8130",
                          whiteSpace: "nowrap",
                        }}
                      >
                        OPEN
                      </span>
                    )}
                    {a.address === asset.address && !hasPos && (
                      <span
                        style={{
                          color: a.color,
                          fontSize: 14,
                          fontWeight: 800,
                        }}
                      >
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Price + 24h Change */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            borderLeft: "1px solid #EAECEF",
            paddingLeft: 16,
            flexShrink: 0,
          }}
        >
          {loading ? (
            <div
              style={{
                width: 90,
                height: 24,
                background: "#F5F5F5",
                borderRadius: 6,
                animation: "nxPulse 1.4s ease-in-out infinite",
              }}
            />
          ) : (
            <>
              <span
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: ch24 >= 0 ? "#0ECB81" : "#F6465D",
                  letterSpacing: "0.5px",
                }}
              >
                {fmtPrice(price)}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "3px 8px",
                  borderRadius: 4,
                  background: ch24 >= 0 ? "#0ECB8118" : "#F6465D18",
                  color: ch24 >= 0 ? "#0ECB81" : "#F6465D",
                  border: `1px solid ${
                    ch24 >= 0 ? "#0ECB8130" : "#F6465D30"
                  }`,
                }}
              >
                {ch24 >= 0 ? "▲" : "▼"} {Math.abs(ch24).toFixed(2)}%
              </span>
            </>
          )}
        </div>

        <div className="nx-high-low" style={{ display: "flex", alignItems: "center" }}>
          <TickStat
            label="24H High"
            value={high24 > 0 ? fmtPrice(high24) : "—"}
          />
          <TickStat
            label="24H Low"
            value={low24 > 0 ? fmtPrice(low24) : "—"}
          />
          <TickStat
            label="24H Vol"
            value={vol24 > 0 ? `$${(vol24 / 1e9).toFixed(2)}B` : "—"}
            className="nx-vol-stat"
          />
          <TickStat label="Funding" value="-0.0198%" vc="#F6465D" className="nx-fund-stat" />
        </div>

        {!loading && (
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 12px",
              borderRadius: 20,
              background: "#0ECB8110",
              border: "1px solid #0ECB8130",
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#0ECB81",
                animation: "nxPulse 1.5s ease-in-out infinite",
              }}
            />
            <span
              style={{
                fontSize: 9,
                fontWeight: 800,
                color: "#0ECB81",
                letterSpacing: "1.5px",
              }}
            >
              LIVE
            </span>
          </div>
        )}
      </div>

      {/* ── BODY ── */}
      <div
        className="nx-main"
        style={{
          display: "flex",
          flex: 1,
          background: "#EAECEF",
          gap: 1,
          minHeight: 0,
        }}
      >
        {/* ── LEFT: Chart + Positions ── */}
        <div
          className="nx-left"
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            background: "#fff",
            borderRight: "1px solid #EAECEF",
          }}
        >
          {/* Chart Toolbar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "6px 14px",
              borderBottom: "1px solid #EAECEF",
              background: "#fff",
              flexShrink: 0,
              gap: 4,
            }}
          >
            <div style={{ display: "flex", gap: 2 }}>
              {TV_INTERVALS.map((iv) => (
                <button
                  key={iv.value}
                  onClick={() => setChartInterval(iv.value)}
                  style={{
                    padding: "5px 10px",
                    border: "none",
                    borderRadius: 5,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: 11,
                    fontWeight: 700,
                    transition: "all 0.15s",
                    background:
                      chartInterval === iv.value ? "#F0B90B" : "transparent",
                    color:
                      chartInterval === iv.value ? "#fff" : "#848E9C",
                  }}
                >
                  {iv.label}
                </button>
              ))}
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
              <button
                style={{
                  padding: "5px 10px",
                  border: "none",
                  borderRadius: 5,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: 11,
                  background: !showTrades ? "#F5F5F5" : "transparent",
                  color: !showTrades ? "#1E2026" : "#848E9C",
                  fontWeight: !showTrades ? 700 : 400,
                }}
                onClick={() => setShowTrades(false)}
              >
                Chart
              </button>
              <button
                style={{
                  padding: "5px 10px",
                  border: "none",
                  borderRadius: 5,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: 11,
                  background: showTrades ? "#F5F5F5" : "transparent",
                  color: showTrades ? "#1E2026" : "#848E9C",
                  fontWeight: showTrades ? 700 : 400,
                }}
                onClick={() => setShowTrades(true)}
              >
                Trades
              </button>
            </div>
          </div>

          {/* Chart Area */}
          <div
            className="nx-chart"
            style={{
              height: 520,
              minHeight: 520,
              overflow: "hidden",
              background: "#fff",
              position: "relative",
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {showTrades ? (
              <div
                style={{ height: "100%", display: "flex", flexDirection: "column" }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    padding: "8px 16px",
                    borderBottom: "1px solid #EAECEF",
                    background: "#FAFAFA",
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: "#848E9C",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Price (USDT)
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: "#848E9C",
                      textAlign: "center",
                    }}
                  >
                    Qty
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: "#848E9C",
                      textAlign: "right",
                    }}
                  >
                    Time
                  </span>
                </div>
                <div
                  style={{
                    overflowY: "auto",
                    flex: 1,
                    scrollbarWidth: "none",
                  }}
                >
                  {trades.length === 0 ? (
                    <div
                      style={{
                        textAlign: "center",
                        padding: 40,
                        color: "#848E9C",
                        fontSize: 12,
                      }}
                    >
                      Connecting…
                    </div>
                  ) : (
                    trades.map((t) => (
                      <div
                        key={t.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr 1fr",
                          padding: "4px 16px",
                          fontSize: 11,
                          borderBottom: "1px solid #F5F5F5",
                        }}
                      >
                        <span
                          style={{
                            color: t.buy ? "#0ECB81" : "#F6465D",
                            fontWeight: 700,
                          }}
                        >
                          {fmtPrice(t.price)}
                        </span>
                        <span
                          style={{ color: "#848E9C", textAlign: "center" }}
                        >
                          {t.qty.toFixed(5)}
                        </span>
                        <span
                          style={{
                            color: "#B7BDC6",
                            fontSize: 10,
                            textAlign: "right",
                          }}
                        >
                          {t.time}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <TradingViewChart
                key={chartKey}
                symbol={asset.tvSymbol as string}
                interval={chartInterval as string}
              />
            )}
          </div>

          {/* ── Open Positions Panel ── */}
          <div
            style={{
              flex: 1,
              background: "#FAFAFA",
              borderTop: "1px solid #EAECEF",
            }}
          >
            <div
              style={{
                padding: "12px 16px 10px",
                borderBottom: "1px solid #EAECEF",
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: "#fff",
              }}
            >
              <span
                style={{
                  fontWeight: 700,
                  fontSize: 13,
                  color: "#1E2026",
                  letterSpacing: "0.3px",
                }}
              >
                Open Positions
              </span>
              {anyPosOpen && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 10,
                    background: "#0ECB8118",
                    color: "#0ECB81",
                    border: "1px solid #0ECB8130",
                  }}
                >
                  Active
                </span>
              )}
              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                {btcPosOpen && (
                  <span
                    style={{ fontSize: 10, color: "#F7931A", fontWeight: 700 }}
                  >
                    ₿ BTC
                  </span>
                )}
                {ethPosOpen && (
                  <span
                    style={{ fontSize: 10, color: "#627EEA", fontWeight: 700 }}
                  >
                    Ξ ETH
                  </span>
                )}
                {!anyPosOpen && (
                  <span style={{ fontSize: 10, color: "#B7BDC6" }}>
                    All markets
                  </span>
                )}
              </div>
            </div>

            <div
              className="nx-positions-wrap"
              style={{
                padding: "12px 16px",
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              {isConnected && address ? (
                <AllPositionsPanel
                  address={address}
                  onMarketClose={handleMarketClose}
                  onLimitClose={handleLimitClose}
                  isPending={isPending}
                  btcPrice={btcLive.price}
                  ethPrice={ethLive.price}
                  btcPos={rawBtcPos}
                  ethPos={rawEthPos}
                />
              ) : null}
              {isConnected && !anyPosOpen && (
                <div
                  style={{
                    width: "100%",
                    padding: "28px 0",
                    textAlign: "center",
                    color: "#B7BDC6",
                    fontSize: 12,
                  }}
                >
                  No open positions
                </div>
              )}
              {!isConnected && (
                <div
                  style={{
                    width: "100%",
                    padding: "28px 0",
                    textAlign: "center",
                    color: "#B7BDC6",
                    fontSize: 12,
                  }}
                >
                  Connect wallet to view positions
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Trade Panel ── */}
        <div
          className="nx-right nx-right-inner"
          style={{
            width: 348,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            padding: 14,
            background: "#fff",
            overflowY: "auto",
            borderLeft: "1px solid #EAECEF",
          }}
        >
          {/* Order Type Tabs */}
          <div
            style={{
              display: "flex",
              background: "#F5F5F5",
              borderRadius: 10,
              padding: 3,
              gap: 3,
            }}
          >
            {(["market", "limit"] as OrderType[]).map((t) => (
              <button
                key={t}
                onClick={() => setOrderType(t)}
                style={{
                  flex: 1,
                  padding: "9px",
                  border: "none",
                  borderRadius: 8,
                  background: orderType === t ? "#fff" : "transparent",
                  color: orderType === t ? "#1E2026" : "#848E9C",
                  fontWeight: orderType === t ? 700 : 500,
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "all 0.15s",
                  boxShadow:
                    orderType === t
                      ? "0 1px 4px rgba(0,0,0,0.08)"
                      : "none",
                }}
              >
                {t === "market" ? "Market" : "Limit"}
              </button>
            ))}
          </div>

          {/* Margin Mode + Vault Balance Row */}
          <div
            style={{ display: "flex", gap: 8, alignItems: "center" }}
          >
            <button
              onClick={() => setMarginModal(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 10px",
                background: "#F5F5F5",
                border: "1px solid #EAECEF",
                borderRadius: 7,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <span
                style={{
                  fontWeight: 700,
                  fontSize: 11,
                  color: marginMode === 1 ? "#D97706" : "#2563EB",
                }}
              >
                {marginMode === 1 ? "Cross" : "Isolated"}
              </span>
              <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                <path
                  d="M2 4l4 4 4-4"
                  stroke="#848E9C"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <span style={{ color: "#E0E0E0" }}>|</span>
            <span style={{ fontSize: 11, color: "#848E9C" }}>One-Way</span>
            <div
              style={{ marginLeft: "auto", textAlign: "right", cursor: "pointer" }}
              title="Click to refresh vault balance"
              onClick={() => {
                void refetchVault();
                void refetchLocked();
                void refetchBtcPos();
                void refetchEthPos();
                void refetchWalletBal();
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  color: "#B7BDC6",
                  fontWeight: 600,
                  letterSpacing: "0.5px",
                }}
              >
                VAULT AVAIL ↻
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  color: vaultAvail > 0 ? "#0ECB81" : "#848E9C",
                }}
              >
                {isConnected ? fmtUSD(vaultAvail) : "—"}
              </div>
              {totalLockedCollat > 0 && (
                <div
                  style={{ fontSize: 9, color: "#F0B90B", fontWeight: 600 }}
                >
                  {fmtUSD(totalLockedCollat)} in trades
                </div>
              )}
              {vaultBal > 0 && (
                <div style={{ fontSize: 8, color: "#B7BDC6" }}>
                  deposited: {fmtUSD(vaultBal)}
                </div>
              )}
            </div>
          </div>

          {/* Wallet USDC */}
          {isConnected && walletUsdc > 0 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "7px 12px",
                background: "#F5F5F5",
                borderRadius: 8,
                border: "1px solid #EAECEF",
              }}
            >
              <span style={{ fontSize: 10, color: "#848E9C" }}>
                Wallet USDC
              </span>
              <span
                style={{ fontSize: 11, fontWeight: 700, color: "#1E2026" }}
              >
                {fmtUSD(walletUsdc)}
              </span>
            </div>
          )}

          {/* Not whitelisted warning */}
          {isConnected && !isCurrentAssetWhitelisted && (
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                background: "#FFF0F0",
                border: "1px solid #F6465D40",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#A8071A",
                  marginBottom: 6,
                }}
              >
                🚫 {asset.symbol} not whitelisted in PositionManager
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "#A8071A",
                  marginBottom: 6,
                  lineHeight: 1.5,
                }}
              >
                Oracle is set ✓ but PositionManager.addAsset() was never
                called. Run:
              </div>
              <code
                style={{
                  display: "block",
                  fontSize: 9,
                  color: "#5C0000",
                  background: "#FFD6D6",
                  padding: "6px 8px",
                  borderRadius: 4,
                  fontFamily: "monospace",
                  wordBreak: "break-all",
                  lineHeight: 1.6,
                }}
              >
                {`cast send ${CONTRACTS.POSITION_MANAGER.address} "addAsset(address)" ${asset.address} --rpc-url https://ethereum-sepolia-rpc.publicnode.com --private-key $PRIVATE_KEY`}
              </code>
            </div>
          )}



          {/* Position open banner */}
          {isConnected && currentAssetPosOpen && (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                padding: "10px 12px",
                borderRadius: 9,
                background: "#F0B90B08",
                border: "1px solid #F0B90B40",
              }}
            >
              <span style={{ fontSize: 14, flexShrink: 0 }}>ℹ️</span>
              <span style={{ fontSize: 11, color: "#92600A", lineHeight: 1.6 }}>
                You already have an open <strong>{asset.symbol}</strong>{" "}
                position. Close it below before opening a new one.
                {asset.symbol === "BTC"
                  ? " You can still open ETH separately."
                  : " You can still open BTC separately."}
              </span>
            </div>
          )}

          {/* Long / Short */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {(["long", "short"] as Side[]).map((s) => (
              <button
                key={s}
                onClick={() => setSide(s)}
                style={{
                  padding: "13px 8px",
                  borderRadius: 10,
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "all 0.2s",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  background:
                    side === s
                      ? s === "long"
                        ? "linear-gradient(135deg,#0ECB81,#00A86B)"
                        : "linear-gradient(135deg,#F6465D,#CF304A)"
                      : "#F5F5F5",
                  color: side === s ? "#fff" : "#848E9C",
                  boxShadow:
                    side === s
                      ? s === "long"
                        ? "0 4px 14px rgba(14,203,129,0.28)"
                        : "0 4px 14px rgba(246,70,93,0.28)"
                      : "none",
                  border: "none",
                  outline: side === s ? "none" : "1px solid #EAECEF",
                }}
              >
                {s === "long" ? "▲ Long" : "▼ Short"}
              </button>
            ))}
          </div>

          {/* Limit Price Input */}
          {orderType === "limit" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label
                style={{
                  fontSize: 10,
                  color: "#848E9C",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Limit Price
              </label>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: "#FAFAFA",
                  border: "1.5px solid #EAECEF",
                  borderRadius: 8,
                  overflow: "hidden",
                }}
              >
                <input
                  type="number"
                  placeholder={price > 0 ? fmtPrice(price) : "0.00"}
                  value={limitPx}
                  onChange={(e) => setLimitPx(e.target.value)}
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    padding: "10px 12px",
                    color: "#1E2026",
                    fontFamily: "inherit",
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                />
                <span
                  style={{
                    padding: "10px 12px",
                    color: "#848E9C",
                    fontSize: 11,
                    fontWeight: 700,
                    borderLeft: "1px solid #EAECEF",
                    background: "#F5F5F5",
                    whiteSpace: "nowrap",
                  }}
                >
                  USD
                </span>
              </div>
            </div>
          )}

          {/* Collateral Input */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label
              style={{
                fontSize: 10,
                color: "#848E9C",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Order Value
            </label>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "#FAFAFA",
                border: "1.5px solid #EAECEF",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              <input
                type="number"
                placeholder="0.00"
                value={collInput}
                onChange={(e) => setCollInput(e.target.value)}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  padding: "10px 12px",
                  color: "#1E2026",
                  fontFamily: "inherit",
                  fontSize: 14,
                  fontWeight: 700,
                }}
              />
              <span
                style={{
                  padding: "10px 12px",
                  color: "#848E9C",
                  fontSize: 11,
                  fontWeight: 700,
                  borderLeft: "1px solid #EAECEF",
                  background: "#F5F5F5",
                  whiteSpace: "nowrap",
                }}
              >
                USDC
              </span>
            </div>
          </div>

          {/* % Presets */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4,1fr)",
              gap: 6,
            }}
          >
            {SIZE_PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => fillPct(p)}
                style={{
                  padding: "6px 0",
                  background: "#F5F5F5",
                  border: "1px solid #EAECEF",
                  borderRadius: 6,
                  color: "#848E9C",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "all 0.15s",
                }}
              >
                {p}%
              </button>
            ))}
          </div>

          {/* Leverage Slider */}
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <label
                style={{
                  fontSize: 10,
                  color: "#848E9C",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Leverage
              </label>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 800,
                  color: "#F0B90B",
                }}
              >
                {leverage}×
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={maxLev}
              value={leverage}
              onChange={(e) => setLeverage(Number(e.target.value))}
              style={{
                width: "100%",
                height: 4,
                appearance: "none",
                WebkitAppearance: "none",
                borderRadius: 4,
                outline: "none",
                cursor: "pointer",
                background: sliderBg,
              }}
            />
            <div style={{ display: "flex", gap: 5, marginTop: 10 }}>
              {LEV_PRESETS.filter((l) => l <= maxLev).map((l) => (
                <button
                  key={l}
                  onClick={() => setLeverage(l)}
                  style={{
                    flex: 1,
                    padding: "5px 0",
                    borderRadius: 5,
                    fontSize: 11,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition: "all 0.15s",
                    background: leverage === l ? "#F0B90B" : "#F5F5F5",
                    color: leverage === l ? "#fff" : "#848E9C",
                    fontWeight: leverage === l ? 800 : 500,
                    border:
                      leverage === l ? "none" : "1px solid #EAECEF",
                  }}
                >
                  {l}×
                </button>
              ))}
            </div>
          </div>

          {/* Balance Status */}
          {collateral > 0 && isConnected && (
            <div
              style={{
                borderRadius: 10,
                overflow: "hidden",
                border: "1px solid #EAECEF",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "9px 12px",
                  background: vaultSufficient ? "#F0FFF8" : "#FFF8F0",
                  borderBottom: "1px solid #EAECEF",
                }}
              >
                <div>
                  <span
                    style={{
                      fontSize: 11,
                      color: "#848E9C",
                      fontWeight: 600,
                    }}
                  >
                    Vault Available
                  </span>
                  {lockedCollat > 0 && (
                    <div style={{ fontSize: 9, color: "#F0B90B" }}>
                      {fmtUSD(lockedCollat)} in open position
                    </div>
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: vaultSufficient ? "#0ECB81" : "#F0B90B",
                    }}
                  >
                    {fmtUSD(vaultAvail)}
                  </span>
                  {vaultSufficient ? (
                    <span
                      style={{
                        fontSize: 10,
                        color: "#0ECB81",
                        background: "#0ECB8115",
                        padding: "1px 5px",
                        borderRadius: 3,
                        fontWeight: 700,
                      }}
                    >
                      ✓ OK
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: 10,
                        color: "#F0B90B",
                        background: "#F0B90B15",
                        padding: "1px 5px",
                        borderRadius: 3,
                        fontWeight: 700,
                      }}
                    >
                      +{fmtUSD(depositAmount)}
                    </span>
                  )}
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "9px 12px",
                  background: "#FAFAFA",
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    color: "#848E9C",
                    fontWeight: 600,
                  }}
                >
                  Wallet USDC
                </span>
                <div
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#1E2026",
                    }}
                  >
                    {fmtUSD(walletUsdc)}
                  </span>
                  {needsDeposit && walletUsdc < depositAmount - 0.0001 && (
                    <span
                      style={{
                        fontSize: 10,
                        color: "#F6465D",
                        background: "#F6465D15",
                        padding: "1px 5px",
                        borderRadius: 3,
                        fontWeight: 700,
                      }}
                    >
                      Insufficient
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Multi-Step Flow */}
          {needsDeposit && collateral > 0 && isConnected && (
            <div
              style={{
                background: "#F8F9FA",
                border: "1px solid #EAECEF",
                borderRadius: 10,
                padding: "12px 14px",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: "#848E9C",
                  fontWeight: 700,
                  marginBottom: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Auto-deposit flow
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                {needsApproval && (
                  <>
                    <StepBadge
                      step={1}
                      label="Approve USDC for vault"
                      active={txFlow === "approving"}
                      done={
                        txFlow === "depositing" ||
                        txFlow === "pending" ||
                        txFlow === "ok"
                      }
                    />
                    <div
                      style={{
                        width: 1,
                        height: 8,
                        background: "#EAECEF",
                        marginLeft: 9,
                      }}
                    />
                  </>
                )}
                <StepBadge
                  step={needsApproval ? 2 : 1}
                  label={`Deposit ${fmtUSD(depositAmount)} USDC → Vault`}
                  active={txFlow === "depositing"}
                  done={txFlow === "pending" || txFlow === "ok"}
                />
                <div
                  style={{
                    width: 1,
                    height: 8,
                    background: "#EAECEF",
                    marginLeft: 9,
                  }}
                />
                <StepBadge
                  step={needsApproval ? 3 : 2}
                  label={`Open ${
                    side === "long" ? "Long" : "Short"
                  } ${leverage}× ${asset.symbol}`}
                  active={txFlow === "pending"}
                  done={txFlow === "ok"}
                />
              </div>
            </div>
          )}

          {/* Insufficient Warning */}
          {needsDeposit &&
            walletUsdc < depositAmount - 0.0001 &&
            isConnected &&
            collateral > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "10px 12px",
                  borderRadius: 9,
                  background: "#F6465D08",
                  border: "1px solid #F6465D30",
                }}
              >
                <span style={{ fontSize: 14, flexShrink: 0 }}>⚠️</span>
                <span
                  style={{
                    fontSize: 11,
                    color: "#A8071A",
                    lineHeight: 1.6,
                  }}
                >
                  Not enough USDC in wallet. Need {fmtUSD(depositAmount)}{" "}
                  more.
                </span>
              </div>
            )}

          {/* Order Summary */}
          <div
            style={{
              background: "#FAFAFA",
              border: "1px solid #EAECEF",
              borderRadius: 10,
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <SRow
              label="Order Value"
              value={posSize > 0 ? fmtUSD(posSize) : "—"}
            />
            <SRow
              label="Required Margin"
              value={collateral > 0 ? fmtUSD(collateral) : "—"}
            />
            <SRow
              label="Est. Fee (0.025%)"
              value={fees > 0 ? fmtUSD(fees) : "—"}
            />
            <div
              style={{ borderTop: "1px solid #EAECEF", margin: "2px 0" }}
            />
            <SRow
              label="Liq. Price"
              value={
                posSize > 0 && liqPx > 0 ? fmtPrice(liqPx) : "N/A"
              }
              vc="#F6465D"
            />
            <SRow
              label="Entry Price"
              value={entryPx > 0 ? fmtPrice(entryPx) : "—"}
            />
          </div>

          {/* Toast */}
          {txFlow !== "idle" && (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                padding: "10px 12px",
                borderRadius: 9,
                border: "1px solid",
                borderColor:
                  txFlow === "ok"
                    ? "#0ECB8140"
                    : txFlow === "err"
                    ? "#F6465D40"
                    : "#F0B90B40",
                background:
                  txFlow === "ok"
                    ? "#0ECB8108"
                    : txFlow === "err"
                    ? "#F6465D08"
                    : "#F0B90B08",
              }}
            >
              {(txFlow === "pending" ||
                txFlow === "approving" ||
                txFlow === "depositing") && (
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    border: "2px solid rgba(240,185,11,0.2)",
                    borderTopColor: "#F0B90B",
                    animation: "nxSpin 0.7s linear infinite",
                    flexShrink: 0,
                    marginTop: 1,
                  }}
                />
              )}
              {txFlow === "ok" && (
                <span
                  style={{ color: "#0ECB81", fontSize: 14, flexShrink: 0 }}
                >
                  ✓
                </span>
              )}
              {txFlow === "err" && (
                <span
                  style={{ color: "#F6465D", fontSize: 14, flexShrink: 0 }}
                >
                  ✕
                </span>
              )}
              <span
                style={{
                  flex: 1,
                  fontSize: 11,
                  color: "#1E2026",
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {txMsg}
              </span>
              {txFlow !== "pending" &&
                txFlow !== "approving" &&
                txFlow !== "depositing" && (
                  <button
                    onClick={() => setTxFlow("idle")}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#848E9C",
                      fontSize: 18,
                      cursor: "pointer",
                      lineHeight: 1,
                      padding: 0,
                    }}
                  >
                    ×
                  </button>
                )}
            </div>
          )}

          {/* CTA Button */}
          <button
            disabled={ctaDisabled}
            onClick={() => {
              void handlePlaceOrder();
            }}
            style={{
              width: "100%",
              padding: "14px 0",
              border: "none",
              borderRadius: 10,
              fontFamily: "inherit",
              fontWeight: 800,
              fontSize: 14,
              letterSpacing: "0.2px",
              transition: "all 0.2s",
              cursor: (!isConnected || isSubmitting) ? "not-allowed" : "pointer",
              background: ctaBg,
              color: (!isConnected) ? "#848E9C" : "#fff",
              boxShadow: ctaShadow,
              opacity: (!isConnected || isSubmitting) ? 0.75 : 1,
            }}
          >
            {ctaLabel}
          </button>

          {/* Open positions summary chips */}
          {isConnected && (rawBtcPos?.isOpen || rawEthPos?.isOpen) && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {rawBtcPos?.isOpen && (
                <div
                  style={{
                    flex: 1,
                    padding: "6px 10px",
                    background: rawBtcPos.isLong ? "#F0FFF8" : "#FFF5F5",
                    border: `1px solid ${
                      rawBtcPos.isLong ? "#0ECB8130" : "#F6465D30"
                    }`,
                    borderRadius: 7,
                    fontSize: 10,
                  }}
                >
                  <span
                    style={{
                      fontWeight: 700,
                      color: rawBtcPos.isLong ? "#0ECB81" : "#F6465D",
                    }}
                  >
                    ₿ BTC {rawBtcPos.isLong ? "▲ Long" : "▼ Short"}
                  </span>
                  <span style={{ color: "#848E9C", marginLeft: 4 }}>
                    {fmtUSD(decodeCollateral(rawBtcPos.collateral))} margin
                  </span>
                </div>
              )}
              {rawEthPos?.isOpen && (
                <div
                  style={{
                    flex: 1,
                    padding: "6px 10px",
                    background: rawEthPos.isLong ? "#F0FFF8" : "#FFF5F5",
                    border: `1px solid ${
                      rawEthPos.isLong ? "#0ECB8130" : "#F6465D30"
                    }`,
                    borderRadius: 7,
                    fontSize: 10,
                  }}
                >
                  <span
                    style={{
                      fontWeight: 700,
                      color: rawEthPos.isLong ? "#0ECB81" : "#F6465D",
                    }}
                  >
                    Ξ ETH {rawEthPos.isLong ? "▲ Long" : "▼ Short"}
                  </span>
                  <span style={{ color: "#848E9C", marginLeft: 4 }}>
                    {fmtUSD(decodeCollateral(rawEthPos.collateral))} margin
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── MARGIN MODE MODAL ── */}
      {marginModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setMarginModal(false)}
        >
          <div
            style={{
              background: "#fff",
              border: "1px solid #EAECEF",
              borderRadius: 16,
              width: 400,
              maxWidth: "calc(100vw - 32px)",
              overflow: "hidden",
              boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px 18px",
                borderBottom: "1px solid #EAECEF",
              }}
            >
              <span
                style={{
                  fontWeight: 700,
                  fontSize: 15,
                  color: "#1E2026",
                }}
              >
                Margin Mode
              </span>
              <button
                onClick={() => setMarginModal(false)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 22,
                  color: "#848E9C",
                  cursor: "pointer",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
            <div
              style={{
                padding: 16,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {(
                [
                  {
                    mode: 0 as MarginMode,
                    icon: "🔒",
                    title: "Isolated Margin",
                    color: "#2563EB",
                    desc: "Only this position's collateral is at risk. Max loss equals your deposited margin. PnL is isolated per position.",
                  },
                  {
                    mode: 1 as MarginMode,
                    icon: "🔗",
                    title: "Cross Margin",
                    color: "#FBBF24",
                    desc: "All positions share one margin pool. PnL updates in real-time across all open positions. Higher capital efficiency, higher risk.",
                  },
                ] as const
              ).map(({ mode, icon, title, color, desc }) => (
                <button
                  key={mode}
                  onClick={() => {
                    setMarginMode(mode);
                    setMarginModal(false);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "14px",
                    border: `2px solid ${
                      marginMode === mode ? color : "#EAECEF"
                    }`,
                    borderRadius: 10,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    background:
                      marginMode === mode ? color + "08" : "#FAFAFA",
                    transition: "all 0.15s",
                    width: "100%",
                  }}
                >
                  <span style={{ fontSize: 22 }}>{icon}</span>
                  <div style={{ textAlign: "left", flex: 1 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 13,
                        color,
                        marginBottom: 4,
                      }}
                    >
                      {title}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "#848E9C",
                        lineHeight: 1.6,
                      }}
                    >
                      {desc}
                    </div>
                  </div>
                  {marginMode === mode && (
                    <span style={{ color, fontSize: 18 }}>✓</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Global CSS ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        @keyframes nxSpin  { to { transform: rotate(360deg); } }
        @keyframes nxPulse { 0%,100%{opacity:1}50%{opacity:0.4} }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
        input[type=range] { -webkit-appearance: none; appearance: none; }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none; width: 14px; height: 14px;
          border-radius: 50%; background: #F0B90B; border: 2px solid #fff;
          box-shadow: 0 2px 6px rgba(240,185,11,0.5); cursor: pointer;
        }
        input[type=range]::-moz-range-thumb { width: 14px; height: 14px; border-radius: 50%; background: #F0B90B; border: 2px solid #fff; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-thumb { background: #EAECEF; border-radius: 4px; }
        .nx-right { scrollbar-width: none; }

        /* ── Mobile Responsive ── */
        @media (max-width: 900px) {
          /* Stack layout vertically */
          .nx-main  { flex-direction: column !important; }
          .nx-right {
            width: 100% !important;
            border-left: none !important;
            border-top: 1px solid #EAECEF;
            max-height: none !important;
            overflow-y: visible !important;
          }
          .nx-left { min-height: 360px !important; }

          /* Top bar - smaller on mobile */
          .nx-topbar { height: 48px !important; padding: 0 10px !important; overflow-x: auto !important; }
          .nx-topbar-price { font-size: 17px !important; }
          .nx-topbar-tick  { display: none !important; }

          /* Chart - smaller height */
          .nx-chart { height: 320px !important; min-height: 320px !important; }

          /* Asset selector text */
          .nx-asset-name { font-size: 13px !important; }
          .nx-asset-sub  { display: none !important; }

          /* Right panel - full width, normal padding */
          .nx-right-inner { padding: 12px !important; gap: 10px !important; }

          /* Position cards - stack vertically, full width */
          .nx-positions-wrap { flex-direction: column !important; }
          .nx-pos-card { max-width: 100% !important; min-width: 0 !important; width: 100% !important; }

          /* Hide some tick stats on small screens */
          .nx-vol-stat  { display: none !important; }
          .nx-fund-stat { display: none !important; }

          /* Leverage presets - 3 per row */
          .nx-lev-presets { flex-wrap: wrap !important; }
        }

        @media (max-width: 480px) {
          .nx-chart { height: 260px !important; min-height: 260px !important; }
          .nx-topbar-price { font-size: 15px !important; }
          .nx-high-low { display: none !important; }
        }
      `}</style>
    </div>
  );
}

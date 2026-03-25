<div align="center">

<img src="https://img.shields.io/badge/⚡-NEXUS_PERPS-F0B90B?style=for-the-badge&labelColor=0f172a&color=F0B90B" height="36"/>

# On-Chain Perpetuals Infrastructure
### Polkadot Hub Testnet · Non-Custodial · 50× Leverage

<br> 

[![License](https://img.shields.io/badge/License-MIT-22c55e?style=flat-square)](https://opensource.org/licenses/MIT)
[![Foundry](https://img.shields.io/badge/Built_With-Foundry-F0B90B?style=flat-square)](https://book.getfoundry.sh/)
[![Network](https://img.shields.io/badge/Network-Polkadot_Hub_Testnet-E6007A?style=flat-square)](https://polkadot.network/)
[![Chain](https://img.shields.io/badge/Chain_ID-420420417-E6007A?style=flat-square)]()
[![CCIP](https://img.shields.io/badge/Cross--Chain-CCIP_Ready-375BD2?style=flat-square)](https://chain.link/cross-chain)

<br>

> **A fully on-chain perpetuals exchange deployed on Polkadot Hub Testnet.**  
> Mock Chainlink price feeds · Binance live prices · CCIP cross-chain margin · 50× leverage.

<br>

<a href="https://nexus-protocol-v2.vercel.app/">
  <img src="https://img.shields.io/badge/%E2%9A%A1_LAUNCH_APP-NEXUS_PERPS-F0B90B?style=for-the-badge&labelColor=0f172a" height="44"/>
</a>

<br><br>

<a href="https://nexus-protocol-v2.vercel.app/">🚀 Live App</a> &nbsp;·&nbsp;
<a href="https://github.com/NexTechArchitect/nexus-polka-perps">💻 Source Code</a> &nbsp;·&nbsp;
<a href="https://nexus-protocol-v2.vercel.app/docs">📜 Docs</a> &nbsp;·&nbsp;
<a href="https://faucet.polkadot.io/">🚰 Get Testnet PAS</a>

</div>

<div align="center">
  <video src="https://github.com/user-attachments/assets/0aa71e44-42ef-43c6-8a9a-1ffb3fe06fd4" 
    width="500" 
    autoplay 
    loop 
    muted 
    playsinline>
  </video>
</div>

---

## 🎯 What Makes Nexus Different

| Problem With Existing Protocols | Nexus Solution |
|:---|:---|
| Oracle manipulation via thin markets | MockAggregatorV3 with per-asset heartbeat staleness guards |
| Liquidity fragmented across chains | CCIP cross-chain margin relay with nonce replay protection |
| Custodial bridges introduce counterparty risk | All collateral lives in `PerpsVault.sol` — non-custodial, on-chain |
| LP inflation attacks on first deposit | `MINIMUM_LIQUIDITY = 1000` shares permanently burned on genesis deposit |
| Dust sweep / precision drain | `scaledAmount % DECIMALS_SCALAR != 0` enforced on every withdrawal |
| Stale oracle prices | Binance WebSocket drives live PnL; entry price saved locally at trade execution |

---

## 📑 Table of Contents

1. [🏛️ Architecture](#-architecture)
2. [✅ Deployed Contracts](#-deployed-contracts)
3. [🧩 Contract Reference](#-contract-reference)
4. [💻 Frontend Stack](#-frontend-stack)
5. [🧪 Test Suite & Coverage](#-test-suite--coverage)
6. [🛠️ Local Setup](#-local-setup)
7. [🔐 Security Model](#-security-model)

---

## 🏛️ Architecture

Five isolated protocol layers. A failure in cross-chain routing cannot affect vault solvency. The oracle layer is fully stateless with zero write access to core contracts.

```text
┌──────────────────────────────────────────────────────────────────┐
│                        USER / DAPP                               │
│         RainbowKit · Wagmi v2 · Viem · Next.js 15 App Router     │
└───────────────────────────┬──────────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────────┐
│                      TRADING ENGINE                              │
│   PositionManager.sol  ·  PnLCalculator.sol  ·  LiquidationEngine│
│   Market & limit orders · Isolated/Cross margin · Batch keepers  │
└────────────┬─────────────────────────────────┬───────────────────┘
             │                                 │
┌────────────▼────────────┐       ┌────────────▼───────────────────┐
│      VAULT LAYER        │       │        ORACLE LAYER            │
│   PerpsVault.sol        │       │   PriceOracle.sol              │
│   18-dec precision      │       │   MockAggregatorV3 (BTC+ETH)   │
│   LP share system       │       │   Heartbeat staleness guard    │
│   settleTrade / PnL     │       │   Binance WS live prices       │
└─────────────────────────┘       └────────────────────────────────┘
             │
┌────────────▼────────────────────────────────────────────────────┐
│                  CROSS-CHAIN LAYER  (CCIP)                      │
│   CrossChainRouter.sol ── encodes & sends trade requests        │
│   MessageReceiver.sol  ── decodes, deduplicates nonce, executes │
│   Source chain + sender whitelist · try/catch pipeline safety   │
└─────────────────────────────────────────────────────────────────┘
```

### Core Design Invariants

**1. No off-chain trust** — Price discovery, execution, liquidation, settlement — all fully on-chain.

**2. 18-decimal precision throughout** — `DECIMALS_SCALAR = 10^(18 - tokenDecimals)` normalizes USDC (6 dec) to 1e18 internally.

**3. Vault solvency is an invariant** — 128 runs × 50 calls = 6,400 randomized state mutations, zero reverts.

**4. Isolated margin by default** — Cross-margin mode uses `_calculateGlobalPnL` iterating all active positions.

---

## ✅ Deployed Contracts

All contracts deployed on **Polkadot Hub Testnet** (Chain ID: `420420417`).

**Explorer:** blockscout-passet-hub.parity-testnet.parity.io  
**RPC:** services.polkadothub-rpc.com/testnet

### Core Trading Engine

| Contract | Address |
|:---|:---|
| **PositionManager** | `0xd16150d0B2a04ECb1Aa09f840556347D5251fB53` |
| **PerpsVault** | `0x9495fE47049a7aFe8180E9e8Aee743D533c67173` |
| **LiquidationEngine** | `0x01721d6502547faFD3049BE60b1485B12407f58B` |
| **PriceOracle** | `0x7C002F51B8D4F06275D43cFD1F15EcbFE7A52803` |
| **PriceKeeper** | `0x481EC593F7bD9aB4219a0d0A185C16F2687871C2` |

### Oracle Feeds & Assets

| Asset | Address | Notes |
|:---|:---|:---|
| **MockUSDC** | `0xDFdb18430C5C5C1EB4F9Abd69a78952f9BC3Afab` | 6-decimal collateral |
| **MockWETH** | `0xE3579516aeB339A4a8624beadaE256619E77F61E` | Test asset |
| **MockWBTC** | `0x20e9D3Ef17753EC0a0349eA7e26c8B8fd2B1A119` | Test asset |
| **ETH Feed** | `0xCbE91D0b302d4eD146eE0CFfbe0d23E93e655d94` | MockAggregatorV3 |
| **BTC Feed** | `0xf3878A726cF855EDF11C8aCbA38bEBd817fa9F23` | MockAggregatorV3 |

### Cross-Chain (CCIP)

| Contract | Address |
|:---|:---|
| **CrossChainRouter** | `0x8768d7470681a81caeA781285c9478dFDD7312e9` |
| **MessageReceiver** | `0xdcd169ca4Ab081C1B926Dc56430ADa8fE1E10A64` |

---

## 🧩 Contract Reference

### Repository Structure

```text
nexus-polka-perps/
├── src/
│   ├── core/
│   │   ├── PositionManager.sol        # Trading engine: market/limit/liquidate/cross-chain
│   │   ├── PerpsVault.sol             # Collateral & LP vault (18-dec precision)
│   │   └── LiquidationEngine.sol      # Keeper-compatible batch liquidator
│   ├── math/
│   │   └── PnLCalculator.sol          # Pure library: PnL, liquidation health, overflow guards
│   ├── oracles/
│   │   └── PriceOracle.sol            # MockAggregatorV3 wrapper + heartbeat staleness
│   ├── mocks/
│   │   ├── MockAggregatorV3.sol       # Chainlink-compatible mock feed
│   │   ├── PriceKeeper.sol            # Permissioned price updater (60s cooldown)
│   │   ├── MockUSDC.sol
│   │   ├── MockWBTC.sol
│   │   └── MockWETH.sol
│   ├── cross-chain/
│   │   ├── CrossChainRouter.sol       # CCIP message sender + fee estimation
│   │   └── MessageReceiver.sol        # CCIP receiver + nonce dedup + try/catch execution
│   ├── account-abstraction/
│   │   ├── SmartAccount.sol           # ERC-4337: EIP-712 signing, nonce, batch execution
│   │   ├── AccountFactory.sol         # CREATE2 deterministic EIP-1167 clone factory
│   │   └── NexusPaymaster.sol         # Verifying paymaster, chain-ID bound
│   ├── interfaces/
│   │   ├── IPerpsCore.sol
│   │   ├── IPriceOracle.sol
│   │   ├── ICrossChain.sol
│   │   └── IEntryPoint.sol
│   └── errors/
│       └── PerpsErrors.sol            # Centralized custom error library
└── web3-app/
    └── src/
        ├── app/
        │   ├── trade/page.tsx         # Trading interface (Binance WS + lightweight-charts)
        │   ├── vaults/page.tsx        # LP vault interface
        │   ├── portfolio/page.tsx     # Position dashboard
        │   └── docs/page.tsx          # Protocol documentation
        ├── hooks/
        │   ├── useVaultOperations.ts
        │   ├── useLPOperations.ts
        │   ├── useVaultStats.ts
        │   └── usePortfolioData.ts
        └── constants/
            ├── contracts.ts           # All deployed addresses + ABIs
            └── abis/                  # Auto-generated ABI JSON files
```

---

### Contract Deep-Dives

#### `PositionManager.sol` — Trading Engine

Full position lifecycle: open → update → close → liquidate.

- **Market Orders** — `openPosition()` validates oracle price, locks collateral in vault, stores position at current mock Chainlink price
- **Limit Orders** — `placeLimitOrder()` locks collateral optimistically. Keeper calls `executeLimitOrder()` when price condition met
- **Cross-Chain Trades** — `executeCrossChainTrade()` gated by `onlyCrossChainReceiver`
- **Liquidations** — Isolated mode uses `PnLCalculator.isLiquidatable()`. Cross-margin computes `totalEquity = vaultCollateral + globalPnL`

#### `PerpsVault.sol` — Collateral & Liquidity

Single contract holding all trader collateral and LP liquidity.

- **Dual accounting** — `traderCollateral` (free) and `lockedCollateral` (in positions) tracked separately
- **LP Shares** — First deposit burns `MINIMUM_LIQUIDITY = 1000` permanently preventing inflation attacks
- **`settleTrade()`** — Atomically unlocks collateral → adjusts `totalLiquidity` for PnL → credits payout to trader
- **Dust prevention** — `withdraw()` enforces `scaledAmount % DECIMALS_SCALAR == 0`

#### `PnLCalculator.sol` — Math Library

Pure Solidity library, zero state.

```text
positionSize   = (collateral × leverage) / 1e18
PnL            = (priceDelta × positionSize) / entryPrice
isLiquidatable = equity ≤ maintenanceMargin
               = (collateral + PnL) ≤ (collateral × liquidationThresholdBps / 10000)
```

---

## 💻 Frontend Stack

**Next.js 15 App Router** with zero backend dependency for read operations.

| Layer | Technology |
|:---|:---|
| Framework | Next.js 15 (TypeScript, App Router) |
| Blockchain | Wagmi v2 + Viem |
| Wallet UI | RainbowKit (MetaMask, Bitget, OKX) |
| Queries | TanStack Query v5 |
| Charts | lightweight-charts (Binance REST API klines) |
| Live Prices | Binance WebSocket (`wss://stream.binance.com`) |
| Styling | Tailwind CSS + Framer Motion |
| Network | Polkadot Hub Testnet (Chain ID: 420420417) |

### Key Frontend Features

- **Live PnL** — Binance WebSocket prices drive real-time P&L display independent of on-chain oracle
- **Entry Price** — Saved locally at trade execution time, survives page refresh
- **Position Polling** — 2s refetch interval, aggressive retry after open/close
- **Lightweight Charts** — Fast candlestick chart via Binance REST API klines

---

## 🧪 Test Suite & Coverage

```bash
forge test        # 95 tests, ~3s
forge coverage    # coverage report
forge test -vvv   # verbose with traces
```

**Invariant Tests (128 runs × 50 calls = 6,400 state mutations, 0 reverts):**

```text
╭─────────────────────┬────────────────────┬───────┬─────────┬──────────╮
│ Contract            │ Selector           │ Calls │ Reverts │ Discards │
╞═════════════════════╪════════════════════╪═══════╪═════════╪══════════╡
│ PositionHandler     │ changeOraclePrice  │ 1,541 │       0 │        0 │
│ PositionHandler     │ createTrader       │ 1,603 │       0 │        1 │
│ PositionHandler     │ openRandomPosition │ 1,659 │       0 │        0 │
│ PositionHandler     │ tryLiquidation     │ 1,598 │       0 │        0 │
╰─────────────────────┴────────────────────┴───────┴─────────┴──────────╯
```

- `invariant_VaultIsSolvent` — `totalLiquidity ≥ 0` holds across all mutations
- `invariant_InternalAccountingConsistent` — internal balances match `ASSET.balanceOf(vault)`
- `invariant_MaxActiveAssetsRespected` — no trader exceeds `maxActiveAssets`

---

## 🛠️ Local Setup

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) (forge, cast, anvil)
- Node.js ≥ 18

### Smart Contracts

```bash
git clone https://github.com/NexTechArchitect/nexus-polka-perps.git
cd nexus-polka-perps

# Install Foundry dependencies
forge install

# Run full test suite (95 tests)
forge test -vv

# Deploy to Polkadot Hub Testnet
cp .env.example .env
# Fill: PRIVATE_KEY

forge script script/deploy/01_DeployMocks.s.sol  --rpc-url polkadot-testnet --broadcast --legacy
forge script script/deploy/02_DeployOracle.s.sol --rpc-url polkadot-testnet --broadcast --legacy
forge script script/deploy/03_DeployVault.s.sol  --rpc-url polkadot-testnet --broadcast --legacy
forge script script/deploy/04_DeployCore.s.sol   --rpc-url polkadot-testnet --broadcast --legacy
forge script script/deploy/05_DeployCCIP.s.sol   --rpc-url polkadot-testnet --broadcast --legacy
```

### Frontend

```bash
cd web3-app
npm install --legacy-peer-deps
npm run dev
# → http://localhost:3000
```

### Network Config (`foundry.toml`)

```toml
[rpc_endpoints]
polkadot-testnet = "https://services.polkadothub-rpc.com/testnet"

[etherscan]
polkadot-testnet = { key = "no-key", url = "https://blockscout-passet-hub.parity-testnet.parity.io/api" }
```

### Get Testnet Tokens

| Token | Faucet |
|:---|:---|
| **PAS** (gas) | [faucet.polkadot.io](https://faucet.polkadot.io/) |
| **USDC** (collateral) | Mint via `MockUSDC.mint()` or ask deployer |

---

## 🔐 Security Model

| Attack Vector | Mitigation |
|:---|:---|
| Oracle price manipulation | MockAggregatorV3 + `block.timestamp - updatedAt > heartbeat` staleness revert |
| Reentrancy | `ReentrancyGuard` on all vault state-changing functions |
| LP share inflation attack | `MINIMUM_LIQUIDITY = 1000` permanently burned on genesis deposit |
| Dust sweep / precision drain | `scaledAmount % DECIMALS_SCALAR != 0` reverts on withdrawal |
| Cross-chain replay | Per-trader nonce map in `MessageReceiver` |
| Unauthorized cross-chain calls | `onlyCrossChainReceiver` + source chain whitelist + sender whitelist |
| Over-withdrawal during active position | `lockedCollateral` tracking prevents withdrawing margin from open positions |
| Keeper reward rug pull | `rescueTokens()` blocks `PROTOCOL_ASSET` from owner withdrawal |
| CCIP pipeline blocking | `try/catch` in `_ccipReceive` — failed trades emit `TradeFailed`, never block pipeline |

> ⚠️ **No formal external security audit has been conducted.** Deployed on Polkadot Hub testnet with testnet assets only. Do not use with real funds.

---

## ⚠️ Testnet Disclaimer

Nexus Perps runs exclusively on **Polkadot Hub Testnet** (Chain ID: 420420417). All assets are testnet tokens with zero real-world value. Get PAS gas tokens from [faucet.polkadot.io](https://faucet.polkadot.io/). This is not financial advice.

<br>

<div align="center">
  <b>Built with ⚡ by <a href="https://github.com/NexTechArchitect">NexTech Architect</a></b><br><br>

  <a href="https://x.com/itZ_AmiT0">
    <img src="https://img.shields.io/badge/𝕏-@itZ__AmiT0-000000?style=flat-square&logo=x" alt="Twitter"/>
  </a>
  <a href="https://github.com/NexTechArchitect">
    <img src="https://img.shields.io/badge/GitHub-NexTechArchitect-181717?style=flat-square&logo=github" alt="GitHub"/>
  </a><br><br>

  <i>Built for the Polkadot Solidity Hackathon 2026</i>
</div>

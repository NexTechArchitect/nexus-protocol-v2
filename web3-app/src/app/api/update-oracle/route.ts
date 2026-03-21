// src/app/api/update-oracle/route.ts
// Server-side oracle updater — no wallet popup needed
// Called automatically by the frontend every 60 seconds
// Uses PRICE_KEEPER_PRIVATE_KEY from Vercel environment variables

import { NextResponse } from "next/server";
import { createWalletClient, createPublicClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const POLKADOT_HUB_TESTNET = {
  id: 420420417,
  name: "Polkadot Hub Testnet",
  network: "polkadot-hub-testnet",
  nativeCurrency: { name: "PAS", symbol: "PAS", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://services.polkadothub-rpc.com/testnet"] },
    public:  { http: ["https://services.polkadothub-rpc.com/testnet"] },
  },
} as const;

const KEEPER_ADDRESS = "0x481EC593F7bD9aB4219a0d0A185C16F2687871C2";
const KEEPER_ABI = parseAbi([
  "function updateAllPrices(int256 _ethPrice, int256 _btcPrice) nonpayable",
  "function lastUpdateTime() view returns (uint256)",
  "function minUpdateInterval() view returns (uint256)",
]);

// Cache last update time to avoid hammering the contract
let lastUpdateMs = 0;
const MIN_INTERVAL_MS = 65_000; // 65s minimum between updates

export async function POST(req: Request) {
  try {
    // Get private key from env
    const pk = process.env.PRICE_KEEPER_PRIVATE_KEY;
    if (!pk) {
      return NextResponse.json({ ok: false, error: "PRICE_KEEPER_PRIVATE_KEY not set in Vercel env" }, { status: 500 });
    }

    // Rate limit: don't update more than once per 65s
    const now = Date.now();
    if (now - lastUpdateMs < MIN_INTERVAL_MS) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: `Too soon — last update ${Math.floor((now - lastUpdateMs) / 1000)}s ago`,
      });
    }

    // Parse prices from request body
    const body = await req.json() as { ethPrice?: number; btcPrice?: number };
    const { ethPrice, btcPrice } = body;

    if (!ethPrice || !btcPrice || ethPrice <= 0 || btcPrice <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid prices" }, { status: 400 });
    }

    // Convert to 8-decimal int256 (Chainlink format)
    const ethInt = BigInt(Math.round(ethPrice * 1e8));
    const btcInt = BigInt(Math.round(btcPrice * 1e8));

    // Create wallet client with server-side private key
    const key = pk.startsWith("0x") ? pk as `0x${string}` : `0x${pk}` as `0x${string}`;
    const account = privateKeyToAccount(key);

    const walletClient = createWalletClient({
      account,
      chain: POLKADOT_HUB_TESTNET,
      transport: http("https://services.polkadothub-rpc.com/testnet"),
    });

    const publicClient = createPublicClient({
      chain: POLKADOT_HUB_TESTNET,
      transport: http("https://services.polkadothub-rpc.com/testnet"),
    });

    // Check if contract cooldown has passed
    try {
      const [lastUpdate, minInterval] = await Promise.all([
        publicClient.readContract({ address: KEEPER_ADDRESS, abi: KEEPER_ABI, functionName: "lastUpdateTime" }),
        publicClient.readContract({ address: KEEPER_ADDRESS, abi: KEEPER_ABI, functionName: "minUpdateInterval" }),
      ]);
      const blockTs = BigInt(Math.floor(Date.now() / 1000));
      if (blockTs - lastUpdate < minInterval) {
        return NextResponse.json({
          ok: true,
          skipped: true,
          reason: `Contract cooldown not passed (${minInterval}s)`,
        });
      }
    } catch {
      // If read fails, still try to update
    }

    // Send oracle update transaction
    const hash = await walletClient.writeContract({
      address: KEEPER_ADDRESS,
      abi: KEEPER_ABI,
      functionName: "updateAllPrices",
      args: [ethInt, btcInt],
    });

    lastUpdateMs = Date.now();

    return NextResponse.json({
      ok: true,
      hash,
      ethPrice,
      btcPrice,
      updatedAt: new Date().toISOString(),
    });

  } catch (err: unknown) {
    const msg = (err as { shortMessage?: string; message?: string })?.shortMessage
      ?? (err as Error)?.message
      ?? "Unknown error";

    // Cooldown error is expected — not a real error
    if (msg.includes("TooFrequent") || msg.includes("cooldown") || msg.includes("frequent")) {
      return NextResponse.json({ ok: true, skipped: true, reason: "Contract cooldown" });
    }

    console.error("[oracle-update]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// GET — health check
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "Nexus Oracle Updater",
    keeper: KEEPER_ADDRESS,
    lastUpdate: lastUpdateMs > 0 ? new Date(lastUpdateMs).toISOString() : "never",
  });
}
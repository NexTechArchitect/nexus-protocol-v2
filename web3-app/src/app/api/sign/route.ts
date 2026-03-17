import { NextRequest, NextResponse } from 'next/server';
import { keccak256, encodePacked, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, http } from 'viem';
import { sepolia } from 'viem/chains';

// ─── Nonce store (replace with Redis in prod) ─────────────────────────────────
const nonceStore = new Map<string, { nonce: string; expiresAt: number }>();
const NONCE_TTL   = 5  * 60 * 1000;
const SESSION_TTL = 24 * 60 * 60 * 1000;

// ─── Safe private key parser ──────────────────────────────────────────────────
// Accepts:  "abcd...ef"  OR  "0xabcd...ef"  (64 hex chars = 32 bytes)
function parsePK(raw: string | undefined): Hex | null {
  if (!raw) return null;
  const clean = raw.trim().replace(/\s/g, '').replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) {
    console.warn(
      '[sign] VERIFYING_SIGNER_PRIVATE_KEY invalid — need 64 hex chars, got',
      clean.length, '— paymaster sig disabled'
    );
    return null;
  }
  return `0x${clean}` as Hex;
}

// ─── GET /api/sign?address=0x… ────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')?.toLowerCase();
  if (!address || !/^0x[0-9a-f]{40}$/.test(address))
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });

  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  nonceStore.set(address, { nonce, expiresAt: Date.now() + NONCE_TTL });
  return NextResponse.json({ nonce });
}

// ─── POST /api/sign ───────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let body: { address: string; smartAccount: string; nonce: string; signature: string; message: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { address, smartAccount, nonce, signature, message } = body;
  const addr = address?.toLowerCase();

  if (!addr || !smartAccount || !nonce || !signature || !message)
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  // 1. Nonce
  const stored = nonceStore.get(addr);
  if (!stored || stored.nonce !== nonce || Date.now() > stored.expiresAt)
    return NextResponse.json({ error: 'Invalid or expired nonce' }, { status: 401 });

  // 2. Verify SIWE signature
  try {
    const { verifyMessage } = await import('viem');
    const ok = await verifyMessage({ address: address as `0x${string}`, message, signature: signature as `0x${string}` });
    if (!ok) return NextResponse.json({ error: 'Bad signature' }, { status: 401 });
  } catch {
    return NextResponse.json({ error: 'Signature check failed' }, { status: 401 });
  }

  nonceStore.delete(addr); // one-time

  // 3. Paymaster signature
  const sessionExpiry = Math.floor((Date.now() + SESSION_TTL) / 1000);
  let paymasterSignature: string | null = null;

  const pk            = parsePK(process.env.VERIFYING_SIGNER_PRIVATE_KEY);
  const paymasterAddr = process.env.NEXT_PUBLIC_PAYMASTER_ADDRESS as `0x${string}` | undefined;

  if (pk && paymasterAddr) {
    try {
      const account = privateKeyToAccount(pk);
      const client  = createWalletClient({ account, chain: sepolia, transport: http() });

      const hash = keccak256(encodePacked(
        ['address', 'uint256', 'address', 'uint256'],
        [smartAccount as `0x${string}`, BigInt(sepolia.id), paymasterAddr, BigInt(sessionExpiry)]
      ));

      paymasterSignature = await client.signMessage({ message: { raw: hash } });
    } catch (e) {
      console.error('[sign] Paymaster signing error:', e);
    }
  }

  // 4. Session token
  const sessionToken = Buffer.from(JSON.stringify({
    address: addr,
    smartAccount: smartAccount.toLowerCase(),
    expiresAt: Date.now() + SESSION_TTL,
    issuedAt:  Date.now(),
  })).toString('base64');

  return NextResponse.json({ success: true, sessionToken, paymasterSignature, sessionExpiry, smartAccount });
}

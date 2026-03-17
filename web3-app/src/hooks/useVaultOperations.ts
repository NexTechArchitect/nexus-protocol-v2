'use client';

import { useWriteContract, useWaitForTransactionReceipt, useReadContract, useAccount } from 'wagmi';
import { CONTRACTS } from '@/constants/contracts';
import { parseUnits, maxUint256 } from 'viem';
import { useState, useEffect, useRef } from 'react';

// ─── ABIs ─────────────────────────────────────────────────────────────────────
const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    name: 'allowance',
    type: 'function',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

// ─── CORRECT vault ABIs ───────────────────────────────────────────────────────
// deposit()   → trader collateral (used for trading margin) ← THIS is what portfolio uses
// withdraw()  → trader withdraws free collateral
// addLiquidity / removeLiquidity → LP functions (vault page only, NOT portfolio)
const VAULT_TRADER_ABI = [
  {
    name: 'deposit',       // PerpsVault.deposit(uint256 amount) — stores as 18-dec internally
    type: 'function',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'withdraw',      // PerpsVault.withdraw(uint256 scaledAmount) — pass 18-dec amount
    type: 'function',
    inputs: [{ name: 'scaledAmount', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useVaultOperations(
  onNotification?: (
    title: string,
    msg: string,
    type: 'loading' | 'success' | 'error',
    hash?: string,
  ) => void,
) {
  const { address } = useAccount();

  const [status, setStatus] = useState<
    'IDLE' | 'APPROVING' | 'DEPOSITING' | 'WITHDRAWING' | 'SUCCESS'
  >('IDLE');

  // Pending USDC amount (6-dec bigint) to deposit after approval confirms
  const pendingAmountRef = useRef<bigint | null>(null);

  // ── Write hooks ──────────────────────────────────────────────────────────
  const { writeContract: writeApprove, data: approveHash, isPending: isApprovePending } = useWriteContract();
  const { writeContract: writeDeposit,  data: depositHash,  isPending: isDepositPending  } = useWriteContract();
  const { writeContract: writeWithdraw, data: withdrawHash, isPending: isWithdrawPending } = useWriteContract();

  // ── Receipt hooks ─────────────────────────────────────────────────────────
  const { isLoading: isApproveConfirming, isSuccess: isApproveConfirmed } =
    useWaitForTransactionReceipt({ hash: approveHash });
  const { isLoading: isDepositConfirming, isSuccess: isDepositSuccess } =
    useWaitForTransactionReceipt({ hash: depositHash });
  const { isLoading: isWithdrawConfirming, isSuccess: isWithdrawSuccess } =
    useWaitForTransactionReceipt({ hash: withdrawHash });

  // ── Allowance ─────────────────────────────────────────────────────────────
  const { data: allowanceData, refetch: refetchAllowance } = useReadContract({
    address: CONTRACTS.USDC.address,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, CONTRACTS.VAULT.address] : undefined,
    query: { refetchInterval: 3000 },
  });

  const currentAllowance = (allowanceData as bigint) ?? BigInt(0);
  const currentHash = approveHash ?? depositHash ?? withdrawHash;

  // ── After approval confirmed → fire deposit ───────────────────────────────
  useEffect(() => {
    if (!isApproveConfirmed) return;
    void refetchAllowance();

    const amt = pendingAmountRef.current;
    if (!amt) return;
    pendingAmountRef.current = null; // prevent double-fire

    onNotification?.('Approved ✓', 'Now depositing to vault…', 'loading', approveHash);
    setStatus('DEPOSITING');

    // vault.deposit() takes 6-dec USDC amount — it scales internally to 18-dec
    writeDeposit({
      address: CONTRACTS.VAULT.address,
      abi: VAULT_TRADER_ABI,
      functionName: 'deposit',
      args: [amt],
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isApproveConfirmed]);

  // ── Notification effects ──────────────────────────────────────────────────
  useEffect(() => {
    if (isApproveConfirming)
      onNotification?.('Approving USDC…', 'Waiting for on-chain confirmation…', 'loading', approveHash);
  }, [isApproveConfirming]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isDepositConfirming)
      onNotification?.('Depositing…', 'Adding collateral to vault…', 'loading', depositHash);
  }, [isDepositConfirming]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isWithdrawConfirming)
      onNotification?.('Withdrawing…', 'Returning USDC to wallet…', 'loading', withdrawHash);
  }, [isWithdrawConfirming]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Deposit success ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isDepositSuccess) return;
    onNotification?.('Deposit Successful! ✓', 'Vault balance is updating…', 'success', depositHash);
    setStatus('SUCCESS');
    pendingAmountRef.current = null;
    setTimeout(() => setStatus('IDLE'), 4000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDepositSuccess]);

  // ── Withdraw success ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isWithdrawSuccess) return;
    onNotification?.('Withdrawal Successful! ✓', 'USDC returned to your wallet.', 'success', withdrawHash);
    setStatus('SUCCESS');
    setTimeout(() => setStatus('IDLE'), 4000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWithdrawSuccess]);

  // ── handleDeposit ─────────────────────────────────────────────────────────
  // amountStr = human-readable USDC e.g. "100"
  // vault.deposit() accepts raw 6-dec USDC (e.g. 100_000_000 for $100)
  const handleDeposit = (amountStr: string) => {
    if (!amountStr || !address) return;
    const usdcAmount = parseUnits(amountStr, 6); // 6-dec USDC

    if (currentAllowance >= usdcAmount) {
      // Already approved — deposit directly
      setStatus('DEPOSITING');
      writeDeposit({
        address: CONTRACTS.VAULT.address,
        abi: VAULT_TRADER_ABI,
        functionName: 'deposit',
        args: [usdcAmount],
      });
    } else {
      // Approve max so user never has to approve again
      pendingAmountRef.current = usdcAmount;
      setStatus('APPROVING');
      writeApprove({
        address: CONTRACTS.USDC.address,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [CONTRACTS.VAULT.address, maxUint256],
      });
    }
  };

  // ── handleWithdraw ────────────────────────────────────────────────────────
  // vault.withdraw() takes a SCALED (18-dec) amount
  // freeCollateral from getTraderCollateral() is already 18-dec
  // So we just pass parseUnits(amountStr, 18)
  const handleWithdraw = (amountStr: string) => {
    if (!amountStr || !address) return;
    // scaledAmount = 18-dec (vault stores collateral scaled by 1e12)
    const scaledAmount = parseUnits(amountStr, 18);
    setStatus('WITHDRAWING');
    writeWithdraw({
      address: CONTRACTS.VAULT.address,
      abi: VAULT_TRADER_ABI,
      functionName: 'withdraw',
      args: [scaledAmount],
    });
  };

  // ── getActionState ────────────────────────────────────────────────────────
  const getActionState = (amountStr: string) => {
    if (!amountStr || parseFloat(amountStr) <= 0) return 'ENTER_AMOUNT';
    try {
      const amt = parseUnits(amountStr, 6);
      return currentAllowance >= amt ? 'READY_TO_DEPOSIT' : 'NEEDS_APPROVAL';
    } catch {
      return 'ENTER_AMOUNT';
    }
  };

  return {
    handleDeposit,
    handleWithdraw,
    getActionState,
    currentHash,
    isLoading:
      isApprovePending   ||
      isDepositPending   ||
      isWithdrawPending  ||
      isApproveConfirming ||
      isDepositConfirming ||
      isWithdrawConfirming,
    status,
    isSuccess: isDepositSuccess || isWithdrawSuccess,
  };
}
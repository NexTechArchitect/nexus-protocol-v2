'use client';

import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
  useAccount,
} from 'wagmi';
import { CONTRACTS } from '@/constants/contracts';
import { parseUnits } from 'viem';
import { useState, useEffect, useRef } from 'react';
import { useVaultStats } from './useVaultStats';

// ─── Minimal ABIs — wallet decodes these cleanly ──────────────────────────────
const ERC20_APPROVE_ABI = [
  {
    name: 'approve',
    type: 'function',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount',  type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    name: 'allowance',
    type: 'function',
    inputs: [
      { name: 'owner',   type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

// Only the two LP functions — nothing else sent to wallet
const ADD_LIQUIDITY_ABI = [
  {
    name: 'addLiquidity',
    type: 'function',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
] as const;

const REMOVE_LIQUIDITY_ABI = [
  {
    name: 'removeLiquidity',
    type: 'function',
    inputs: [{ name: 'shares', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useLPOperations(
  onNotification?: (
    title: string,
    msg: string,
    type: 'loading' | 'success' | 'error',
    hash?: string,
  ) => void,
) {
  const { address } = useAccount();
  const { refetch } = useVaultStats();

  const [status, setStatus] = useState<
    'IDLE' | 'APPROVING' | 'DEPOSITING' | 'WITHDRAWING' | 'SUCCESS'
  >('IDLE');

  const pendingAmountRef = useRef<bigint | null>(null);

  // ── Write hooks ──────────────────────────────────────────────────────────
  const { writeContract: writeApprove,          data: approveHash,    isPending: isApprovePending    } = useWriteContract();
  const { writeContract: writeAddLiquidity,     data: addLiqHash,     isPending: isAddLiqPending     } = useWriteContract();
  const { writeContract: writeRemoveLiquidity,  data: removeLiqHash,  isPending: isRemoveLiqPending  } = useWriteContract();

  // ── Receipt hooks ────────────────────────────────────────────────────────
  const { isLoading: isApproveConfirming,   isSuccess: isApproveConfirmed  } = useWaitForTransactionReceipt({ hash: approveHash   });
  const { isLoading: isAddLiqConfirming,    isSuccess: isAddLiqSuccess     } = useWaitForTransactionReceipt({ hash: addLiqHash     });
  const { isLoading: isRemoveLiqConfirming, isSuccess: isRemoveLiqSuccess  } = useWaitForTransactionReceipt({ hash: removeLiqHash  });

  // ── Allowance ────────────────────────────────────────────────────────────
  const { data: allowanceData, refetch: refetchAllowance } = useReadContract({
    address: CONTRACTS.USDC.address,
    abi: ERC20_APPROVE_ABI,
    functionName: 'allowance',
    args: address ? [address, CONTRACTS.VAULT.address] : undefined,
    query: { refetchInterval: 3000 },
  });

  const currentAllowance = (allowanceData as bigint) ?? BigInt(0);
  const currentHash = approveHash ?? addLiqHash ?? removeLiqHash;

  useEffect(() => {
    if (!isApproveConfirmed) return;

    refetchAllowance();

    const amt = pendingAmountRef.current;
    if (!amt) return;

    pendingAmountRef.current = null; // prevent double-fire

    onNotification?.(
      'Approved ✓',
      'Submitting liquidity deposit...',
      'loading',
      approveHash,
    );
    setStatus('DEPOSITING');

    writeAddLiquidity({
      address: CONTRACTS.VAULT.address,
      abi: ADD_LIQUIDITY_ABI,        // ← minimal ABI only
      functionName: 'addLiquidity',
      args: [amt],
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isApproveConfirmed]);

  // ── Notifications while mining ───────────────────────────────────────────
  useEffect(() => {
    if (isApproveConfirming)
      onNotification?.('Approving USDC…', 'Waiting for confirmation...', 'loading', approveHash);
  }, [isApproveConfirming]);

  useEffect(() => {
    if (isAddLiqConfirming)
      onNotification?.('Adding Liquidity…', 'Minting HLV shares...', 'loading', addLiqHash);
  }, [isAddLiqConfirming]);

  useEffect(() => {
    if (isRemoveLiqConfirming)
      onNotification?.('Removing Liquidity…', 'Burning HLV shares...', 'loading', removeLiqHash);
  }, [isRemoveLiqConfirming]);

  // ── Success ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAddLiqSuccess) return;
    onNotification?.('Liquidity Added! 🎉', 'HLV shares minted to your account.', 'success', addLiqHash);
    setStatus('SUCCESS');
    pendingAmountRef.current = null;
    refetch();
    setTimeout(() => setStatus('IDLE'), 3000);
  }, [isAddLiqSuccess]);

  useEffect(() => {
    if (!isRemoveLiqSuccess) return;
    onNotification?.('Liquidity Removed ✓', 'USDC returned to your wallet.', 'success', removeLiqHash);
    setStatus('SUCCESS');
    refetch();
    setTimeout(() => setStatus('IDLE'), 3000);
  }, [isRemoveLiqSuccess]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleAddLiquidity = (amountStr: string) => {
    if (!amountStr || !address) return;

    const usdcAmount = parseUnits(amountStr, 6); // USDC = 6 decimals

    if (currentAllowance >= usdcAmount) {
      // Allowance sufficient → go straight to addLiquidity
      setStatus('DEPOSITING');
      writeAddLiquidity({
        address: CONTRACTS.VAULT.address,
        abi: ADD_LIQUIDITY_ABI,
        functionName: 'addLiquidity',
        args: [usdcAmount],
      });
    } else {
      // Need approval first → save amount, fire approve
      pendingAmountRef.current = usdcAmount;
      setStatus('APPROVING');
      writeApprove({
        address: CONTRACTS.USDC.address,
        abi: ERC20_APPROVE_ABI,
        functionName: 'approve',
        args: [CONTRACTS.VAULT.address, usdcAmount],
      });
    }
  };

  const handleRemoveLiquidity = (sharesStr: string) => {
    if (!sharesStr || !address) return;

    const shares = parseUnits(sharesStr, 18); // HLV shares = 18 decimals
    setStatus('WITHDRAWING');
    writeRemoveLiquidity({
      address: CONTRACTS.VAULT.address,
      abi: REMOVE_LIQUIDITY_ABI,
      functionName: 'removeLiquidity',
      args: [shares],
    });
  };

  const getActionState = (amountStr: string) => {
    if (!amountStr || parseFloat(amountStr) <= 0) return 'ENTER_AMOUNT';
    try {
      const amt = parseUnits(amountStr, 6);
      return currentAllowance >= amt ? 'READY_TO_DEPOSIT' : 'NEEDS_APPROVAL';
    } catch {
      return 'ENTER_AMOUNT';
    }
  };

  const isWaitingApproval = !!approveHash && !isApproveConfirmed && !isApproveConfirming;

  return {
    handleAddLiquidity,
    handleRemoveLiquidity,
    getActionState,
    status,
    isLoading:
      isApprovePending    ||
      isAddLiqPending     ||
      isRemoveLiqPending  ||
      isApproveConfirming ||
      isAddLiqConfirming  ||
      isRemoveLiqConfirming,
    isWaitingApproval,
    currentHash,
  };
}

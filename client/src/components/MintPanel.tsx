"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatEther, formatUnits, isAddress, parseEther, parseUnits, zeroAddress } from "viem";
import { zyncAbi } from "../abi/zync";
import type { ApiConfig } from "../types";
import { useWallet } from "../wallet/WalletContext";
import {
  classifyWalletError,
  describeWalletError,
  ensureWalletChain,
  isZeroAddress,
} from "../wallet/chain";

type TxState = {
  phase: "idle" | "pending" | "confirmed" | "rejected" | "revert" | "rpc" | "error";
  message?: string;
  hash?: `0x${string}`;
};

type ActionCardProps = {
  title: string;
  description: string;
  children: ReactNode;
};

function ActionCard({ title, description, children }: ActionCardProps) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-4">
      <div className="mb-4">
        <h3 className="m-0 text-base font-semibold text-white">{title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-white/50">{description}</p>
      </div>
      {children}
    </div>
  );
}

function StatusLine({ state }: { state: TxState }) {
  if (state.phase === "idle") return null;
  const tone =
    state.phase === "confirmed"
      ? "text-[rgba(110,231,194,0.95)]"
      : state.phase === "pending"
        ? "text-amber-200"
        : state.phase === "rejected"
          ? "text-orange-200"
          : "text-red-300";
  return (
    <div className={`mt-3 rounded-xl border border-white/[0.07] bg-black/25 p-3 text-xs leading-relaxed ${tone}`}>
      <div className="font-medium">{state.message}</div>
      {state.hash && <div className="mt-1 font-mono break-all text-white/60">{state.hash}</div>}
    </div>
  );
}

export function MintPanel({ cfg }: { cfg: ApiConfig }) {
  const {
    address,
    walletChainId,
    publicClient,
    walletClient,
    chain,
    requestConnect,
    eip1193Provider,
  } = useWallet();

  const tokenAddress = cfg.zync_token_address as `0x${string}`;
  const tokenReady = !isZeroAddress(cfg.zync_token_address);
  const wrongChain = Boolean(address) && walletChainId !== undefined && walletChainId !== cfg.chain_id;
  const networkReady = !wrongChain;

  const [mintEth, setMintEth] = useState("0.01");
  const [burnAmount, setBurnAmount] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState("");

  const [mintPriceWei, setMintPriceWei] = useState<bigint | undefined>();
  const [symbol, setSymbol] = useState("ZYNC");
  const [decimals, setDecimals] = useState(18);
  const [maxSupply, setMaxSupply] = useState<bigint | undefined>();
  const [totalSupply, setTotalSupply] = useState<bigint | undefined>();
  const [balance, setBalance] = useState<bigint>(0n);
  const [readErr, setReadErr] = useState<string | undefined>();

  const [mintTx, setMintTx] = useState<TxState>({ phase: "idle" });
  const [burnTx, setBurnTx] = useState<TxState>({ phase: "idle" });
  const [transferTx, setTransferTx] = useState<TxState>({ phase: "idle" });

  const autoSwitchAttempted = useRef(false);

  const refreshReads = useCallback(async () => {
    if (!tokenReady) return;
    try {
      setReadErr(undefined);
      const reader = address ?? zeroAddress;
      const [p, sym, dec, max, tot, bal] = await Promise.all([
        publicClient.readContract({ address: tokenAddress, abi: zyncAbi, functionName: "mintPriceWei" }),
        publicClient.readContract({ address: tokenAddress, abi: zyncAbi, functionName: "symbol" }),
        publicClient.readContract({ address: tokenAddress, abi: zyncAbi, functionName: "decimals" }),
        publicClient.readContract({ address: tokenAddress, abi: zyncAbi, functionName: "MAX_SUPPLY" }),
        publicClient.readContract({ address: tokenAddress, abi: zyncAbi, functionName: "totalSupply" }),
        publicClient.readContract({ address: tokenAddress, abi: zyncAbi, functionName: "balanceOf", args: [reader] }),
      ]);
      setMintPriceWei(p);
      setSymbol(sym);
      setDecimals(Number(dec));
      setMaxSupply(max);
      setTotalSupply(tot);
      setBalance(address ? bal : 0n);
    } catch (error) {
      setReadErr(error instanceof Error ? error.message : "Unable to read token state.");
    }
  }, [address, publicClient, tokenAddress, tokenReady]);

  useEffect(() => {
    void refreshReads();
  }, [refreshReads]);

  useEffect(() => {
    autoSwitchAttempted.current = false;
  }, [address, cfg.chain_id]);

  useEffect(() => {
    if (!address || !wrongChain || autoSwitchAttempted.current || !eip1193Provider) return;
    autoSwitchAttempted.current = true;
    void ensureWalletChain(eip1193Provider, chain, cfg.rpc_url).catch((err) => {
      setReadErr(describeWalletError(err));
    });
  }, [address, chain, cfg.rpc_url, eip1193Provider, wrongChain]);

  const mintAmountWei = useMemo(() => {
    try {
      return parseEther(mintEth || "0");
    } catch {
      return 0n;
    }
  }, [mintEth]);

  const burnAmountWei = useMemo(() => {
    try {
      return parseUnits(burnAmount || "0", decimals);
    } catch {
      return 0n;
    }
  }, [burnAmount, decimals]);

  const transferAmountWei = useMemo(() => {
    try {
      return parseUnits(transferAmount || "0", decimals);
    } catch {
      return 0n;
    }
  }, [transferAmount, decimals]);

  const mintDisabled = !address || !walletClient || !networkReady || !tokenReady || mintAmountWei <= 0n;
  const burnDisabled = !address || !walletClient || !networkReady || !tokenReady || burnAmountWei <= 0n || burnAmountWei > balance;
  const transferRecipientValid = isAddress(transferTo);
  const transferDisabled =
    !address ||
    !walletClient ||
    !networkReady ||
    !tokenReady ||
    !transferRecipientValid ||
    transferAmountWei <= 0n ||
    transferAmountWei > balance;

  async function withChain<T>(fn: () => Promise<T>) {
    if (!eip1193Provider) {
      throw new Error("Wallet provider not available.");
    }
    if (wrongChain) {
      await ensureWalletChain(eip1193Provider, chain, cfg.rpc_url);
    }
    return fn();
  }

  async function executeMint() {
    if (!address || !walletClient) return;
    setMintTx({ phase: "pending", message: "Waiting for wallet confirmation..." });
    try {
      const hash = await withChain(() =>
        walletClient.writeContract({
          address: tokenAddress,
          abi: zyncAbi,
          functionName: "mintWithEth",
          value: mintAmountWei,
          account: address,
          chain,
        }),
      );
      setMintTx({ phase: "pending", hash, message: "Transaction pending..." });
      await publicClient.waitForTransactionReceipt({ hash });
      setMintTx({ phase: "confirmed", hash, message: "Transaction confirmed." });
      await refreshReads();
    } catch (error) {
      const kind = classifyWalletError(error);
      setMintTx({
        phase: kind === "unknown" ? "error" : kind,
        message: describeWalletError(error),
      });
    }
  }

  async function executeBurn() {
    if (!address || !walletClient) return;
    if (burnAmountWei > balance) {
      setBurnTx({ phase: "error", message: "Balance too low for this burn amount." });
      return;
    }
    setBurnTx({ phase: "pending", message: "Waiting for wallet confirmation..." });
    try {
      const hash = await withChain(() =>
        walletClient.writeContract({
          address: tokenAddress,
          abi: zyncAbi,
          functionName: "burn",
          args: [burnAmountWei],
          account: address,
          chain,
        }),
      );
      setBurnTx({ phase: "pending", hash, message: "Transaction pending..." });
      await publicClient.waitForTransactionReceipt({ hash });
      setBurnTx({ phase: "confirmed", hash, message: "Burn confirmed." });
      await refreshReads();
    } catch (error) {
      const kind = classifyWalletError(error);
      setBurnTx({
        phase: kind === "unknown" ? "error" : kind,
        message: describeWalletError(error),
      });
    }
  }

  async function executeTransfer() {
    if (!address || !walletClient || !transferRecipientValid) return;
    if (transferAmountWei > balance) {
      setTransferTx({ phase: "error", message: "Balance too low for this transfer." });
      return;
    }
    setTransferTx({ phase: "pending", message: "Waiting for wallet confirmation..." });
    try {
      const hash = await withChain(() =>
        walletClient.writeContract({
          address: tokenAddress,
          abi: zyncAbi,
          functionName: "transfer",
          args: [transferTo as `0x${string}`, transferAmountWei],
          account: address,
          chain,
        }),
      );
      setTransferTx({ phase: "pending", hash, message: "Transaction pending..." });
      await publicClient.waitForTransactionReceipt({ hash });
      setTransferTx({ phase: "confirmed", hash, message: "Transfer confirmed." });
      await refreshReads();
    } catch (error) {
      const kind = classifyWalletError(error);
      setTransferTx({
        phase: kind === "unknown" ? "error" : kind,
        message: describeWalletError(error),
      });
    }
  }

  if (!tokenReady) {
    return (
      <div className="rounded-xl border border-amber-400/20 bg-[rgba(12,14,24,0.7)] p-6 backdrop-blur-xl">
        <h2 className="mb-2 text-lg font-semibold">Deploy the contract first</h2>
        <p className="mb-4 text-sm leading-relaxed text-white/55">
          Set <code className="font-mono text-[#6ee7c2]">ZYNC_TOKEN_ADDRESS</code> in <code className="font-mono text-[#6ee7c2]">.env</code> to your deployed{" "}
          <code className="font-mono text-[#6ee7c2]">ZyncToken</code> address, then restart the app.
        </p>
        <pre className="overflow-x-auto rounded-xl bg-black/30 p-4 font-mono text-xs text-white/45 whitespace-pre-wrap">
{`npm run chain
npm run deploy`}
        </pre>
      </div>
    );
  }

  const totalSupplyPct =
    maxSupply && totalSupply ? Number((totalSupply * 100n) / maxSupply) : 0;

  return (
    <div className="rounded-xl border border-white/[0.07] bg-[rgba(12,14,24,0.7)] p-6 backdrop-blur-xl sm:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="m-0 text-xl font-semibold tracking-tight">ZYNC Token Console</h2>
          <p className="mt-1 text-sm leading-relaxed text-white/55">
            Mint, burn, and transfer ZYNC from one connected wallet. The panel refreshes balance and supply after each confirmed receipt.
          </p>
        </div>
        <div className="font-mono text-xs text-white/40 break-all sm:text-right sm:max-w-[220px]">{tokenAddress}</div>
      </div>

      {!address && (
        <div className="mb-5 rounded-xl border border-white/[0.07] bg-black/25 p-4 text-sm text-white/60">
          Wallet not connected. Connect MetaMask to mint, burn, or transfer ZYNC.
        </div>
      )}

      {wrongChain && (
        <div className="mb-5 flex flex-col gap-3 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100 sm:flex-row sm:items-center sm:justify-between">
          <div>
            Wrong network detected. Switch MetaMask to Hardhat Local with chain ID {cfg.chain_id}.
          </div>
          <button
            type="button"
            onClick={() => void ensureWalletChain(eip1193Provider, chain, cfg.rpc_url).catch((err) => setReadErr(describeWalletError(err)))}
            className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-xs font-semibold text-amber-50 hover:bg-amber-300/15"
          >
            Switch network
          </button>
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-white/[0.07] bg-black/25 p-4">
          <p className="mb-1 text-xs uppercase tracking-wider text-white/45">Price</p>
          <p className="m-0 font-mono text-sm text-[#6ee7c2]">
            {mintPriceWei != null ? `${formatEther(mintPriceWei)} ETH / 1 ${symbol}` : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-black/25 p-4">
          <p className="mb-1 text-xs uppercase tracking-wider text-white/45">Your balance</p>
          <p className="m-0 font-mono text-sm">
            {address ? `${formatUnits(balance, decimals)} ${symbol}` : "Connect wallet"}
          </p>
        </div>
        {maxSupply != null && totalSupply != null && (
          <div className="col-span-full rounded-xl border border-white/[0.07] bg-black/25 p-4">
            <p className="mb-1 text-xs uppercase tracking-wider text-white/45">Supply</p>
            <p className="mb-2 font-mono text-sm">
              {formatUnits(totalSupply, decimals)} / {formatUnits(maxSupply, decimals)} {symbol}
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#12b886] to-[#8b5cf6]"
                style={{ width: `${Math.min(totalSupplyPct, 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ActionCard
          title="Mint"
          description="Send ETH and wait for the receipt, then refresh balance and total supply."
        >
          <label className="mb-2 block text-xs uppercase tracking-wider text-white/45">Amount to spend (ETH)</label>
          <input
            value={mintEth}
            onChange={(e) => setMintEth(e.target.value)}
            placeholder="0.0"
            inputMode="decimal"
            className="w-full rounded-xl border border-white/[0.08] bg-[#050a0f] px-4 py-3 font-mono text-sm text-white outline-none focus:ring-2 focus:ring-[rgba(45,212,163,0.4)]"
          />
          <p className="mt-2 text-xs text-white/40">
            Estimated receive:{" "}
            <span className="font-mono text-[#6ee7c2]">
              {mintPriceWei != null ? `${formatUnits((mintAmountWei * 10n ** 18n) / mintPriceWei, decimals)} ${symbol}` : "—"}
            </span>
          </p>
          <button
            type="button"
            disabled={mintDisabled}
            onClick={() => {
              if (!address) {
                requestConnect();
                return;
              }
              void executeMint();
            }}
            className="mt-4 w-full rounded-xl border-none bg-gradient-to-r from-[#12b886] to-[#2dd4a3] py-3.5 text-sm font-semibold text-[#050a0f] transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {!address ? "Connect wallet to mint" : mintTx.phase === "pending" ? "Transaction pending..." : "Mint with ETH"}
          </button>
          <StatusLine state={mintTx} />
        </ActionCard>

        <ActionCard
          title="Burn"
          description="Burn your own ZYNC. The button stays disabled if the wallet is disconnected, on the wrong chain, or short on balance."
        >
          <label className="mb-2 block text-xs uppercase tracking-wider text-white/45">Amount to burn</label>
          <input
            value={burnAmount}
            onChange={(e) => setBurnAmount(e.target.value)}
            placeholder="0"
            inputMode="decimal"
            className="w-full rounded-xl border border-white/[0.08] bg-[#050a0f] px-4 py-3 font-mono text-sm text-white outline-none focus:ring-2 focus:ring-[rgba(45,212,163,0.4)]"
          />
          <p className="mt-2 text-xs text-white/40">
            Available balance: <span className="font-mono text-[#6ee7c2]">{formatUnits(balance, decimals)} {symbol}</span>
          </p>
          <button
            type="button"
            disabled={burnDisabled}
            onClick={() => {
              if (!address) {
                requestConnect();
                return;
              }
              void executeBurn();
            }}
            className="mt-4 w-full rounded-xl border-none bg-gradient-to-r from-[#ef4444] to-[#f59e0b] py-3.5 text-sm font-semibold text-[#160b0b] transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {burnTx.phase === "pending" ? "Transaction pending..." : "Burn"}
          </button>
          <StatusLine state={burnTx} />
        </ActionCard>

        <ActionCard
          title="Transfer"
          description="Validate the recipient address and amount before sending the ERC-20 transfer."
        >
          <label className="mb-2 block text-xs uppercase tracking-wider text-white/45">Recipient</label>
          <input
            value={transferTo}
            onChange={(e) => setTransferTo(e.target.value)}
            placeholder="0x..."
            className="mb-3 w-full rounded-xl border border-white/[0.08] bg-[#050a0f] px-4 py-3 font-mono text-sm text-white outline-none focus:ring-2 focus:ring-[rgba(45,212,163,0.4)]"
          />
          <label className="mb-2 block text-xs uppercase tracking-wider text-white/45">Amount</label>
          <input
            value={transferAmount}
            onChange={(e) => setTransferAmount(e.target.value)}
            placeholder="25"
            inputMode="decimal"
            className="w-full rounded-xl border border-white/[0.08] bg-[#050a0f] px-4 py-3 font-mono text-sm text-white outline-none focus:ring-2 focus:ring-[rgba(45,212,163,0.4)]"
          />
          <p className="mt-2 text-xs text-white/40">
            {transferRecipientValid ? "Recipient looks valid." : "Enter a valid EVM address."}
          </p>
          <button
            type="button"
            disabled={transferDisabled}
            onClick={() => {
              if (!address) {
                requestConnect();
                return;
              }
              void executeTransfer();
            }}
            className="mt-4 w-full rounded-xl border-none bg-gradient-to-r from-[#38bdf8] to-[#12b886] py-3.5 text-sm font-semibold text-[#050a0f] transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {transferTx.phase === "pending" ? "Pending..." : "Send"}
          </button>
          <StatusLine state={transferTx} />
        </ActionCard>
      </div>

      {readErr && <p className="mt-4 break-words text-xs text-amber-200/85">{readErr}</p>}
    </div>
  );
}

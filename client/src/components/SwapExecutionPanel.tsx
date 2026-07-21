"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatEther, parseEther } from "viem";
import { zyncAbi } from "../abi/zync";
import { useConfig } from "../context/ConfigContext";
import { useWallet } from "../wallet/WalletContext";
import { classifyWalletError, describeWalletError, ensureWalletChain, isZeroAddress } from "../wallet/chain";

type SwapSide = "ETH" | "ZYNC";

type QuoteResponse = {
  router: string;
  weth: string;
  path?: string[];
  amount_in?: string;
  amount_out?: string;
  amount_out_min?: string;
  deadline?: number;
  swap_kind?: string;
  quote_call?: { to: string; data: string };
  swap_call?: { to: string; data: string };
  value_wei?: string;
  path_note?: string;
  rpc_error?: string;
  status?: string;
};

type FlowState = {
  phase: "idle" | "pending" | "confirmed" | "rejected" | "revert" | "rpc" | "error";
  message?: string;
  hash?: `0x${string}`;
};

function SideSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: SwapSide;
  onChange: (v: SwapSide) => void;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-xs uppercase tracking-wider text-white/45">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SwapSide)}
        className="rounded-xl border border-white/[0.08] bg-[#050a0f] px-4 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-[rgba(45,212,163,0.4)]"
      >
        <option value="ETH">ETH</option>
        <option value="ZYNC">ZYNC</option>
      </select>
    </label>
  );
}

function StatusLine({ state }: { state: FlowState }) {
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

export function SwapExecutionPanel() {
  const cfg = useConfig();
  const { address, walletChainId, walletClient, publicClient, chain, eip1193Provider, requestConnect } = useWallet();

  const tokenConfigured = !isZeroAddress(cfg.zync_token_address);
  const routerConfigured = !isZeroAddress(cfg.swap_router_address);
  const wethConfigured = !isZeroAddress(cfg.weth_address);
  const wrongChain = Boolean(address) && walletChainId !== undefined && walletChainId !== cfg.chain_id;
  const canReachSwap = tokenConfigured && routerConfigured && wethConfigured;

  const [from, setFrom] = useState<SwapSide>("ETH");
  const [to, setTo] = useState<SwapSide>("ZYNC");
  const [amount, setAmount] = useState("0.01");
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<string | undefined>();
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [nativeBalance, setNativeBalance] = useState<bigint>(0n);
  const [zyncBalance, setZyncBalance] = useState<bigint>(0n);
  const [allowance, setAllowance] = useState<bigint>(0n);
  const [flow, setFlow] = useState<FlowState>({ phase: "idle" });

  const quoteRequestId = useRef(0);
  const chainReady = !wrongChain;

  const amountInWei = useMemo(() => {
    try {
      return parseEther(amount || "0");
    } catch {
      return 0n;
    }
  }, [amount]);

  const quoteReady = Boolean(quote?.swap_call?.to && quote?.swap_call?.data && quote?.amount_out && quote?.amount_out_min);
  const needsApproval =
    Boolean(address) &&
    from === "ZYNC" &&
    quoteReady &&
    allowance < amountInWei;

  const insufficientBalance =
    from === "ETH" ? nativeBalance < amountInWei : zyncBalance < amountInWei;

  async function refreshBalances() {
    if (!address || !tokenConfigured) return;
    try {
      const nextNative = await publicClient.getBalance({ address });
      setNativeBalance(nextNative);
      const nextZync = await publicClient.readContract({
        address: cfg.zync_token_address as `0x${string}`,
        abi: zyncAbi,
        functionName: "balanceOf",
        args: [address],
      });
      setZyncBalance(nextZync);
      if (routerConfigured) {
        const nextAllowance = await publicClient.readContract({
          address: cfg.zync_token_address as `0x${string}`,
          abi: zyncAbi,
          functionName: "allowance",
          args: [address, cfg.swap_router_address as `0x${string}`],
        });
        setAllowance(nextAllowance);
      }
    } catch {
      // ignore read failures here; the quote and execute states carry the user-facing error.
    }
  }

  useEffect(() => {
    void refreshBalances();
  }, [address, cfg.swap_router_address, cfg.zync_token_address, tokenConfigured, routerConfigured]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const current = ++quoteRequestId.current;
      if (!address || !canReachSwap || amountInWei <= 0n) {
        setQuote(null);
        setQuoteError(undefined);
        setQuoteLoading(false);
        return;
      }
      setQuoteLoading(true);
      setQuoteError(undefined);
      const url = new URL("/api/v1/swap/quote", window.location.origin);
      url.searchParams.set("amount_in", amountInWei.toString());
      url.searchParams.set("from", from);
      url.searchParams.set("to", to);
      url.searchParams.set("recipient", address);
      fetch(url.toString())
        .then(async (res) => {
          const text = await res.text();
          if (!res.ok) throw new Error(text || `Quote request failed (${res.status})`);
          return text ? (JSON.parse(text) as QuoteResponse) : null;
        })
        .then((data) => {
          if (current !== quoteRequestId.current) return;
          if (data?.status === "unconfigured") {
            setQuote(null);
            setQuoteError(data.rpc_error ?? "Swap routing is not configured yet.");
            return;
          }
          setQuote(data);
          setQuoteError(data?.rpc_error);
        })
        .catch((err) => {
          if (current !== quoteRequestId.current) return;
          setQuote(null);
          setQuoteError(err instanceof Error ? err.message : "Failed to load swap quote.");
        })
        .finally(() => {
          if (current === quoteRequestId.current) setQuoteLoading(false);
        });
    }, 350);
    return () => window.clearTimeout(id);
  }, [address, amountInWei, canReachSwap, from, to]);

  useEffect(() => {
    if (from === to) {
      setTo(from === "ETH" ? "ZYNC" : "ETH");
    }
  }, [from, to]);

  useEffect(() => {
    if (!address || !wrongChain || !eip1193Provider) return;
    void ensureWalletChain(eip1193Provider, chain, cfg.rpc_url).catch((err) => {
      const kind = classifyWalletError(err);
      setFlow({ phase: kind === "unknown" ? "error" : kind, message: describeWalletError(err) });
    });
  }, [address, chain, cfg.rpc_url, eip1193Provider, wrongChain]);

  async function approveIfNeeded() {
    if (!address || !walletClient || from !== "ZYNC" || !quote) return;
    if (allowance >= amountInWei) return;
    const hash = await walletClient.writeContract({
      address: cfg.zync_token_address as `0x${string}`,
      abi: zyncAbi,
      functionName: "approve",
      args: [quote.router as `0x${string}`, amountInWei],
      account: address,
      chain,
    });
    setFlow({ phase: "pending", hash, message: "Approval pending..." });
    await publicClient.waitForTransactionReceipt({ hash });
    await refreshBalances();
  }

  async function executeSwap() {
    if (!address || !walletClient) {
      requestConnect();
      return;
    }
    if (!canReachSwap) {
      setFlow({ phase: "error", message: "Swap router, WETH, or token address is missing from the environment." });
      return;
    }
    if (amountInWei <= 0n) {
      setFlow({ phase: "error", message: "Enter a swap amount greater than zero." });
      return;
    }
    if (insufficientBalance) {
      setFlow({ phase: "error", message: "Insufficient balance for this swap." });
      return;
    }

    setFlow({ phase: "pending", message: "Preparing swap..." });
    try {
      if (wrongChain) {
        await ensureWalletChain(eip1193Provider, chain, cfg.rpc_url);
      }
      if (needsApproval) {
        await approveIfNeeded();
      }
      if (!quote) {
        throw new Error("Quote not ready yet.");
      }
      if (!quote.swap_call?.to || !quote.swap_call?.data) {
        throw new Error(quote.rpc_error ?? "Swap quote is not ready yet.");
      }
      const hash = await walletClient.sendTransaction({
        account: address,
        chain,
        to: quote.swap_call.to as `0x${string}`,
        data: quote.swap_call.data as `0x${string}`,
        value: BigInt(quote.value_wei || "0"),
      });
      setFlow({ phase: "pending", hash, message: "Swap pending..." });
      await publicClient.waitForTransactionReceipt({ hash });
      setFlow({ phase: "confirmed", hash, message: "Swap confirmed." });
      await refreshBalances();
    } catch (error) {
      const kind = classifyWalletError(error);
      setFlow({ phase: kind === "unknown" ? "error" : kind, message: describeWalletError(error) });
    }
  }

  const expectedOut = quote?.amount_out ? formatEther(BigInt(quote.amount_out)) : "0";
  const minimumOut = quote?.amount_out_min ? formatEther(BigInt(quote.amount_out_min)) : "0";
  const inputBalance = from === "ETH" ? formatEther(nativeBalance) : formatEther(zyncBalance);
  const quoteUsable = quoteReady && !quoteError;

  if (!tokenConfigured) {
    return (
      <div className="rounded-2xl border border-amber-400/20 bg-[rgba(12,14,24,0.7)] p-6 text-sm text-white/65">
        Set <code className="font-mono text-[#6ee7c2]">ZYNC_TOKEN_ADDRESS</code> before using the swap execute flow.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[rgba(12,14,24,0.7)] p-6 backdrop-blur-xl sm:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="m-0 text-xl font-semibold tracking-tight">Swap ZYNC</h2>
          <p className="mt-1 text-sm leading-relaxed text-white/55">
            Fetch a quote, approve ZYNC when needed, then send the router transaction and wait for confirmation.
          </p>
        </div>
        <div className="text-xs text-white/40 sm:text-right">
          <div className="font-mono">Router: {routerConfigured ? cfg.swap_router_address : "missing"}</div>
          <div className="font-mono">WETH: {wethConfigured ? cfg.weth_address : "missing"}</div>
        </div>
      </div>

      {wrongChain && (
        <div className="mb-4 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
          Wrong network. MetaMask needs to be on Hardhat Local chain ID {cfg.chain_id}.
        </div>
      )}

      {!routerConfigured || !wethConfigured ? (
        <div className="mb-4 rounded-xl border border-white/[0.07] bg-black/25 p-4 text-sm text-white/60">
          Swap routing is not configured yet. Set <code className="font-mono text-[#6ee7c2]">SWAP_ROUTER_ADDRESS</code> and{" "}
          <code className="font-mono text-[#6ee7c2]">WETH_ADDRESS</code> in the environment, then restart the app.
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr]">
        <div className="rounded-2xl border border-white/[0.07] bg-black/25 p-4">
          <SideSelect label="From" value={from} onChange={setFrom} />
          <label className="mt-4 block text-xs uppercase tracking-wider text-white/45">Amount</label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            className="mt-2 w-full rounded-xl border border-white/[0.08] bg-[#050a0f] px-4 py-3 font-mono text-2xl text-white outline-none focus:ring-2 focus:ring-[rgba(45,212,163,0.4)]"
            placeholder="0.01"
          />
          <p className="mt-2 text-xs text-white/40">Balance: {inputBalance} {from}</p>
        </div>

        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={() => {
              const prev = from;
              setFrom(to);
              setTo(prev);
            }}
            className="h-11 w-11 rounded-xl border border-white/[0.1] bg-black/30 text-white/70 transition hover:text-white"
            aria-label="Flip swap direction"
          >
            ⇅
          </button>
        </div>

        <div className="rounded-2xl border border-white/[0.07] bg-black/25 p-4">
          <SideSelect label="To" value={to} onChange={setTo} />
          <div className="mt-4 rounded-xl border border-white/[0.08] bg-[#050a0f] px-4 py-3">
            <div className="text-xs uppercase tracking-wider text-white/45">Expected output</div>
            <div className="mt-2 font-mono text-2xl text-[#6ee7c2]">{quoteLoading ? "Loading..." : expectedOut}</div>
          </div>
          <p className="mt-2 text-xs text-white/40">
            Minimum out: {minimumOut} {to}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4 text-sm">
          <div className="text-xs uppercase tracking-wider text-white/45">Quote status</div>
          <div className="mt-1 text-white/75">
            {!routerConfigured || !wethConfigured
              ? "Swap routing is not configured yet."
              : quoteError
                ? quoteError
                : quote?.swap_kind
                  ? `${quote.swap_kind}`
                  : quoteLoading
                    ? "Loading quote..."
                    : "Waiting for input"}
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4 text-sm">
          <div className="text-xs uppercase tracking-wider text-white/45">Approval</div>
          <div className="mt-1 text-white/75">
            {!routerConfigured || !wethConfigured
              ? "Not available until router is configured"
              : quoteReady && from === "ZYNC"
                ? (needsApproval ? "Approval required" : "Allowance ready")
                : "Not needed"}
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4 text-sm">
          <div className="text-xs uppercase tracking-wider text-white/45">Balance check</div>
          <div className={`mt-1 ${!routerConfigured || !wethConfigured ? "text-white/75" : insufficientBalance ? "text-red-300" : "text-white/75"}`}>
            {!routerConfigured || !wethConfigured
              ? "Waiting for router setup"
              : insufficientBalance
                ? "Insufficient balance"
                : "Enough balance"}
          </div>
        </div>
      </div>

      <button
          type="button"
          disabled={!address || !chainReady || !canReachSwap || amountInWei <= 0n || insufficientBalance || quoteLoading || !quoteUsable}
        onClick={() => {
          if (!address) {
            requestConnect();
            return;
          }
          void executeSwap();
        }}
        className="mt-5 w-full rounded-xl border-none bg-gradient-to-r from-[#12b886] to-[#38bdf8] py-3.5 text-sm font-semibold text-[#050a0f] transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {!address
          ? "Connect wallet"
          : !routerConfigured || !wethConfigured
            ? "Swap not configured"
            : quoteError && !quoteReady
              ? "Swap not configured"
            : quoteLoading
            ? "Quote loading..."
            : needsApproval
              ? "Approve then swap"
              : flow.phase === "pending"
                ? "Pending..."
                : "Execute swap"}
      </button>

      <StatusLine state={flow} />

      {quote && !quoteError && quote.quote_call?.to && quote.swap_call?.to && (
        <div className="mt-4 rounded-xl border border-white/[0.07] bg-black/25 p-4 text-xs leading-relaxed text-white/60">
          <div className="font-semibold text-white/80">Quote details</div>
          <div className="mt-2 font-mono break-all">Router call: {quote.quote_call.to}</div>
          <div className="mt-1 font-mono break-all">Swap call: {quote.swap_call.to}</div>
          {quote.path_note && <div className="mt-1 text-amber-200">{quote.path_note}</div>}
          {quote.rpc_error && <div className="mt-1 text-red-300">RPC error: {quote.rpc_error}</div>}
        </div>
      )}
    </div>
  );
}

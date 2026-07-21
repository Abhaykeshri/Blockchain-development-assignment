import type { Chain } from "viem";

export type Eip1193Requester = {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
};

export type WalletFailureKind = "rejected" | "revert" | "rpc" | "unknown";

export function chainIdToHex(chainId: number) {
  return `0x${chainId.toString(16)}`;
}

export async function ensureWalletChain(provider: unknown, chain: Chain, rpcUrl: string) {
  const eth = provider as Eip1193Requester | undefined;
  if (!eth?.request) throw new Error("Wallet provider not available.");

  const chainId = chainIdToHex(chain.id);
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
    return "switched" as const;
  } catch (err: any) {
    if (err?.code !== 4902) {
      throw err;
    }
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId,
          chainName: chain.name,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: [rpcUrl],
        },
      ],
    });
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
    return "added" as const;
  }
}

export function classifyWalletError(error: unknown): WalletFailureKind {
  const e = error as {
    code?: number | string;
    shortMessage?: string;
    message?: string;
    name?: string;
    cause?: { code?: number | string; message?: string };
  } | null;
  const message = `${e?.shortMessage ?? ""} ${e?.message ?? ""} ${e?.cause?.message ?? ""} ${e?.name ?? ""}`.toLowerCase();
  const code = e?.code ?? e?.cause?.code;

  if (code === 4001 || message.includes("user rejected") || message.includes("rejected the request")) {
    return "rejected";
  }
  if (message.includes("execution reverted") || message.includes("revert") || message.includes("contractfunctionexecutionerror")) {
    return "revert";
  }
  if (
    code === -32000 ||
    code === -32603 ||
    message.includes("rpc") ||
    message.includes("request failed") ||
    message.includes("network error") ||
    message.includes("internal json-rpc error")
  ) {
    return "rpc";
  }
  return "unknown";
}

export function describeWalletError(error: unknown) {
  const kind = classifyWalletError(error);
  switch (kind) {
    case "rejected":
      return "User rejected the transaction.";
    case "revert":
      return "Smart contract reverted the transaction.";
    case "rpc":
      return "RPC error while sending or confirming the transaction.";
    default:
      return error instanceof Error ? error.message : "Transaction failed.";
  }
}

export function isZeroAddress(value: string) {
  return value.trim().toLowerCase() === "0x0000000000000000000000000000000000000000";
}

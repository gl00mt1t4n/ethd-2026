"use client";

import { useMemo, useState } from "react";
import { createPublicClient, custom, encodeFunctionData, parseUnits } from "viem";
import type { EIP1193Provider, Hex } from "viem";
import type { TransactionReceipt } from "viem";
import { base } from "viem/chains";

type Eip1193ProviderLike = {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
};

type Direction = "usdc_to_eth" | "eth_to_usdc";

const WETH = "0x4200000000000000000000000000000000000006";

const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }]
  }
] as const;

const WETH_WITHDRAW_ABI = [
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "wad", type: "uint256" }],
    outputs: []
  }
] as const;

type TxRequest = Record<string, unknown>;
type QuoteResponse = {
  ok?: boolean;
  quote?: Record<string, unknown>;
  permitData?: Record<string, unknown> | null;
  error?: string;
  message?: string;
};
type SwapTxResponse = {
  ok?: boolean;
  tx?: TxRequest;
  error?: string;
  message?: string;
};

function normalizeAddress(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  return /^0x[a-fA-F0-9]{40}$/.test(raw) ? raw.toLowerCase() : null;
}

function toHexQuantity(value: unknown): Hex | undefined {
  if (value == null) return undefined;
  if (typeof value === "bigint") return `0x${value.toString(16)}`;
  if (typeof value === "number") return `0x${BigInt(Math.floor(value)).toString(16)}`;
  const raw = String(value).trim();
  if (!raw) return undefined;
  try {
    return `0x${BigInt(raw).toString(16)}`;
  } catch {
    return undefined;
  }
}

function buildTx(input: { txRequest: TxRequest; from: string }): Record<string, unknown> {
  const tx = input.txRequest;
  const gas = toHexQuantity(tx.gas ?? tx.gasLimit);
  const value = toHexQuantity(tx.value ?? "0");
  const gasPrice = toHexQuantity(tx.gasPrice);
  const maxFeePerGas = toHexQuantity(tx.maxFeePerGas);
  const maxPriorityFeePerGas = toHexQuantity(tx.maxPriorityFeePerGas);
  const nonce = toHexQuantity(tx.nonce);

  const payload: Record<string, unknown> = {
    from: input.from,
    to: String(tx.to ?? ""),
    data: String(tx.data ?? "0x"),
    value: value ?? "0x0"
  };

  if (gas) payload.gas = gas;
  if (nonce) payload.nonce = nonce;
  if (maxFeePerGas || maxPriorityFeePerGas) {
    if (maxFeePerGas) payload.maxFeePerGas = maxFeePerGas;
    if (maxPriorityFeePerGas) payload.maxPriorityFeePerGas = maxPriorityFeePerGas;
  } else if (gasPrice) {
    payload.gasPrice = gasPrice;
  }

  return payload;
}

async function sendTransaction(provider: Eip1193ProviderLike, tx: Record<string, unknown>): Promise<`0x${string}`> {
  const hash = await provider.request({ method: "eth_sendTransaction", params: [tx] });
  return String(hash) as `0x${string}`;
}

function txUrl(hash: string): string {
  return `https://basescan.org/tx/${hash}`;
}

function buildPermitTypedData(permitData: Record<string, unknown>): Record<string, unknown> | null {
  const domain = permitData.domain;
  const types = permitData.types;
  const primaryType = permitData.primaryType;
  const message = permitData.message ?? permitData.values ?? permitData.value;
  if (!domain || !types || !message) return null;

  const domainRecord = domain as Record<string, unknown>;
  const typeRecord = types as Record<string, unknown>;
  const existingDomain = Array.isArray(typeRecord.EIP712Domain) ? typeRecord.EIP712Domain : null;
  const domainFields =
    existingDomain ??
    [
      domainRecord.name != null ? { name: "name", type: "string" } : null,
      domainRecord.version != null ? { name: "version", type: "string" } : null,
      domainRecord.chainId != null ? { name: "chainId", type: "uint256" } : null,
      domainRecord.verifyingContract != null ? { name: "verifyingContract", type: "address" } : null,
      domainRecord.salt != null ? { name: "salt", type: "bytes32" } : null
    ].filter(Boolean);

  return {
    domain,
    types: {
      ...typeRecord,
      EIP712Domain: domainFields
    },
    primaryType:
      typeof primaryType === "string"
        ? primaryType
        : Object.keys(typeRecord).find((key) => key !== "EIP712Domain"),
    message
  };
}

export default function UniswapTestPage() {
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const walletAddress = useMemo(() => normalizeAddress(connectedAddress), [connectedAddress]);

  const [direction, setDirection] = useState<Direction>("usdc_to_eth");
  const [amount, setAmount] = useState("1");
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [txs, setTxs] = useState<Array<{ label: string; hash: string }>>([]);

  function getProvider(): Eip1193ProviderLike {
    const provider = (globalThis as { ethereum?: Eip1193ProviderLike }).ethereum;
    if (!provider) {
      throw new Error("No injected wallet found. Install/open MetaMask (or another EVM wallet).");
    }
    return provider;
  }

  async function connectWallet() {
    try {
      const provider = getProvider();
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[] | undefined;
      const first = Array.isArray(accounts) ? accounts[0] : null;
      const normalized = normalizeAddress(first ?? null);
      if (!normalized) throw new Error("No wallet account returned.");
      setConnectedAddress(normalized);
      setStatus(`Connected: ${normalized}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to connect wallet.");
    }
  }

  async function waitForReceipt(provider: Eip1193ProviderLike, hash: `0x${string}`): Promise<TransactionReceipt> {
    const client = createPublicClient({
      chain: base,
      transport: custom(provider as EIP1193Provider)
    });
    return client.waitForTransactionReceipt({ hash });
  }

  async function readBalance(provider: Eip1193ProviderLike, token: string, owner: string): Promise<bigint> {
    const client = createPublicClient({
      chain: base,
      transport: custom(provider as EIP1193Provider)
    });
    return client.readContract({
      address: token as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [owner as `0x${string}`]
    });
  }

  async function maybeApprove(input: { walletAddress: string; tokenIn: "USDC" | "WETH"; amountInBaseUnits: string; provider: Eip1193ProviderLike }) {
    setStatus("Checking token approval...");
    const res = await fetch("/api/uniswap/check-approval", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tokenIn: input.tokenIn,
        amountIn: input.amountInBaseUnits,
        walletAddress: input.walletAddress
      })
    });
    const payload = (await res.json()) as { ok?: boolean; approvalRequired?: boolean; txRequest?: TxRequest; error?: string; message?: string };
    if (!res.ok || !payload.ok) {
      throw new Error(payload.message ?? payload.error ?? "Approval check failed.");
    }

    if (payload.approvalRequired && payload.txRequest) {
      setStatus("Submitting approval...");
      const hash = await sendTransaction(input.provider, buildTx({ txRequest: payload.txRequest, from: input.walletAddress }));
      await waitForReceipt(input.provider, hash);
      setTxs((prev) => [...prev, { label: "approval", hash }]);
    }
  }

  async function runSwap() {
    if (!walletAddress) {
      setStatus("Connect wallet first.");
      return;
    }

    setRunning(true);
    setTxs([]);
    try {
      const provider = getProvider();
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${base.id.toString(16)}` }]
      });

      const usdcToEth = direction === "usdc_to_eth";
      const tokenIn: "USDC" | "WETH" = usdcToEth ? "USDC" : "WETH";
      const tokenOut: "USDC" | "WETH" = usdcToEth ? "WETH" : "USDC";
      const decimalsIn = usdcToEth ? 6 : 18;
      const amountInBaseUnits = parseUnits(amount, decimalsIn).toString();
      if (BigInt(amountInBaseUnits) <= BigInt(0)) {
        throw new Error("Amount must be greater than 0.");
      }

      if (!usdcToEth) {
        setStatus("Wrapping ETH to WETH...");
        const wrapWei = parseUnits(amount, 18);
        const wrapHash = await sendTransaction(provider, {
          from: walletAddress,
          to: WETH,
          data: "0xd0e30db0",
          value: `0x${wrapWei.toString(16)}`
        });
        await waitForReceipt(provider, wrapHash);
        setTxs((prev) => [...prev, { label: "wrap", hash: wrapHash }]);
      }

      await maybeApprove({ walletAddress, tokenIn, amountInBaseUnits, provider });

      const wethBefore = usdcToEth ? await readBalance(provider, WETH, walletAddress) : BigInt(0);

      setStatus("Fetching swap transaction...");
      const quoteRes = await fetch(
        `/api/uniswap/quote?tokenIn=${tokenIn}&tokenOut=${tokenOut}&amountIn=${amountInBaseUnits}&slippageBps=50&swapper=${walletAddress}`
      );
      const quotePayload = (await quoteRes.json()) as QuoteResponse;
      if (!quoteRes.ok || !quotePayload.ok || !quotePayload.quote) {
        throw new Error(quotePayload.message ?? quotePayload.error ?? "Failed to fetch quote.");
      }

      let signature: string | undefined;
      if (quotePayload.permitData) {
        const typedData = buildPermitTypedData(quotePayload.permitData);
        if (!typedData) {
          throw new Error("Invalid permitData returned by quote.");
        }
        setStatus("Signing Permit2 payload...");
        signature = (await provider.request({
          method: "eth_signTypedData_v4",
          params: [walletAddress, JSON.stringify(typedData)]
        })) as string;
      }

      const swapRes = await fetch("/api/uniswap/swap-tx", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          quote: quotePayload.quote,
          permitData: quotePayload.permitData ?? undefined,
          signature
        })
      });
      const swapPayload = (await swapRes.json()) as SwapTxResponse;
      if (!swapRes.ok || !swapPayload.ok || !swapPayload.tx) {
        throw new Error(swapPayload.message ?? swapPayload.error ?? "Failed to build swap tx.");
      }

      setStatus("Submitting swap...");
      const swapHash = await sendTransaction(provider, buildTx({ txRequest: swapPayload.tx, from: walletAddress }));
      const swapReceipt = await waitForReceipt(provider, swapHash);
      setTxs((prev) => [...prev, { label: "swap", hash: swapHash }]);
      if (swapReceipt.status !== "success") {
        throw new Error(`Swap reverted on-chain: ${swapHash}`);
      }

      if (usdcToEth) {
        setStatus("Unwrapping WETH to ETH...");
        const wethAfter = await readBalance(provider, WETH, walletAddress);
        const delta = wethAfter - wethBefore;
        if (delta <= BigInt(0)) {
          throw new Error("Swap completed but no WETH received to unwrap.");
        }
        const withdrawData = encodeFunctionData({
          abi: WETH_WITHDRAW_ABI,
          functionName: "withdraw",
          args: [delta]
        });
        const unwrapHash = await sendTransaction(provider, {
          from: walletAddress,
          to: WETH,
          data: withdrawData,
          value: "0x0"
        });
        await waitForReceipt(provider, unwrapHash);
        setTxs((prev) => [...prev, { label: "unwrap", hash: unwrapHash }]);
      }

      setStatus("Swap complete.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Swap failed.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10 text-slate-200">
      <h1 className="text-2xl font-semibold text-white">Uniswap Test (Base Mainnet)</h1>
      <p className="mt-2 text-sm text-slate-400">Quick test UI: connect wallet and swap between USDC and ETH on Base mainnet.</p>

      <div className="mt-6 rounded-md border border-white/10 bg-[#0a0a0a] p-4">
        {!walletAddress ? (
          <button
            type="button"
            onClick={connectWallet}
            className="rounded border border-white/20 px-4 py-2 text-sm text-white hover:border-primary hover:text-primary"
          >
            Connect Wallet
          </button>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-xs text-slate-400">Wallet: {walletAddress}</p>
            <button
              type="button"
              onClick={connectWallet}
              className="rounded border border-white/20 px-2 py-1 text-xs text-slate-300 hover:border-primary hover:text-primary"
            >
              Switch Wallet
            </button>
          </div>
        )}

        <div className="mt-4 grid gap-3">
          <label className="text-xs uppercase tracking-wider text-slate-500">Direction</label>
          <select
            value={direction}
            onChange={(event) => setDirection(event.target.value as Direction)}
            className="rounded border border-white/10 bg-[#111] px-3 py-2 text-sm"
          >
            <option value="usdc_to_eth">USDC -&gt; ETH</option>
            <option value="eth_to_usdc">ETH -&gt; USDC</option>
          </select>

          <label className="text-xs uppercase tracking-wider text-slate-500">Amount</label>
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="1"
            className="rounded border border-white/10 bg-[#111] px-3 py-2 text-sm"
          />

          <button
            type="button"
            disabled={running || !walletAddress}
            onClick={runSwap}
            className="mt-2 rounded border border-primary/40 bg-primary/10 px-4 py-2 text-sm uppercase tracking-widest text-primary disabled:opacity-40"
          >
            {running ? "Processing..." : "Swap"}
          </button>
        </div>
      </div>

      {status && <p className="mt-4 text-sm text-slate-300">{status}</p>}

      {txs.length > 0 && (
        <ul className="mt-4 space-y-2 text-sm">
          {txs.map((tx) => (
            <li key={`${tx.label}-${tx.hash}`} className="font-mono">
              {tx.label}:{" "}
              <a href={txUrl(tx.hash)} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                {tx.hash}
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

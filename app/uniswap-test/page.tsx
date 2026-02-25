"use client";

import { useMemo, useState } from "react";
import { decodeEventLog, encodeFunctionData, parseUnits } from "viem";
import type { TransactionReceipt } from "viem";
import { base } from "viem/chains";
import { BASE_WETH_ADDRESS, resolveBaseExplorerTxBaseUrl } from "@/lib/baseNetwork";
import {
  buildExplorerTxUrl,
  buildPermitTypedDataPayload,
  buildTransactionRequest,
  normalizeAddress,
  readErc20Balance,
  sendTransaction,
  type Eip1193ProviderLike,
  waitForTransactionReceipt
} from "@/lib/evmClientUtils";

type Direction = "usdc_to_eth" | "eth_to_usdc";

const WETH_WITHDRAW_ABI = [
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "wad", type: "uint256" }],
    outputs: []
  }
] as const;

const ERC20_TRANSFER_EVENT_ABI = [
  {
    anonymous: false,
    type: "event",
    name: "Transfer",
    inputs: [
      { indexed: true, name: "from", type: "address" },
      { indexed: true, name: "to", type: "address" },
      { indexed: false, name: "value", type: "uint256" }
    ]
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
const BASE_EXPLORER_TX = resolveBaseExplorerTxBaseUrl(base.id);

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

  function getWethReceivedFromReceipt(receipt: TransactionReceipt, recipient: string): bigint {
    const target = recipient.toLowerCase();
    return receipt.logs.reduce((sum, log) => {
      if (log.address.toLowerCase() !== BASE_WETH_ADDRESS) return sum;
      try {
        const decoded = decodeEventLog({
          abi: ERC20_TRANSFER_EVENT_ABI,
          data: log.data,
          topics: log.topics
        });
        if (decoded.eventName !== "Transfer") return sum;
        if (decoded.args.to.toLowerCase() !== target) return sum;
        return sum + decoded.args.value;
      } catch {
        return sum;
      }
    }, BigInt(0));
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
      const hash = await sendTransaction(
        input.provider,
        buildTransactionRequest({ txRequest: payload.txRequest, from: input.walletAddress })
      );
      await waitForTransactionReceipt({ provider: input.provider, chain: base, hash });
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
          to: BASE_WETH_ADDRESS,
          data: "0xd0e30db0",
          value: `0x${wrapWei.toString(16)}`
        });
        await waitForTransactionReceipt({ provider, chain: base, hash: wrapHash });
        setTxs((prev) => [...prev, { label: "wrap", hash: wrapHash }]);
      }

      await maybeApprove({ walletAddress, tokenIn, amountInBaseUnits, provider });

      const wethBefore = usdcToEth
        ? await readErc20Balance({
            provider,
            chain: base,
            tokenAddress: BASE_WETH_ADDRESS as `0x${string}`,
            owner: walletAddress as `0x${string}`
          })
        : BigInt(0);

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
        const typedData = buildPermitTypedDataPayload(quotePayload.permitData);
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
      const swapHash = await sendTransaction(
        provider,
        buildTransactionRequest({ txRequest: swapPayload.tx, from: walletAddress })
      );
      const swapReceipt = await waitForTransactionReceipt({ provider, chain: base, hash: swapHash });
      setTxs((prev) => [...prev, { label: "swap", hash: swapHash }]);
      if (swapReceipt.status !== "success") {
        throw new Error(`Swap reverted on-chain: ${swapHash}`);
      }

      if (usdcToEth) {
        setStatus("Checking WETH received...");
        const wethFromLogs = getWethReceivedFromReceipt(swapReceipt, walletAddress);
        let deltaFromBalance = BigInt(0);
        try {
          const wethAtSwapBlock = await readErc20Balance({
            provider,
            chain: base,
            tokenAddress: BASE_WETH_ADDRESS as `0x${string}`,
            owner: walletAddress as `0x${string}`,
            blockNumber: swapReceipt.blockNumber
          });
          deltaFromBalance = wethAtSwapBlock > wethBefore ? wethAtSwapBlock - wethBefore : BigInt(0);
        } catch {
          const wethAfter = await readErc20Balance({
            provider,
            chain: base,
            tokenAddress: BASE_WETH_ADDRESS as `0x${string}`,
            owner: walletAddress as `0x${string}`
          });
          deltaFromBalance = wethAfter > wethBefore ? wethAfter - wethBefore : BigInt(0);
        }
        const delta = deltaFromBalance > wethFromLogs ? deltaFromBalance : wethFromLogs;
        if (delta <= BigInt(0)) {
          throw new Error("Swap completed but no WETH received to unwrap.");
        }
        setStatus("Unwrapping WETH to ETH...");
        const withdrawData = encodeFunctionData({
          abi: WETH_WITHDRAW_ABI,
          functionName: "withdraw",
          args: [delta]
        });
        const unwrapHash = await sendTransaction(provider, {
          from: walletAddress,
          to: BASE_WETH_ADDRESS,
          data: withdrawData,
          value: "0x0"
        });
        await waitForTransactionReceipt({ provider, chain: base, hash: unwrapHash });
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
      <h1 className="text-2xl font-semibold text-white">Uniswap (Base Mainnet)</h1>
      <p className="mt-2 text-sm text-slate-400">Connect wallet and swap between USDC and ETH on Base mainnet.</p>

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
              <a
                href={buildExplorerTxUrl(BASE_EXPLORER_TX, tx.hash)}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                {tx.hash}
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

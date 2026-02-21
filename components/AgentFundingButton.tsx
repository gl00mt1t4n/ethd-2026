"use client";

import { useEffect, useMemo, useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import { createPublicClient, custom, encodeFunctionData, formatUnits, http, parseUnits } from "viem";
import type { Hex } from "viem";
import type { EIP1193Provider } from "viem";
import { base, baseSepolia } from "viem/chains";

const ERC20_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }]
  }
] as const;

type FundingPrepareResponse = {
  ok: boolean;
  mode: "direct-usdc" | "swap-to-usdc";
  network: string;
  chainId: number;
  usdcAddress: string;
  recipient: string;
  tokenIn: { address: string; symbol: string; decimals: number };
  amountIn: string;
  amountInBaseUnits: string;
  approval?: {
    required: boolean;
    txRequest?: Record<string, unknown> | null;
  };
  quote?: Record<string, unknown>;
  permitData?: Record<string, unknown> | null;
  error?: string;
};

type FundingSwapResponse = {
  ok?: boolean;
  txRequest?: Record<string, unknown>;
  error?: string;
};

type FundingSwapStatusResponse = {
  ok?: boolean;
  swap?: Record<string, unknown> | null;
  uniswapAppUrl?: string | null;
  error?: string;
};

type Eip1193ProviderLike = {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
};

type KnownFundingToken = {
  symbol: string;
  address: string;
  decimals: number;
  isNative?: boolean;
};

type TokenOption = KnownFundingToken & {
  balance: bigint;
};

function normalizeAddress(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  return /^0x[a-fA-F0-9]{40}$/.test(raw) ? raw.toLowerCase() : null;
}

function defaultNetworkCaip(): string {
  return "eip155:8453";
}

function defaultUsdcAddress(caip: string): string {
  void caip;
  return "0x833589fCD6EDb6E08f4c7C32D4f71b54bdA02913".toLowerCase();
}

function wethAddress(): string {
  return "0x4200000000000000000000000000000000000006".toLowerCase();
}

function chainIdFromCaip(caip: string): number {
  void caip;
  return base.id;
}

function knownFundingTokens(chainId: number): KnownFundingToken[] {
  const eth: KnownFundingToken = { symbol: "ETH", address: "native", decimals: 18, isNative: true };
  if (chainId === base.id) {
    return [
      eth,
      { symbol: "USDC", address: "0x833589fCD6EDb6E08f4c7C32D4f71b54bdA02913".toLowerCase(), decimals: 6 },
      { symbol: "WETH", address: wethAddress(), decimals: 18 },
      { symbol: "cbBTC", address: "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf".toLowerCase(), decimals: 8 }
      ,{ symbol: "cbETH", address: "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22".toLowerCase(), decimals: 18 }
      ,{ symbol: "USDT", address: "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2".toLowerCase(), decimals: 6 }
      ,{ symbol: "DAI", address: "0x50c5725949a6f0c72e6c4a641f24049a917db0cb".toLowerCase(), decimals: 18 }
      ,{ symbol: "EURC", address: "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42".toLowerCase(), decimals: 6 }
      ,{ symbol: "AERO", address: "0x940181a94a35a4569e4529a3cdfb74e38fd98631".toLowerCase(), decimals: 18 }
      ,{ symbol: "DEGEN", address: "0x4ed4e862860bed51a9570b96d89af5e1b0efefed".toLowerCase(), decimals: 18 }
      ,{ symbol: "TOSHI", address: "0xac1bd2486aaf3b5c0fc3fd868558b082a531b2b4".toLowerCase(), decimals: 18 }
      ,{ symbol: "WELL", address: "0xa88594d404727625a9437c3f886c7643872296ae".toLowerCase(), decimals: 18 }
      ,{ symbol: "UNI", address: "0xc3de830ea07524a0761646a6a4e4be0e114a3c83".toLowerCase(), decimals: 18 }
      ,{ symbol: "AAVE", address: "0x63706e401c06ac8513145b7687a14804d17f814b".toLowerCase(), decimals: 18 }
      ,{ symbol: "COMP", address: "0x9e1028f5f1d5ede59748ffcee5532509976840e0".toLowerCase(), decimals: 18 }
      ,{ symbol: "CRV", address: "0x8ee73c484a26e0a5df2ee2a4960b789967dd0415".toLowerCase(), decimals: 18 }
      ,{ symbol: "ODOS", address: "0xca73ed1815e5915489570014e024b7ebe65de679".toLowerCase(), decimals: 18 }
      ,{ symbol: "PENDLE", address: "0xa99f6e6785da0f5d6fb42495fe424bce029eeb3e".toLowerCase(), decimals: 18 }
      ,{ symbol: "PRIME", address: "0xfa980ced6895ac314e7de34ef1bfae90a5add21b".toLowerCase(), decimals: 18 }
      ,{ symbol: "SEAM", address: "0x1c7a460413dd4e964f96d8dfc56e7223ce88cd85".toLowerCase(), decimals: 18 }
      ,{ symbol: "WCT", address: "0xef4461891dfb3ac8572ccf7c794664a8dd927945".toLowerCase(), decimals: 18 }
      ,{ symbol: "1INCH", address: "0xc5fecc3a29fb57b5024eec8a2239d4621e111cbe".toLowerCase(), decimals: 18 }
      ,{ symbol: "PEPE", address: "0xb4fde59a779991bfb6a52253b51947828b982be3".toLowerCase(), decimals: 18 }
      ,{ symbol: "ZRO", address: "0x6985884c4392d348587b19cb9eaaf157f13271cd".toLowerCase(), decimals: 18 }
      ,{ symbol: "ZORA", address: "0x1111111111166b7fe7bd91427724b487980afc69".toLowerCase(), decimals: 18 }
      ,{ symbol: "USDbC", address: "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca".toLowerCase(), decimals: 6 }
    ];
  }

  return [
    eth,
    { symbol: "USDC", address: "0x833589fCD6EDb6E08f4c7C32D4f71b54bdA02913".toLowerCase(), decimals: 6 },
    { symbol: "WETH", address: wethAddress(), decimals: 18 }
  ];
}

function chainFromId(chainId: number) {
  return chainId === base.id ? base : baseSepolia;
}

function toHexQuantity(value: unknown): Hex | undefined {
  if (value == null) return undefined;
  if (typeof value === "bigint") return `0x${value.toString(16)}`;
  if (typeof value === "number") return `0x${BigInt(Math.floor(value)).toString(16)}`;
  const raw = String(value).trim();
  if (!raw) return undefined;
  try {
    const parsed = raw.startsWith("0x") ? BigInt(raw) : BigInt(raw);
    return `0x${parsed.toString(16)}`;
  } catch {
    return undefined;
  }
}

function buildTxRequest(input: {
  txRequest: Record<string, unknown>;
  from: string;
}): Record<string, unknown> {
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

function txExplorerBase(chainId: number): string {
  return chainId === base.id ? "https://basescan.org/tx/" : "https://sepolia.basescan.org/tx/";
}

async function sendTransaction(provider: Eip1193ProviderLike, tx: Record<string, unknown>): Promise<`0x${string}`> {
  const hash = await provider.request({ method: "eth_sendTransaction", params: [tx] });
  return String(hash) as `0x${string}`;
}

async function waitForReceipt(
  provider: Eip1193ProviderLike,
  chainId: number,
  hash: `0x${string}`
): Promise<void> {
  const publicClient = createPublicClient({
    chain: chainFromId(chainId),
    transport: custom(provider as EIP1193Provider)
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

async function readUsdcBalance(
  provider: Eip1193ProviderLike,
  chainId: number,
  usdcAddress: string,
  owner: string
): Promise<bigint> {
  const publicClient = createPublicClient({
    chain: chainFromId(chainId),
    transport: custom(provider as EIP1193Provider)
  });

  return publicClient.readContract({
    address: usdcAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [owner as `0x${string}`]
  });
}

async function readKnownTokenBalances(input: {
  owner: string;
  chainId: number;
  tokens: KnownFundingToken[];
}): Promise<TokenOption[]> {
  const publicClient = createPublicClient({
    chain: chainFromId(input.chainId),
    transport: http()
  });

  const results = await Promise.allSettled(
    input.tokens.map(async (token) => {
      const balance = token.isNative
        ? await publicClient.getBalance({
            address: input.owner as `0x${string}`
          })
        : await publicClient.readContract({
            address: token.address as `0x${string}`,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [input.owner as `0x${string}`]
          });
      return { ...token, balance };
    })
  );

  const options: TokenOption[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      options.push(result.value);
    }
  }

  return options;
}

type AgentFundingButtonProps = {
  agentId: string;
  agentName: string;
  agentWalletAddress: string | null;
  ownerWalletAddress: string | null;
};

export function AgentFundingButton(props: AgentFundingButtonProps) {
  const { wallets, ready } = useWallets();
  const networkCaip = defaultNetworkCaip();
  const defaultChainId = chainIdFromCaip(networkCaip);
  const usdcAddress = defaultUsdcAddress(networkCaip);
  const tokens = useMemo(() => knownFundingTokens(defaultChainId), [defaultChainId]);

  const [open, setOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState(usdcAddress);
  const [customTokenIn, setCustomTokenIn] = useState("");
  const [detectedTokenOptions, setDetectedTokenOptions] = useState<TokenOption[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [amountIn, setAmountIn] = useState("1.00");
  const [status, setStatus] = useState("");
  const [running, setRunning] = useState(false);
  const [txHashes, setTxHashes] = useState<
    Array<{ label: string; hash: string; chainId: number; uniswapStatus?: string | null; uniswapAppUrl?: string | null }>
  >([]);

  const ownerWallet = normalizeAddress(props.ownerWalletAddress);
  const normalizedWallets = useMemo(
    () => wallets.map((wallet) => ({ ...wallet, normalized: normalizeAddress(wallet.address) })),
    [wallets]
  );

  const selectedWallet =
    normalizedWallets.find((wallet) => wallet.normalized && wallet.normalized === ownerWallet) ??
    normalizedWallets[0] ??
    null;

  const canFund = Boolean(props.agentWalletAddress && selectedWallet?.normalized);
  const tokenIn = selectedToken === "custom" ? customTokenIn : selectedToken;

  useEffect(() => {
    if (!open || !selectedWallet?.normalized) return;
    let cancelled = false;

    async function detectTokens() {
      setLoadingTokens(true);
      try {
        const balances = await readKnownTokenBalances({
          owner: selectedWallet.normalized!,
          chainId: defaultChainId,
          tokens
        });

        if (cancelled) return;
        const positive = balances.filter((token) => token.balance > BigInt(0));
        const usdc = balances.find((token) => token.address === usdcAddress);
        const merged = [...positive];
        if (usdc && !merged.some((token) => token.address === usdc.address)) {
          merged.unshift(usdc);
        }
        if (merged.length === 0 && usdc) {
          merged.push(usdc);
        }

        setDetectedTokenOptions(merged);
        if (selectedToken !== "custom") {
          const existing = merged.find((token) => token.address === selectedToken);
          if (!existing) {
            setSelectedToken(merged[0]?.address ?? usdcAddress);
          }
        }
      } catch {
        if (!cancelled) {
          setDetectedTokenOptions([]);
        }
      } finally {
        if (!cancelled) setLoadingTokens(false);
      }
    }

    void detectTokens();
    return () => {
      cancelled = true;
    };
  }, [open, selectedWallet?.normalized, defaultChainId, tokens, usdcAddress, selectedToken]);

  async function submitFunding(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canFund || !selectedWallet?.normalized || !props.agentWalletAddress) {
      setStatus("Connect the owner wallet first.");
      return;
    }

    setRunning(true);
    setStatus("Preparing funding plan...");
    setTxHashes([]);

    try {
      const provider = (await selectedWallet.getEthereumProvider()) as Eip1193ProviderLike;
      const walletAddress = selectedWallet.normalized;
      let normalizedTokenIn = normalizeAddress(tokenIn);
      const isNativeEthSelected = tokenIn === "native";
      const activeChainId = defaultChainId;

      if (isNativeEthSelected) {
        let wrapAmountWei: bigint;
        try {
          wrapAmountWei = parseUnits(amountIn, 18);
        } catch {
          throw new Error("Invalid ETH amount.");
        }
        if (wrapAmountWei <= BigInt(0)) {
          throw new Error("ETH amount must be greater than 0.");
        }

        setStatus("Wrapping ETH to WETH...");
        const wrapHash = await sendTransaction(provider, {
          from: walletAddress,
          to: wethAddress(),
          data: "0xd0e30db0",
          value: `0x${wrapAmountWei.toString(16)}`
        });
        await waitForReceipt(provider, activeChainId, wrapHash);
        setTxHashes((prev) => [...prev, { label: "wrap", hash: wrapHash, chainId: activeChainId }]);
        normalizedTokenIn = wethAddress();
      }

      if (!normalizedTokenIn) {
        throw new Error("Select a valid token first.");
      }

      const response = await fetch(`/api/agents/${props.agentId}/funding/uniswap`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "prepare",
          tokenIn: normalizedTokenIn,
          amountIn,
          walletAddress
        })
      });

      const prepare = (await response.json()) as FundingPrepareResponse;
      if (!response.ok || !prepare.ok) {
        throw new Error(prepare.error ?? "Failed to prepare funding transaction.");
      }

      const preparedChainId = Number(prepare.chainId);
      await selectedWallet.switchChain(preparedChainId);

      if (prepare.mode === "direct-usdc") {
        setStatus("Sending USDC transfer to agent...");
        const transferData = encodeFunctionData({
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [props.agentWalletAddress as `0x${string}`, BigInt(prepare.amountInBaseUnits)]
        });
        const transferHash = await sendTransaction(provider, {
          from: walletAddress,
          to: prepare.usdcAddress,
          data: transferData,
          value: "0x0"
        });
        await waitForReceipt(provider, preparedChainId, transferHash);
        setTxHashes([{ label: "deposit", hash: transferHash, chainId: preparedChainId }]);
        setStatus("Deposit complete.");
        return;
      }

      const usdcBefore = await readUsdcBalance(provider, preparedChainId, prepare.usdcAddress, walletAddress);

      if (prepare.approval?.required && prepare.approval.txRequest) {
        setStatus("Sending token approval...");
        const approvalHash = await sendTransaction(
          provider,
          buildTxRequest({ txRequest: prepare.approval.txRequest, from: walletAddress })
        );
        await waitForReceipt(provider, preparedChainId, approvalHash);
        setTxHashes((prev) => [...prev, { label: "approval", hash: approvalHash, chainId: preparedChainId }]);
      }

      let signature: string | null = null;
      if (prepare.permitData) {
        const typedData = buildPermitTypedData(prepare.permitData);
        if (!typedData) {
          throw new Error("Invalid permitData returned by Uniswap API.");
        }
        setStatus("Signing Permit2 payload...");
        signature = (await provider.request({
          method: "eth_signTypedData_v4",
          params: [walletAddress, JSON.stringify(typedData)]
        })) as string;
      }

      setStatus("Building swap transaction...");
      const swapResponse = await fetch(`/api/agents/${props.agentId}/funding/uniswap`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "swapTx",
          walletAddress,
          quote: prepare.quote,
          permitData: prepare.permitData ?? null,
          signature
        })
      });

      const swapPayload = (await swapResponse.json()) as FundingSwapResponse;
      if (!swapResponse.ok || !swapPayload.txRequest) {
        throw new Error(swapPayload.error ?? "Failed to build swap transaction.");
      }

      setStatus("Submitting swap...");
      const swapHash = await sendTransaction(
        provider,
        buildTxRequest({ txRequest: swapPayload.txRequest, from: walletAddress })
      );
      await waitForReceipt(provider, preparedChainId, swapHash);
      setTxHashes((prev) => [...prev, { label: "swap", hash: swapHash, chainId: preparedChainId }]);

      try {
        const swapStatusResponse = await fetch(`/api/agents/${props.agentId}/funding/uniswap`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "swapStatus",
            chainId: preparedChainId,
            txHash: swapHash
          })
        });
        const swapStatus = (await swapStatusResponse.json()) as FundingSwapStatusResponse;
        const status =
          swapStatus.swap && typeof swapStatus.swap.status === "string" ? String(swapStatus.swap.status) : null;
        const uniswapAppUrl = swapStatus.uniswapAppUrl ?? null;
        setTxHashes((prev) =>
          prev.map((entry) =>
            entry.hash === swapHash
              ? {
                  ...entry,
                  uniswapStatus: status,
                  uniswapAppUrl
                }
              : entry
          )
        );
      } catch {}

      setStatus("Calculating USDC received...");
      const usdcAfter = await readUsdcBalance(provider, preparedChainId, prepare.usdcAddress, walletAddress);
      const receivedUsdc = usdcAfter - usdcBefore;
      if (receivedUsdc <= BigInt(0)) {
        throw new Error("Swap completed but no USDC was received.");
      }

      setStatus(`Depositing ${formatUnits(receivedUsdc, 6)} USDC into agent wallet...`);
      const transferData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [props.agentWalletAddress as `0x${string}`, receivedUsdc]
      });

      const depositHash = await sendTransaction(provider, {
        from: walletAddress,
        to: prepare.usdcAddress,
        data: transferData,
        value: "0x0"
      });
      await waitForReceipt(provider, preparedChainId, depositHash);
      setTxHashes((prev) => [...prev, { label: "deposit", hash: depositHash, chainId: preparedChainId }]);
      setStatus("Swap + deposit complete.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Funding flow failed.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={!props.agentWalletAddress}
        onClick={() => setOpen(true)}
        className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-[11px] uppercase tracking-widest text-primary hover:bg-primary/20 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
      >
        Fund Agent
      </button>

      {open && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative z-10 w-full max-w-xl rounded-md border border-white/15 bg-[#090909] p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">Fund {props.agentName}</h3>
                <p className="text-xs text-slate-500">
                  Base mainnet only: swap supported tokens to USDC via Uniswap API, then deposit to the agent wallet.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded border border-white/15 px-2 py-1 text-xs text-slate-400 hover:text-white"
              >
                Close
              </button>
            </div>

            <form onSubmit={submitFunding} className="space-y-3">
              <div>
                <label className="mb-1 block text-[11px] uppercase tracking-wider text-slate-500">From Token</label>
                <select
                  value={selectedToken}
                  onChange={(event) => setSelectedToken(event.target.value)}
                  className="w-full rounded-md border border-white/10 bg-[#111] px-3 py-2 text-sm text-slate-200"
                >
                  {loadingTokens && <option value={usdcAddress}>Loading wallet tokens...</option>}
                  {!loadingTokens &&
                    detectedTokenOptions.map((token) => (
                      <option key={token.address} value={token.address}>
                        {token.symbol} ({formatUnits(token.balance, token.decimals)})
                      </option>
                    ))}
                  <option value="custom">Custom token address...</option>
                </select>
                {selectedToken === "custom" && (
                  <input
                    value={customTokenIn}
                    onChange={(event) => setCustomTokenIn(event.target.value)}
                    placeholder="0x..."
                    className="mt-2 w-full rounded-md border border-white/10 bg-[#111] px-3 py-2 font-mono text-sm text-slate-200"
                  />
                )}
              </div>
              <div>
                <label className="mb-1 block text-[11px] uppercase tracking-wider text-slate-500">Amount In</label>
                <input
                  value={amountIn}
                  onChange={(event) => setAmountIn(event.target.value)}
                  placeholder="1.00"
                  className="w-full rounded-md border border-white/10 bg-[#111] px-3 py-2 text-sm text-slate-200"
                />
              </div>
              <div className="rounded border border-white/10 bg-black/20 p-2 text-xs text-slate-500">
                Owner wallet: {selectedWallet?.normalized ?? "not connected"}
                <br />
                Agent wallet: {props.agentWalletAddress ?? "missing"}
                <br />
                Wallets ready: {ready ? "yes" : "no"}
              </div>

              <button
                type="submit"
                disabled={running || !canFund}
                className="w-full rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-xs uppercase tracking-widest text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {running ? "Processing..." : "Swap + Deposit"}
              </button>
            </form>

            {status && <p className="mt-3 text-xs text-slate-300">{status}</p>}

            {txHashes.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-slate-400">
                {txHashes.map((entry) => (
                  <li key={`${entry.label}-${entry.hash}`}>
                    {entry.label}:{" "}
                    <a
                      href={`${txExplorerBase(entry.chainId)}${entry.hash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline"
                    >
                      {entry.hash}
                    </a>
                    {entry.uniswapStatus && (
                      <span className="ml-2 text-[11px] uppercase tracking-wide text-slate-500">
                        ({entry.uniswapStatus})
                      </span>
                    )}
                    {entry.label === "swap" && entry.uniswapAppUrl && (
                      <a
                        href={entry.uniswapAppUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-2 text-[11px] uppercase tracking-wide text-primary hover:underline"
                      >
                        Uniswap
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}

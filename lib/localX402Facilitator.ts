import { x402Facilitator } from "@x402/core/facilitator";
import type { FacilitatorClient } from "@x402/core/server";
import type {
  Network,
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  SupportedResponse,
  VerifyResponse
} from "@x402/core/types";
import { registerExactEvmScheme } from "@x402/evm/exact/facilitator";
import type { FacilitatorEvmSigner } from "@x402/evm";
import { createPublicClient, createWalletClient, http, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getBuilderCode, getBuilderCodeDataSuffix } from "@/lib/builderCode";
import { getChainByX402Network, getPaymentNetworkConfigByCaip, isBaseX402Network } from "@/lib/paymentNetwork";

const ERC20_BALANCE_OF_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }]
  }
] as const;

const EIP3009_AUTHORIZATION_STATE_ABI = [
  {
    type: "function",
    name: "authorizationState",
    stateMutability: "view",
    inputs: [
      { name: "authorizer", type: "address" },
      { name: "nonce", type: "bytes32" }
    ],
    outputs: [{ name: "used", type: "bool" }]
  }
] as const;

function requireFacilitatorPrivateKey(network: Network): `0x${string}` {
  const isBase = isBaseX402Network(network);
  const value = (
    (isBase
      ? process.env.X402_BASE_FACILITATOR_PRIVATE_KEY ??
        process.env.X402_FACILITATOR_PRIVATE_KEY ??
        process.env.BASE_ESCROW_PRIVATE_KEY
      : process.env.X402_KITE_FACILITATOR_PRIVATE_KEY ??
        process.env.KITE_ESCROW_PRIVATE_KEY ??
        process.env.X402_FACILITATOR_PRIVATE_KEY ??
        process.env.BASE_ESCROW_PRIVATE_KEY) ??
    process.env.PRIVATE_KEY ??
    ""
  ).trim();

  if (!value) {
    throw new Error(
      "Missing facilitator key. Set X402_FACILITATOR_PRIVATE_KEY (or BASE_ESCROW_PRIVATE_KEY / KITE_ESCROW_PRIVATE_KEY / PRIVATE_KEY)."
    );
  }
  return value as `0x${string}`;
}

class LocalX402FacilitatorClient implements FacilitatorClient {
  private readonly facilitator = new x402Facilitator();
  private readonly publicClient: ReturnType<typeof createPublicClient>;
  private readonly eip3009SupportCache = new Map<string, boolean>();

  constructor(network: Network) {
    const chain = getChainByX402Network(network);
    if (!chain) {
      throw new Error(`Unsupported x402 network for local facilitator: ${network}`);
    }

    const account = privateKeyToAccount(requireFacilitatorPrivateKey(network));
    const builderCode = isBaseX402Network(network) ? getBuilderCode() : null;
    const dataSuffix = isBaseX402Network(network) ? getBuilderCodeDataSuffix() : undefined;
    const txAttribution = dataSuffix ? { dataSuffix } : {};
    const networkConfig = getPaymentNetworkConfigByCaip(network);
    const rpcUrl = (process.env.X402_FACILITATOR_RPC_URL ?? networkConfig?.rpcUrl ?? "").trim() || undefined;
    const transport = http(rpcUrl);

    console.info(
      `[x402] local facilitator enabled network=${network} signer=${account.address} builderCode=${builderCode ?? "none"}`
    );

    const publicClient = createPublicClient({
      chain,
      transport
    });
    this.publicClient = publicClient;

    const walletClient = createWalletClient({
      account,
      chain,
      transport,
      ...txAttribution
    });

    const signer: FacilitatorEvmSigner = {
      getAddresses: () => [account.address],
      readContract: (args) => publicClient.readContract(args as never),
      verifyTypedData: (args) => publicClient.verifyTypedData(args as never),
      writeContract: (args) =>
        walletClient.writeContract({
          address: args.address,
          abi: args.abi as never,
          functionName: args.functionName as never,
          args: args.args as never,
          ...txAttribution,
          account
        } as never),
      sendTransaction: (args) =>
        walletClient.sendTransaction({
          to: args.to,
          data: args.data,
          ...txAttribution,
          account
        }),
      waitForTransactionReceipt: (args) => publicClient.waitForTransactionReceipt(args as never),
      getCode: (args) => publicClient.getCode(args as never)
    };

    registerExactEvmScheme(this.facilitator, {
      signer,
      networks: [network]
    });
  }

  private extractAuthorizationInfo(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements
  ): { payer: `0x${string}`; asset: `0x${string}`; amount: bigint } | null {
    const payload = (paymentPayload as { payload?: Record<string, unknown> })?.payload;
    if (!payload || typeof payload !== "object") {
      return null;
    }

    const authorization = (payload as { authorization?: Record<string, unknown> }).authorization;
    if (authorization && typeof authorization === "object") {
      const payer = String((authorization as { from?: unknown }).from ?? "").trim();
      const amountRaw = String((authorization as { value?: unknown }).value ?? "").trim();
      const asset = String((paymentRequirements as { asset?: unknown }).asset ?? "").trim();
      if (!isAddress(payer) || !isAddress(asset) || !amountRaw) {
        return null;
      }
      try {
        const amount = BigInt(amountRaw);
        if (amount <= BigInt(0)) {
          return null;
        }
        return {
          payer: payer as `0x${string}`,
          asset: asset as `0x${string}`,
          amount
        };
      } catch {
        return null;
      }
    }

    const permit2 = (payload as { permit2Authorization?: Record<string, unknown> }).permit2Authorization;
    if (!permit2 || typeof permit2 !== "object") {
      return null;
    }

    const payer = String((permit2 as { from?: unknown }).from ?? "").trim();
    const permitted = (permit2 as { permitted?: Record<string, unknown> }).permitted;
    if (!permitted || typeof permitted !== "object") {
      return null;
    }
    const asset = String((permitted as { token?: unknown }).token ?? "").trim();
    const amountRaw = String((permitted as { amount?: unknown }).amount ?? "").trim();
    if (!isAddress(payer) || !isAddress(asset) || !amountRaw) {
      return null;
    }
    try {
      const amount = BigInt(amountRaw);
      if (amount <= BigInt(0)) {
        return null;
      }
      return {
        payer: payer as `0x${string}`,
        asset: asset as `0x${string}`,
        amount
      };
    } catch {
      return null;
    }
  }

  private async assertEip3009Support(asset: `0x${string}`): Promise<void> {
    const key = asset.toLowerCase();
    const cached = this.eip3009SupportCache.get(key);
    if (cached === true) {
      return;
    }
    if (cached === false) {
      throw new Error(
        `Token ${asset} is not EIP-3009 compatible on this network (missing transferWithAuthorization).`
      );
    }

    let supported = false;
    try {
      await this.publicClient.readContract({
        address: asset,
        abi: EIP3009_AUTHORIZATION_STATE_ABI,
        functionName: "authorizationState",
        args: ["0x0000000000000000000000000000000000000001", `0x${"00".repeat(32)}`]
      });
      supported = true;
    } catch {}

    this.eip3009SupportCache.set(key, supported);
    if (!supported) {
      throw new Error(
        `Token ${asset} is not EIP-3009 compatible on this network (missing transferWithAuthorization).`
      );
    }
  }

  private async assertSufficientBalance(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements
  ): Promise<void> {
    const info = this.extractAuthorizationInfo(paymentPayload, paymentRequirements);
    if (!info) {
      return;
    }

    const transferMethod = String(
      ((paymentRequirements as { extra?: Record<string, unknown> | null })?.extra?.assetTransferMethod ?? "eip3009")
    )
      .trim()
      .toLowerCase();

    if (transferMethod === "eip3009") {
      await this.assertEip3009Support(info.asset);
    }

    const balance = await this.publicClient.readContract({
      address: info.asset,
      abi: ERC20_BALANCE_OF_ABI,
      functionName: "balanceOf",
      args: [info.payer]
    });

    if (balance < info.amount) {
      throw new Error(
        `Insufficient token balance for x402 settlement: have ${balance.toString()}, need ${info.amount.toString()}, asset=${info.asset}, payer=${info.payer}`
      );
    }
  }

  verify(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<VerifyResponse> {
    return this.facilitator.verify(paymentPayload, paymentRequirements);
  }

  async settle(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<SettleResponse> {
    await this.assertSufficientBalance(paymentPayload, paymentRequirements);
    return this.facilitator.settle(paymentPayload, paymentRequirements);
  }

  async getSupported(): Promise<SupportedResponse> {
    const supported = this.facilitator.getSupported() as {
      kinds: Array<{
        x402Version: number;
        scheme: string;
        network: string;
        extra?: Record<string, unknown>;
      }>;
      extensions: string[];
      signers: Record<string, string[]>;
    };

    return {
      ...supported,
      kinds: supported.kinds.map((kind) => ({
        ...kind,
        network: kind.network as Network
      }))
    };
  }
}

const localFacilitatorClients = new Map<Network, LocalX402FacilitatorClient>();

export function getLocalX402FacilitatorClient(network: Network): FacilitatorClient {
  const existing = localFacilitatorClients.get(network);
  if (existing) {
    return existing;
  }

  const created = new LocalX402FacilitatorClient(network);
  localFacilitatorClients.set(network, created);
  return created;
}

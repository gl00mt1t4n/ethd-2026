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
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import { getBuilderCodeDataSuffix } from "@/lib/builderCode";

function getBaseChain(network: Network) {
  if (network === "eip155:84532") {
    return baseSepolia;
  }
  if (network === "eip155:8453") {
    return base;
  }
  throw new Error(`Unsupported X402_BASE_NETWORK for local facilitator: ${network}`);
}

function requireFacilitatorPrivateKey(): `0x${string}` {
  const value = (
    process.env.X402_FACILITATOR_PRIVATE_KEY ??
    process.env.BASE_ESCROW_PRIVATE_KEY ??
    process.env.PRIVATE_KEY ??
    ""
  ).trim();

  if (!value) {
    throw new Error(
      "Missing facilitator key. Set X402_FACILITATOR_PRIVATE_KEY (or BASE_ESCROW_PRIVATE_KEY / PRIVATE_KEY)."
    );
  }
  return value as `0x${string}`;
}

class LocalX402FacilitatorClient implements FacilitatorClient {
  private readonly facilitator = new x402Facilitator();

  constructor(network: Network) {
    const chain = getBaseChain(network);
    const account = privateKeyToAccount(requireFacilitatorPrivateKey());
    const dataSuffix = getBuilderCodeDataSuffix();
    const rpcUrl = (process.env.X402_FACILITATOR_RPC_URL ?? "").trim() || undefined;
    const transport = http(rpcUrl);

    const publicClient = createPublicClient({
      chain,
      transport
    });

    const walletClient = createWalletClient({
      account,
      chain,
      transport,
      dataSuffix
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
          account
        } as never),
      sendTransaction: (args) =>
        walletClient.sendTransaction({
          to: args.to,
          data: args.data,
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

  verify(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<VerifyResponse> {
    return this.facilitator.verify(paymentPayload, paymentRequirements);
  }

  settle(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<SettleResponse> {
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

let localFacilitatorClient: LocalX402FacilitatorClient | null = null;

export function getLocalX402FacilitatorClient(network: Network): FacilitatorClient {
  if (!localFacilitatorClient) {
    localFacilitatorClient = new LocalX402FacilitatorClient(network);
  }
  return localFacilitatorClient;
}

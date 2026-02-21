import {
  HTTPFacilitatorClient,
  x402HTTPResourceServer,
  x402ResourceServer,
  type HTTPAdapter,
  type HTTPRequestContext,
  type RouteConfig
} from "@x402/core/server";
import type { Network } from "@x402/core/types";
import { registerExactEvmScheme } from "@x402/evm/exact/server";
import { NextResponse } from "next/server";
import { getLocalX402FacilitatorClient } from "@/lib/localX402Facilitator";

const FACILITATOR_URL = process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator";
export const X402_BASE_NETWORK = (process.env.X402_BASE_NETWORK ?? "eip155:84532") as Network;
const USE_LOCAL_FACILITATOR = (process.env.X402_USE_LOCAL_FACILITATOR ?? "1").trim() !== "0";

const facilitator = USE_LOCAL_FACILITATOR
  ? getLocalX402FacilitatorClient(X402_BASE_NETWORK)
  : new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const resourceServer = new x402ResourceServer(facilitator);
registerExactEvmScheme(resourceServer, { networks: [X402_BASE_NETWORK] });

let initializationPromise: Promise<void> | null = null;
let settlementQueue: Promise<void> = Promise.resolve();

async function initializeServer(): Promise<void> {
  if (!initializationPromise) {
    initializationPromise = resourceServer.initialize();
  }
  await initializationPromise;
}

async function runSettlementSerial<T>(task: () => Promise<T>): Promise<T> {
  const previous = settlementQueue;
  let release!: () => void;

  settlementQueue = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous.catch(() => {});

  try {
    return await task();
  } finally {
    release();
  }
}

class NextHttpAdapter implements HTTPAdapter {
  constructor(private readonly request: Request) {}

  getHeader(name: string): string | undefined {
    return this.request.headers.get(name) ?? undefined;
  }

  getMethod(): string {
    return this.request.method;
  }

  getPath(): string {
    return new URL(this.request.url).pathname;
  }

  getUrl(): string {
    return this.request.url;
  }

  getAcceptHeader(): string {
    return this.request.headers.get("accept") ?? "";
  }

  getUserAgent(): string {
    return this.request.headers.get("user-agent") ?? "";
  }
}

function toResponseInstructions(result: {
  status: number;
  headers: Record<string, string>;
  body?: unknown;
}) {
  const contentType = result.headers["Content-Type"] ?? result.headers["content-type"];

  if (!contentType || contentType.includes("application/json")) {
    return NextResponse.json(result.body ?? {}, {
      status: result.status,
      headers: result.headers
    });
  }

  return new NextResponse(typeof result.body === "string" ? result.body : JSON.stringify(result.body ?? {}), {
    status: result.status,
    headers: result.headers
  });
}

function decodePaymentRequiredError(headers: Record<string, string>): string | null {
  const encoded = headers["payment-required"] ?? headers["Payment-Required"];
  if (!encoded) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as { error?: unknown };
    const error = typeof decoded?.error === "string" ? decoded.error.trim() : "";
    return error || null;
  } catch {
    return null;
  }
}

export type PaidRouteContext = {
  paymentVerified: boolean;
  settlementTransaction: string | null;
  settlementNetwork: Network | null;
};

export async function handlePaidRoute(
  request: Request,
  routeConfig: RouteConfig,
  onPaidRequest: (context: PaidRouteContext) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    await initializeServer();
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "x402 facilitator initialization failed."
      },
      { status: 500 }
    );
  }

  const httpServer = new x402HTTPResourceServer(resourceServer, routeConfig);
  const adapter = new NextHttpAdapter(request);
  const context: HTTPRequestContext = {
    adapter,
    path: adapter.getPath(),
    method: adapter.getMethod()
  };

  let paymentState;
  try {
    paymentState = await httpServer.processHTTPRequest(context);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to process x402 payment request."
      },
      { status: 500 }
    );
  }

  if (paymentState.type === "payment-error") {
    const headerError = decodePaymentRequiredError(paymentState.response.headers);
    if (
      headerError &&
      (!paymentState.response.body ||
        typeof paymentState.response.body !== "object" ||
        typeof (paymentState.response.body as { error?: unknown }).error !== "string")
    ) {
      return NextResponse.json(
        { error: headerError },
        {
          status: paymentState.response.status,
          headers: paymentState.response.headers
        }
      );
    }

    return toResponseInstructions(paymentState.response);
  }
  let settlementHeaders: Record<string, string> | null = null;
  let paidContext: PaidRouteContext = {
    paymentVerified: false,
    settlementTransaction: null,
    settlementNetwork: null
  };

  // Settle payment first, then run the protected mutation.
  if (paymentState.type === "payment-verified") {
    let settlement;
    try {
      settlement = await runSettlementSerial(() =>
        httpServer.processSettlement(
          paymentState.paymentPayload,
          paymentState.paymentRequirements,
          paymentState.declaredExtensions
        )
      );
    } catch (error) {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Failed to settle x402 payment."
        },
        { status: 500 }
      );
    }

    if (!settlement.success) {
      return NextResponse.json(
        {
          error: settlement.errorMessage ?? settlement.errorReason ?? "Payment settlement failed."
        },
        { status: 402 }
      );
    }

    settlementHeaders = settlement.headers;
    paidContext = {
      paymentVerified: true,
      settlementTransaction: settlement.transaction?.trim() || null,
      settlementNetwork: settlement.network ?? null
    };
  }

  let response;
  try {
    response = await onPaidRequest(paidContext);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Paid route handler failed."
      },
      { status: 500 }
    );
  }

  if (settlementHeaders) {
    for (const [key, value] of Object.entries(settlementHeaders)) {
      response.headers.set(key, value);
    }
  }

  return response;
}

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

const FACILITATOR_URL = process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator";
export const X402_BASE_NETWORK = (process.env.X402_BASE_NETWORK ?? "eip155:8453") as Network;

const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const resourceServer = new x402ResourceServer(facilitator);
registerExactEvmScheme(resourceServer, { networks: [X402_BASE_NETWORK] });

let initializationPromise: Promise<void> | null = null;

async function initializeServer(): Promise<void> {
  if (!initializationPromise) {
    initializationPromise = resourceServer.initialize();
  }
  await initializationPromise;
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

export async function handlePaidRoute(
  request: Request,
  routeConfig: RouteConfig,
  onPaidRequest: () => Promise<NextResponse>
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

  const paymentState = await httpServer.processHTTPRequest(context);

  if (paymentState.type === "payment-error") {
    return toResponseInstructions(paymentState.response);
  }

  const response = await onPaidRequest();

  if (paymentState.type !== "payment-verified") {
    return response;
  }

  if (response.status >= 400) {
    return response;
  }

  const settlement = await httpServer.processSettlement(
    paymentState.paymentPayload,
    paymentState.paymentRequirements,
    paymentState.declaredExtensions
  );

  if (!settlement.success) {
    return NextResponse.json(
      {
        error: settlement.errorMessage ?? settlement.errorReason ?? "Payment settlement failed."
      },
      { status: 402 }
    );
  }

  for (const [key, value] of Object.entries(settlement.headers)) {
    response.headers.set(key, value);
  }

  return response;
}

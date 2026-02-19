import { NextResponse } from "next/server";
import { listAgents, listAgentsByOwner, registerAgent } from "@/lib/agentStore";
import { getAuthState } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope");
  const auth = await getAuthState();

  if (scope === "mine") {
    if (!auth.loggedIn || !auth.walletAddress) {
      return NextResponse.json({ error: "Login required." }, { status: 401 });
    }

    const mine = await listAgentsByOwner(auth.walletAddress);
    return NextResponse.json({ agents: mine });
  }

  const agents = await listAgents();
  return NextResponse.json({ agents });
}

export async function POST(request: Request) {
  const auth = await getAuthState();

  if (!auth.loggedIn || !auth.walletAddress || !auth.username) {
    return NextResponse.json({ error: "You must login and complete username setup first." }, { status: 401 });
  }

  const body = (await request.json()) as {
    name?: string;
    description?: string;
    baseWalletAddress?: string;
    mcpServerUrl?: string;
    transport?: string;
    entrypointCommand?: string;
    tags?: string;
  };

  const tags = String(body.tags ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  const result = await registerAgent({
    ownerWalletAddress: auth.walletAddress,
    ownerUsername: auth.username,
    name: String(body.name ?? ""),
    description: String(body.description ?? ""),
    baseWalletAddress: String(body.baseWalletAddress ?? ""),
    mcpServerUrl: String(body.mcpServerUrl ?? ""),
    transport: String(body.transport ?? ""),
    entrypointCommand: String(body.entrypointCommand ?? ""),
    tags
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(
    {
      ok: true,
      agent: result.agent,
      agentAccessToken: result.agentAccessToken,
      eventStreamUrl: "/api/events/questions"
    },
    { status: 201 }
  );
}

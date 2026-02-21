import { NextResponse } from "next/server";
import { appendAgentActionLog, generateAgentActionId } from "@/lib/agentActionLogStore";
import { findAgentByAccessToken } from "@/lib/agentStore";
import { addAnswer, listAnswersByPost } from "@/lib/answerStore";
import { getEscrowPayToAddress } from "@/lib/baseSettlement";
import { formatUsdFromCents } from "@/lib/bidPricing";
import { MAX_PARTICIPANTS_PER_POST } from "@/lib/marketRules";
import { getPostById } from "@/lib/postStore";
import { handlePaidRoute, X402_BASE_NETWORK } from "@/lib/x402Server";

export const runtime = "nodejs";

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) {
    return null;
  }
  return header.slice(7).trim();
}

function getAgentActionId(request: Request): string {
  const raw = String(request.headers.get("x-agent-action-id") ?? "").trim();
  if (!raw) {
    return generateAgentActionId();
  }
  return raw.slice(0, 96);
}

async function safeLog(input: Parameters<typeof appendAgentActionLog>[0]): Promise<void> {
  try {
    await appendAgentActionLog(input);
  } catch {}
}

export async function GET(_request: Request, props: { params: Promise<{ postId: string }> }) {
  const params = await props.params;
  const answers = await listAnswersByPost(params.postId);
  return NextResponse.json({ answers });
}

export async function POST(request: Request, props: { params: Promise<{ postId: string }> }) {
  const params = await props.params;
  const actionId = getAgentActionId(request);
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Missing Bearer agent token." }, { status: 401 });
  }

  const agent = await findAgentByAccessToken(token);
  if (!agent) {
    return NextResponse.json({ error: "Invalid agent token." }, { status: 401 });
  }

  const post = await getPostById(params.postId);
  if (!post) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  if (post.settlementStatus !== "open") {
    return NextResponse.json({ error: "Bidding is already closed for this post." }, { status: 400 });
  }

  if (new Date() > new Date(post.answersCloseAt)) {
    return NextResponse.json({ error: "Bidding window has ended for this post." }, { status: 400 });
  }

  const answers = await listAnswersByPost(params.postId);
  if (answers.some((answer) => answer.agentId === agent.id)) {
    return NextResponse.json({ error: "Agent already answered this question." }, { status: 400 });
  }
  if (answers.length >= MAX_PARTICIPANTS_PER_POST) {
    return NextResponse.json(
      { error: `Participant cap reached for this post (${MAX_PARTICIPANTS_PER_POST}).` },
      { status: 400 }
    );
  }

  let body: { content?: string; bidAmountCents?: unknown };
  try {
    body = (await request.clone().json()) as { content?: string; bidAmountCents?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const content = String(body.content ?? "");
  const bidValue =
    typeof body.bidAmountCents === "number" ? body.bidAmountCents : Number(body.bidAmountCents);

  if (!Number.isFinite(bidValue) || !Number.isInteger(bidValue)) {
    return NextResponse.json({ error: "bidAmountCents must be an integer." }, { status: 400 });
  }
  if (bidValue < 0) {
    return NextResponse.json({ error: "bidAmountCents cannot be negative." }, { status: 400 });
  }

  const bidAmountCents = bidValue;

  if (bidAmountCents === 0) {
    const result = await addAnswer({
      postId: params.postId,
      agentId: agent.id,
      agentName: agent.name,
      content,
      bidAmountCents,
      paymentNetwork: "internal",
      paymentTxHash: null
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(
      {
        ok: true,
        answer: result.answer,
        bidAmountUsd: formatUsdFromCents(bidAmountCents),
        bidAmountCents,
        paymentTxHash: result.answer.paymentTxHash
      },
      { status: 201 }
    );
  }

  let payTo = "";
  try {
    payTo = getEscrowPayToAddress();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Escrow wallet is not configured." },
      { status: 500 }
    );
  }

  const route = `/api/posts/${params.postId}/answers`;

  await safeLog({
    actionId,
    route,
    method: "POST",
    stage: "paid_submit_attempt",
    outcome: "info",
    agentId: agent.id,
    agentName: agent.name,
    postId: params.postId,
    bidAmountCents,
    paymentNetwork: X402_BASE_NETWORK,
    metadata: { payTo }
  });

  const response = await handlePaidRoute(
    request,
    {
      accepts: {
        scheme: "exact",
        network: X402_BASE_NETWORK,
        payTo,
        price: `$${formatUsdFromCents(bidAmountCents)}`
      },
      description: `Stake to submit an agent answer for post ${params.postId}`,
      unpaidResponseBody: async () => ({
        contentType: "application/json",
        body: {
          error: "Payment required to submit this answer.",
          bidAmountUsd: formatUsdFromCents(bidAmountCents),
          bidAmountCents,
          network: X402_BASE_NETWORK,
          payTo
        }
      })
    },
    async (paidContext) => {
      const result = await addAnswer({
        postId: params.postId,
        agentId: agent.id,
        agentName: agent.name,
        content,
        bidAmountCents,
        paymentNetwork: X402_BASE_NETWORK,
        paymentTxHash: paidContext.settlementTransaction
      });

      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      await safeLog({
        actionId,
        route,
        method: "POST",
        stage: "paid_submit_success",
        outcome: "success",
        agentId: agent.id,
        agentName: agent.name,
        postId: params.postId,
        bidAmountCents,
        paymentNetwork: X402_BASE_NETWORK,
        paymentTxHash: result.answer.paymentTxHash,
        httpStatus: 201
      });

      return NextResponse.json(
        {
          ok: true,
          answer: result.answer,
          bidAmountUsd: formatUsdFromCents(bidAmountCents),
          bidAmountCents,
          paymentTxHash: result.answer.paymentTxHash
        },
        { status: 201 }
      );
    }
  );

  if (!response.ok) {
    const payload = await response.clone().json().catch(() => null);
    const errorMessage =
      payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `HTTP ${response.status}`;
    await safeLog({
      actionId,
      route,
      method: "POST",
      stage: "paid_submit_failed",
      outcome: "failure",
      agentId: agent.id,
      agentName: agent.name,
      postId: params.postId,
      bidAmountCents,
      paymentNetwork: X402_BASE_NETWORK,
      httpStatus: response.status,
      errorMessage
    });
  }

  response.headers.set("x-agent-action-id", actionId);
  return response;
}

import { NextResponse } from "next/server";
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

export async function GET(_request: Request, { params }: { params: { postId: string } }) {
  const answers = await listAnswersByPost(params.postId);
  return NextResponse.json({ answers });
}

export async function POST(request: Request, { params }: { params: { postId: string } }) {
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

  const bidAmountCents = post.requiredBidCents;

  let payTo = "";
  try {
    payTo = getEscrowPayToAddress();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Escrow wallet is not configured." },
      { status: 500 }
    );
  }

  return handlePaidRoute(
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
      const body = (await request.json()) as { content?: string };
      const content = String(body.content ?? "");

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
}

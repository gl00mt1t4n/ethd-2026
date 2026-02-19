import { NextResponse } from "next/server";
import { findAgentById } from "@/lib/agentStore";
import { listAnswersByPost } from "@/lib/answerStore";
import { disburseWinnerPayout } from "@/lib/baseSettlement";
import { formatUsdFromCents } from "@/lib/bidPricing";
import { getPostById, settlePost } from "@/lib/postStore";
import { getAuthState } from "@/lib/session";
import { X402_BASE_NETWORK } from "@/lib/x402Server";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: { postId: string } }) {
  const auth = await getAuthState();
  if (!auth.loggedIn || !auth.username) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const post = await getPostById(params.postId);
  if (!post) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  if (post.poster !== auth.username) {
    return NextResponse.json({ error: "Only the question poster can select a winner." }, { status: 403 });
  }

  if (post.settlementStatus !== "open") {
    return NextResponse.json({ error: "Post has already been settled." }, { status: 400 });
  }

  if (new Date() < new Date(post.answersCloseAt)) {
    return NextResponse.json({ error: "Answer window is still active." }, { status: 400 });
  }

  const body = (await request.json()) as { answerId?: string };
  const answerId = String(body.answerId ?? "").trim();
  if (!answerId) {
    return NextResponse.json({ error: "answerId is required." }, { status: 400 });
  }

  const answers = await listAnswersByPost(params.postId);
  const winnerAnswer = answers.find((answer) => answer.id === answerId);

  if (!winnerAnswer) {
    return NextResponse.json({ error: "Selected answer does not belong to this post." }, { status: 400 });
  }

  if (post.poolTotalCents <= 0) {
    return NextResponse.json({ error: "Escrow pool is empty." }, { status: 400 });
  }

  const winnerAgent = await findAgentById(winnerAnswer.agentId);
  if (!winnerAgent) {
    return NextResponse.json({ error: "Winning agent record not found." }, { status: 404 });
  }
  if (!winnerAgent.baseWalletAddress) {
    return NextResponse.json({ error: "Winning agent has no payout wallet configured." }, { status: 400 });
  }

  const winnerPayoutCents = Math.max(1, Math.floor(post.poolTotalCents * 0.8));
  const platformFeeCents = post.poolTotalCents - winnerPayoutCents;

  let payout;
  try {
    payout = await disburseWinnerPayout({
      to: winnerAgent.baseWalletAddress,
      amountCents: winnerPayoutCents
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to disburse winner payout."
      },
      { status: 502 }
    );
  }

  const settled = await settlePost({
    postId: post.id,
    winnerAnswerId: winnerAnswer.id,
    winnerAgentId: winnerAnswer.agentId,
    winnerPayoutCents,
    platformFeeCents,
    settlementTxHash: payout.txHash
  });

  if (!settled) {
    return NextResponse.json({ error: "Failed to persist settlement." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    post: settled,
    settlement: {
      network: X402_BASE_NETWORK,
      txHash: payout.txHash,
      poolTotalUsd: formatUsdFromCents(post.poolTotalCents),
      winnerPayoutUsd: formatUsdFromCents(winnerPayoutCents),
      platformFeeUsd: formatUsdFromCents(platformFeeCents)
    }
  });
}

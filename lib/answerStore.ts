import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { MAX_PARTICIPANTS_PER_POST } from "@/lib/marketRules";
import { createAnswer, type Answer } from "@/lib/types";

function toAnswer(record: {
  id: string;
  postId: string;
  agentId: string;
  agentName: string;
  content: string;
  bidAmountCents?: number | null;
  paymentNetwork?: string | null;
  paymentTxHash?: string | null;
  createdAt: Date;
}): Answer {
  return {
    id: record.id,
    postId: record.postId,
    agentId: record.agentId,
    agentName: record.agentName,
    content: record.content,
    bidAmountCents: Number(record.bidAmountCents ?? 0),
    paymentNetwork: record.paymentNetwork ?? "internal",
    paymentTxHash: record.paymentTxHash ?? null,
    createdAt: record.createdAt.toISOString()
  };
}

export async function listAnswersByPost(postId: string): Promise<Answer[]> {
  const answers = await prisma.answer.findMany({
    where: { postId },
    orderBy: { createdAt: "asc" }
  });
  return answers.map((answer) => toAnswer(answer as any));
}

export async function addAnswer(input: {
  postId: string;
  agentId: string;
  agentName: string;
  content: string;
  bidAmountCents: number;
  paymentNetwork: string;
  paymentTxHash?: string | null;
}): Promise<{ ok: true; answer: Answer } | { ok: false; error: string }> {
  const content = input.content.trim();
  if (content.length < 3) {
    return { ok: false, error: "Answer content too short." };
  }

  if (!Number.isFinite(input.bidAmountCents) || input.bidAmountCents <= 0) {
    return { ok: false, error: "Bid amount must be a positive number of cents." };
  }

  const answer = createAnswer({
    postId: input.postId,
    agentId: input.agentId,
    agentName: input.agentName,
    content,
    bidAmountCents: Math.floor(input.bidAmountCents),
    paymentNetwork: input.paymentNetwork,
    paymentTxHash: input.paymentTxHash ?? null
  });

  try {
    const created = await prisma.$transaction(async (tx) => {
      const post = await tx.post.findUnique({
        where: { id: input.postId },
        select: { answersCloseAt: true, settlementStatus: true } as any
      });

      if (!post) {
        throw new Error("Post does not exist.");
      }

      if ((post as any).settlementStatus !== "open") {
        throw new Error("Bidding is closed for this post.");
      }

      if ((post as any).answersCloseAt && new Date() > new Date((post as any).answersCloseAt)) {
        throw new Error("Bidding window has ended for this post.");
      }

      await tx.$queryRaw`SELECT id FROM "Post" WHERE id = ${input.postId} FOR UPDATE`;

      const answerCount = await tx.answer.count({
        where: { postId: input.postId }
      });

      if (answerCount >= MAX_PARTICIPANTS_PER_POST) {
        throw new Error(`Participant cap reached for this post (${MAX_PARTICIPANTS_PER_POST}).`);
      }

      const inserted = await tx.answer.create({
        data: {
          id: answer.id,
          postId: answer.postId,
          agentId: answer.agentId,
          agentName: answer.agentName,
          content: answer.content,
          bidAmountCents: answer.bidAmountCents,
          paymentNetwork: answer.paymentNetwork,
          paymentTxHash: answer.paymentTxHash,
          createdAt: new Date(answer.createdAt)
        } as any
      });

      await tx.post.update({
        where: { id: input.postId },
        data: {
          poolTotalCents: {
            increment: answer.bidAmountCents
          }
        } as any
      });

      return inserted;
    });

    return { ok: true, answer: toAnswer(created as any) };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "Agent already answered this question." };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return { ok: false, error: "Post does not exist." };
    }
    if (error instanceof Error && error.message === "Post does not exist.") {
      return { ok: false, error: "Post does not exist." };
    }
    if (error instanceof Error && error.message === "Bidding is closed for this post.") {
      return { ok: false, error: "Bidding is closed for this post." };
    }
    if (error instanceof Error && error.message === "Bidding window has ended for this post.") {
      return { ok: false, error: "Bidding window has ended for this post." };
    }
    if (error instanceof Error && error.message === `Participant cap reached for this post (${MAX_PARTICIPANTS_PER_POST}).`) {
      return { ok: false, error: `Participant cap reached for this post (${MAX_PARTICIPANTS_PER_POST}).` };
    }
    throw error;
  }
}

export async function findAnswerById(answerId: string): Promise<Answer | null> {
  const answer = await prisma.answer.findUnique({
    where: { id: answerId }
  });
  return answer ? toAnswer(answer as any) : null;
}

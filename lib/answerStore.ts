import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createAnswer, type Answer } from "@/lib/types";

function toAnswer(record: {
  id: string;
  postId: string;
  agentId: string;
  agentName: string;
  content: string;
  bidAmountCents: number;
  paymentNetwork: string;
  createdAt: Date;
}): Answer {
  return {
    id: record.id,
    postId: record.postId,
    agentId: record.agentId,
    agentName: record.agentName,
    content: record.content,
    bidAmountCents: record.bidAmountCents,
    paymentNetwork: record.paymentNetwork,
    createdAt: record.createdAt.toISOString()
  };
}

export async function listAnswersByPost(postId: string): Promise<Answer[]> {
  const answers = await prisma.answer.findMany({
    where: { postId },
    orderBy: { createdAt: "asc" }
  });
  return answers.map(toAnswer);
}

export async function addAnswer(input: {
  postId: string;
  agentId: string;
  agentName: string;
  content: string;
  bidAmountCents: number;
  paymentNetwork: string;
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
    paymentNetwork: input.paymentNetwork
  });

  try {
    const created = await prisma.$transaction(async (tx) => {
      const post = await tx.post.findUnique({
        where: { id: input.postId },
        select: { answersCloseAt: true, settlementStatus: true }
      });

      if (!post) {
        throw new Error("Post does not exist.");
      }

      if (post.settlementStatus !== "open") {
        throw new Error("Bidding is closed for this post.");
      }

      if (new Date() > post.answersCloseAt) {
        throw new Error("Bidding window has ended for this post.");
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
          createdAt: new Date(answer.createdAt)
        }
      });

      await tx.post.update({
        where: { id: input.postId },
        data: {
          poolTotalCents: {
            increment: answer.bidAmountCents
          }
        }
      });

      return inserted;
    });

    return { ok: true, answer: toAnswer(created) };
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
    throw error;
  }
}

export async function findAnswerById(answerId: string): Promise<Answer | null> {
  const answer = await prisma.answer.findUnique({
    where: { id: answerId }
  });
  return answer ? toAnswer(answer) : null;
}

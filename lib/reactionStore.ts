import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { recordVoteReputation } from "@/lib/reputationStore";

export type ReactionEntityType = "post" | "answer";
export type ReactionChoice = "like" | "dislike";
export type ViewerReaction = ReactionChoice | null;

type ReactionState = {
  likesCount: number;
  dislikesCount: number;
  viewerReaction: ViewerReaction;
};

function randomId(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
}

export function createVoterKey(): string {
  return randomId("vk");
}

function reactionToValue(reaction: ReactionChoice): 1 | -1 {
  return reaction === "like" ? 1 : -1;
}

function valueToReaction(value: number | null | undefined): ViewerReaction {
  if (value === 1) return "like";
  if (value === -1) return "dislike";
  return null;
}

export async function getReactionState(input: {
  entityType: ReactionEntityType;
  entityId: string;
  voterKey: string;
}): Promise<ReactionState> {
  const [entity, existing] = await Promise.all([
    input.entityType === "post"
      ? prisma.post.findUnique({
          where: { id: input.entityId },
          select: { likesCount: true, dislikesCount: true }
        })
      : prisma.answer.findUnique({
          where: { id: input.entityId },
          select: { likesCount: true, dislikesCount: true }
        }),
    prisma.reaction.findUnique({
      where: {
        entityType_entityId_voterKey: {
          entityType: input.entityType,
          entityId: input.entityId,
          voterKey: input.voterKey
        }
      },
      select: { value: true }
    })
  ]);

  if (!entity) {
    throw new Error("Entity not found.");
  }

  return {
    likesCount: Number(entity.likesCount ?? 0),
    dislikesCount: Number(entity.dislikesCount ?? 0),
    viewerReaction: valueToReaction(existing?.value)
  };
}

export async function setReaction(input: {
  entityType: ReactionEntityType;
  entityId: string;
  voterKey: string;
  reaction: ReactionChoice;
}): Promise<ReactionState> {
  const targetValue = reactionToValue(input.reaction);

  return prisma.$transaction(async (tx) => {
    const entityExists =
      input.entityType === "post"
        ? await tx.post.findUnique({
            where: { id: input.entityId },
            select: { id: true }
          })
        : await tx.answer.findUnique({
            where: { id: input.entityId },
            select: { id: true }
          });

    if (!entityExists) {
      throw new Error("Entity not found.");
    }

    const existing = await tx.reaction.findUnique({
      where: {
        entityType_entityId_voterKey: {
          entityType: input.entityType,
          entityId: input.entityId,
          voterKey: input.voterKey
        }
      },
      select: { id: true, value: true }
    });

    const currentValue = existing?.value ?? 0;
    // UX rule:
    // - same reaction click => neutral
    // - opposite reaction click => neutral first (requires second click to set opposite)
    // This avoids accidental hard flips between like/dislike.
    const nextValue =
      currentValue === targetValue
        ? 0
        : currentValue !== 0 && currentValue !== targetValue
          ? 0
          : targetValue;

    const likeDelta = (nextValue === 1 ? 1 : 0) - (currentValue === 1 ? 1 : 0);
    const dislikeDelta = (nextValue === -1 ? 1 : 0) - (currentValue === -1 ? 1 : 0);

    if (existing && nextValue === 0) {
      await tx.reaction.delete({ where: { id: existing.id } });
    } else if (existing) {
      await tx.reaction.update({
        where: { id: existing.id },
        data: { value: nextValue }
      });
    } else if (nextValue !== 0) {
      await tx.reaction.create({
        data: {
          id: randomId("rxn"),
          entityType: input.entityType,
          entityId: input.entityId,
          voterKey: input.voterKey,
          value: nextValue
        } as any
      });
    }

    if (input.entityType === "post") {
      const updatedPost = await tx.post.update({
        where: { id: input.entityId },
        data: {
          likesCount: { increment: likeDelta },
          dislikesCount: { increment: dislikeDelta }
        } as any,
        select: { likesCount: true, dislikesCount: true }
      });

      return {
        likesCount: Number(updatedPost.likesCount ?? 0),
        dislikesCount: Number(updatedPost.dislikesCount ?? 0),
        viewerReaction: valueToReaction(nextValue)
      };
    }

    const updatedAnswer = await tx.answer.update({
      where: { id: input.entityId },
      data: {
        likesCount: { increment: likeDelta },
        dislikesCount: { increment: dislikeDelta }
      } as any,
      select: { likesCount: true, dislikesCount: true, agentId: true }
    });

    if (likeDelta !== 0) {
      await tx.agent.update({
        where: { id: updatedAnswer.agentId },
        data: {
          totalLikes: { increment: likeDelta }
        } as any
      });
    }

    // Record vote reputation change for ERC-8004 (net change: like=+1, dislike=-1)
    const reputationDelta = likeDelta - dislikeDelta;
    if (reputationDelta !== 0) {
      const sign = reputationDelta >= 0 ? "+" : "";
      console.log(
        `[reputation] reaction entityType=answer answerId=${input.entityId} agentId=${updatedAnswer.agentId} likeDelta=${likeDelta} dislikeDelta=${dislikeDelta} reputationDelta=${sign}${reputationDelta} -> recordVoteReputation`
      );
      recordVoteReputation({
        agentId: updatedAnswer.agentId,
        valueDelta: reputationDelta
      }).catch((err) => {
        console.error("Failed to record vote reputation:", err);
      });
    }

    return {
      likesCount: Number(updatedAnswer.likesCount ?? 0),
      dislikesCount: Number(updatedAnswer.dislikesCount ?? 0),
      viewerReaction: valueToReaction(nextValue)
    };
  });
}

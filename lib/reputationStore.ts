import { prisma } from "@/lib/prisma";
import { submitReputationFeedback, getErc8004Config } from "@/lib/erc8004";

export const WINNER_BONUS_VALUE = 10;

type PendingReputation = {
  erc8004TokenId: number;
  voteScore: number;
  winnerBonuses: number;
};

const pendingReputation = new Map<string, PendingReputation>();

export function getPendingReputation(): Map<string, PendingReputation> {
  return new Map(pendingReputation);
}

export async function recordWinnerReputation(input: {
  agentId: string;
  postId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const agent = await prisma.agent.findUnique({
    where: { id: input.agentId },
    select: {
      id: true,
      erc8004TokenId: true
    }
  });

  if (!agent) {
    return { ok: false, error: "Agent not found" };
  }

  if (agent.erc8004TokenId == null) {
    return { ok: true };
  }

  const existing = pendingReputation.get(input.agentId);
  if (existing) {
    existing.winnerBonuses += 1;
  } else {
    pendingReputation.set(input.agentId, {
      erc8004TokenId: agent.erc8004TokenId,
      voteScore: 0,
      winnerBonuses: 1
    });
  }

  const pending = pendingReputation.get(input.agentId)!;
  console.log(
    `[reputation] winner agentId=${input.agentId} postId=${input.postId} tokenId=${agent.erc8004TokenId} delta=+${WINNER_BONUS_VALUE} pendingVote=${pending.voteScore} pendingWinners=${pending.winnerBonuses}`
  );
  return { ok: true };
}

export async function recordVoteReputation(input: {
  agentId: string;
  valueDelta: number;
}): Promise<{ ok: boolean; error?: string }> {
  if (input.valueDelta === 0) {
    return { ok: true };
  }

  const agent = await prisma.agent.findUnique({
    where: { id: input.agentId },
    select: {
      id: true,
      erc8004TokenId: true
    }
  });

  if (!agent) {
    return { ok: false, error: "Agent not found" };
  }

  if (agent.erc8004TokenId == null) {
    return { ok: true };
  }

  const existing = pendingReputation.get(input.agentId);
  if (existing) {
    existing.voteScore += input.valueDelta;
  } else {
    pendingReputation.set(input.agentId, {
      erc8004TokenId: agent.erc8004TokenId,
      voteScore: input.valueDelta,
      winnerBonuses: 0
    });
  }

  const pending = pendingReputation.get(input.agentId)!;
  const sign = input.valueDelta >= 0 ? "+" : "";
  console.log(
    `[reputation] vote agentId=${input.agentId} tokenId=${agent.erc8004TokenId} delta=${sign}${input.valueDelta} (pendingVote=${pending.voteScore} pendingWinners=${pending.winnerBonuses})`
  );
  return { ok: true };
}

export async function submitPendingReputation(): Promise<{
  submitted: number;
  failed: number;
  errors: string[];
}> {
  const config = getErc8004Config();
  if (!config.configured) {
    return { submitted: 0, failed: 0, errors: ["ERC-8004 not configured"] };
  }

  const entries = Array.from(pendingReputation.entries());
  let submitted = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const [agentId, pending] of entries) {
    const totalValue = pending.voteScore + (pending.winnerBonuses * WINNER_BONUS_VALUE);
    
    if (totalValue === 0) {
      pendingReputation.delete(agentId);
      continue;
    }

    try {
      // Submit vote score if non-zero
      if (pending.voteScore !== 0) {
        console.log(`[reputation] submit agentId=${agentId} tokenId=${pending.erc8004TokenId} type=vote value=${pending.voteScore} tag1=answerQuality`);
        await submitReputationFeedback({
          agentTokenId: pending.erc8004TokenId,
          value: pending.voteScore,
          tag1: "answerQuality",
          tag2: "aggregated"
        });
      }

      // Submit winner bonuses if any
      if (pending.winnerBonuses > 0) {
        const winnerValue = pending.winnerBonuses * WINNER_BONUS_VALUE;
        console.log(`[reputation] submit agentId=${agentId} tokenId=${pending.erc8004TokenId} type=winner value=+${winnerValue} count=${pending.winnerBonuses} tag1=winnerSelected`);
        await submitReputationFeedback({
          agentTokenId: pending.erc8004TokenId,
          value: winnerValue,
          tag1: "winnerSelected",
          tag2: "aggregated"
        });
      }

      pendingReputation.delete(agentId);
      submitted++;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      errors.push(`${agentId}: ${errorMessage}`);
      failed++;
    }
  }

  return { submitted, failed, errors };
}

export function clearPendingReputation(): void {
  pendingReputation.clear();
}

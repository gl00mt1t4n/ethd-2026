export const WINNER_PAYOUT_BPS = 9000;
export const PLATFORM_FEE_BPS = 1000;
export const BPS_DENOMINATOR = 10_000;

export function computeSettlementSplit(poolTotalCents: number): {
  winnerPayoutCents: number;
  platformFeeCents: number;
} {
  const total = Math.max(0, Math.floor(Number(poolTotalCents) || 0));
  if (total === 0) {
    return { winnerPayoutCents: 0, platformFeeCents: 0 };
  }

  const rawWinner = Math.floor((total * WINNER_PAYOUT_BPS) / BPS_DENOMINATOR);
  const winnerPayoutCents = Math.min(total, Math.max(1, rawWinner));
  const platformFeeCents = total - winnerPayoutCents;

  return { winnerPayoutCents, platformFeeCents };
}

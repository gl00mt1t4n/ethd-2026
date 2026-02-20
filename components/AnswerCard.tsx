import Link from "next/link";
import { formatUtcTimestamp } from "@/lib/dateTime";
import { formatUsdFromCents } from "@/lib/bidPricing";
import type { Answer } from "@/lib/types";
import { WinnerBadge } from "@/components/WinnerBadge";

function getTxExplorerUrl(network: string, txHash: string | null): string | null {
  if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return null;
  }

  if (network === "eip155:8453") {
    return `https://basescan.org/tx/${txHash}`;
  }

  if (network === "eip155:84532") {
    return `https://sepolia.basescan.org/tx/${txHash}`;
  }

  return null;
}

function getX402ScanUrl(txHash: string | null): string | null {
  if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return null;
  }

  return `https://www.x402scan.com/transactions?search=${encodeURIComponent(txHash)}`;
}

export function AnswerCard({ answer, isWinner }: { answer: Answer; isWinner?: boolean }) {
  const txUrl = getTxExplorerUrl(answer.paymentNetwork, answer.paymentTxHash);
  const x402scanUrl = getX402ScanUrl(answer.paymentTxHash);
  const shortTx = answer.paymentTxHash
    ? `${answer.paymentTxHash.slice(0, 10)}...${answer.paymentTxHash.slice(-8)}`
    : null;

  return (
    <article className="answer-card stack">
      <div className="row-between">
        <p className="answer-content">{answer.content}</p>
        {isWinner ? <WinnerBadge /> : null}
      </div>
      <p className="post-meta" style={{ margin: 0 }}>
        by agent <strong>{answer.agentName}</strong> at {formatUtcTimestamp(answer.createdAt)} • bid $
        {formatUsdFromCents(answer.bidAmountCents)}
        {txUrl ? (
          <>
            {" "}
            •{" "}
            <Link href={txUrl} target="_blank" rel="noreferrer">
              tx: {shortTx}
            </Link>
          </>
        ) : null}
        {x402scanUrl ? (
          <>
            {" "}
            •{" "}
            <Link href={x402scanUrl} target="_blank" rel="noreferrer">
              x402scan
            </Link>
          </>
        ) : null}
      </p>
    </article>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type WinnerSelectionPanelProps = {
  postId: string;
  canSelectWinner: boolean;
  answerOptions: Array<{ id: string; agentName: string; preview: string }>;
};

export function WinnerSelectionPanel({ postId, canSelectWinner, answerOptions }: WinnerSelectionPanelProps) {
  const router = useRouter();
  const [selectedAnswerId, setSelectedAnswerId] = useState(answerOptions[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  if (!canSelectWinner) {
    return null;
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAnswerId) {
      setMessage("Select an answer first.");
      return;
    }

    setLoading(true);
    setMessage("");

    const response = await fetch(`/api/posts/${postId}/winner`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answerId: selectedAnswerId })
    });

    const data = (await response.json()) as {
      error?: string;
      settlement?: { txHash?: string; winnerPayoutUsd?: string };
    };

    setLoading(false);

    if (!response.ok) {
      setMessage(data.error ?? "Failed to settle winner.");
      return;
    }

    setMessage(
      `Winner settled successfully. Payout ${data.settlement?.winnerPayoutUsd ?? ""} USDC. Tx: ${
        data.settlement?.txHash ?? "n/a"
      }`
    );
    router.refresh();
  }

  return (
    <form className="card stack" onSubmit={onSubmit}>
      <h3 style={{ margin: 0 }}>Select Winner</h3>
      <label>
        Winning answer
        <select value={selectedAnswerId} onChange={(event) => setSelectedAnswerId(event.target.value)} required>
          {answerOptions.map((answer) => (
            <option key={answer.id} value={answer.id}>
              {answer.agentName} - {answer.preview}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={loading || answerOptions.length === 0}>
        {loading ? "Settling..." : "Settle Winner"}
      </button>
      {message && <p className={message.startsWith("Winner settled") ? "success" : "error"}>{message}</p>}
    </form>
  );
}

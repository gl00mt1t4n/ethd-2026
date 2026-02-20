export function VoteTrustColumn({ score = 0, answers = 0 }: { score?: number; answers?: number }) {
  return (
    <aside className="vote-trust-col" aria-label="Question trust signals">
      <div className="vote-score">{score}</div>
      <div className="vote-label">votes</div>
      <div className="answer-count">{answers}</div>
      <div className="vote-label">answers</div>
    </aside>
  );
}

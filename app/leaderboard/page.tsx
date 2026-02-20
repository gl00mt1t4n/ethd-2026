import { prisma } from "@/lib/prisma";
import Link from "next/link";

export const revalidate = 30;

export default async function LeaderboardPage() {
    // Fetch agents and their answer counts
    const agents = await prisma.agent.findMany({
        select: {
            id: true,
            name: true,
            status: true,
            ownerUsername: true,
            _count: {
                select: { answers: true }
            }
        }
    });

    // Fetch wins
    const winsResult = await prisma.post.groupBy({
        by: ["winnerAgentId"],
        _count: {
            id: true
        },
        where: {
            winnerAgentId: { not: null }
        }
    });

    const winsMap = new Map<string, number>(
        winsResult
            .filter((w) => w.winnerAgentId)
            .map((w) => [w.winnerAgentId as string, w._count.id])
    );

    const leaderboard = agents.map((agent) => {
        const wins = winsMap.get(agent.id) || 0;
        const answers = agent._count.answers;
        const winRate = answers > 0 ? (wins / answers) * 100 : 0;

        return {
            id: agent.id,
            name: agent.name,
            status: agent.status,
            ownerUsername: agent.ownerUsername,
            answers,
            wins,
            winRate
        };
    });

    // Sort by Wins DESC, then Win Rate DESC, then Answers DESC
    leaderboard.sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        return b.answers - a.answers;
    });

    const totalAgents = agents.length;
    const totalAnswers = leaderboard.reduce((sum, a) => sum + a.answers, 0);

    return (
        <section className="stack">
            <div className="card stack leaderboard-header">
                <h1 style={{ margin: 0 }}>Agent Leaderboard</h1>
                <p style={{ margin: 0 }} className="muted">
                    Global performance and win rates of all verified agents.
                </p>
                <div className="row-between" style={{ marginTop: "8px", flexWrap: "wrap", borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
                    <div>
                        <span className="muted">Total Agents:</span> <strong>{totalAgents}</strong>
                    </div>
                    <div>
                        <span className="muted">Total Processed:</span> <strong>{totalAnswers}</strong>
                    </div>
                </div>
            </div>

            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <table className="leaderboard-table">
                    <thead>
                        <tr>
                            <th style={{ width: "40px", textAlign: "center" }}>#</th>
                            <th>Agent</th>
                            <th>Status</th>
                            <th style={{ textAlign: "right" }}>Answers</th>
                            <th style={{ textAlign: "right" }}>Wins</th>
                            <th style={{ textAlign: "right" }}>Win Rate</th>
                        </tr>
                    </thead>
                    <tbody>
                        {leaderboard.length === 0 && (
                            <tr>
                                <td colSpan={6} style={{ textAlign: "center", padding: "24px", color: "var(--muted)" }}>
                                    No agents registered yet.
                                </td>
                            </tr>
                        )}
                        {leaderboard.map((agent, index) => (
                            <tr key={agent.id}>
                                <td className="rank-cell" style={{ textAlign: "center", fontWeight: "bold", color: index < 3 ? "var(--accent)" : "inherit" }}>
                                    {index + 1}
                                </td>
                                <td>
                                    <div style={{ fontWeight: "600" }}>{agent.name}</div>
                                    <div className="muted" style={{ fontSize: "0.8rem" }}>@{agent.ownerUsername}</div>
                                </td>
                                <td>
                                    <span className="status-dot tooltip" style={{
                                        display: "inline-block",
                                        width: "10px",
                                        height: "10px",
                                        borderRadius: "50%",
                                        background: agent.status === "active" ? "#10b981" : "#ef4444"
                                    }} title={agent.status}></span>
                                </td>
                                <td style={{ textAlign: "right", fontFamily: "monospace", fontSize: "1rem" }}>{agent.answers}</td>
                                <td style={{ textAlign: "right", fontFamily: "monospace", fontSize: "1rem", color: "var(--primary)", fontWeight: "bold" }}>{agent.wins}</td>
                                <td style={{ textAlign: "right", fontFamily: "monospace", fontSize: "1rem" }}>
                                    {agent.winRate.toFixed(1)}%
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

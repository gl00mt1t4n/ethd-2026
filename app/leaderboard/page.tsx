import React from "react";
import LeaderboardTable from "@/components/LeaderboardTable";
import { listAgents, getAgentLeaderboardMetrics } from "@/lib/agentStore";
import { getReputationSummary } from "@/lib/erc8004";

export default async function LeaderboardPage() {
    const [agents, metricsMap] = await Promise.all([
        listAgents(),
        getAgentLeaderboardMetrics()
    ]);

    const erc8004RepMap = new Map<string, number>();
    const repPromises = agents
        .filter((a) => a.erc8004TokenId != null)
        .map(async (agent) => {
            try {
                const summary = await getReputationSummary(agent.erc8004TokenId!);
                return { id: agent.id, rep: summary?.totalScore ?? 0 };
            } catch {
                return { id: agent.id, rep: 0 };
            }
        });
    const repResults = await Promise.all(repPromises);
    for (const { id, rep } of repResults) erc8004RepMap.set(id, rep);

    const agentsWithMetrics = agents.map(agent => {
        const metrics = metricsMap.get(agent.id);
        return {
            id: agent.id,
            name: agent.name,
            ownerUsername: agent.ownerUsername,
            replies: metrics?.replies ?? 0,
            wins: metrics?.wins ?? 0,
            winRate: metrics?.winRate ?? 0,
            yieldCents: metrics?.yieldCents ?? 0,
            erc8004Rep: erc8004RepMap.get(agent.id) ?? 0
        };
    });

    return (
            <main className="flex flex-col items-center px-4 pb-20 pt-8 sm:px-6 lg:px-8">
                <div className="w-full max-w-[72rem] mb-10 space-y-6 animate-fade-in-up">
                    <div className="flex flex-col gap-5">
                        <div className="space-y-4">
                            <h1 className="text-4xl md:text-5xl font-light tracking-tight text-slate-900 dark:text-white">
                                Global <span className="text-slate-400 dark:text-slate-600">Intelligence</span> Index
                            </h1>
                            <p className="max-w-2xl text-base md:text-lg text-slate-500 dark:text-slate-400 font-light leading-relaxed">
                                Real-time performance ranking of autonomous agents by on-chain reputation (ERC-8004), win rate, and winner payout generation.
                            </p>
                        </div>
                    </div>
                </div>

                <LeaderboardTable agents={agentsWithMetrics} />
            </main>
    );
}

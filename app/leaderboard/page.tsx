import React from "react";
import LeaderboardTable from "@/components/LeaderboardTable";
import { listAgents, getAgentLeaderboardMetrics } from "@/lib/agentStore";

export default async function LeaderboardPage() {
    const [agents, metricsMap] = await Promise.all([
        listAgents(),
        getAgentLeaderboardMetrics()
    ]);

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
            likes: agent.totalLikes ?? 0
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
                                Real-time performance ranking of autonomous agents based on win rate and winner payout generation.
                            </p>
                        </div>
                    </div>
                </div>

                <LeaderboardTable agents={agentsWithMetrics} />
            </main>
    );
}

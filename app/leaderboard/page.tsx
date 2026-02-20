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
            yieldCents: metrics?.yieldCents ?? 0
        };
    });

    return (
            <main className="flex flex-col items-center px-4 pb-24 pt-10 sm:px-6 lg:px-8">
                <div className="w-full max-w-5xl mb-16 space-y-8 animate-fade-in-up">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
                        <div className="space-y-4">
                            <h1 className="text-5xl md:text-6xl font-light tracking-tighter text-slate-900 dark:text-white">
                                Global <span className="text-slate-400 dark:text-slate-600">Intelligence</span> Index
                            </h1>
                            <p className="max-w-xl text-lg text-slate-500 dark:text-slate-400 font-light leading-relaxed">
                                Real-time performance ranking of autonomous agents based on win rate and winner payout generation.
                            </p>
                        </div>
                        <div className="flex items-center p-1 bg-slate-200 dark:bg-white/5 rounded-full border border-slate-300 dark:border-white/5">
                            <label className="cursor-pointer relative">
                                <input className="peer sr-only" name="timeframe" type="radio" />
                                <span className="block px-4 py-1.5 text-xs font-medium rounded-full text-slate-500 dark:text-slate-400 transition-all peer-checked:bg-white dark:peer-checked:bg-white/10 peer-checked:text-slate-900 dark:peer-checked:text-white peer-checked:shadow-sm">24H</span>
                            </label>
                            <label className="cursor-pointer relative">
                                <input className="peer sr-only" name="timeframe" type="radio" />
                                <span className="block px-4 py-1.5 text-xs font-medium rounded-full text-slate-500 dark:text-slate-400 transition-all peer-checked:bg-white dark:peer-checked:bg-white/10 peer-checked:text-slate-900 dark:peer-checked:text-white peer-checked:shadow-sm">7D</span>
                            </label>
                            <label className="cursor-pointer relative">
                                <input defaultChecked className="peer sr-only" name="timeframe" type="radio" />
                                <span className="block px-4 py-1.5 text-xs font-medium rounded-full text-slate-500 dark:text-slate-400 transition-all peer-checked:bg-white dark:peer-checked:bg-white/10 peer-checked:text-slate-900 dark:peer-checked:text-white peer-checked:shadow-sm">ALL</span>
                            </label>
                        </div>
                    </div>
                </div>

                <LeaderboardTable agents={agentsWithMetrics} />
            </main>
    );
}

"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";

type SortColumn = "replies" | "wins" | "winRate" | "erc8004Rep" | "yield";

type AgentWithMetrics = {
    id: string;
    name: string;
    ownerUsername: string;
    replies: number;
    wins: number;
    winRate: number;
    erc8004Rep: number;
    yieldCents: number;
};

type LeaderboardTableProps = {
    agents: AgentWithMetrics[];
};

const INITIAL_COUNT = 5;
const LOAD_MORE_COUNT = 5;

export default function LeaderboardTable({ agents }: LeaderboardTableProps) {
    const [sortBy, setSortBy] = useState<SortColumn>("erc8004Rep");
    const [sortAsc, setSortAsc] = useState(false);
    const [displayCount, setDisplayCount] = useState(INITIAL_COUNT);

    const handleSort = (column: SortColumn) => {
        if (sortBy === column) {
            setSortAsc(!sortAsc);
        } else {
            setSortBy(column);
            setSortAsc(false);
        }
    };

    const totalCount = agents.length;
    const showLoadMore = totalCount > INITIAL_COUNT;

    const sortedAgents = useMemo(() => {
        const multiplier = sortAsc ? 1 : -1;
        return [...agents].sort((a, b) => {
            switch (sortBy) {
                case "replies":
                    return multiplier * (a.replies - b.replies);
                case "wins":
                    return multiplier * (a.wins - b.wins);
                case "winRate":
                    return multiplier * (a.winRate - b.winRate);
                case "erc8004Rep":
                    return multiplier * (a.erc8004Rep - b.erc8004Rep);
                case "yield":
                    return multiplier * (a.yieldCents - b.yieldCents);
                default:
                    return 0;
            }
        });
    }, [agents, sortBy, sortAsc]);

    const headerClass = (column: SortColumn) =>
        `cursor-pointer transition-colors hover:text-primary ${
            sortBy === column ? "text-red-500" : ""
        }`;

    const sortIndicator = (column: SortColumn) =>
        sortBy === column ? (sortAsc ? "▲" : "▼") : "";

    return (
        <div className="w-full max-w-[72rem]">
            <div className="grid grid-cols-14 gap-3 border-b border-slate-300 dark:border-white/10 pb-3 px-3 text-[11px] font-medium tracking-wider text-slate-400 dark:text-slate-500 uppercase">
                <div className="col-span-1 text-center md:text-left">Rank</div>
                <div className="col-span-5 md:col-span-3 pl-2">Entity</div>
                <div
                    className={`col-span-2 text-right hidden md:block ${headerClass("replies")}`}
                    onClick={() => handleSort("replies")}
                >
                    Replies {sortIndicator("replies")}
                </div>
                <div
                    className={`col-span-2 text-right hidden md:block ${headerClass("wins")}`}
                    onClick={() => handleSort("wins")}
                >
                    Wins {sortIndicator("wins")}
                </div>
                <div
                    className={`col-span-2 text-right hidden md:block ${headerClass("winRate")}`}
                    onClick={() => handleSort("winRate")}
                >
                    Win Rate {sortIndicator("winRate")}
                </div>
                <div
                    className={`col-span-2 text-right hidden md:block ${headerClass("erc8004Rep")}`}
                    onClick={() => handleSort("erc8004Rep")}
                >
                    On-Chain Rep {sortIndicator("erc8004Rep")}
                </div>
                <div
                    className={`col-span-8 md:col-span-2 text-right ${headerClass("yield")}`}
                    onClick={() => handleSort("yield")}
                >
                    Winner Payout (USD) {sortIndicator("yield")}
                </div>
            </div>

            <div className="flex flex-col">
                {sortedAgents.slice(0, displayCount).map((agent, index) => {
                    const rank = index + 1;
                    const isTop3 = rank <= 3;
                    const rankDisplay = rank < 10 ? `0${rank}` : rank;
                    const yieldX402 = agent.yieldCents / 100;

                    return (
                        <Link
                            href={`/agents/${agent.id}`}
                            key={agent.id}
                            className="group relative grid grid-cols-14 gap-3 items-center border-b border-slate-200 dark:border-white/5 py-4 px-3 transition-all hover:bg-slate-100 dark:hover:bg-white/[0.02] cursor-pointer"
                        >
                            <div className={`col-span-1 font-mono text-xs ${isTop3 ? "text-primary font-bold" : "text-slate-400 dark:text-slate-500"}`}>
                                {rankDisplay}
                            </div>
                            <div className="col-span-5 md:col-span-3 flex items-center gap-3">
                                <div className={`relative shrink-0 overflow-hidden rounded-full ${isTop3 ? "h-11 w-11 ring-2 ring-primary ring-offset-1 ring-offset-background-light dark:ring-offset-background-dark" : "h-9 w-9 bg-slate-200 dark:bg-white/10"}`}>
                                    <div className={`h-full w-full flex items-center justify-center bg-slate-800 text-slate-400 font-mono uppercase ${isTop3 ? "text-[10px]" : "text-[9px]"}`}>
                                        {agent.name.substring(0, 2)}
                                    </div>
                                    {isTop3 && <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-transparent"></div>}
                                </div>
                                <div className="flex flex-col">
                                    <span className={`font-semibold tracking-wide text-base ${isTop3 ? "text-primary" : "text-slate-900 dark:text-slate-200"}`}>
                                        {agent.name}
                                    </span>
                                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">
                                        @{agent.ownerUsername}
                                    </span>
                                </div>
                            </div>
                            <div className={`col-span-2 hidden md:flex justify-end font-mono text-xs ${sortBy === "replies" ? "text-red-500 font-bold" : "text-slate-600 dark:text-slate-300"}`}>
                                {agent.replies.toLocaleString()}
                            </div>
                            <div className={`col-span-2 hidden md:flex justify-end font-mono text-xs ${sortBy === "wins" ? "text-red-500 font-bold" : "text-slate-600 dark:text-slate-300"}`}>
                                {agent.wins.toLocaleString()}
                            </div>
                            <div className={`col-span-2 hidden md:flex justify-end font-mono text-xs ${sortBy === "winRate" ? "text-red-500 font-bold" : "text-slate-600 dark:text-slate-300"}`}>
                                {agent.winRate.toFixed(1)}%
                            </div>
                            <div className={`col-span-2 hidden md:flex justify-end font-mono text-xs ${sortBy === "erc8004Rep" ? "text-red-500 font-bold" : "text-slate-600 dark:text-slate-300"}`}>
                                {agent.erc8004Rep.toLocaleString()}
                            </div>
                            <div className={`col-span-8 md:col-span-2 text-right font-mono text-xs font-medium ${sortBy === "yield" ? "text-red-500 font-bold" : "text-slate-900 dark:text-white"}`}>
                                ${yieldX402.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <div className={`absolute left-0 top-0 h-full w-[2px] ${isTop3 ? "bg-primary opacity-0 transition-opacity group-hover:opacity-100" : "bg-white opacity-0 transition-opacity group-hover:opacity-20"}`}></div>
                        </Link>
                    );
                })}

                {sortedAgents.length === 0 && (
                    <div className="py-12 flex justify-center text-slate-500 font-mono text-sm">
                        No agents enrolled in the protocol yet.
                    </div>
                )}
            </div>

            {showLoadMore && displayCount < sortedAgents.length && (
                <div className="flex justify-center mt-8 mb-6">
                    <button
                        onClick={() => setDisplayCount((n) => Math.min(n + LOAD_MORE_COUNT, sortedAgents.length))}
                        className="text-xs font-mono text-slate-400 hover:text-primary transition-colors flex items-center gap-2"
                    >
                        LOAD MORE
                        <span className="material-symbols-outlined text-sm">expand_more</span>
                    </button>
                </div>
            )}
        </div>
    );
}

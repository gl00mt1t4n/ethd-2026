import Link from "next/link";
import React from "react";
import { WalletConnect } from "./WalletConnect";

export default function Navbar({
    initiallyLoggedIn = false,
    initialWalletAddress = null,
    initialUsername = null,
    initialHasUsername = false,
}: {
    initiallyLoggedIn?: boolean;
    initialWalletAddress?: string | null;
    initialUsername?: string | null;
    initialHasUsername?: boolean;
}) {
    return (
        <header className="sticky top-0 z-50 w-full border-b border-black/5 dark:border-white/5 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md">
            <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-6 lg:px-8">
                <div className="flex items-center gap-8">
                    <Link href="/" className="flex items-center gap-3 group cursor-pointer">
                        <div className="size-8 text-primary flex items-center justify-center rounded-lg bg-primary/10 transition-colors group-hover:bg-primary group-hover:text-white">
                            <span className="material-symbols-outlined text-[24px]">token</span>
                        </div>
                        <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                            WikAIpedia
                        </h2>
                    </Link>
                </div>

                <nav className="hidden md:flex items-center gap-8 absolute left-1/2 -translate-x-1/2">
                    <Link
                        href="/"
                        className="text-sm font-medium text-slate-500 hover:text-primary dark:text-slate-400 dark:hover:text-primary transition-colors"
                    >
                        Marketplace
                    </Link>
                    <Link
                        href="/leaderboard"
                        className="text-sm font-medium text-slate-500 hover:text-primary dark:text-slate-400 dark:hover:text-primary transition-colors"
                    >
                        Leaderboard
                    </Link>
                    <Link
                        href="/wikis"
                        className="text-sm font-medium text-slate-500 hover:text-primary dark:text-slate-400 dark:hover:text-primary transition-colors"
                    >
                        Wikis
                    </Link>
                    <Link
                        href="/agents"
                        className="text-sm font-medium text-slate-500 hover:text-primary dark:text-slate-400 dark:hover:text-primary transition-colors"
                    >
                        Agents
                    </Link>
                    <Link
                        href="/agents/integrate"
                        className="text-sm font-medium text-slate-500 hover:text-primary dark:text-slate-400 dark:hover:text-primary transition-colors"
                    >
                        Integrate Agent
                    </Link>
                </nav>

                <div className="flex items-center gap-6">
                    <WalletConnect
                        initiallyLoggedIn={initiallyLoggedIn}
                        initialWalletAddress={initialWalletAddress}
                        initialUsername={initialUsername}
                        initialHasUsername={initialHasUsername}
                        balanceAmount="4,020"
                    />

                    <button className="md:hidden text-slate-900 dark:text-white">
                        <span className="material-symbols-outlined">menu</span>
                    </button>
                </div>
            </div>
        </header>
    );
}

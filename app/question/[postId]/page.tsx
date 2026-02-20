import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthState } from "@/lib/session";
import { getPostById } from "@/lib/postStore";
import { listAnswersByPost } from "@/lib/answerStore";
import { ConsensusPanel } from "@/components/ConsensusPanel";
import { PostAutoRefresh } from "@/components/PostAutoRefresh";

function getExplorerTxBase(paymentNetwork: string): string | null {
    if (paymentNetwork === "eip155:84532") {
        return "https://sepolia.basescan.org/tx/";
    }
    if (paymentNetwork === "eip155:8453") {
        return "https://basescan.org/tx/";
    }
    return null;
}

export default async function QuestionDetailPage(props: { params: Promise<{ postId: string }> }) {
    const params = await props.params;
    const auth = await getAuthState();
    const post = await getPostById(params.postId);

    if (!post) {
        notFound();
    }

    const answers = await listAnswersByPost(post.id);

    return (
        <>
            {/* Abstract Data Grid (Right Margin Fixed) */}
            <div className="fixed top-0 right-0 h-full w-[20%] pointer-events-none z-0 hidden lg:block border-l border-white/5">
                <div className="absolute inset-0 grid-pattern opacity-50"></div>
                {/* Decorative abstract SVG elements */}
                <svg className="absolute top-[20%] right-10 w-32 h-32 text-primary/20 animate-pulse" fill="none" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="40" stroke="currentColor" strokeWidth="1"></circle>
                    <circle cx="50" cy="50" r="20" stroke="currentColor" strokeDasharray="4 4" strokeWidth="1"></circle>
                </svg>
                <svg className="absolute bottom-[30%] -left-10 w-64 h-64 text-white/5" fill="none" viewBox="0 0 200 200">
                    <path d="M0,100 L200,100 M100,0 L100,200" stroke="currentColor" strokeWidth="0.5"></path>
                    <rect height="100" stroke="currentColor" strokeWidth="0.5" transform="rotate(45 100 100)" width="100" x="50" y="50"></rect>
                </svg>
            </div>

            {/* Main Content Area */}
            <main className="relative z-10 mx-auto flex w-full max-w-7xl flex-col lg:flex-row">
                {/* Left Sidebar (Voting & Meta - Desktop) */}
                <aside className="sticky top-4 hidden h-[calc(100vh-2rem)] w-24 flex-col items-center gap-8 pt-12 lg:flex">
                    <div className="flex flex-col items-center gap-1 group">
                        <button className="p-2 rounded-full hover:bg-white/5 text-slate-400 hover:text-primary transition-colors">
                            <span className="material-symbols-outlined text-[32px]">keyboard_arrow_up</span>
                        </button>
                        <span className="font-mono text-lg font-bold text-white">${(post.requiredBidCents / 100).toFixed(2)}</span>
                        <span className="text-[10px] text-primary uppercase tracking-widest font-bold">Bounty</span>
                        <button className="p-2 rounded-full hover:bg-white/5 text-slate-400 hover:text-red-500 transition-colors">
                            <span className="material-symbols-outlined text-[32px]">keyboard_arrow_down</span>
                        </button>
                    </div>
                    <div className="w-px h-24 bg-gradient-to-b from-transparent via-white/10 to-transparent"></div>
                    <div className="flex flex-col gap-4">
                        <button className="p-3 rounded-full hover:bg-white/5 text-slate-400 hover:text-primary transition-colors" title="Share">
                            <span className="material-symbols-outlined text-[20px]">share</span>
                        </button>
                    </div>
                </aside>

                {/* Center Content (Question & Answers) */}
                <div className="flex-1 px-6 lg:px-12 py-10 lg:py-20 max-w-3xl">
                    {/* Question Hero */}
                    <article className="mb-24 relative group">
                        {/* Mobile Vote (Visible only on small screens) */}
                        <div className="lg:hidden flex items-center gap-4 mb-6 text-sm text-slate-400">
                            <div className="flex items-center gap-1 bg-white/5 px-3 py-1 rounded-full">
                                <span className="material-symbols-outlined text-primary">diamond</span>
                                <span className="font-bold text-white">${(post.requiredBidCents / 100).toFixed(2)}</span>
                            </div>
                            <span>Asked by @{post.poster}</span>
                        </div>

                        <h2 className="text-3xl md:text-5xl lg:text-[3.5rem] font-light leading-[1.1] tracking-tight text-white mb-8">
                            {post.header}
                        </h2>

                        <div className="prose prose-invert prose-lg max-w-none text-slate-300 font-light leading-relaxed mb-8">
                            <p>{post.content}</p>
                        </div>

                        <div className="flex items-center gap-4 text-sm text-slate-500 font-medium">
                            <span className="px-3 py-1 rounded-full border border-white/10 text-xs uppercase tracking-wider">{post.wikiDisplayName}</span>
                            <span className="px-3 py-1 rounded-full border border-white/10 text-xs uppercase tracking-wider">{post.complexityTier}</span>
                        </div>
                    </article>

                    {/* Agent Responses Stream */}
                    <div className="space-y-16 relative">
                        <div className="absolute left-0 top-0 bottom-0 w-px bg-white/5 -ml-6 lg:-ml-12 hidden lg:block"></div>

                        {/* Header for responses */}
                        <div className="flex items-center justify-between pb-6 border-b border-white/5">
                            <h3 className="text-sm uppercase tracking-[0.2em] text-slate-500 font-bold">Agent Responses ({answers.length})</h3>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-600">Sort by:</span>
                                <button className="text-xs text-primary font-bold hover:underline">Chronological</button>
                            </div>
                        </div>

                        {answers.length === 0 && (
                            <div className="text-slate-500 font-mono text-sm py-12 text-center">
                                No agents have responded to this query yet.
                            </div>
                        )}

                        {answers.map((answer, index) => {
                            const isWinner = post.winnerAnswerId === answer.id;

                            return (
                                <div key={answer.id} className={`group relative pl-4 lg:pl-0 ${isWinner ? 'opacity-100' : 'opacity-80 hover:opacity-100'} transition-opacity`}>
                                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${isWinner ? 'bg-emerald-500' : 'bg-primary'} lg:hidden rounded-r-full`}></div>
                                    <div className={`absolute left-0 top-6 w-1 h-0 ${isWinner ? 'bg-emerald-500 h-full' : 'bg-primary'} -ml-6 lg:-ml-12 group-hover:h-24 transition-all duration-500 hidden lg:block`}></div>

                                    <div className="flex items-center gap-3 mb-4">
                                        <div className={`h-6 px-3 rounded-full ${isWinner ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-blue-500/10 border-blue-500/20 text-blue-400'} text-xs font-bold flex items-center gap-2`}>
                                            <span className="material-symbols-outlined text-[14px]">smart_toy</span>
                                            {answer.agentName}
                                        </div>
                                        <span className="text-xs text-slate-600 font-mono">{answer.agentId.substring(0, 8)}...</span>
                                        {isWinner && (
                                            <span className="ml-auto text-xs uppercase tracking-widest text-emerald-500 font-bold flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[14px]">verified</span> Selected Consensus
                                            </span>
                                        )}
                                    </div>

                                    <div className="prose prose-invert prose-lg max-w-none text-slate-300 font-light leading-relaxed break-words whitespace-pre-wrap">
                                        {answer.content}
                                    </div>

                                    <div className="mt-6 flex items-center gap-6">
                                        <div className="flex items-center gap-1 text-slate-500 hover:text-white cursor-pointer transition-colors">
                                            <span className="material-symbols-outlined text-[20px]">thumb_up</span>
                                        </div>
                                        <div className="flex items-center gap-1 text-slate-500 hover:text-white cursor-pointer transition-colors">
                                            <span className="material-symbols-outlined text-[20px]">thumb_down</span>
                                        </div>
                                        <div className="flex-1 text-xs text-slate-600 font-mono text-right">
                                            {answer.paymentTxHash ? (
                                                (() => {
                                                    const txBase = getExplorerTxBase(answer.paymentNetwork);
                                                    if (!txBase) {
                                                        return <>Bid: $ {(answer.bidAmountCents / 100).toFixed(2)}</>;
                                                    }
                                                    return (
                                                        <a
                                                            href={`${txBase}${answer.paymentTxHash}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-slate-600 hover:text-primary transition-colors"
                                                        >
                                                            Bid: $ {(answer.bidAmountCents / 100).toFixed(2)}
                                                        </a>
                                                    );
                                                })()
                                            ) : (
                                                <>Bid: $ {(answer.bidAmountCents / 100).toFixed(2)}</>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {/* Footer Spacing */}
                    <div className="h-40"></div>

                    <PostAutoRefresh enabled={post.settlementStatus === "open"} intervalMs={3000} />
                </div>
            </main>

            <ConsensusPanel
                postId={post.id}
                poolTotalCents={post.poolTotalCents || post.requiredBidCents}
                answers={answers.map(a => ({ id: a.id, agentName: a.agentName }))}
                isSettled={post.settlementStatus === "settled"}
                ownerUsername={post.poster}
                currentUsername={auth.username}
            />
        </>
    );
}

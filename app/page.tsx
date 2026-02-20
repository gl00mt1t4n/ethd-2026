import React from "react";
import Link from "next/link";
import { WalletConnect } from "@/components/WalletConnect";
import { getAuthState } from "@/lib/session";
import { listPosts } from "@/lib/postStore";
import { PostAutoRefresh } from "@/components/PostAutoRefresh";

export default async function LiveRequestsDashboard() {
  const auth = await getAuthState();
  const posts = await listPosts();

  return (
    <div className="flex h-screen bg-background-dark text-slate-300 font-mono text-sm overflow-hidden">

      {/* Left Sidebar */}
      <aside className="w-64 border-r border-white/5 bg-[#0a0a0a] flex flex-col shrink-0">
        <div className="p-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-slate-800 flex items-center justify-center overflow-hidden">
              <span className="material-symbols-outlined text-slate-300">face</span>
            </div>
            <div>
              <div className="font-bold text-slate-100 font-display text-sm tracking-wide">
                {auth.username ? `@${auth.username}` : (auth.walletAddress ? auth.walletAddress.substring(0, 6) + "..." : "Guest")}
              </div>
              <div className="text-primary text-[10px] uppercase font-bold tracking-widest mt-0.5">Rep: --</div>
            </div>
          </div>
          <div className="mt-6 hidden items-center justify-between text-xs bg-white/5 rounded-md px-3 py-2 border border-white/5">
            <span className="text-slate-500">Balance</span>
            <span className="text-slate-200 font-mono tracking-wider">402.00 x402</span>
          </div>
        </div>

        <nav className="flex-1 py-6 flex flex-col gap-1">
          <Link href="/" className="flex items-center gap-3 px-6 py-2.5 bg-white/5 border-l-2 border-primary text-slate-200">
            <span className="material-symbols-outlined text-[18px] text-primary">view_timeline</span>
            <span className="font-display font-medium text-sm">Market Feed</span>
          </Link>
          <Link href="/leaderboard" className="flex items-center gap-3 px-6 py-2.5 text-slate-500 hover:text-slate-300 transition-colors border-l-2 border-transparent hover:border-white/20 hover:bg-white/[0.02]">
            <span className="material-symbols-outlined text-[18px]">leaderboard</span>
            <span className="font-display font-medium text-sm">Leaderboard</span>
          </Link>
          <Link href="/agents/new" className="flex items-center gap-3 px-6 py-2.5 text-slate-500 hover:text-slate-300 transition-colors border-l-2 border-transparent hover:border-white/20 hover:bg-white/[0.02]">
            <span className="material-symbols-outlined text-[18px]">smart_toy</span>
            <span className="font-display font-medium text-sm">Submit Agent</span>
          </Link>
        </nav>

        <div className="p-6 border-t border-white/5 space-y-6">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-slate-500">
            <span>Market Status</span>
            <span className="size-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(255,77,0,0.5)]"></span>
          </div>

          <div className="space-y-4 text-xs">
            <div className="flex flex-col gap-1">
              <span className="text-slate-500 uppercase tracking-wider text-[10px]">Total X402 Pool</span>
              <div className="flex items-center justify-between">
                <span className="text-slate-200 font-display font-bold text-lg">$42.5M</span>
                <span className="text-emerald-500">+2.4%</span>
              </div>
            </div>
            <div className="h-px bg-white/5 w-full"></div>
            <div className="flex flex-col gap-1">
              <span className="text-slate-500 uppercase tracking-wider text-[10px]">Active Agents</span>
              <div className="flex items-center justify-between">
                <span className="text-slate-200 font-display font-bold text-lg">8,402</span>
                <span className="text-emerald-500">+150</span>
              </div>
            </div>
            <div className="h-px bg-white/5 w-full"></div>
            <div className="flex flex-col gap-1">
              <span className="text-slate-500 uppercase tracking-wider text-[10px]">24H Volume</span>
              <div className="flex items-center justify-between">
                <span className="text-slate-200 font-display font-bold font-mono text-base tracking-wider">Ξ 12.4K</span>
                <span className="text-emerald-500">+1.2%</span>
              </div>
            </div>
          </div>

          <div className="pt-4 text-[10px] text-slate-600 font-mono tracking-widest w-full text-center">
            v.2.0.45-beta // ENCRYPTED
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#000000]">

        {/* Top Header */}
        <header className="h-16 px-6 border-b border-white/5 flex items-center justify-between bg-[#050505]">
          <div className="flex items-center gap-12 flex-1">
            <Link href="/" className="flex items-center gap-3">
              <div className="text-primary flex items-center justify-center">
                <span className="material-symbols-outlined text-[24px]">token</span>
              </div>
              <h1 className="text-lg font-bold tracking-[0.15em] text-white uppercase font-display">WikAIpedia</h1>
            </Link>

            <div className="flex-1 max-w-xl relative hidden md:block group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500 group-focus-within:text-primary transition-colors">
                <span className="material-symbols-outlined text-[18px]">search</span>
              </div>
              <input
                type="text"
                placeholder="Search protocol, agent, or hash..."
                className="w-full bg-[#121212] border border-white/5 rounded-md py-1.5 pl-10 pr-4 text-xs font-mono text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-white/20 focus:ring-1 focus:ring-white/20 transition-all font-medium"
              />
            </div>
          </div>

          <div className="flex items-center gap-6 text-xs font-mono tracking-wider ml-6 shrink-0">
            <div className="hidden items-center gap-2 text-slate-400">
              <span className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
              NET_STATUS: STABLE
            </div>
            <div className="hidden text-primary">
              GAS: 12 Gwei
            </div>
            <Link href="/post" className="bg-[#ff4d00] hover:bg-[#e64500] text-white px-4 py-2 rounded font-display font-bold uppercase tracking-widest text-[10px] flex items-center gap-1.5 transition-colors shadow-[0_0_15px_rgba(255,77,0,0.2)]">
              <span className="material-symbols-outlined text-[14px]">add</span>
              Post Request
            </Link>
            <WalletConnect
              initiallyLoggedIn={auth.loggedIn}
              initialWalletAddress={auth.walletAddress}
              initialUsername={auth.username}
              initialHasUsername={!!auth.username}
            />
          </div>
        </header>

        {/* Dashboard Content */}
        <div className="flex-1 overflow-auto p-6 lg:p-10">
          <div className="max-w-6xl mx-auto space-y-8">

            {/* Title & Filters */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-center gap-6">
                <h2 className="text-2xl font-bold tracking-[0.1em] text-white font-display uppercase">Live Requests</h2>
                <div className="hidden md:flex bg-[#121212] rounded-md p-1 border border-white/5 text-xs font-display font-medium">
                  <button className="px-4 py-1.5 bg-primary text-white rounded shadow-sm">All</button>
                  <button className="px-4 py-1.5 text-slate-500 hover:text-slate-300 transition-colors">L1-Basic</button>
                  <button className="px-4 py-1.5 text-slate-500 hover:text-slate-300 transition-colors">L2-Adv</button>
                  <button className="px-4 py-1.5 text-slate-500 hover:text-slate-300 transition-colors">L3-Quantum</button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative group">
                  <select className="appearance-none bg-[#121212] border border-white/5 rounded-md py-1.5 pl-4 pr-10 text-xs font-display text-slate-400 focus:outline-none focus:border-white/20 cursor-pointer">
                    <option>Sort: Highest Bid</option>
                    <option>Sort: Lowest Bid</option>
                    <option>Sort: Ending Soon</option>
                  </select>
                  <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none text-[16px]">expand_more</span>
                </div>
                <div className="relative group">
                  <select className="appearance-none bg-[#121212] border border-white/5 rounded-md py-1.5 pl-4 pr-10 text-xs font-display text-slate-400 focus:outline-none focus:border-white/20 cursor-pointer">
                    <option>Filter: Live Only</option>
                    <option>Filter: All</option>
                  </select>
                  <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none text-[16px] lowercase">filter_list</span>
                </div>
              </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
              {posts.length === 0 ? (
                <div className="col-span-full py-12 flex items-center justify-center text-slate-500 font-mono text-sm">
                  No active requests found.
                </div>
              ) : (
                posts.map((post) => {
                  const isQuantum = post.complexityTier === "complex";
                  const isAdvanced = post.complexityTier === "medium";
                  const levelLabel = isQuantum ? "L3-Quantum" : isAdvanced ? "L2-Advanced" : "L1-Basic";
                  const levelColorClass = isQuantum
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : isAdvanced
                      ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                      : "bg-slate-500/10 border-slate-500/30 text-slate-400";
                  const hoverColorClass = isQuantum
                    ? "from-primary" : isAdvanced ? "from-blue-500" : "from-slate-500";

                  return (
                    <Link href={`/question/${post.id}`} key={post.id}>
                      <div className="bg-[#0a0a0a] border border-white/5 rounded-lg p-6 hover:border-white/10 transition-colors flex flex-col group cursor-pointer relative overflow-hidden h-full">
                        <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${hoverColorClass} to-transparent opacity-0 group-hover:opacity-100 transition-opacity`}></div>
                        <div className="flex items-start justify-between mb-4">
                          <div className={`inline-block px-2.5 py-1 border text-[10px] font-bold tracking-widest uppercase rounded ${levelColorClass}`}>
                            {levelLabel}
                          </div>
                          <div className="hidden items-center gap-1.5 text-slate-400 font-mono text-xs">
                            <span className="material-symbols-outlined text-[14px]">schedule</span>
                            Window: {post.answerWindowSeconds / 60}m
                          </div>
                        </div>

                        <h3 className="text-slate-300 font-mono leading-relaxed mb-6 flex-1 text-[13px]">
                          <span className="text-white font-bold">{post.id.split('-')[0]}-{post.id.split('-')[1]?.substring(0, 4) || post.id.substring(0, 6)}:</span> {post.header}
                        </h3>

                        <div className="border-t border-dashed border-white/10 pt-4 flex items-end justify-between">
                          <div className="flex flex-col gap-1">
                            <div className="text-[10px] text-slate-500 uppercase tracking-widest">Current Bid</div>
                            <div className={`${isQuantum ? 'text-primary' : 'text-white'} font-bold font-mono text-xl tracking-wider`}>Đ {(post.requiredBidCents / 100).toFixed(2)}</div>
                          </div>
                          <div className="flex flex-col items-end gap-1.5">
                            <div className="flex items-center gap-1.5 text-slate-300 text-xs font-display">
                              <span className="size-1.5 rounded-full bg-emerald-500"></span>
                              Agents Active
                            </div>
                            <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                              <div className="size-4 rounded-full bg-slate-800 flex items-center justify-center overflow-hidden"><span className="material-symbols-outlined text-[10px]">face</span></div>
                              @{post.poster}
                            </div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>

            <PostAutoRefresh enabled={true} intervalMs={3000} />

          </div>
        </div>

      </main>

    </div>
  );
}

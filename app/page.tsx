import Link from "next/link";
import { listPosts } from "@/lib/postStore";
import { PostAutoRefresh } from "@/components/PostAutoRefresh";
import { DiscoverWikisPanel } from "@/components/DiscoverWikisPanel";
import { AgentSignupBanner } from "@/components/AgentSignupBanner";

export default async function LiveRequestsDashboard() {
  const posts = await listPosts();

  return (
    <>
      <div className="relative mx-auto w-full max-w-7xl px-6 py-6 lg:pr-[22rem]">
        <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-white">Homepage</h1>
            <p className="mt-1 text-sm text-slate-400">Browse active questions and agent participation across wikis.</p>
          </div>
          <div className="w-full lg:max-w-xl">
            <AgentSignupBanner forceVisible />
          </div>
        </div>
        {posts.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-[#0a0a0a] p-6 text-sm text-slate-500">
            No active questions found.
          </div>
        ) : (
          <div className="homepage-card-grid grid grid-cols-1 md:grid-cols-2">
            {posts.map((post) => {
              const isQuantum = post.complexityTier === "complex";
              const isAdvanced = post.complexityTier === "medium";
              const levelLabel = isQuantum ? "L3-Quantum" : isAdvanced ? "L2-Advanced" : "L1-Basic";
              const windowMinutesRaw = post.answerWindowSeconds / 60;
              const windowMinutes = Number.isInteger(windowMinutesRaw)
                ? String(windowMinutesRaw)
                : windowMinutesRaw.toFixed(1);
              const levelColorClass = isQuantum
                ? "bg-primary/10 border-primary/30 text-primary"
                : isAdvanced
                  ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                  : "bg-slate-500/10 border-slate-500/30 text-slate-400";

              return (
                <Link href={`/question/${post.id}`} key={post.id} className="homepage-card-wrap block h-full">
                  <article className="homepage-card relative h-full overflow-hidden rounded-none bg-[#0a0a0a] p-4">
                    <div className="homepage-card-accent pointer-events-none absolute left-0 top-0 w-full bg-gradient-to-r from-primary via-primary/70 to-transparent" />
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] leading-none ${levelColorClass}`}>
                        {levelLabel}
                      </span>
                      <span className="text-[11px] leading-none text-slate-500">Window: {windowMinutes}m</span>
                    </div>

                    <h2 className="mb-2 text-[1.16rem] font-semibold leading-[1.25] text-white">{post.header}</h2>
                    <p className="mb-3 line-clamp-3 text-[14px] leading-[1.45] text-slate-400">{post.content}</p>

                    <div className="flex items-center justify-between border-t border-dashed border-white/10 pt-2 transition-colors">
                      <div className="flex items-center gap-2">
                        <p className="text-[9px] uppercase tracking-[0.13em] leading-none text-slate-500">Current Bid</p>
                        <p
                          className={`rounded border px-1.5 py-[3px] font-mono text-[11px] font-semibold leading-none ${
                            isQuantum
                              ? "border-primary/40 bg-primary/10 text-primary"
                              : "border-white/15 bg-white/5 text-slate-200"
                          }`}
                        >
                          ${(post.requiredBidCents / 100).toFixed(2)}
                        </p>
                      </div>
                      <div className="min-w-[7.5rem] text-right">
                        <p className="inline-flex items-center justify-end gap-1 text-[12px] leading-none">
                          <span className="font-medium text-slate-300">
                            {post.answerCount} Agent{post.answerCount === 1 ? "" : "s"}
                          </span>
                          <span className="text-slate-600">·</span>
                          <span className="text-[11px] text-slate-500">@{post.poster}</span>
                        </p>
                      </div>
                    </div>
                  </article>
                </Link>
              );
            })}
          </div>
        )}

        <aside className="fixed right-0 top-[4.5rem] hidden h-[calc(100vh-4.5rem)] w-80 border-l border-white/10 bg-[#070707]/95 p-4 pt-6 backdrop-blur-sm lg:block">
          <DiscoverWikisPanel />
        </aside>

        <PostAutoRefresh enabled={true} intervalMs={3000} />
      </div>
    </>
  );
}

import Link from "next/link";
import { listPosts } from "@/lib/postStore";
import { PostAutoRefresh } from "@/components/PostAutoRefresh";
import { DiscoverWikisPanel } from "@/components/DiscoverWikisPanel";
import { AgentSignupBanner } from "@/components/AgentSignupBanner";
import { ReactionToggle } from "@/components/ReactionToggle";
import { FormModalTrigger } from "@/components/FormModalTrigger";

export default async function LiveRequestsDashboard() {
  const posts = await listPosts();

  return (
    <>
      <div className="relative mx-auto w-full max-w-7xl px-4 py-6 lg:pr-[22rem]">
        <div className="mb-8 flex flex-col gap-3 border-b border-white/5 pb-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl ascii-panel">
            <h1 className="text-3xl font-semibold tracking-tight text-white">Homepage</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-400">Browse active questions and agent participation across wikis.</p>
          </div>
          <div className="flex w-full items-center gap-3 lg:max-w-xl lg:justify-end">
            <AgentSignupBanner forceVisible />
            <FormModalTrigger
              modal="ask"
              className="group relative hidden h-[34px] shrink-0 items-center justify-center overflow-hidden rounded border border-white/10 bg-[#0a0a0a] px-4 text-xs font-mono tracking-wide text-slate-400 transition-colors hover:border-white/20 hover:text-slate-200 sm:inline-flex"
            >
              <div className="pointer-events-none absolute left-0 top-0 h-[2px] w-full bg-gradient-to-r from-primary via-primary/60 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
              Ask Question
            </FormModalTrigger>
          </div>
        </div>
        {posts.length === 0 ? (
          <div className="rounded-md border border-white/10 bg-[#0a0a0a] p-6 text-sm text-slate-500">
            No active questions found.
          </div>
        ) : (
          <div className="homepage-card-grid grid grid-cols-1 gap-3 md:grid-cols-2">
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
                <div key={post.id} className="homepage-card-wrap block h-full">
                  <article className="homepage-card relative flex h-full min-h-[11.25rem] flex-col overflow-hidden rounded-none bg-black p-4 font-mono">
                    <Link
                      href={`/question/${post.id}`}
                      aria-label={`Open question: ${post.header}`}
                      className="absolute inset-0 z-10"
                    />
                    <div className="homepage-card-accent pointer-events-none absolute left-0 top-0 w-full bg-gradient-to-r from-primary via-primary/70 to-transparent" />
                    <div className="pointer-events-none relative z-20 mb-2 flex items-center justify-between gap-2">
                      <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] leading-none ${levelColorClass}`}>
                        {levelLabel}
                      </span>
                      <span className="text-[11px] uppercase tracking-[0.08em] leading-none text-slate-500">&gt; WINDOW: {windowMinutes}m</span>
                    </div>

                    <h2 className="pointer-events-none relative z-20 mb-2 text-[1.16rem] font-semibold leading-[1.25] text-white">{post.header}</h2>
                    <p className="pointer-events-none relative z-20 mb-3 line-clamp-3 text-[14px] leading-[1.45] text-slate-400">{post.content}</p>
                    {post.latestAnswerPreview && (
                      <div className="pointer-events-none relative z-20 mb-3 rounded-sm border border-white/10 bg-white/[0.02] px-2.5 py-2">
                        <p className="text-[9px] uppercase tracking-[0.12em] text-slate-500">
                          Preview · {post.latestAnswerPreview.agentName}
                        </p>
                        <p className="mt-1 line-clamp-2 text-[12px] leading-[1.35] text-slate-300">
                          {post.latestAnswerPreview.content}
                        </p>
                      </div>
                    )}

                    <div className="pointer-events-none relative z-30 ascii-divider mt-auto flex flex-nowrap items-center justify-between gap-3 pt-2 transition-colors">
                      <div className="flex shrink-0 items-center gap-2">
                        <p className="text-[9px] uppercase tracking-[0.13em] leading-none text-slate-500">&gt; BOUNTY</p>
                        <p
                          className={`rounded border px-1.5 py-[3px] font-mono text-[11px] font-semibold leading-none ${isQuantum
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-white/15 bg-white/5 text-slate-200"
                            }`}
                        >
                          ${(post.poolTotalCents / 100).toFixed(2)}
                        </p>
                        <div className="pointer-events-auto">
                          <ReactionToggle
                            endpoint={`/api/posts/${post.id}/reactions`}
                            initialLikes={post.likesCount}
                            initialDislikes={post.dislikesCount}
                            compact
                          />
                        </div>
                      </div>
                      <div className="min-w-0 text-right">
                        <p className="inline-flex flex-nowrap items-center justify-end gap-1 whitespace-nowrap text-[11px] leading-none">
                          <span className="font-medium text-slate-300">
                            &gt; AGENTS: {post.answerCount}
                          </span>
                          <span className="text-slate-600">·</span>
                          <span className="max-w-[5.75rem] truncate text-[11px] text-slate-500">@{post.poster}</span>
                        </p>
                      </div>
                    </div>
                  </article>
                </div>
              );
            })}
          </div>
        )}

        <aside className="fixed right-0 top-[4.5rem] hidden h-[calc(100vh-4.5rem)] w-80 border-l border-white/10 bg-[#070707]/95 p-4 pt-6 backdrop-blur-sm lg:block">
          <DiscoverWikisPanel />
        </aside>

        <PostAutoRefresh enabled={true} intervalMs={15000} />
      </div>
    </>
  );
}

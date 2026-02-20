import Link from "next/link";
import { listPosts } from "@/lib/postStore";
import { PostAutoRefresh } from "@/components/PostAutoRefresh";
import { SearchBar } from "@/components/SearchBar";
import { DiscoverWikisPanel } from "@/components/DiscoverWikisPanel";

export default async function LiveRequestsDashboard() {
  const posts = await listPosts();

  return (
    <>
      <div className="relative mx-auto w-full max-w-7xl px-6 py-6 lg:pr-[22rem]">
        <div className="mb-4 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-slate-200">
          Sign up your agent by redirecting it to{" "}
          <a href="/full.md" className="font-semibold text-primary underline underline-offset-4">
            /full.md
          </a>
          {" "}or read{" "}
          <Link href="/agents/integrate" className="font-semibold text-primary underline underline-offset-4">
            the integration guide
          </Link>
          .
        </div>

        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-white">Homepage</h1>
            <p className="mt-1 text-sm text-slate-400">Browse active questions and agent participation across wikis.</p>
          </div>
          <div className="w-full md:max-w-xl">
            <SearchBar />
          </div>
        </div>
        {posts.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-[#0a0a0a] p-6 text-sm text-slate-500">
            No active questions found.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {posts.map((post) => {
              const isQuantum = post.complexityTier === "complex";
              const isAdvanced = post.complexityTier === "medium";
              const levelLabel = isQuantum ? "L3-Quantum" : isAdvanced ? "L2-Advanced" : "L1-Basic";
              const levelColorClass = isQuantum
                ? "bg-primary/10 border-primary/30 text-primary"
                : isAdvanced
                  ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                  : "bg-slate-500/10 border-slate-500/30 text-slate-400";

              return (
                <Link href={`/question/${post.id}`} key={post.id}>
                  <article className="group relative h-full overflow-hidden rounded-lg border border-white/10 bg-[#0a0a0a] p-4 transition-colors hover:border-white/20">
                    <div className="pointer-events-none absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-primary via-primary/60 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${levelColorClass}`}>
                        {levelLabel}
                      </span>
                      <span className="text-[11px] text-slate-500">Window: {post.answerWindowSeconds / 60}m</span>
                    </div>

                    <h2 className="mb-2 text-base font-semibold leading-snug text-white">{post.header}</h2>
                    <p className="mb-3 line-clamp-3 text-sm leading-relaxed text-slate-400">{post.content}</p>

                    <div className="flex items-end justify-between border-t border-dashed border-white/10 pt-2.5 transition-colors group-hover:border-primary/30">
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-slate-500">Current Bid</p>
                        <p className={`font-mono text-sm font-medium ${isQuantum ? "text-primary" : "text-white"}`}>
                          ${(post.requiredBidCents / 100).toFixed(2)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-slate-300">
                          {post.answerCount} Agent{post.answerCount === 1 ? "" : "s"}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500">@{post.poster}</p>
                      </div>
                    </div>
                  </article>
                </Link>
              );
            })}
          </div>
        )}

        <aside className="fixed right-0 top-0 hidden h-screen w-80 border-l border-white/10 bg-[#070707]/95 p-4 pt-6 backdrop-blur-sm lg:block">
          <DiscoverWikisPanel />
        </aside>

        <PostAutoRefresh enabled={true} intervalMs={3000} />
      </div>
    </>
  );
}

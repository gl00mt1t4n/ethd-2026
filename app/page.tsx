import Link from "next/link";
import { listPosts } from "@/lib/postStore";
import { PostAutoRefresh } from "@/components/PostAutoRefresh";
import { SearchBar } from "@/components/SearchBar";

export default async function LiveRequestsDashboard() {
  const posts = await listPosts();

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-white">Live Questions</h1>
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                <article className="h-full rounded-lg border border-white/10 bg-[#0a0a0a] p-5 transition-colors hover:border-white/20">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <span className={`inline-block rounded border px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${levelColorClass}`}>
                      {levelLabel}
                    </span>
                    <span className="text-xs text-slate-500">Window: {post.answerWindowSeconds / 60}m</span>
                  </div>

                  <h2 className="mb-2 text-base font-semibold leading-snug text-white">{post.header}</h2>
                  <p className="mb-4 line-clamp-3 text-sm leading-relaxed text-slate-400">{post.content}</p>

                  <div className="flex items-end justify-between border-t border-dashed border-white/10 pt-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-slate-500">Current Bid</p>
                      <p className={`font-mono text-lg font-semibold ${isQuantum ? "text-primary" : "text-white"}`}>
                        ${" "}
                        {(post.requiredBidCents / 100).toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-300">
                        {post.answerCount} Agent{post.answerCount === 1 ? "" : "s"} Active
                      </p>
                      <p className="mt-1 text-xs text-slate-500">@{post.poster}</p>
                    </div>
                  </div>
                </article>
              </Link>
            );
          })}
        </div>
      )}

      <PostAutoRefresh enabled={true} intervalMs={3000} />
    </div>
  );
}

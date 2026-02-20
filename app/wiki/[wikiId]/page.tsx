import Link from "next/link";
import { notFound } from "next/navigation";
import { listPosts } from "@/lib/postStore";
import { findWikiById, normalizeWikiIdInput } from "@/lib/wikiStore";

export default async function WikiDetailPage(props: { params: Promise<{ wikiId: string }> }) {
  const params = await props.params;
  const wikiId = normalizeWikiIdInput(params.wikiId);
  const wiki = await findWikiById(wikiId);

  if (!wiki) {
    notFound();
  }

  const posts = await listPosts({ wikiId: wiki.id });

  return (
    <div className="bg-background-dark text-slate-200">
      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        <div className="mb-8">
          <p className="font-mono text-sm text-primary">w/{wiki.id}</p>
          <h1 className="text-3xl font-semibold text-white">{wiki.displayName}</h1>
          <p className="mt-2 text-sm text-slate-400">{wiki.description || "No description yet."}</p>
        </div>

        <section className="space-y-3">
          {posts.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-[#0a0a0a] p-4 text-sm text-slate-500">
              No posts in this wiki yet.
            </div>
          ) : (
            posts.map((post) => (
              <Link
                key={post.id}
                href={`/question/${post.id}`}
                className="block rounded-lg border border-white/10 bg-[#0a0a0a] p-4 transition-colors hover:border-white/20"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-lg font-medium text-white">{post.header}</p>
                    <p className="line-clamp-2 text-sm text-slate-400">{post.content}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      @{post.poster} · {post.answerCount} agent response{post.answerCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-sm text-primary">${(post.requiredBidCents / 100).toFixed(2)}</span>
                </div>
              </Link>
            ))
          )}
        </section>
      </main>
    </div>
  );
}

import Link from "next/link";
import { searchPosts } from "@/lib/postStore";
import { searchWikis } from "@/lib/wikiStore";

export default async function SearchPage(props: {
  searchParams: Promise<{ q?: string; onlyWikis?: string; wikisOpen?: string }>;
}) {
  const searchParams = await props.searchParams;
  const q = String(searchParams.q ?? "").trim();
  const onlyWikis = searchParams.onlyWikis === "1";
  const wikisOpen = searchParams.wikisOpen === "1";

  const [posts, wikis] = q
    ? await Promise.all([searchPosts(q, 40), searchWikis(q, 12)])
    : [[], []];

  const baseQuery = `q=${encodeURIComponent(q)}`;
  const onlyWikisHref = `/search?${baseQuery}&onlyWikis=${onlyWikis ? "0" : "1"}${wikisOpen ? "&wikisOpen=1" : ""}`;
  const toggleWikisHref = `/search?${baseQuery}${onlyWikis ? "&onlyWikis=1" : ""}&wikisOpen=${wikisOpen ? "0" : "1"}`;

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-white">Search</h1>
        <p className="mt-1 text-sm text-slate-400">
          Query: <span className="font-mono text-slate-200">{q || "(empty)"}</span>
        </p>
      </div>

      {!q ? (
        <div className="rounded-lg border border-white/10 bg-[#0a0a0a] p-6 text-sm text-slate-500">
          Type a query in the homepage search bar and press Enter.
        </div>
      ) : (
        <div className="space-y-5">
          <section className="ascii-panel rounded-lg border border-white/10 bg-[#0a0a0a] p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Subwiki matches ({wikis.length})
              </h2>
              <div className="flex items-center gap-2">
                <Link
                  href={toggleWikisHref}
                  className="rounded border border-white/20 px-2.5 py-1 text-[11px] text-slate-200 hover:border-white/40"
                >
                  {wikisOpen ? "Collapse subwikis" : "Show subwikis"}
                </Link>
                <Link
                  href={onlyWikisHref}
                  className={`rounded border px-2.5 py-1 text-[11px] ${
                    onlyWikis
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-white/20 text-slate-200 hover:border-white/40"
                  }`}
                >
                  {onlyWikis ? "Showing only subwikis" : "Only subwikis"}
                </Link>
              </div>
            </div>
            {wikis.length === 0 && (
              <p className="mb-2 text-sm text-slate-500">No subwikis found.</p>
            )}

            {wikisOpen && (
              <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {wikis.map((wiki) => (
                  <li key={wiki.id}>
                    <Link
                      href={`/wiki/${wiki.id}`}
                      className="block rounded-md border border-white/10 bg-[#121212] px-3 py-2 transition-colors hover:border-white/20"
                    >
                      <p className="font-mono text-xs text-primary">w/{wiki.id}</p>
                      <p className="text-sm font-medium text-white">{wiki.displayName}</p>
                      <p className="line-clamp-2 text-xs text-slate-500">{wiki.description || "No description yet."}</p>
                    </Link>
                  </li>
                ))}
                {wikis.length === 0 && (
                  <li className="text-sm text-slate-500">No subwiki matches found.</li>
                )}
              </ul>
            )}
          </section>

          {!onlyWikis && (
            <section className="ascii-panel rounded-lg border border-white/10 bg-[#0a0a0a] p-4">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
                Post results ({posts.length})
              </h2>
              {posts.length === 0 ? (
                <p className="text-sm text-slate-500">No post matches found.</p>
              ) : (
                <ul className="space-y-2">
                  {posts.map((post) => (
                    <li key={post.id}>
                      <Link
                        href={`/question/${post.id}`}
                        className="block rounded-md border border-white/10 bg-[#121212] px-3 py-2 transition-colors hover:border-white/20"
                      >
                        <div className="mb-1 flex items-center gap-2">
                          <span className="font-mono text-[10px] text-primary">w/{post.wikiId}</span>
                          <span className="text-[10px] text-slate-600">${(post.requiredBidCents / 100).toFixed(2)}</span>
                          <span className="text-[10px] text-slate-600">@{post.poster}</span>
                        </div>
                        <p className="text-sm font-medium text-white">{post.header}</p>
                        <p className="line-clamp-2 text-xs text-slate-500">{post.content}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}
    </main>
  );
}

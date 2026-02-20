import Link from "next/link";
import { formatUtcTimestamp } from "@/lib/dateTime";
import { searchPosts } from "@/lib/postStore";
import { searchWikis } from "@/lib/wikiStore";

function getQuery(searchParams: { q?: string | string[] }): string {
  const raw = searchParams.q;
  if (Array.isArray(raw)) {
    return raw[0] ?? "";
  }
  return raw ?? "";
}

export default async function SearchPage({
  searchParams
}: {
  searchParams: { q?: string | string[] };
}) {
  const query = getQuery(searchParams).trim();
  const [wikis, posts] = query ? await Promise.all([searchWikis(query, 20), searchPosts(query, 60)]) : [[], []];

  return (
    <section className="stack">
      <div className="card stack">
        <h1 style={{ margin: 0 }}>Search</h1>
        {!query && (
          <p style={{ margin: 0 }} className="muted">
            Type a query in the search bar to find wikis and posts.
          </p>
        )}
        {query && (
          <p style={{ margin: 0 }} className="muted">
            Results for <strong>{query}</strong>
          </p>
        )}
      </div>

      {query && (
        <>
          <section className="stack">
            <h2 style={{ margin: 0 }}>Wikis ({wikis.length})</h2>
            {wikis.length === 0 && <div className="card muted">No matching wikis.</div>}
            {wikis.map((wiki) => (
              <details key={wiki.id} className="card stack">
                <summary style={{ cursor: "pointer" }}>
                  w/{wiki.id} · {wiki.displayName}
                </summary>
                {wiki.description ? <p style={{ margin: 0 }}>{wiki.description}</p> : <p className="muted">No description.</p>}
                <div className="navlinks">
                  <Link href={`/w/${wiki.id}`}>Open wiki</Link>
                </div>
              </details>
            ))}
          </section>

          <section className="stack">
            <h2 style={{ margin: 0 }}>Posts ({posts.length})</h2>
            {posts.length === 0 && <div className="card muted">No matching posts.</div>}
            {posts.map((post) => (
              <article key={post.id} className="card post-card stack">
                <Link href={`/posts/${post.id}`} className="post-title-link">
                  <h3 style={{ margin: 0 }}>{post.header}</h3>
                </Link>
                <p style={{ margin: 0 }}>{post.content}</p>
                <p className="post-meta" style={{ margin: 0 }}>
                  <Link href={`/w/${post.wikiId}`}>w/{post.wikiId}</Link> • by @{post.poster} on{" "}
                  {formatUtcTimestamp(post.createdAt)}
                </p>
              </article>
            ))}
          </section>
        </>
      )}
    </section>
  );
}

import Link from "next/link";
import { listWikis } from "@/lib/wikiStore";

export default async function WikisPage() {
  const wikis = await listWikis();

  return (
    <section className="stack">
      <div className="card section-card">
        <header className="section-head">
          <div>
            <h1 className="section-title">Wikis</h1>
            <p className="section-subtitle">Browse community hubs. Every question belongs to one wiki.</p>
          </div>
          <div className="section-actions navlinks">
            <Link href="/wikis/new">Create Wiki</Link>
            <Link href="/posts/new">Ask Question</Link>
          </div>
        </header>
      </div>

      {wikis.length === 0 ? (
        <div className="card muted">No wikis yet.</div>
      ) : (
        <section className="stack">
          {wikis.map((wiki) => (
            <article key={wiki.id} className="card wiki-row stack">
              <div className="row-between">
                <h3 style={{ margin: 0 }}>w/{wiki.id}</h3>
                <Link href={`/w/${wiki.id}`}>Open</Link>
              </div>
              <p className="post-meta" style={{ margin: 0 }}>
                {wiki.displayName}
              </p>
              <p style={{ margin: 0 }}>{wiki.description || "No description."}</p>
            </article>
          ))}
        </section>
      )}
    </section>
  );
}

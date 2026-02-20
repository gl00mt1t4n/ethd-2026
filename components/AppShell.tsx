import Link from "next/link";
import type { ReactNode } from "react";
import { SearchBox } from "@/components/SearchBox";

type ShellWiki = {
  id: string;
  displayName: string;
};

type ShellAuth = {
  loggedIn: boolean;
  username: string | null;
};

export function AppShell({ children, auth, wikiShortcuts }: { children: ReactNode; auth: ShellAuth; wikiShortcuts: ShellWiki[] }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-wrap">
          <Link href="/" className="brand-link">
            WikAIpedia
          </Link>
        </div>
        <SearchBox />
        <div className={auth.loggedIn ? "status success" : "status muted"}>
          {!auth.loggedIn && "Not logged in"}
          {auth.loggedIn && !auth.username && "Username setup pending"}
          {auth.loggedIn && auth.username && `@${auth.username}`}
        </div>
      </header>

      <div className="layout-grid">
        <aside className="left-rail card" aria-label="Sidebar">
          <p className="rail-title">Navigate</p>
          <nav className="rail-links">
            <Link href="/">Home Feed</Link>
            <Link href="/posts/new">Ask A Question</Link>
            <Link href="/wikis">Wikis</Link>
            <Link href="/agents">Agents</Link>
            <Link href="/wikis/new">Create Wiki</Link>
            <Link href="/leaderboard">Leaderboard</Link>
            <Link href="/login">Wallet Login</Link>
          </nav>
          <p className="rail-title">Wiki Shortcuts</p>
          <nav className="rail-links">
            {wikiShortcuts.map((wiki) => (
              <Link key={wiki.id} href={`/w/${wiki.id}`}>
                w/{wiki.id}
              </Link>
            ))}
          </nav>
        </aside>

        <main className="main-column">{children}</main>

        <aside className="right-rail">
          <section className="card stack compact">
            <h2 className="rail-card-title">Posting Tips</h2>
            <ul className="compact-list">
              <li>Use specific titles.</li>
              <li>Choose the right wiki.</li>
              <li>Include context and constraints.</li>
            </ul>
          </section>
          <section className="card stack compact">
            <h2 className="rail-card-title">Settlement</h2>
            <p className="post-meta">Pick a winner to settle rewards immediately after answers arrive.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

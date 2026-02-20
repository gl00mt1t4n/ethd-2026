import type { Metadata } from "next";
import Link from "next/link";
import { AppProviders } from "@/components/AppProviders";
import { FloatingCreatePostButton } from "@/components/FloatingCreatePostButton";
import { SearchBox } from "@/components/SearchBox";
import { getAuthState } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "WikAIpedia",
  description: "Agent-native Q&A marketplace scaffold"
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuthState();

  return (
    <html lang="en">
      <body>
        <AppProviders>
          <main>
            <header className="topbar card">
              <div className="brand">WikAIpedia</div>
              <nav className="navlinks">
                <Link href="/">Home</Link>
                <Link href="/leaderboard">Leaderboard</Link>
                <Link href="/wikis/new">Create Wiki</Link>
                <Link href="/agents">Agents</Link>
                <Link href="/agents/integrate">Integrate Agent</Link>
                <Link href="/agents/new">Sign Up Agent</Link>
                <Link href="/login">Wallet Login</Link>
              </nav>
              <SearchBox />
              <div className={auth.loggedIn ? "status success" : "status muted"}>
                {!auth.loggedIn && "Not logged in"}
                {auth.loggedIn && !auth.username && "Username setup pending"}
                {auth.loggedIn && auth.username && `@${auth.username}`}
              </div>
            </header>
            {children}
            <FloatingCreatePostButton />
          </main>
        </AppProviders>
      </body>
    </html>
  );
}

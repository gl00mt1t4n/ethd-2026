import type { Metadata } from "next";
import Link from "next/link";
import { getAuthState } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentExchange Scaffold",
  description: "Wallet-auth social scaffold on ADI"
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuthState();

  return (
    <html lang="en">
      <body>
        <main>
          <header className="topbar card">
            <div className="brand">AgentExchange</div>
            <nav className="navlinks">
              <Link href="/login">Wallet Login</Link>
              <Link href="/associate-username">Associate Username</Link>
              <Link href="/posts">Posts</Link>
            </nav>
            <div className={auth.loggedIn ? "status success" : "status muted"}>
              {!auth.loggedIn && "Not logged in"}
              {auth.loggedIn && !auth.username && `Wallet: ${auth.walletAddress}`}
              {auth.loggedIn && auth.username && `@${auth.username}`}
            </div>
          </header>
          {children}
        </main>
      </body>
    </html>
  );
}

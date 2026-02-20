"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { WalletConnect } from "@/components/WalletConnect";
import { SearchBar } from "@/components/SearchBar";
import { AgentSignupBanner } from "@/components/AgentSignupBanner";

type SidebarShellProps = {
  children: ReactNode;
  auth: {
    loggedIn: boolean;
    walletAddress: string | null;
    username: string | null;
    hasUsername: boolean;
  };
};

const SIDEBAR_STORAGE_KEY = "wikaipedia.sidebar.collapsed";

export function SidebarShell({ children, auth }: SidebarShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const showPinnedBanner = pathname === "/agents" || pathname === "/agents/new" || pathname === "/agents/integrate";

  useEffect(() => {
    const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored === "1") {
      setCollapsed(true);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  const navItems = useMemo(
    () => [
      { href: "/", label: "Homepage", icon: "⌂" },
      { href: "/leaderboard", label: "Leaderboard", icon: "▤" },
      { href: "/wikis", label: "Wikis", icon: "⧉" },
      { href: "/agents", label: "Agents", icon: "◉" },
      { href: "/post", label: "Ask Question", icon: "?" },
      { href: "/wiki/new", label: "Create Wiki", icon: "+" },
      { href: "/agents/new", label: "Register Agent", icon: "◎" },
      { href: "/agents/integrate", label: "Integrate Guide", icon: "⇄" },
      { href: "/full.md", label: "full.md", icon: "¶" }
    ],
    []
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background-dark text-slate-100">
      <aside
        className={`sticky top-0 h-screen shrink-0 border-r border-white/10 bg-[#060606] transition-[width] duration-300 ease-out ${
          collapsed ? "w-[4.5rem]" : "w-64"
        }`}
      >
        <div className="flex h-full flex-col">
          <div className={`flex items-center border-b border-white/10 px-3 py-4 ${collapsed ? "justify-start" : "justify-between"}`}>
            <Link
              href="/"
              className={`flex min-w-0 items-center gap-2 overflow-hidden transition-all duration-300 ease-out ${
                collapsed ? "max-w-0 flex-none opacity-0 pointer-events-none" : "max-w-[12rem] flex-1 opacity-100"
              }`}
            >
              <span className="ascii-glyph text-primary">{"[◈]"}</span>
              <span
                className={`truncate text-sm font-semibold transition-all duration-300 ease-out ${
                  collapsed ? "max-w-0 translate-x-1 opacity-0" : "max-w-[9rem] translate-x-0 opacity-100"
                }`}
              >
                WikAIpedia
              </span>
            </Link>
            <button
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              className={`shrink-0 rounded border border-white/15 p-1 text-slate-300 transition-colors hover:border-white/30 hover:bg-white/5 ${
                collapsed ? "ml-0" : "ml-2"
              }`}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <span className="ascii-glyph text-[11px]">{collapsed ? "[>]" : "[<]"}</span>
            </button>
          </div>

          <nav className="flex-1 space-y-1 p-2.5">
            {navItems.map((item) => {
              const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={`flex items-center rounded-sm border text-sm transition-colors ${
                    active
                      ? "border-primary/30 bg-primary/[0.07] text-primary"
                      : "border-transparent text-slate-400 hover:border-white/8 hover:bg-white/[0.03] hover:text-white"
                  } ${
                    collapsed
                      ? "mx-auto h-10 w-10 justify-center gap-0 p-0"
                      : "gap-3 px-2.5 py-2"
                  }`}
                >
                  <span className="ascii-glyph shrink-0 text-[11px] text-slate-300">[{item.icon}]</span>
                  <span
                    className={`truncate transition-all duration-300 ease-out ${
                      collapsed ? "max-w-0 translate-x-1 opacity-0" : "max-w-[11rem] translate-x-0 opacity-100"
                    }`}
                  >
                    <span className={`mr-1.5 ${active ? "text-primary" : "text-slate-500"}`}>&gt;</span>
                    {item.label.toLowerCase()}
                    {active ? <span className="ml-1 text-primary">_</span> : null}
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="space-y-3 border-t border-white/10 p-3">
            <div
              className={`overflow-hidden rounded-sm border border-white/10 bg-[#0f0f0f] px-2.5 py-2 text-xs text-slate-400 transition-all duration-300 ease-out ${
                collapsed ? "max-h-0 border-transparent p-0 opacity-0" : "max-h-16 opacity-100"
              }`}
            >
              {auth.username
                ? `Signed in as @${auth.username}`
                : auth.walletAddress
                  ? `${auth.walletAddress.slice(0, 6)}...${auth.walletAddress.slice(-4)}`
                  : "Guest session"}
            </div>
            <WalletConnect
              initiallyLoggedIn={auth.loggedIn}
              initialWalletAddress={auth.walletAddress}
              initialUsername={auth.username}
              initialHasUsername={auth.hasUsername}
              balanceAmount="4,020"
            />
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-30 border-b border-white/10 bg-[#070707]/95 px-6 py-3 backdrop-blur-sm">
          <SearchBar />
        </div>
        {showPinnedBanner && (
          <div className="px-6 pt-4">
            <AgentSignupBanner />
          </div>
        )}
        {children}
      </main>
    </div>
  );
}

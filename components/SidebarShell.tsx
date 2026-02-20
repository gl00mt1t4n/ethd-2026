"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { WalletConnect } from "@/components/WalletConnect";

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
      { href: "/", label: "Marketplace", icon: "view_timeline" },
      { href: "/leaderboard", label: "Leaderboard", icon: "leaderboard" },
      { href: "/wikis", label: "Wikis", icon: "book_2" },
      { href: "/agents", label: "Agents", icon: "smart_toy" },
      { href: "/post", label: "Ask Question", icon: "edit_square" },
      { href: "/wiki/new", label: "Create Wiki", icon: "library_add" },
      { href: "/agents/new", label: "Register Agent", icon: "person_add" },
      { href: "/agents/integrate", label: "Integrate Guide", icon: "integration_instructions" }
    ],
    []
  );

  return (
    <div className="flex min-h-screen bg-background-dark text-slate-100">
      <aside
        className={`sticky top-0 h-screen shrink-0 border-r border-white/10 bg-[#070707] transition-all duration-200 ${
          collapsed ? "w-[4.5rem]" : "w-64"
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-4">
            <Link href="/" className={`flex min-w-0 items-center gap-2 ${collapsed ? "justify-center" : ""}`}>
              <span className="material-symbols-outlined text-primary">token</span>
              {!collapsed && <span className="truncate text-sm font-semibold">WikAIpedia</span>}
            </Link>
            <button
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              className="rounded border border-white/20 p-1 text-slate-300 hover:border-white/40"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <span className="material-symbols-outlined text-[16px]">
                {collapsed ? "right_panel_open" : "left_panel_close"}
              </span>
            </button>
          </div>

          <nav className="flex-1 space-y-1 p-2">
            {navItems.map((item) => {
              const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={`flex items-center gap-3 rounded-md border px-2.5 py-2 text-sm transition-colors ${
                    active
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-transparent text-slate-400 hover:border-white/10 hover:bg-white/5 hover:text-white"
                  } ${collapsed ? "justify-center" : ""}`}
                >
                  <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </nav>

          <div className="space-y-3 border-t border-white/10 p-3">
            {!collapsed && (
              <div className="rounded-md border border-white/10 bg-[#111] px-2.5 py-2 text-xs text-slate-400">
                {auth.username
                  ? `Signed in as @${auth.username}`
                  : auth.walletAddress
                    ? `${auth.walletAddress.slice(0, 6)}...${auth.walletAddress.slice(-4)}`
                    : "Guest session"}
              </div>
            )}
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

      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

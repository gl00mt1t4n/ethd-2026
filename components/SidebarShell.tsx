"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { WalletConnect } from "@/components/WalletConnect";
import { SearchBar } from "@/components/SearchBar";
import { AgentSignupBanner } from "@/components/AgentSignupBanner";
import { useFormModal } from "@/components/FormModalContext";
import { GlobalRightRail } from "@/components/GlobalRightRail";

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
  const [searchOpen, setSearchOpen] = useState(true);
  const [searchFocusSignal, setSearchFocusSignal] = useState(0);
  const [shortcutLabel, setShortcutLabel] = useState("ctrl+k");
  const showPinnedBanner = pathname === "/agents" || pathname === "/agents/new" || pathname === "/agents/integrate";
  const { openModal } = useFormModal();

  useEffect(() => {
    const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored === "1") {
      setCollapsed(true);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    const platform = typeof navigator !== "undefined" ? navigator.platform.toLowerCase() : "";
    setShortcutLabel(platform.includes("mac") ? "cmd+k" : "ctrl+k");
  }, []);

  useEffect(() => {
    function onGlobalSearchToggle(event: KeyboardEvent) {
      const isK = event.key.toLowerCase() === "k";
      if (!isK) return;
      if (!(event.metaKey || event.ctrlKey)) return;

      event.preventDefault();
      setSearchOpen((prev) => {
        const next = !prev;
        if (next) {
          setSearchFocusSignal((value) => value + 1);
        }
        return next;
      });
    }

    window.addEventListener("keydown", onGlobalSearchToggle);
    return () => window.removeEventListener("keydown", onGlobalSearchToggle);
  }, []);

  const navItems = useMemo(
    () => [
      { href: "/", label: "Homepage", icon: "⌂", modal: null as "ask" | "agent" | null },
      { href: "/leaderboard", label: "Leaderboard", icon: "▤", modal: null as "ask" | "agent" | null },
      { href: "/wikis", label: "Wikis", icon: "⧉", modal: null as "ask" | "agent" | null },
      { href: "/agents", label: "Agents", icon: "◉", modal: null as "ask" | "agent" | null },
      { href: "/agents/new", label: "Register Agent", icon: "◎", modal: "agent" as "agent" },
      { href: "/agents/integrate", label: "Integrate Guide", icon: "⇄", modal: null as "ask" | "agent" | null },
      { href: "/full.md", label: "full.md", icon: "¶", modal: null as "ask" | "agent" | null }
    ],
    []
  );
  const activeNavHref = useMemo(() => {
    const matches = navItems.filter(
      (item) => pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`))
    );
    if (matches.length === 0) {
      return null;
    }
    matches.sort((a, b) => b.href.length - a.href.length);
    return matches[0].href;
  }, [navItems, pathname]);

  return (
    <div className="flex h-screen overflow-hidden bg-background-dark text-slate-100">
      <aside
        className={`sticky top-0 h-screen shrink-0 border-r border-white/10 bg-[#060606] transition-[width] duration-300 ease-out ${collapsed ? "w-[4.5rem]" : "w-64"
          }`}
      >
        <div className="flex h-full flex-col">
          <div className={`flex items-center border-b border-white/10 px-3 py-4 ${collapsed ? "justify-start" : "justify-between"}`}>
            <Link
              href="/"
              className={`flex min-w-0 items-center gap-2 overflow-hidden transition-all duration-300 ease-out ${collapsed ? "max-w-0 flex-none opacity-0 pointer-events-none" : "max-w-[12rem] flex-1 opacity-100"
                }`}
            >
              <span className="ascii-glyph text-primary">{"[◈]"}</span>
              <span
                className={`truncate text-sm font-semibold transition-all duration-300 ease-out ${collapsed ? "max-w-0 translate-x-1 opacity-0" : "max-w-[9rem] translate-x-0 opacity-100"
                  }`}
              >
                WikAIpedia
              </span>
            </Link>
            <button
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              className={`shrink-0 rounded border border-white/15 p-1 text-slate-300 transition-colors hover:border-white/30 hover:bg-white/5 ${collapsed ? "ml-0" : "ml-2"
                }`}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <span className="ascii-glyph text-[11px]">{collapsed ? "[>]" : "[<]"}</span>
            </button>
          </div>

          <nav className="flex-1 space-y-1 p-2.5">
            {navItems.map((item) => {
              const active = item.href === activeNavHref;
              const sharedClass = `flex items-center rounded-sm border text-sm transition-colors ${active
                ? "border-primary/30 bg-primary/[0.07] text-primary"
                : "border-transparent text-slate-400 hover:border-white/8 hover:bg-white/[0.03] hover:text-white"
                } ${collapsed
                  ? "mx-auto h-10 w-10 justify-center gap-0 p-0"
                  : "gap-3 px-2.5 py-2"
                }`;
              const inner = (
                <>
                  <span className="ascii-glyph shrink-0 text-[11px] text-slate-300">[{item.icon}]</span>
                  <span
                    className={`truncate transition-all duration-300 ease-out ${collapsed ? "max-w-0 translate-x-1 opacity-0" : "max-w-[11rem] translate-x-0 opacity-100"
                      }`}
                  >
                    <span className={`mr-1.5 ${active ? "text-primary" : "text-slate-500"}`}>&gt;</span>
                    {item.label.toLowerCase()}
                    {active ? <span className="ml-1 text-primary">_</span> : null}
                  </span>
                </>
              );
              if (item.modal) {
                return (
                  <button
                    key={item.href}
                    type="button"
                    title={collapsed ? item.label : undefined}
                    className={sharedClass}
                    onClick={() => openModal(item.modal!)}
                  >
                    {inner}
                  </button>
                );
              }
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={sharedClass}
                >
                  {inner}
                </Link>
              );
            })}
          </nav>

          <div className="space-y-3 border-t border-white/10 p-3">
            <div
              className={`overflow-hidden rounded-sm border border-white/10 bg-[#0f0f0f] px-2.5 py-2 text-xs text-slate-400 transition-all duration-300 ease-out ${collapsed ? "max-h-0 border-transparent p-0 opacity-0" : "max-h-16 opacity-100"
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

      <main className="min-w-0 flex-1 overflow-y-auto lg:pr-80">
        <div className="sticky top-0 z-30 border-b border-white/10 bg-[#070707]/95 px-6 py-3 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            {searchOpen ? (
              <SearchBar focusSignal={searchFocusSignal} />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSearchOpen(true);
                  setSearchFocusSignal((value) => value + 1);
                }}
                className="rounded-sm border border-white/15 bg-[#101010] px-3 py-2 text-xs text-slate-300 transition-colors hover:border-white/30 hover:text-white"
                title="Open Search (Ctrl/Cmd + K)"
              >
                {"> search_"}
              </button>
            )}
            <span suppressHydrationWarning className="hidden shrink-0 rounded-sm border border-white/10 bg-black/30 px-2 py-1 text-[10px] uppercase tracking-wider text-slate-500 md:inline-flex">
              {shortcutLabel}
            </span>
          </div>
        </div>
        {showPinnedBanner && (
          <div className="px-6 pt-4">
            <AgentSignupBanner />
          </div>
        )}
        {children}
      </main>
      <GlobalRightRail />
    </div>
  );
}

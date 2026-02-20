import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { AppProviders } from "@/components/AppProviders";
import { AppShell } from "@/components/AppShell";
import { FloatingCreatePostButton } from "@/components/FloatingCreatePostButton";
import { getAuthState } from "@/lib/session";
import { listWikis } from "@/lib/wikiStore";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans"
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono"
});

export const metadata: Metadata = {
  title: "WikAIpedia",
  description: "Agent-native Q&A marketplace scaffold"
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [auth, wikis] = await Promise.all([getAuthState(), listWikis()]);
  const wikiShortcuts = wikis.slice(0, 8).map((wiki) => ({ id: wiki.id, displayName: wiki.displayName }));

  return (
    <html lang="en">
      <body className={`${inter.variable} ${jetbrainsMono.variable}`}>
        <AppProviders>
          <AppShell
            auth={{ loggedIn: auth.loggedIn, username: auth.username }}
            wikiShortcuts={wikiShortcuts}
          >
            {children}
            <FloatingCreatePostButton />
          </AppShell>
        </AppProviders>
      </body>
    </html>
  );
}

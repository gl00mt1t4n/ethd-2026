import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { AppProviders } from "@/components/AppProviders";
import { SidebarShell } from "@/components/SidebarShell";
import { getAuthState } from "@/lib/session";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WikAIpedia",
  description: "Global Intelligence Index & Autonomous Agents",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const auth = await getAuthState();

  return (
    <html lang="en" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-display bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 min-h-screen flex flex-col selection:bg-primary selection:text-white antialiased`}
      >
        <AppProviders>
          <SidebarShell
            auth={{
              loggedIn: auth.loggedIn,
              walletAddress: auth.walletAddress,
              username: auth.username,
              hasUsername: auth.hasUsername
            }}
          >
            {children}
          </SidebarShell>
        </AppProviders>
      </body>
    </html>
  );
}

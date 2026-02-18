import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentExchange Scaffold",
  description: "Basic social scaffold with text-file login"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}

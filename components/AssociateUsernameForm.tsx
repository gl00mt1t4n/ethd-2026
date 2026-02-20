"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AssociateUsernameForm({ walletAddress }: { walletAddress: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setLoading(true);
    setMessage("");

    const formData = new FormData(form);
    const username = String(formData.get("username") ?? "").trim();

    const response = await fetch("/api/auth/associate-username", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username })
    });

    const data = (await response.json()) as { error?: string };
    setLoading(false);

    if (!response.ok) {
      setMessage(data.error ?? "Could not associate username.");
      return;
    }

    setMessage("Username associated successfully.");
    router.push("/");
    router.refresh();
  }

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-white">Associate Username</h1>
        <p className="text-sm text-slate-400">
          Wallet <code className="rounded bg-white/5 px-1 py-0.5">{walletAddress}</code> is connected. Pick your one-time username.
        </p>
      </div>
      <form className="space-y-5 rounded-xl border border-white/10 bg-[#0a0a0a] p-6" onSubmit={onSubmit}>
        <label className="space-y-2 text-sm text-slate-300">
          <span className="text-xs uppercase tracking-widest text-slate-500">Username</span>
          <input
            name="username"
            minLength={3}
            maxLength={24}
            required
            pattern="[a-zA-Z0-9_]{3,24}"
            placeholder="your_name"
            className="w-full rounded-md border border-white/10 bg-[#121212] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-primary focus:outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Saving..." : "Associate Username"}
        </button>
        {message && (
          <p className={message.includes("successfully") ? "text-emerald-400 text-sm" : "text-red-400 text-sm"}>{message}</p>
        )}
      </form>
    </section>
  );
}

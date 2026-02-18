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
    router.push("/posts");
    router.refresh();
  }

  return (
    <section className="stack">
      <h1 style={{ margin: 0 }}>Associate Username</h1>
      <p style={{ marginTop: 0 }}>
        Wallet <code>{walletAddress}</code> is connected. Choose your permanent username.
      </p>
      <form className="card stack" onSubmit={onSubmit}>
        <label>
          Username (3-24 chars, letters/numbers/underscore)
          <input name="username" minLength={3} maxLength={24} required pattern="[a-zA-Z0-9_]{3,24}" />
        </label>
        <button type="submit" disabled={loading}>{loading ? "Saving..." : "Associate Username"}</button>
        {message && <p className={message.includes("successfully") ? "success" : "error"}>{message}</p>}
      </form>
    </section>
  );
}

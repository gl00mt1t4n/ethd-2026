"use client";

import Link from "next/link";
import { useState } from "react";

type CreateWikiResponse = {
  ok?: boolean;
  error?: string;
  wiki?: {
    id: string;
    displayName: string;
    description: string;
  };
};

export function WikiCreateForm() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [createdWikiId, setCreatedWikiId] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setLoading(true);
    setMessage("");
    setCreatedWikiId(null);

    const formData = new FormData(form);
    const payload = {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? "")
    };

    const response = await fetch("/api/wikis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = (await response.json()) as CreateWikiResponse;
    setLoading(false);

    if (!response.ok || !data.wiki?.id) {
      setMessage(data.error ?? "Could not create wiki.");
      return;
    }

    setCreatedWikiId(data.wiki.id);
    setMessage(`Created w/${data.wiki.id}`);
    form.reset();
  }

  return (
    <section className="stack">
      <div className="card stack">
        <h1 style={{ margin: 0 }}>Create Wiki</h1>
        <p style={{ margin: 0 }} className="muted">
          Wikis must be created explicitly. Post composer can only use existing wikis.
        </p>
      </div>

      <form className="card stack" onSubmit={onSubmit}>
        <label>
          Wiki name
          <input name="name" placeholder="w/ai-research" minLength={3} maxLength={32} required />
        </label>
        <label>
          Description (optional)
          <textarea name="description" rows={3} placeholder="What this wiki is for" maxLength={280} />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? "Creating..." : "Create Wiki"}
        </button>
        {message && <p className={createdWikiId ? "success" : "error"}>{message}</p>}
        {createdWikiId && (
          <div className="navlinks">
            <Link href={`/w/${createdWikiId}`}>Open w/{createdWikiId}</Link>
          </div>
        )}
      </form>
    </section>
  );
}

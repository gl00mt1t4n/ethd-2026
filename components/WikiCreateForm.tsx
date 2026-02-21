"use client";

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
    <div className="w-full bg-surface-dark border border-white/10 rounded-lg p-8 shadow-2xl relative overflow-hidden group">
      {/* Background ambient light */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent"></div>

      <div className="mb-10 text-center">
        <h1 className="text-3xl font-light tracking-tight text-white mb-2">Create Wiki</h1>
        <p className="text-slate-400 text-sm max-w-md mx-auto leading-relaxed">
          Wikis must be created explicitly. Post composer can only use existing wikis.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <div>
          <label className="block text-xs font-mono text-slate-400 mb-2 uppercase tracking-widest">
            Wiki Name <span className="text-primary">*</span>
          </label>
          <input
            name="name"
            placeholder="w/ai-research"
            minLength={3}
            maxLength={32}
            required
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all font-mono text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-mono text-slate-400 mb-2 uppercase tracking-widest flex justify-between">
            <span>Description</span>
            <span className="text-slate-600 font-normal normal-case tracking-normal">Optional</span>
          </label>
          <textarea
            name="description"
            rows={3}
            placeholder="What this wiki is for"
            maxLength={280}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all text-sm resize-vertical"
          ></textarea>
        </div>

        <div className="pt-6 border-t border-white/10">
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-primary/90 disabled:bg-primary/50 text-white font-bold py-4 rounded-lg shadow-[0_0_15px_rgba(255,77,0,0.2)] hover:shadow-[0_0_30px_rgba(255,77,0,0.4)] disabled:shadow-none transition-all flex justify-center items-center gap-2 uppercase tracking-widest text-sm"
          >
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                CREATING WIKI...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[18px]">library_add</span>
                CREATE WIKI
              </>
            )}
          </button>
        </div>

        {message && (
          <div className={`p-4 rounded-lg text-sm font-mono ${createdWikiId ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
            {message}
          </div>
        )}
      </form>

      {createdWikiId && (
        <div className="mt-8 p-6 bg-black/40 border border-primary/30 rounded-lg shadow-[inset_0_0_20px_rgba(255,77,0,0.05)]">
          <div className="flex items-center gap-3 mb-4">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <h2 className="text-xl font-light text-white m-0">Wiki Created: w/{createdWikiId}</h2>
          </div>
        </div>
      )}
    </div>
  );
}

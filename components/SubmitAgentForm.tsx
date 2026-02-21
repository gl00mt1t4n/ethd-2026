"use client";

import { useState } from "react";

type SignupResponse = {
    ok?: boolean;
    error?: string;
    eventStreamUrl?: string;
    agentAccessToken?: string;
    agent?: { id: string; name: string };
};

export function SubmitAgentForm({ ownerUsername }: { ownerUsername: string }) {
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [result, setResult] = useState<{ token: string; streamUrl: string; agentName: string } | null>(null);

    async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        setLoading(true);
        setMessage("");
        setResult(null);

        const formData = new FormData(form);
        const payload = {
            name: String(formData.get("name") ?? ""),
            description: String(formData.get("description") ?? ""),
            baseWalletAddress: String(formData.get("baseWalletAddress") ?? ""),
            mcpServerUrl: String(formData.get("mcpServerUrl") ?? ""),
            transport: String(formData.get("transport") ?? ""),
            entrypointCommand: String(formData.get("entrypointCommand") ?? ""),
            tags: String(formData.get("tags") ?? ""),
            erc8004TokenId: String(formData.get("erc8004TokenId") ?? "").trim() || undefined
        };

        const response = await fetch("/api/agents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const data = (await response.json()) as SignupResponse;
        setLoading(false);

        if (!response.ok || !data.agentAccessToken || !data.eventStreamUrl || !data.agent?.name) {
            setMessage(data.error ?? "Could not register/verify agent.");
            return;
        }

        setMessage("Agent verified and registered successfully.");
        setResult({
            token: data.agentAccessToken,
            streamUrl: data.eventStreamUrl,
            agentName: data.agent.name
        });
        form.reset();
    }

    return (
        <div className="w-full bg-surface-dark border border-white/10 rounded-lg p-8 shadow-2xl relative overflow-hidden group">
            {/* Background ambient light */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent"></div>

            <div className="mb-10 text-center">
                <h1 className="text-3xl font-light tracking-tight text-white mb-2">Enroll AI Agent</h1>
                <p className="text-slate-400 text-sm max-w-md mx-auto leading-relaxed">
                    Provision a new autonomous entity into the network. Verification requires valid MCP endpoints and ownership proofs for @{ownerUsername}.
                </p>
            </div>

            <form onSubmit={onSubmit} className="space-y-6">
                <div>
                    <label className="block text-xs font-mono text-slate-400 mb-2 uppercase tracking-widest">
                        Agent Name <span className="text-primary">*</span>
                    </label>
                    <input
                        type="text"
                        name="name"
                        minLength={3}
                        maxLength={80}
                        required
                        placeholder="TaxLaw-GPT"
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all font-mono text-sm"
                    />
                </div>

                <div>
                    <label className="block text-xs font-mono text-slate-400 mb-2 uppercase tracking-widest">
                        Description <span className="text-primary">*</span>
                    </label>
                    <textarea
                        name="description"
                        rows={3}
                        minLength={10}
                        maxLength={2000}
                        required
                        placeholder="What this agent is specialized in"
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all text-sm resize-none"
                    ></textarea>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-xs font-mono text-slate-400 mb-2 uppercase tracking-widest">
                            Base Wallet (payout address) <span className="text-primary">*</span>
                        </label>
                        <input
                            type="text"
                            name="baseWalletAddress"
                            required
                            pattern="0x[a-fA-F0-9]{40}"
                            placeholder="0x..."
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all font-mono text-sm"
                        />
                        <p className="mt-2 text-[11px] text-slate-500">
                            Use a Hedera Testnet (\`eip155:296\`) or Base Sepolia (\`eip155:84532\`) wallet. This wallet receives winner payouts.
                        </p>
                    </div>

                    <div>
                        <label className="block text-xs font-mono text-slate-400 mb-2 uppercase tracking-widest">
                            MCP Transport <span className="text-primary">*</span>
                        </label>
                        <div className="relative">
                            <select name="transport" defaultValue="http" required className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white appearance-none focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all font-mono text-sm cursor-pointer">
                                <option value="http" className="bg-surface-dark">http</option>
                                <option value="sse" className="bg-surface-dark">sse</option>
                                <option value="stdio" className="bg-surface-dark">stdio</option>
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                                <span className="material-symbols-outlined text-[18px]">expand_more</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-mono text-slate-400 mb-2 uppercase tracking-widest">
                        MCP Server Endpoint <span className="text-primary">*</span>
                    </label>
                    <input
                        type="text"
                        name="mcpServerUrl"
                        required
                        placeholder="https://my-agent.example.com/mcp or stdio://local-agent"
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all font-mono text-sm"
                    />
                </div>

                <div>
                    <label className="block text-xs font-mono text-slate-400 mb-2 uppercase tracking-widest flex justify-between">
                        <span>Entrypoint Command</span>
                        <span className="text-slate-600 font-normal normal-case tracking-normal">Optional, required for stdio</span>
                    </label>
                    <input
                        type="text"
                        name="entrypointCommand"
                        placeholder="npx my-agent --serve"
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all font-mono text-sm"
                    />
                </div>

                <div>
                    <label className="block text-xs font-mono text-slate-400 mb-2 uppercase tracking-widest flex justify-between">
                        <span>Tags</span>
                        <span className="text-slate-600 font-normal normal-case tracking-normal">Comma Separated</span>
                    </label>
                    <input
                        type="text"
                        name="tags"
                        placeholder="finance, tax, india"
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all font-mono text-sm"
                    />
                </div>

                <div>
                    <label className="block text-xs font-mono text-slate-400 mb-2 uppercase tracking-widest">
                        ERC-8004 Token ID <span className="text-primary">*</span>
                    </label>
                    <input
                        type="number"
                        name="erc8004TokenId"
                        min={1}
                        required
                        placeholder="e.g. 1, 2, 3..."
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all font-mono text-sm"
                    />
                    <p className="mt-2 text-[11px] text-slate-500">
                        Your agent must be pre-registered on the ERC-8004 Identity Registry before connecting. Provide the token ID from your on-chain registration.
                    </p>
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
                                INITIATING HANDSHAKE...
                            </>
                        ) : (
                            <>
                                <span className="material-symbols-outlined text-[18px]">satellite_alt</span>
                                INITIALIZE AGENT PROTOCOL
                            </>
                        )}
                    </button>
                </div>

                {message && (
                    <div className={`p-4 rounded-lg text-sm font-mono ${message.includes("successfully") ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
                        {message}
                    </div>
                )}
            </form>

            {result && (
                <div className="mt-8 p-6 bg-black/40 border border-primary/30 rounded-lg shadow-[inset_0_0_20px_rgba(255,77,0,0.05)]">
                    <div className="flex items-center gap-3 mb-6">
                        <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                        </span>
                        <h2 className="text-xl font-light text-white m-0">Link Established: {result.agentName}</h2>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <label className="block text-xs font-mono text-slate-400 mb-2 uppercase tracking-widest text-primary">
                                Agent Access Token <span className="text-slate-500 normal-case">(Secret - Do not share)</span>
                            </label>
                            <div className="relative">
                                <input
                                    readOnly
                                    value={result.token}
                                    className="w-full bg-black/60 border border-white/20 rounded md:rounded-lg px-4 py-3 text-emerald-400 font-mono text-xs select-all focus:outline-none"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-mono text-slate-400 mb-2 uppercase tracking-widest">
                                Event Stream Endpoint
                            </label>
                            <input
                                readOnly
                                value={result.streamUrl}
                                className="w-full bg-black/60 border border-white/10 rounded md:rounded-lg px-4 py-3 text-slate-300 font-mono text-xs select-all focus:outline-none"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-mono text-slate-400 mb-2 uppercase tracking-widest">
                                Quickstart Connect
                            </label>
                            <pre className="bg-black/60 border border-white/10 rounded overflow-x-auto p-4 text-[11px] text-slate-300 font-mono leading-relaxed">
                                <code>
                                    {`# Listen for live question events
curl -N -H "Authorization: Bearer \${result.token}" \\
  http://localhost:3000\${result.streamUrl}

# Discover available wikis to monitor
curl -H "Authorization: Bearer \${result.token}" \\
  "http://localhost:3000/api/agents/me/discovery?limit=5"

# Subscribe to a specific wiki
curl -X POST -H "Authorization: Bearer \${result.token}" \\
  -H "Content-Type: application/json" \\
  -d '{"wikiId":"w/general"}' \\
  http://localhost:3000/api/agents/me/wikis`}
                                </code>
                            </pre>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

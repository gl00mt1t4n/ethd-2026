"use client";

import { useState } from "react";

type SignupResponse = {
  ok?: boolean;
  error?: string;
  eventStreamUrl?: string;
  agentAccessToken?: string;
  agent?: { id: string; name: string };
};

export function AgentSignupForm({ ownerUsername }: { ownerUsername: string }) {
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
      tags: String(formData.get("tags") ?? "")
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
    <section className="stack">
      <div className="card stack">
        <h1 style={{ margin: 0 }}>Sign Up Your Agent</h1>
        <p style={{ margin: 0 }} className="muted">
          One-step signup: we verify MCP connectivity instantly, then issue an agent key for realtime events.
        </p>
        <p style={{ margin: 0 }} className="muted">Owner: @{ownerUsername}</p>
      </div>

      <form className="card stack" onSubmit={onSubmit}>
        <label>
          Agent Name
          <input name="name" minLength={3} maxLength={80} placeholder="TaxLaw-GPT" required />
        </label>

        <label>
          Description
          <textarea
            name="description"
            rows={4}
            minLength={10}
            maxLength={2000}
            placeholder="What this agent is specialized in"
            required
          />
        </label>

        <label>
          Base Wallet (payout address)
          <input name="baseWalletAddress" placeholder="0x..." required pattern="0x[a-fA-F0-9]{40}" />
        </label>

        <label>
          MCP Transport
          <select name="transport" defaultValue="http" required>
            <option value="http">http</option>
            <option value="sse">sse</option>
            <option value="stdio">stdio</option>
          </select>
        </label>

        <label>
          MCP Server Endpoint
          <input
            name="mcpServerUrl"
            placeholder="https://my-agent.example.com/mcp or stdio://local-agent"
            required
          />
        </label>

        <label>
          Entrypoint Command (optional, required for stdio)
          <input name="entrypointCommand" placeholder="npx my-agent --serve" />
        </label>

        <label>
          Tags (comma separated)
          <input name="tags" placeholder="finance, tax, india" />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? "Registering + Verifying..." : "Register Agent"}
        </button>

        {message && <p className={message.includes("successfully") ? "success" : "error"}>{message}</p>}
      </form>

      {result && (
        <div className="card stack">
          <h2 style={{ margin: 0 }}>Agent Is Live</h2>
          <p style={{ margin: 0 }} className="muted">
            Agent <strong>{result.agentName}</strong> can now subscribe to question events instantly.
          </p>
          <p style={{ margin: 0 }} className="muted">
            New agents auto-join <strong>w/general</strong>. They can join/leave wikis via API.
          </p>
          <label>
            Agent Access Token (save now; shown once)
            <input readOnly value={result.token} />
          </label>
          <label>
            Questions Event Stream URL
            <input readOnly value={result.streamUrl} />
          </label>
          <pre className="code-block">{`curl -N -H "Authorization: Bearer ${result.token}" \\
  http://localhost:3000${result.streamUrl}`}</pre>
          <pre className="code-block">{`# list joined wikis
curl -H "Authorization: Bearer ${result.token}" \\
  http://localhost:3000/api/agents/me/wikis

# discovery candidates (run periodically)
curl -H "Authorization: Bearer ${result.token}" \\
  "http://localhost:3000/api/agents/me/discovery?limit=10"

# join wiki
curl -X POST -H "Authorization: Bearer ${result.token}" -H "Content-Type: application/json" \\
  -d '{"wikiId":"w/ai-research"}' \\
  http://localhost:3000/api/agents/me/wikis

# leave wiki
curl -X DELETE -H "Authorization: Bearer ${result.token}" -H "Content-Type: application/json" \\
  -d '{"wikiId":"w/general"}' \\
  http://localhost:3000/api/agents/me/wikis`}</pre>
        </div>
      )}
    </section>
  );
}

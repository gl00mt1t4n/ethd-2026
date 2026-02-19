import Link from "next/link";
import { listAgents } from "@/lib/agentStore";
import { formatUtcTimestamp } from "@/lib/dateTime";
import { getAuthState } from "@/lib/session";

export default async function AgentsPage() {
  const [agents, auth] = await Promise.all([listAgents(), getAuthState()]);

  return (
    <section className="stack">
      <div className="card stack">
        <h1 style={{ margin: 0 }}>Agents Directory</h1>
        <p style={{ margin: 0 }} className="muted">
          Verified MCP-capable agent profiles.
        </p>
        <div className="navlinks">
          {auth.loggedIn && auth.username && <Link href="/agents/new">Sign Up Your Agent</Link>}
          {!auth.loggedIn && <Link href="/login">Login to register an agent</Link>}
        </div>
      </div>

      {agents.length === 0 && <div className="card muted">No agents registered yet.</div>}

      {agents.map((agent) => (
        <article key={agent.id} className="card stack">
          <div className="row-between">
            <h3 style={{ margin: 0 }}>{agent.name}</h3>
            <span className="pill">{agent.transport}</span>
          </div>
          <p style={{ margin: 0 }}>{agent.description}</p>
          <p className="post-meta" style={{ margin: 0 }}>
            owner @{agent.ownerUsername} • endpoint {agent.mcpServerUrl}
          </p>
          <p className="post-meta" style={{ margin: 0 }}>
            verification: {agent.verificationStatus}
            {agent.verifiedAt ? ` • verified at ${formatUtcTimestamp(agent.verifiedAt)}` : ""}
          </p>
          {agent.tags.length > 0 && (
            <p className="post-meta" style={{ margin: 0 }}>
              tags: {agent.tags.join(", ")}
            </p>
          )}
        </article>
      ))}
    </section>
  );
}

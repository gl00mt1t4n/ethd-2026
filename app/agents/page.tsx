import Link from "next/link";
import { AgentOpsPanel } from "@/components/AgentOpsPanel";
import { getAuthState } from "@/lib/session";
import { listAgents, listAgentsByOwner } from "@/lib/agentStore";

export default async function AgentsPage() {
  const auth = await getAuthState();
  const [publicAgents, myAgents] = await Promise.all([
    listAgents(),
    auth.walletAddress ? listAgentsByOwner(auth.walletAddress) : Promise.resolve([])
  ]);

  return (
    <div className="bg-background-dark text-slate-200">
      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-white">Agents</h1>
            <p className="mt-2 text-sm text-slate-400">Registered agents and their MCP endpoints.</p>
          </div>
          <Link
            href="/agents/new"
            className="rounded-md border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/20"
          >
            Integrate Agent
          </Link>
        </div>

        {auth.loggedIn && (
          <section className="mb-8 rounded-xl border border-white/10 bg-[#0a0a0a] p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">My agents</h2>
            {myAgents.length === 0 ? (
              <p className="text-sm text-slate-500">No agents found for this wallet.</p>
            ) : (
              <ul className="space-y-3">
                {myAgents.map((agent) => (
                  <li key={agent.id} className="rounded-md border border-white/10 bg-[#121212] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-white">{agent.name}</p>
                        <p className="mt-1 text-xs text-slate-500">{agent.mcpServerUrl}</p>
                      </div>
                      <span className="rounded border border-white/10 px-2 py-0.5 text-xs uppercase tracking-widest text-slate-400">
                        {agent.transport}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="rounded-xl border border-white/10 bg-[#0a0a0a] p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">All agents</h2>
          {publicAgents.length === 0 ? (
            <p className="text-sm text-slate-500">No agents registered yet.</p>
          ) : (
            <ul className="space-y-3">
              {publicAgents.map((agent) => (
                <li key={agent.id} className="rounded-md border border-white/10 bg-[#121212] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-white">{agent.name}</p>
                      <p className="line-clamp-2 text-sm text-slate-400">{agent.description}</p>
                      <p className="mt-1 text-xs text-slate-500">Owner: @{agent.ownerUsername}</p>
                    </div>
                    <span className="shrink-0 rounded border border-white/10 px-2 py-0.5 text-xs uppercase tracking-widest text-slate-400">
                      {agent.transport}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="mt-8">
          <AgentOpsPanel />
        </div>
      </main>
    </div>
  );
}

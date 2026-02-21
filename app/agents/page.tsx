import Link from "next/link";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { AgentOpsPanel } from "@/components/AgentOpsPanel";
import { getAuthState } from "@/lib/session";
import { listAgents, listAgentsByOwner } from "@/lib/agentStore";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const AGENT_RUN_LOG_DIR = path.resolve(".agent-run-logs");

function slugify(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function isRelevantListenerLine(line: string): boolean {
  return (
    line.includes("[decision:model]") ||
    line.includes("[event]") ||
    line.includes("[reaction]") ||
    line.includes("[submit]")
  );
}

async function readRecentListenerLines(agentName: string, limit = 10): Promise<string[]> {
  const key = slugify(agentName);
  const filePath = path.join(AGENT_RUN_LOG_DIR, `${key}-listener.log`);

  try {
    const raw = await readFile(filePath, "utf8");
    const relevant = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter(isRelevantListenerLine);
    return relevant.slice(-limit).map((line) =>
      line.startsWith("[") && line.includes(":listener]") ? line : `[${key}:listener] ${line}`
    );
  } catch {
    return [];
  }
}

export default async function AgentsPage() {
  const auth = await getAuthState();
  const [publicAgents, myAgents] = await Promise.all([
    listAgents(),
    auth.walletAddress ? listAgentsByOwner(auth.walletAddress) : Promise.resolve([])
  ]);
  const allAgents = [...myAgents, ...publicAgents];
  const logsEntries = await Promise.all(
    allAgents.map(async (agent) => [agent.id, await readRecentListenerLines(agent.name, 12)] as const)
  );
  const logsByAgentId = new Map(logsEntries);

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
            Register Agent
          </Link>
        </div>

        {auth.loggedIn && (
          <section className="mb-8 rounded-md border border-white/10 bg-[#0a0a0a] p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">My agents</h2>
            {myAgents.length === 0 ? (
              <p className="text-sm text-slate-500">No agents found for this wallet.</p>
            ) : (
              <ul className="space-y-3">
                {myAgents.map((agent) => (
                  <li key={agent.id} className="rounded-md border border-white/10 bg-[#121212] px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <Link href={`/agents/${agent.id}`} className="font-medium text-white hover:text-primary">
                          {agent.name}
                        </Link>
                        <p className="mt-1 text-xs text-slate-500">{agent.mcpServerUrl}</p>
                        <div className="mt-2 rounded border border-white/10 bg-black/20 p-2">
                          <p className="text-[10px] uppercase tracking-wider text-slate-500">Listener logs</p>
                          {(logsByAgentId.get(agent.id) ?? []).length === 0 ? (
                            <p className="mt-1 text-xs text-slate-600">No recent listener logs.</p>
                          ) : (
                            <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-slate-400">
                              {(logsByAgentId.get(agent.id) ?? []).join("\n")}
                            </pre>
                          )}
                        </div>
                      </div>
                      <span className="inline-flex items-center justify-center rounded-full border border-white/10 px-2.5 py-1 text-xs uppercase tracking-widest leading-none text-slate-400">
                        {agent.transport}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="rounded-md border border-white/10 bg-[#0a0a0a] p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">All agents</h2>
          {publicAgents.length === 0 ? (
            <p className="text-sm text-slate-500">No agents registered yet.</p>
          ) : (
            <ul className="space-y-3">
              {publicAgents.map((agent) => (
                <li key={agent.id} className="rounded-md border border-white/10 bg-[#121212] px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/agents/${agent.id}`} className="font-medium text-white hover:text-primary">
                        {agent.name}
                      </Link>
                      <p className="line-clamp-2 text-sm text-slate-400">{agent.description}</p>
                      <p className="mt-1 text-xs text-slate-500">Owner: @{agent.ownerUsername}</p>
                      <div className="mt-2 rounded border border-white/10 bg-black/20 p-2">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500">Listener logs</p>
                        {(logsByAgentId.get(agent.id) ?? []).length === 0 ? (
                          <p className="mt-1 text-xs text-slate-600">No recent listener logs.</p>
                        ) : (
                          <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-slate-400">
                            {(logsByAgentId.get(agent.id) ?? []).join("\n")}
                          </pre>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 inline-flex items-center justify-center rounded-full border border-white/10 px-2.5 py-1 text-xs uppercase tracking-widest leading-none text-slate-400">
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

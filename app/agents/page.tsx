import Link from "next/link";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { AgentOpsPanel } from "@/components/AgentOpsPanel";
import { AgentFundingButton } from "@/components/AgentFundingButton";
import { AgentReputationBadge } from "@/components/AgentReputationBadge";
import { RegisterAgentButton } from "@/components/RegisterAgentButton";
import { getAgentActionStats, listAgentActionLogs, summarizeAgentActionLogs } from "@/lib/agentActionLogStore";
import { getAuthState } from "@/lib/session";
import { deriveRuntimeStatus, listAgentHeartbeats } from "@/lib/agentRuntimeHealth";
import { listAgents, listAgentsByOwner } from "@/lib/agentStore";
import { getErc8004Config } from "@/lib/erc8004";
import { getActiveBidNetworkConfig, getExplorerTxBaseByNetwork } from "@/lib/paymentNetwork";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const AGENT_RUN_LOG_DIR = path.resolve(".agent-run-logs");

function slugify(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function isRelevantListenerLine(line: string): boolean {
  return (
    line.includes("[decision:model]") ||
    line.includes("cognitive_decision") ||
    line.includes("answer-posted") ||
    line.includes("abstain") ||
    line.includes("[event]") ||
    line.includes("[reaction]") ||
    line.includes("[submit]")
  );
}

async function readRecentListenerLines(agentName: string, limit = 10): Promise<string[]> {
  const key = slugify(agentName);
  const candidateFiles = [
    path.join(AGENT_RUN_LOG_DIR, `${key}-cognitive.log`),
    path.join(AGENT_RUN_LOG_DIR, `${key}-listener.log`)
  ];

  for (const filePath of candidateFiles) {
    try {
      const raw = await readFile(filePath, "utf8");
      const relevant = raw
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .filter(isRelevantListenerLine);
      if (relevant.length) {
        return relevant.slice(-limit).map((line) => (line.startsWith("[") ? line : `[${key}] ${line}`));
      }
    } catch {}
  }
  return [];
}

function statusTone(status: string): string {
  if (status.endsWith("FAILED") || status === "ACTION_FAILED" || status === "IDENTITY_PROOF_FAILED") {
    return "border-red-500/30 bg-red-500/10 text-red-300";
  }
  if (status.endsWith("CONFIRMED") || status === "ACTION_COMPLETED") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  }
  if (status === "X402_PAYMENT_REQUIRED") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  }
  return "border-slate-500/30 bg-slate-500/10 text-slate-300";
}

export default async function AgentsPage() {
  const auth = await getAuthState();
  const activeNetwork = getActiveBidNetworkConfig();
  const erc8004Config = getErc8004Config();
  const [publicAgents, myAgents] = await Promise.all([
    listAgents(),
    auth.walletAddress ? listAgentsByOwner(auth.walletAddress, { ownerUsername: auth.username }) : Promise.resolve([])
  ]);
  const [heartbeats, actionLogs, actionStats] = await Promise.all([
    listAgentHeartbeats(),
    listAgentActionLogs({ limit: 120 }),
    getAgentActionStats()
  ]);
  const actionSummaries = summarizeAgentActionLogs(actionLogs).slice(0, 20);
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
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-cyan-300">
                Active Bid Network: {activeNetwork.label}
              </span>
              <span className="rounded border border-white/10 bg-black/20 px-2 py-0.5 text-[11px] uppercase tracking-wide text-slate-400">
                {activeNetwork.x402Network}
              </span>
              <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-amber-300">
                Active Agent Network: {erc8004Config.chain.name}
              </span>
              <span className="rounded border border-white/10 bg-black/20 px-2 py-0.5 text-[11px] uppercase tracking-wide text-slate-400">
                eip155:{erc8004Config.chainId}
              </span>
            </div>
          </div>
          <RegisterAgentButton />
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
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Link href={`/agents/${agent.id}`} className="font-medium text-white hover:text-primary transition-colors">
                            {agent.name}
                          </Link>
                          <AgentReputationBadge agentId={agent.id} compact />
                        </div>
                        {(() => {
                          const hb =
                            heartbeats.get(agent.name) ??
                            heartbeats.get(agent.id) ??
                            heartbeats.get(String(agent.baseWalletAddress ?? "").toLowerCase()) ??
                            null;
                          const runtimeStatus = deriveRuntimeStatus(hb);
                          const statusClass =
                            runtimeStatus === "online"
                              ? "text-emerald-400"
                              : runtimeStatus === "degraded"
                                ? "text-amber-400"
                                : "text-slate-500";
                          return (
                            <p className={`mt-1 text-xs uppercase tracking-wider ${statusClass}`}>
                              Runtime: {runtimeStatus}
                            </p>
                          );
                        })()}
                        <p className="mt-1 text-xs uppercase tracking-wider text-slate-500">
                          On-chain connection: {agent.erc8004TokenId != null ? "true" : "false"}
                        </p>
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
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <AgentFundingButton
                          agentId={agent.id}
                          agentName={agent.name}
                          agentWalletAddress={agent.baseWalletAddress}
                          ownerWalletAddress={auth.walletAddress}
                          activeBidNetwork={activeNetwork.key}
                        />
                        <span className="inline-flex items-center justify-center rounded-full border border-white/10 px-2.5 py-1 text-xs uppercase tracking-widest leading-none text-slate-400">
                          {agent.transport}
                        </span>
                      </div>
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
                      <div className="flex items-center gap-2">
                        <Link href={`/agents/${agent.id}`} className="font-medium text-white hover:text-primary transition-colors">
                          {agent.name}
                        </Link>
                        <AgentReputationBadge agentId={agent.id} compact />
                      </div>
                      {(() => {
                        const hb =
                          heartbeats.get(agent.name) ??
                          heartbeats.get(agent.id) ??
                          heartbeats.get(String(agent.baseWalletAddress ?? "").toLowerCase()) ??
                          null;
                        const runtimeStatus = deriveRuntimeStatus(hb);
                        const statusClass =
                          runtimeStatus === "online"
                            ? "text-emerald-400"
                            : runtimeStatus === "degraded"
                              ? "text-amber-400"
                              : "text-slate-500";
                        return (
                          <p className={`mt-1 text-xs uppercase tracking-wider ${statusClass}`}>
                            Runtime: {runtimeStatus}
                          </p>
                        );
                      })()}
                      <p className="mt-1 text-xs uppercase tracking-wider text-slate-500">
                        On-chain connection: {agent.erc8004TokenId != null ? "true" : "false"}
                      </p>
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

        <section className="mt-8 rounded-md border border-white/10 bg-[#0a0a0a] p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                Payment Evidence
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Per-action x402 lifecycle mapping across Base and Kite.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded border border-white/10 bg-black/20 px-2 py-1 text-slate-400">
                Total: {actionStats.total}
              </span>
              <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-emerald-300">
                Success: {actionStats.success}
              </span>
              <span className="rounded border border-red-500/20 bg-red-500/10 px-2 py-1 text-red-300">
                Failure: {actionStats.failure}
              </span>
            </div>
          </div>

          {actionSummaries.length === 0 ? (
            <p className="text-sm text-slate-500">No payment-action logs yet.</p>
          ) : (
            <ul className="space-y-3">
              {actionSummaries.map((entry) => {
                const txBase = entry.paymentNetwork ? getExplorerTxBaseByNetwork(entry.paymentNetwork) : null;
                return (
                  <li key={entry.actionId} className="rounded-md border border-white/10 bg-[#121212] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="rounded border border-white/10 bg-black/20 px-2 py-0.5 text-[11px] uppercase tracking-wider text-slate-400">
                          {entry.actionType}
                        </span>
                        <span className="text-sm text-white">{entry.latestStatus.replace(/_/g, " ")}</span>
                      </div>
                      <span className={`rounded border px-2 py-0.5 text-[11px] uppercase tracking-wider ${statusTone(entry.latestStatus)}`}>
                        {entry.latestOutcome}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-slate-400 sm:grid-cols-2">
                      <p className="font-mono">actionId: {entry.actionId}</p>
                      <p className="truncate">network: {entry.paymentNetwork ?? "n/a"}</p>
                      <p className="truncate">identity: {entry.identityScheme ?? "n/a"} / {entry.identitySubject ?? "n/a"}</p>
                      <p>x402: {entry.x402Amount ?? "n/a"} {entry.x402Currency ?? ""}</p>
                      {entry.postId ? (
                        <p>
                          post:{" "}
                          <Link href={`/question/${entry.postId}`} className="text-primary hover:underline">
                            {entry.postId}
                          </Link>
                        </p>
                      ) : (
                        <p>post: n/a</p>
                      )}
                      {entry.paymentTxHash && txBase ? (
                        <p className="min-w-0 truncate">
                          tx:{" "}
                          <a href={`${txBase}${entry.paymentTxHash}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" title={entry.paymentTxHash}>
                            {entry.paymentTxHash}
                          </a>
                        </p>
                      ) : (
                        <p className="truncate">tx: {entry.paymentTxHash ?? "n/a"}</p>
                      )}
                    </div>
                    {entry.failureMessage ? (
                      <p className="mt-2 rounded border border-red-500/20 bg-red-500/10 px-2 py-1 text-xs text-red-300">
                        {entry.failureCode ? `${entry.failureCode}: ` : ""}
                        {entry.failureMessage}
                      </p>
                    ) : null}
                  </li>
                );
              })}
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

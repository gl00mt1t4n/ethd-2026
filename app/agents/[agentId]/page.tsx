import Link from "next/link";
import { notFound } from "next/navigation";
import { listAgentActionLogsByAgentId } from "@/lib/agentActionLogStore";
import { findAgentById, getAgentLeaderboardMetrics } from "@/lib/agentStore";
import { AgentReputationCard } from "@/components/AgentReputationBadge";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getExplorerTxBase(paymentNetwork: string): string | null {
  if (paymentNetwork === "eip155:84532") {
    return "https://sepolia.basescan.org/tx/";
  }
  if (paymentNetwork === "eip155:8453") {
    return "https://basescan.org/tx/";
  }
  return null;
}

function formatStage(stage: string): string {
  return stage.replace(/[._]+/g, " ").trim();
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

export default async function AgentDetailPage(props: { params: Promise<{ agentId: string }> }) {
  const params = await props.params;
  const agent = await findAgentById(params.agentId);

  if (!agent) {
    notFound();
  }

  const [metricsMap, logs] = await Promise.all([
    getAgentLeaderboardMetrics(),
    listAgentActionLogsByAgentId(agent.id, { limit: 80 })
  ]);
  const metrics = metricsMap.get(agent.id);

  return (
    <div className="bg-background-dark text-slate-200">
      <main className="mx-auto w-full max-w-4xl px-6 py-10">
        <div className="rounded-md border border-white/10 bg-[#0a0a0a] p-6">
          <h1 className="text-3xl font-semibold text-white">{agent.name}</h1>
          <p className="mt-2 text-slate-400">{agent.description}</p>
          <div className="mt-4 grid gap-2 text-sm text-slate-400">
            <p>Owner: @{agent.ownerUsername}</p>
            <p>Transport: {agent.transport}</p>
            <p>MCP URL: {agent.mcpServerUrl}</p>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div className="rounded-md border border-white/10 bg-[#121212] p-3">
              <p className="text-xs uppercase tracking-wider text-slate-500">Replies</p>
              <p className="text-xl font-semibold text-white">{metrics?.replies ?? 0}</p>
            </div>
            <div className="rounded-md border border-white/10 bg-[#121212] p-3">
              <p className="text-xs uppercase tracking-wider text-slate-500">Wins</p>
              <p className="text-xl font-semibold text-white">{metrics?.wins ?? 0}</p>
            </div>
            <div className="rounded-md border border-white/10 bg-[#121212] p-3">
              <p className="text-xs uppercase tracking-wider text-slate-500">Winner Payout</p>
              <p className="text-xl font-semibold text-white">${((metrics?.yieldCents ?? 0) / 100).toFixed(2)}</p>
            </div>
            <AgentReputationCard agentId={agent.id} />
          </div>
        </div>

        <section className="mt-6 rounded-md border border-white/10 bg-[#0a0a0a] p-6">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Agent Action Logs</h2>
              <p className="mt-1 text-xs text-slate-500">Latest {logs.length} payment-action log entries.</p>
            </div>
          </div>

          {logs.length === 0 ? (
            <p className="text-sm text-slate-500">No action logs found for this agent yet.</p>
          ) : (
            <ul className="space-y-3">
              {logs.map((entry) => {
                const txBase = entry.paymentNetwork ? getExplorerTxBase(entry.paymentNetwork) : null;
                const outcomeTone =
                  entry.outcome === "success"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    : entry.outcome === "failure"
                      ? "border-red-500/30 bg-red-500/10 text-red-300"
                      : "border-slate-500/30 bg-slate-500/10 text-slate-300";
                return (
                  <li key={entry.id} className="rounded-md border border-white/10 bg-[#121212] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="rounded border border-white/10 bg-black/20 px-2 py-0.5 text-[11px] uppercase tracking-wider text-slate-400">
                          {entry.method}
                        </span>
                        <span className="text-sm text-white">{formatStage(entry.stage)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded border px-2 py-0.5 text-[11px] uppercase tracking-wider ${outcomeTone}`}>
                          {entry.outcome}
                        </span>
                        <span className="text-xs text-slate-500">{formatTimestamp(entry.createdAt)}</span>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-400 sm:grid-cols-2">
                      <p className="font-mono">actionId: {entry.actionId}</p>
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
                      <p>bid: {entry.bidAmountCents === null ? "n/a" : `$${(entry.bidAmountCents / 100).toFixed(2)}`}</p>
                      <p>status: {entry.httpStatus ?? "n/a"}</p>
                      <p className="truncate">network: {entry.paymentNetwork ?? "n/a"}</p>
                      {entry.paymentTxHash && txBase ? (
                        <p>
                          tx:{" "}
                          <a
                            href={`${txBase}${entry.paymentTxHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            {entry.paymentTxHash}
                          </a>
                        </p>
                      ) : (
                        <p className="truncate">tx: {entry.paymentTxHash ?? "n/a"}</p>
                      )}
                    </div>

                    {entry.errorMessage ? (
                      <p className="mt-3 rounded border border-red-500/20 bg-red-500/10 px-2 py-1 text-xs text-red-300">
                        {entry.errorCode ? `${entry.errorCode}: ` : ""}
                        {entry.errorMessage}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

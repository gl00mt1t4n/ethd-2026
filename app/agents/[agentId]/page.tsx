import Link from "next/link";
import { notFound } from "next/navigation";
import { listAgentActionLogsByAgentId, summarizeAgentActionLogs } from "@/lib/agentActionLogStore";
import { findAgentById, getAgentLeaderboardMetrics } from "@/lib/agentStore";
import { AgentReputationCard } from "@/components/AgentReputationBadge";
import { getErc8004Config } from "@/lib/erc8004";
import {
  getActiveBidNetworkConfig,
  getExplorerTxBaseByNetwork,
  getPaymentNetworkConfigByCaip,
  KITE_TESTNET_CAIP
} from "@/lib/paymentNetwork";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatStage(stage: string): string {
  return stage.replace(/[._]+/g, " ").trim();
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
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

export default async function AgentDetailPage(props: {
  params: Promise<{ agentId: string }>;
  searchParams: Promise<{ network?: string; status?: string }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const selectedNetwork = String(searchParams.network ?? "").trim();
  const selectedStatus = String(searchParams.status ?? "").trim();
  const activeNetwork = getActiveBidNetworkConfig();
  const erc8004Config = getErc8004Config();

  const agent = await findAgentById(params.agentId);

  if (!agent) {
    notFound();
  }

  const [metricsMap, logs] = await Promise.all([
    getAgentLeaderboardMetrics(),
    listAgentActionLogsByAgentId(agent.id, {
      limit: 120,
      network: selectedNetwork || undefined,
      status: selectedStatus || undefined
    })
  ]);
  const metrics = metricsMap.get(agent.id);
  const summaries = summarizeAgentActionLogs(logs);

  const availableNetworks = new Set<string>();
  for (const entry of logs) {
    if (entry.paymentNetwork) {
      availableNetworks.add(entry.paymentNetwork);
    }
  }
  availableNetworks.add(activeNetwork.x402Network);
  availableNetworks.add(`eip155:${erc8004Config.chainId}`);
  availableNetworks.add("eip155:84532");
  availableNetworks.add("eip155:8453");
  availableNetworks.add(KITE_TESTNET_CAIP);

  return (
    <div className="bg-background-dark text-slate-200">
      <main className="mx-auto w-full max-w-4xl px-6 py-10">
        <div className="rounded-md border border-white/10 bg-[#0a0a0a] p-6">
          <h1 className="text-3xl font-semibold text-white">{agent.name}</h1>
          <p className="mt-2 text-slate-400">{agent.description}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 uppercase tracking-wide text-cyan-300">
              Active Bid Network: {activeNetwork.label}
            </span>
            <span className="rounded border border-white/10 bg-black/20 px-2 py-0.5 uppercase tracking-wide text-slate-400">
              {activeNetwork.x402Network}
            </span>
            <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 uppercase tracking-wide text-amber-300">
              Active Agent Network: {erc8004Config.chain.name}
            </span>
            <span className="rounded border border-white/10 bg-black/20 px-2 py-0.5 uppercase tracking-wide text-slate-400">
              eip155:{erc8004Config.chainId}
            </span>
          </div>
          <div className="mt-4 grid gap-2 text-sm text-slate-400">
            <p>Owner: @{agent.ownerUsername}</p>
            <p>Transport: {agent.transport}</p>
            <p>MCP URL: {agent.mcpServerUrl}</p>
            <p>On-chain connection: {agent.erc8004TokenId != null ? "true" : "false"}</p>
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
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Agent Action Logs</h2>
              <p className="mt-1 text-xs text-slate-500">Latest {logs.length} lifecycle entries, {summaries.length} correlated actions.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/agents/${agent.id}`}
                className={`rounded border px-2 py-1 text-xs uppercase tracking-wider ${
                  !selectedNetwork
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-white/10 bg-black/20 text-slate-400"
                }`}
              >
                All networks
              </Link>
              {Array.from(availableNetworks)
                .sort()
                .map((network) => {
                  const label = getPaymentNetworkConfigByCaip(network)?.label ?? network;
                  return (
                    <Link
                      key={network}
                      href={`/agents/${agent.id}?network=${encodeURIComponent(network)}`}
                      className={`rounded border px-2 py-1 text-xs uppercase tracking-wider ${
                        selectedNetwork === network
                          ? "border-primary/50 bg-primary/10 text-primary"
                          : "border-white/10 bg-black/20 text-slate-400"
                      }`}
                    >
                      {label}
                    </Link>
                  );
                })}
            </div>
          </div>

          {summaries.length === 0 ? (
            <p className="text-sm text-slate-500">No action logs found for this agent yet.</p>
          ) : (
            <ul className="space-y-3">
              {summaries.map((entry) => {
                const txBase = entry.paymentNetwork ? getExplorerTxBaseByNetwork(entry.paymentNetwork) : null;
                return (
                  <li key={entry.actionId} className="rounded-md border border-white/10 bg-[#121212] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="rounded border border-white/10 bg-black/20 px-2 py-0.5 text-[11px] uppercase tracking-wider text-slate-400">
                          {entry.actionType}
                        </span>
                        <span className="text-sm text-white">{formatStage(entry.latestStatus)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded border px-2 py-0.5 text-[11px] uppercase tracking-wider ${statusTone(entry.latestStatus)}`}>
                          {entry.latestOutcome}
                        </span>
                        <span className="text-xs text-slate-500">{formatTimestamp(entry.lastAt)}</span>
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
                      <p className="truncate">network: {entry.paymentNetwork ?? "n/a"}</p>
                      <p>
                        x402: {entry.x402Amount ?? "n/a"} {entry.x402Currency ?? ""}
                      </p>
                      <p>identity: {entry.identityScheme ?? "n/a"}</p>
                      <p className="truncate">subject: {entry.identitySubject ?? "n/a"}</p>
                      {entry.paymentTxHash && txBase ? (
                        <p className="min-w-0 truncate">
                          tx:{" "}
                          <a
                            href={`${txBase}${entry.paymentTxHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                            title={entry.paymentTxHash}
                          >
                            {entry.paymentTxHash}
                          </a>
                        </p>
                      ) : (
                        <p className="truncate">tx: {entry.paymentTxHash ?? "n/a"}</p>
                      )}
                      <p className="truncate">statuses: {entry.statuses.join(" -> ")}</p>
                    </div>

                    {entry.failureMessage ? (
                      <p className="mt-3 rounded border border-red-500/20 bg-red-500/10 px-2 py-1 text-xs text-red-300">
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

        {selectedStatus ? (
          <section className="mt-4 rounded border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
            Status filter is set to <code>{selectedStatus}</code>. Remove the query param to show all statuses.
          </section>
        ) : null}
      </main>
    </div>
  );
}

import { notFound } from "next/navigation";
import { findAgentById, getAgentLeaderboardMetrics } from "@/lib/agentStore";

export default async function AgentDetailPage(props: { params: Promise<{ agentId: string }> }) {
  const params = await props.params;
  const agent = await findAgentById(params.agentId);

  if (!agent) {
    notFound();
  }

  const metricsMap = await getAgentLeaderboardMetrics();
  const metrics = metricsMap.get(agent.id);

  return (
    <div className="bg-background-dark text-slate-200">
      <main className="mx-auto w-full max-w-4xl px-6 py-10">
        <div className="rounded-xl border border-white/10 bg-[#0a0a0a] p-6">
          <h1 className="text-3xl font-semibold text-white">{agent.name}</h1>
          <p className="mt-2 text-slate-400">{agent.description}</p>
          <div className="mt-4 grid gap-2 text-sm text-slate-400">
            <p>Owner: @{agent.ownerUsername}</p>
            <p>Transport: {agent.transport}</p>
            <p>MCP URL: {agent.mcpServerUrl}</p>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
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
          </div>
        </div>
      </main>
    </div>
  );
}

import { loadLocalEnv } from "./load-local-env.mjs";
import { loadRealAgentsConfig } from "./real-agents-config.mjs";

loadLocalEnv();

const APP_BASE_URL = String(process.env.APP_BASE_URL ?? "http://localhost:3000").trim();

async function main() {
  const { agents } = await loadRealAgentsConfig();
  const expectedNames = new Set(agents.map((agent) => String(agent.name ?? "").trim().toLowerCase()).filter(Boolean));

  const response = await fetch(`${APP_BASE_URL}/api/agents/health`);
  if (!response.ok) {
    throw new Error(`Health endpoint failed: ${response.status}`);
  }
  const payload = await response.json();
  const rows = Array.isArray(payload?.agents) ? payload.agents : [];
  const onlyRealRows = rows.filter((row) => expectedNames.has(String(row?.name ?? "").trim().toLowerCase()));

  console.log(`App: ${APP_BASE_URL}`);
  console.log(`Expected real agents: ${expectedNames.size}`);
  console.log(`Reported real agents: ${onlyRealRows.length}`);
  console.log(`Online: ${onlyRealRows.filter((row) => row.runtimeStatus === "online").length}`);
  console.log(`Degraded: ${onlyRealRows.filter((row) => row.runtimeStatus === "degraded").length}`);
  console.log(`Offline: ${onlyRealRows.filter((row) => row.runtimeStatus === "offline").length}`);
  console.log("");
  for (const row of onlyRealRows) {
    console.log(
      `${row.name} status=${row.runtimeStatus} heartbeat=${row.heartbeatTs ?? "none"} loops=${
        row.loops ?? "-"
      }`
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});


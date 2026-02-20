import { spawnSync } from "node:child_process";
import { loadLocalEnv } from "./load-local-env.mjs";
import { getOpenclawSwarmConfigPath, loadOpenclawSwarmAgents } from "./openclaw-swarm-config.mjs";

loadLocalEnv();

const CONFIG_PATH = getOpenclawSwarmConfigPath();
const ETH_PER_WALLET = String(process.argv[2] ?? process.env.OPENCLAW_SWARM_FUND_ETH ?? "0.002").trim();
const USDC_PER_WALLET = String(process.argv[3] ?? process.env.OPENCLAW_SWARM_FUND_USDC ?? "2").trim();

function fail(message) {
  console.error(message);
  process.exit(1);
}

function isAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

async function main() {
  const agents = await loadOpenclawSwarmAgents(CONFIG_PATH);

  const addresses = [
    ...new Set(
      agents
        .map((agent) => String(agent?.baseWalletAddress ?? "").trim())
        .filter((address) => isAddress(address))
    )
  ];

  if (addresses.length === 0) {
    fail("No valid baseWalletAddress entries found in swarm config.");
  }

  console.log(
    `Funding ${addresses.length} swarm wallet(s) with ${ETH_PER_WALLET} ETH and ${USDC_PER_WALLET} USDC each.`
  );

  const result = spawnSync(
    "node",
    ["scripts/fund-agent-wallet-addresses.mjs", ETH_PER_WALLET, USDC_PER_WALLET, ...addresses],
    { stdio: "inherit" }
  );

  if (result.status !== 0) {
    fail("Swarm wallet funding failed.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

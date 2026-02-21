import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { loadLocalEnv } from "./load-local-env.mjs";
import { getOpenclawSwarmConfigPath, loadOpenclawSwarmAgents } from "./openclaw-swarm-config.mjs";

loadLocalEnv();

const ROOT = process.cwd();
const CONFIG_PATH = getOpenclawSwarmConfigPath();
const LOG_DIR = path.resolve(".agent-run-logs");
const CHECKPOINT_DIR = path.resolve(".agent-checkpoints");
const APP_DISCOVERY_PORTS = [3000, 3001, 3002, 3003, 3004, 3005];
const OPENCLAW_MCP_PORT = Number(process.env.OPENCLAW_MCP_PORT ?? 8790);
const OPENCLAW_MCP_URL = String(process.env.OPENCLAW_SWARM_MCP_URL ?? `http://localhost:${OPENCLAW_MCP_PORT}/mcp`).trim();
const ENABLE_STARTUP_BACKFILL = (process.env.ENABLE_STARTUP_BACKFILL ?? "0") !== "0";
const X402_BASE_NETWORK = String(process.env.X402_BASE_NETWORK ?? "eip155:84532").trim();
const AGENT_ALWAYS_RESPOND = String(process.env.OPENCLAW_SWARM_ALWAYS_RESPOND ?? "0").trim();
const ENABLE_WIKI_DISCOVERY = String(process.env.OPENCLAW_SWARM_DISCOVERY ?? "1").trim();
const AGENT_RESPONSE_LOG_VERBOSE = String(process.env.AGENT_RESPONSE_LOG_VERBOSE ?? "1").trim();
const AGENT_ENABLE_REACTIONS = String(process.env.OPENCLAW_SWARM_REACTIONS ?? "1").trim();
const AGENT_REACT_TO_POSTS = String(process.env.OPENCLAW_SWARM_REACT_POSTS ?? "1").trim();
const AGENT_REACT_TO_ANSWERS = String(process.env.OPENCLAW_SWARM_REACT_ANSWERS ?? "1").trim();
const AGENT_MAX_WIKI_SUBSCRIPTIONS = String(process.env.OPENCLAW_SWARM_MAX_WIKIS ?? "4").trim();

function fail(message) {
  console.error(message);
  process.exit(1);
}

function slugify(input) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function loadConfig() {
  const agents = await loadOpenclawSwarmAgents(CONFIG_PATH);
  return agents.map((agent, index) => {
    const name = String(agent?.name ?? `openclaw-${index + 1}`).trim();
    const accessToken = String(agent?.accessToken ?? "").trim();
    const basePrivateKey = String(agent?.basePrivateKey ?? "").trim();
    const mcpServerUrl = String(agent?.mcpServerUrl ?? OPENCLAW_MCP_URL).trim() || OPENCLAW_MCP_URL;
    const interests = String(agent?.interests ?? "").trim();
    const personaProfile = agent?.personaProfile && typeof agent.personaProfile === "object" ? agent.personaProfile : null;

    if (!name || !accessToken || !basePrivateKey) {
      fail(`Invalid agent entry at index ${index} in ${CONFIG_PATH}`);
    }

    return { name, accessToken, basePrivateKey, mcpServerUrl, interests, personaProfile };
  });
}

async function isAppReachable(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/api/posts`);
    return response.ok;
  } catch {
    return false;
  }
}

async function resolveAppBaseUrl() {
  const explicit = String(process.env.APP_BASE_URL ?? "").trim();
  if (explicit) {
    if (!(await isAppReachable(explicit))) {
      fail(`APP_BASE_URL is set but unreachable: ${explicit}`);
    }
    return explicit;
  }

  for (const port of APP_DISCOVERY_PORTS) {
    const candidate = `http://localhost:${port}`;
    if (await isAppReachable(candidate)) {
      return candidate;
    }
  }

  fail(`Could not find app on ports ${APP_DISCOVERY_PORTS.join(", ")}. Start npm run dev first.`);
}

function spawnWithLogs(command, args, env, logfile, label) {
  const child = spawn(command, args, {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  const stream = createWriteStream(logfile, { flags: "w" });
  const prefix = `[${label}] `;

  child.stdout.on("data", (data) => {
    const line = data.toString();
    process.stdout.write(prefix + line);
    stream.write(line);
  });

  child.stderr.on("data", (data) => {
    const line = data.toString();
    process.stderr.write(prefix + line);
    stream.write(line);
  });

  child.on("exit", (code, signal) => {
    process.stdout.write(`${prefix}exited code=${code ?? "null"} signal=${signal ?? "none"}\n`);
    stream.end();
  });

  return child;
}

async function waitForHealth(url, timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

async function main() {
  const agents = await loadConfig();
  const appBaseUrl = await resolveAppBaseUrl();
  await mkdir(LOG_DIR, { recursive: true });
  await mkdir(CHECKPOINT_DIR, { recursive: true });

  console.log(`Using app endpoint: ${appBaseUrl}`);
  console.log(`Using MCP endpoint: ${OPENCLAW_MCP_URL}`);
  console.log(
    `Swarm settings: agents=${agents.length} alwaysRespond=${AGENT_ALWAYS_RESPOND} discovery=${ENABLE_WIKI_DISCOVERY} reactions=${AGENT_ENABLE_REACTIONS} verboseDecisionLogs=${AGENT_RESPONSE_LOG_VERBOSE}`
  );

  const children = [];
  let shuttingDown = false;

  function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\nShutting down (${signal})...`);
    for (const child of children) {
      try {
        child.kill("SIGTERM");
      } catch {}
    }
    setTimeout(() => {
      for (const child of children) {
        try {
          child.kill("SIGKILL");
        } catch {}
      }
      process.exit(0);
    }, 1500).unref();
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  const mcpLog = path.join(LOG_DIR, "openclaw-swarm-mcp.log");
  const mcpEnv = {
    ...process.env,
    OPENCLAW_MCP_PORT: String(OPENCLAW_MCP_PORT)
  };
  const mcpChild = spawnWithLogs("node", ["scripts/openclaw-agent.mjs"], mcpEnv, mcpLog, "openclaw:mcp");
  children.push(mcpChild);

  const mcpHealthy = await waitForHealth(`http://localhost:${OPENCLAW_MCP_PORT}/health`);
  if (!mcpHealthy) {
    fail(`OpenClaw MCP did not become healthy on port ${OPENCLAW_MCP_PORT}`);
  }

  for (const agent of agents) {
    const key = slugify(agent.name);
    const checkpointFile = path.join(CHECKPOINT_DIR, `${key}.checkpoint.json`);
    const listenerLog = path.join(LOG_DIR, `${key}-listener.log`);

    const listenerEnv = {
      ...process.env,
      AGENT_ACCESS_TOKEN: agent.accessToken,
      AGENT_BASE_PRIVATE_KEY: agent.basePrivateKey,
      AGENT_DECISION_SALT: key,
      AGENT_INTERESTS: agent.interests || "",
      AGENT_PERSONA_PROFILE: agent.personaProfile ? JSON.stringify(agent.personaProfile) : "",
      AGENT_CHECKPOINT_FILE: checkpointFile,
      AGENT_MCP_URL: agent.mcpServerUrl || OPENCLAW_MCP_URL,
      APP_BASE_URL: appBaseUrl,
      X402_BASE_NETWORK,
      ENABLE_STARTUP_BACKFILL: ENABLE_STARTUP_BACKFILL ? "1" : "0",
      ENABLE_WIKI_DISCOVERY,
      AGENT_ALWAYS_RESPOND,
      AGENT_RESPONSE_LOG_VERBOSE,
      AGENT_ENABLE_REACTIONS,
      AGENT_REACT_TO_POSTS,
      AGENT_REACT_TO_ANSWERS,
      AGENT_MAX_WIKI_SUBSCRIPTIONS
    };

    const listenerChild = spawnWithLogs(
      "node",
      ["scripts/agent-listener.mjs"],
      listenerEnv,
      listenerLog,
      `${key}:listener`
    );
    children.push(listenerChild);

    console.log(
      `[${key}] ready checkpoint=${checkpointFile} log=${listenerLog} interests=${agent.interests || "none"} persona=${agent.personaProfile?.codename ?? "default"}`
    );
  }

  console.log(`Started OpenClaw swarm (${agents.length} agents). Press Ctrl+C to stop.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

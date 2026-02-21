import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { loadLocalEnv } from "./load-local-env.mjs";
import { loadRealAgentsConfig, getRealAgentsConfigPath } from "./real-agents-config.mjs";

loadLocalEnv();

const ROOT = process.cwd();
const LOG_DIR = path.resolve(".agent-run-logs");
const HEARTBEAT_DIR = path.resolve(".agent-heartbeats");
const MEMORY_DIR = path.resolve(".agent-memory");
const APP_DISCOVERY_PORTS = [3000, 3001, 3002, 3003, 3004, 3005];
const BASE_MCP_PORT = Number(process.env.REAL_AGENT_BASE_MCP_PORT ?? 8890);
const APP_BASE_URL_ENV = String(process.env.APP_BASE_URL ?? "").trim();

function fail(message) {
  console.error(message);
  process.exit(1);
}

function slugify(input) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
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
  if (APP_BASE_URL_ENV) {
    if (!(await isAppReachable(APP_BASE_URL_ENV))) {
      fail(`APP_BASE_URL is set but unreachable: ${APP_BASE_URL_ENV}`);
    }
    return APP_BASE_URL_ENV;
  }

  for (const port of APP_DISCOVERY_PORTS) {
    const candidate = `http://localhost:${port}`;
    if (await isAppReachable(candidate)) return candidate;
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

async function waitForHealth(url, timeoutMs = 25000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return false;
}

async function main() {
  const configPath = getRealAgentsConfigPath();
  const { agents } = await loadRealAgentsConfig(configPath);
  const appBaseUrl = await resolveAppBaseUrl();

  await mkdir(LOG_DIR, { recursive: true });
  await mkdir(HEARTBEAT_DIR, { recursive: true });
  await mkdir(MEMORY_DIR, { recursive: true });

  console.log(`Using app endpoint: ${appBaseUrl}`);
  console.log(`Using real-agent registry: ${configPath}`);
  console.log(`Starting ${agents.length} real agents`);

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
    }, 2000).unref();
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  for (let index = 0; index < agents.length; index += 1) {
    const agent = agents[index];
    const agentName = String(agent?.name ?? `real-agent-${index + 1}`).trim();
    const key = slugify(agentName);
    const mcpPort = BASE_MCP_PORT + index;
    const mcpUrl = `http://localhost:${mcpPort}/mcp`;

    const mcpLog = path.join(LOG_DIR, `${key}-platform-mcp.log`);
    const cognitiveLog = path.join(LOG_DIR, `${key}-cognitive.log`);

    const mcpEnv = {
      ...process.env,
      APP_BASE_URL: appBaseUrl,
      AGENT_ACCESS_TOKEN: String(agent?.accessToken ?? "").trim(),
      AGENT_BASE_PRIVATE_KEY: String(agent?.basePrivateKey ?? "").trim(),
      PLATFORM_MCP_PORT: String(mcpPort),
      AGENT_TOOL_STATE_FILE: path.join(MEMORY_DIR, `${key}-tool-state.json`),
      AGENT_LOG_DIR: LOG_DIR
    };
    const mcpChild = spawnWithLogs("node", ["scripts/platform-mcp-server.mjs"], mcpEnv, mcpLog, `${key}:mcp`);
    children.push(mcpChild);

    const mcpHealthy = await waitForHealth(`http://localhost:${mcpPort}/health`, 30000);
    if (!mcpHealthy) {
      fail(`Agent MCP did not become healthy for ${agentName} on ${mcpPort}`);
    }

    const cognitiveEnv = {
      ...process.env,
      AGENT_LOG_DIR: LOG_DIR,
      REAL_AGENT_ID: agentName,
      PLATFORM_MCP_URL: mcpUrl,
      REAL_AGENT_HEARTBEAT_FILE: path.join(HEARTBEAT_DIR, `${key}.json`),
      REAL_AGENT_MEMORY_FILE: path.join(MEMORY_DIR, `${key}.memory.json`),
      REAL_AGENT_TRACE_FILE: path.join(LOG_DIR, `${key}-cognitive.log`),
      REAL_AGENT_ACTION_TRACE_FILE: path.join(LOG_DIR, `${key}-cognitive-actions.log`)
    };
    const cognitiveChild = spawnWithLogs(
      "node",
      ["scripts/openclaw-real-agent.mjs"],
      cognitiveEnv,
      cognitiveLog,
      `${key}:agent`
    );
    children.push(cognitiveChild);

    console.log(
      `[${key}] online mcp=${mcpUrl} heartbeat=${path.join(HEARTBEAT_DIR, `${key}.json`)}`
    );
  }

  console.log("All 5 real agents started. Press Ctrl+C to stop.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});


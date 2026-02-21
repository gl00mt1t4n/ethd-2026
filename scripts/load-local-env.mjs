import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function applyEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const raw = readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalIndex = trimmed.indexOf("=");
    if (equalIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalIndex).trim();
    const value = stripQuotes(trimmed.slice(equalIndex + 1).trim());

    if (!key || (process.env[key] !== undefined && process.env[key] !== "")) {
      continue;
    }

    process.env[key] = value;
  }
}

export function loadLocalEnv() {
  const root = process.cwd();
  // Load agent-specific defaults first, then generic env files.
  // Existing process env (e.g. per-agent vars injected by run-real-agents) always wins.
  applyEnvFile(path.join(root, ".env.real-agent"));
  applyEnvFile(path.join(root, ".env"));
  applyEnvFile(path.join(root, ".env.local"));
}

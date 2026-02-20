import { readdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const LOG_DIR = path.resolve(".agent-run-logs");
const mode = String(process.argv[2] ?? "list").trim().toLowerCase();
const target = String(process.argv[3] ?? "").trim();

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function listLogs() {
  let entries = [];
  try {
    entries = await readdir(LOG_DIR, { withFileTypes: true });
  } catch (error) {
    fail(`Could not read ${LOG_DIR}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  if (!files.length) {
    console.log(`No log files found in ${LOG_DIR}`);
    return;
  }

  console.log(`Logs in ${LOG_DIR}:`);
  for (const file of files) {
    console.log(`- ${file}`);
  }
}

function followLog(fileName) {
  const filePath = path.join(LOG_DIR, fileName);
  const child = spawn("tail", ["-f", filePath], { stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 0));
}

async function main() {
  if (mode === "list") {
    await listLogs();
    return;
  }

  if (mode === "tail") {
    if (!target) {
      fail("Usage: npm run agent:openclaw:logs -- tail <filename>");
    }
    followLog(target);
    return;
  }

  fail("Usage: npm run agent:openclaw:logs -- [list | tail <filename>]");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});


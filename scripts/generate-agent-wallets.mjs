import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { english, generateMnemonic, mnemonicToAccount, privateKeyToAccount } from "viem/accounts";

const CONFIG_PATH = path.resolve("test/fixed-agents.local.json");
const TEMPLATE_PATH = path.resolve("test/fixed-agents.example.json");
const rawCount = Number(process.argv[2] ?? 3);

if (!Number.isFinite(rawCount) || rawCount <= 0) {
  console.error("Usage: npm run agent:wallets -- <count>");
  process.exit(1);
}

const COUNT = Math.floor(rawCount);

function normalizePort(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function buildDefaultEntry(index) {
  const n = index + 1;
  return {
    name: `agent-${n}`,
    accessToken: "",
    mnemonic: "",
    basePrivateKey: "",
    baseWalletAddress: "",
    mcpPort: 8800 + n,
    fixedResponse: `Agent ${n}: fixed test response for this question.`
  };
}

function ensureString(value, fallback = "") {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function isValidPrivateKey(privateKey) {
  try {
    privateKeyToAccount(privateKey);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function loadConfig() {
  if (existsSync(CONFIG_PATH)) {
    return readJson(CONFIG_PATH);
  }

  if (existsSync(TEMPLATE_PATH)) {
    return readJson(TEMPLATE_PATH);
  }

  return { agents: [] };
}

async function main() {
  const parsed = await loadConfig();
  const existing = Array.isArray(parsed?.agents) ? parsed.agents : [];
  const nextAgents = [];

  for (let i = 0; i < COUNT; i += 1) {
    const current = existing[i] ?? buildDefaultEntry(i);
    const fallback = buildDefaultEntry(i);

    const entry = {
      ...current,
      name: ensureString(current?.name, fallback.name),
      accessToken: ensureString(current?.accessToken, ""),
      mnemonic: ensureString(current?.mnemonic, ""),
      basePrivateKey: ensureString(current?.basePrivateKey, ""),
      baseWalletAddress: ensureString(current?.baseWalletAddress, ""),
      mcpPort: normalizePort(current?.mcpPort, fallback.mcpPort),
      fixedResponse: ensureString(current?.fixedResponse, fallback.fixedResponse)
    };

    if (!isValidPrivateKey(entry.basePrivateKey)) {
      const mnemonic = generateMnemonic(english);
      const mnemonicAccount = mnemonicToAccount(mnemonic, { accountIndex: 0, addressIndex: 0 });
      const hd = await mnemonicAccount.getHdKey();
      if (!hd?.privateKey) {
        throw new Error(`Failed to derive private key for ${entry.name}`);
      }

      const privateKey = `0x${Buffer.from(hd.privateKey).toString("hex")}`;
      const account = privateKeyToAccount(privateKey);

      entry.mnemonic = mnemonic;
      entry.basePrivateKey = privateKey;
      entry.baseWalletAddress = account.address;

      console.log(`generated ${entry.name} ${account.address}`);
    } else {
      const account = privateKeyToAccount(entry.basePrivateKey);
      entry.baseWalletAddress = account.address;
      if (!entry.mnemonic) {
        entry.mnemonic = "(unknown - private key preserved)";
      }
      console.log(`kept ${entry.name} ${account.address}`);
    }

    nextAgents.push(entry);
  }

  const output = {
    agents: nextAgents
  };

  await writeFile(CONFIG_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`\nWrote ${nextAgents.length} agent wallet(s) to ${CONFIG_PATH}`);
  console.log("Next step: register these baseWalletAddress values in /agents/new and paste returned accessToken values.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

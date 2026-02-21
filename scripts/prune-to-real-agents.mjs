import { PrismaClient } from "@prisma/client";
import { loadLocalEnv } from "./load-local-env.mjs";
import { loadRealAgentsConfig } from "./real-agents-config.mjs";

loadLocalEnv();

if (!process.env.DATABASE_URL && (process.env.DIRECT_URL ?? "").trim()) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

const prisma = new PrismaClient();
const APPLY_DELETE = process.argv.includes("--delete");

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("Missing DATABASE_URL (or DIRECT_URL).");
  }

  const { agents } = await loadRealAgentsConfig();
  const allowedIds = new Set(agents.map((agent) => String(agent?.id ?? "").trim()).filter(Boolean));
  const allowedNames = new Set(agents.map((agent) => normalize(agent?.name)).filter(Boolean));
  const allowedBaseWallets = new Set(agents.map((agent) => normalize(agent?.baseWalletAddress)).filter(Boolean));

  const all = await prisma.agent.findMany({
    select: { id: true, name: true, baseWalletAddress: true, status: true }
  });

  const obsolete = all.filter((agent) => {
    if (allowedIds.has(agent.id)) return false;
    if (allowedNames.has(normalize(agent.name))) return false;
    if (allowedBaseWallets.has(normalize(agent.baseWalletAddress))) return false;
    return true;
  });

  if (!obsolete.length) {
    console.log("No obsolete agents found.");
    return;
  }

  console.log(`Found ${obsolete.length} obsolete agents not in real registry:`);
  for (const agent of obsolete) {
    console.log(`- ${agent.id} name=${agent.name} wallet=${agent.baseWalletAddress}`);
  }

  if (!APPLY_DELETE) {
    console.log("\nDry run only. Re-run with --delete to remove obsolete agents and dependent rows.");
    return;
  }

  const obsoleteIds = obsolete.map((agent) => agent.id);
  await prisma.$transaction(async (tx) => {
    await tx.agentWikiMembership.deleteMany({ where: { agentId: { in: obsoleteIds } } });
    await tx.answer.deleteMany({ where: { agentId: { in: obsoleteIds } } });
    await tx.agent.deleteMany({ where: { id: { in: obsoleteIds } } });
  });
  console.log(`Deleted ${obsoleteIds.length} obsolete agents.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


import path from "node:path";
import { readdir, readFile } from "node:fs/promises";

export type AgentRuntimeLogEntry = {
  id: string;
  ts: string;
  agent: string;
  event: string;
  message: string;
  kind: "positive" | "negative" | "neutral";
  postId: string | null;
  payload: Record<string, unknown> | null;
};

const LOG_DIR = path.resolve(".agent-run-logs");

const EVENT_KIND: Record<string, AgentRuntimeLogEntry["kind"]> = {
  "answer-posted": "positive",
  "joined-wiki": "positive",
  "answer-failed": "negative",
  "join-wiki-failed": "negative",
  "question-loop-error": "negative",
  "openclaw-auth-error": "negative",
  "vote-failed": "negative",
  "decision-summary": "neutral",
  abstain: "neutral",
  "skip-closed-window": "neutral",
  "loop-no-open-questions": "neutral",
  "loop-scan-skipped": "neutral",
  "skip-settled": "neutral",
  "skip-revisit-window": "neutral"
};

const IMPORTANT_DEFAULT_EVENTS = new Set<string>([
  "answer-posted",
  "joined-wiki",
  "answer-failed",
  "join-wiki-failed",
  "question-loop-error",
  "openclaw-auth-error",
  "vote-failed"
]);

const POST_CONTEXT_EVENTS = new Set<string>([
  "decision-summary",
  "abstain",
  "answer-posted",
  "answer-failed",
  "skip-closed-window",
  "join-wiki-failed",
  "joined-wiki"
]);

function safeJsonParse(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    return null;
  } catch {
    return null;
  }
}

function parseLine(agent: string, line: string): AgentRuntimeLogEntry | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^\[([^\]]+)\]\s+([a-z0-9._-]+)(?:\s+(\{.*\}))?$/i);
  if (!match) return null;

  const ts = match[1];
  const event = match[2];
  const payloadRaw = match[3];
  const payload = payloadRaw ? safeJsonParse(payloadRaw) : null;
  const postIdRaw = payload?.questionId ?? payload?.postId ?? null;
  const postId = typeof postIdRaw === "string" ? postIdRaw : null;
  const reason = typeof payload?.reason === "string" ? payload.reason : "";
  const message =
    reason ||
    (typeof payload?.error === "string" ? payload.error : "") ||
    (typeof payload?.wikiId === "string" ? payload.wikiId : "") ||
    event;

  return {
    id: `${agent}:${ts}:${event}:${postId ?? "none"}`,
    ts,
    agent,
    event,
    message,
    kind: EVENT_KIND[event] ?? "neutral",
    postId,
    payload
  };
}

function inferAgentNameFromFile(fileName: string): string {
  return fileName.replace(/-(cognitive|listener)\.log$/, "");
}

function normalizeMessageForDedup(message: string): string {
  return String(message ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeBucket(event: string): string {
  if (event === "decision-summary" || event === "abstain") return "decision";
  return event;
}

function shouldKeepEntry(entry: AgentRuntimeLogEntry, expand: boolean, postId?: string): boolean {
  if (postId) {
    if (entry.postId !== postId) return false;
    if (expand) return true;
    return POST_CONTEXT_EVENTS.has(entry.event);
  }
  if (expand) return true;
  return IMPORTANT_DEFAULT_EVENTS.has(entry.event);
}

export async function listRuntimeAgentLogs(options?: {
  limit?: number;
  expand?: boolean;
  postId?: string;
}): Promise<AgentRuntimeLogEntry[]> {
  const limit = Math.min(300, Math.max(1, Math.floor(options?.limit ?? 60)));
  const expand = Boolean(options?.expand);
  const postId = options?.postId?.trim() || undefined;

  let files: string[] = [];
  try {
    files = await readdir(LOG_DIR);
  } catch {
    return [];
  }

  const runtimeFiles = files.filter((name) => name.endsWith("-cognitive.log") || name.endsWith("-listener.log"));
  const allEntries: AgentRuntimeLogEntry[] = [];

  for (const fileName of runtimeFiles) {
    const fullPath = path.join(LOG_DIR, fileName);
    let raw = "";
    try {
      raw = await readFile(fullPath, "utf8");
    } catch {
      continue;
    }
    const lines = raw.split("\n");
    const tail = lines.slice(Math.max(0, lines.length - 500));
    const agent = inferAgentNameFromFile(fileName);

    for (const line of tail) {
      const parsed = parseLine(agent, line);
      if (!parsed) continue;
      if (!shouldKeepEntry(parsed, expand, postId)) continue;
      allEntries.push(parsed);
    }
  }

  allEntries.sort((a, b) => {
    const ta = new Date(a.ts).getTime();
    const tb = new Date(b.ts).getTime();
    return tb - ta;
  });

  const deduped: AgentRuntimeLogEntry[] = [];
  const seen = new Set<string>();
  for (const entry of allEntries) {
    const key = `${entry.agent}|${dedupeBucket(entry.event)}|${entry.postId ?? ""}|${normalizeMessageForDedup(entry.message)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(entry);
    if (deduped.length >= limit) break;
  }

  return deduped;
}

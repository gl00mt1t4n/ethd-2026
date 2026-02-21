import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import { loadLocalEnv } from "./load-local-env.mjs";

loadLocalEnv();

const MODEL = String(process.env.OPENCLAW_MODEL ?? "openclaw-7b").trim();
const OPENCLAW_BASE_URL = String(process.env.OPENCLAW_BASE_URL ?? "http://localhost:11434/v1").trim();
const OPENCLAW_API_KEY = String(process.env.OPENCLAW_API_KEY ?? process.env.OPENAI_API_KEY ?? "").trim();
const PLATFORM_MCP_URL = String(process.env.PLATFORM_MCP_URL ?? "http://localhost:8795/mcp").trim();
const APP_BASE_URL = String(process.env.APP_BASE_URL ?? "http://localhost:3000").trim();
const AGENT_ACCESS_TOKEN = String(process.env.AGENT_ACCESS_TOKEN ?? "").trim();

const LOOP_INTERVAL_MS = Number(process.env.REAL_AGENT_LOOP_INTERVAL_MS ?? 30000);
const MAX_QUESTIONS_PER_LOOP = Number(process.env.REAL_AGENT_MAX_QUESTIONS_PER_LOOP ?? 10);
const MAX_ACTIONS_PER_LOOP = Number(process.env.REAL_AGENT_MAX_ACTIONS_PER_LOOP ?? 2);
const MAX_RESEARCH_QUERIES = Number(process.env.REAL_AGENT_MAX_RESEARCH_QUERIES ?? 2);
const RESEARCH_ITEMS_PER_QUERY = Number(process.env.REAL_AGENT_RESEARCH_ITEMS_PER_QUERY ?? 3);
const MIN_CONFIDENCE_TO_ANSWER = Number(process.env.REAL_AGENT_MIN_CONFIDENCE ?? 0.62);
const MIN_EV_SCORE_TO_BID = Number(process.env.REAL_AGENT_MIN_EV ?? 0.08);
const DEFAULT_BID_CENTS = Number(process.env.REAL_AGENT_DEFAULT_BID_CENTS ?? 20);
const MAX_BID_CENTS = Number(process.env.REAL_AGENT_MAX_BID_CENTS ?? 80);
const SCAN_PROBABILITY = clamp(Number(process.env.REAL_AGENT_SCAN_PROBABILITY ?? 0.75), 0, 1);
const REVISIT_MINUTES = Math.max(1, Number(process.env.REAL_AGENT_REVISIT_MINUTES ?? 45));
const JITTER_MS = Math.max(0, Number(process.env.REAL_AGENT_LOOP_JITTER_MS ?? 5000));
const MAX_ANSWER_CHARS = Math.max(220, Number(process.env.REAL_AGENT_MAX_ANSWER_CHARS ?? 520));
const LOG_SKIP_REVISIT = String(process.env.REAL_AGENT_LOG_SKIP_REVISIT ?? "0").trim() === "1";

const AGENT_ID = String(process.env.REAL_AGENT_ID ?? process.env.AGENT_NAME ?? "real-openclaw-agent").trim();
const LOG_DIR = path.resolve(process.env.AGENT_LOG_DIR ?? ".agent-run-logs");
const TRACE_FILE = path.resolve(
  process.env.REAL_AGENT_TRACE_FILE ?? path.join(LOG_DIR, `${AGENT_ID}-cognitive.log`)
);
const ACTION_TRACE_FILE = path.resolve(
  process.env.REAL_AGENT_ACTION_TRACE_FILE ?? path.join(LOG_DIR, `${AGENT_ID}-cognitive-actions.log`)
);
const MEMORY_FILE = path.resolve(
  process.env.REAL_AGENT_MEMORY_FILE ?? path.join(".agent-memory", `${AGENT_ID}.memory.json`)
);
const HEARTBEAT_FILE = path.resolve(
  process.env.REAL_AGENT_HEARTBEAT_FILE ?? path.join(".agent-heartbeats", `${AGENT_ID}.json`)
);
const OPENCLAW_HTTP_REFERER = String(process.env.OPENCLAW_HTTP_REFERER ?? "").trim();
const OPENCLAW_APP_TITLE = String(process.env.OPENCLAW_APP_TITLE ?? "WikAIpedia Real Agent").trim();
const AUTH_COOLDOWN_MS = Math.max(10000, Number(process.env.REAL_AGENT_AUTH_COOLDOWN_MS ?? 120000));
const SSE_RECONNECT_MS = Math.max(1000, Number(process.env.REAL_AGENT_SSE_RECONNECT_MS ?? 2500));
const DISCOVERY_INTERVAL_MS = Math.max(30000, Number(process.env.REAL_AGENT_DISCOVERY_INTERVAL_MS ?? 180000));
const MAX_EVENT_REACTIONS_PER_LOOP = Math.max(1, Number(process.env.REAL_AGENT_MAX_EVENT_REACTIONS_PER_LOOP ?? 2));
const MAX_EVENT_BODY_CHARS = Math.max(200, Number(process.env.REAL_AGENT_MAX_EVENT_BODY_CHARS ?? 280));
const PERSONA_JSON = String(process.env.REAL_AGENT_PERSONA_JSON ?? "").trim();

const runtime = {
  running: true,
  authBlockedUntil: 0,
  discovery: { lastAt: 0 },
  eventSeen: new Map(),
  reactionWindow: { minuteKey: "", count: 0 },
  memory: {
    schemaVersion: 2,
    loops: 0,
    lastLoopAt: "",
    seenQuestionIds: [],
    questionLedger: {},
    topicStats: {},
    toolStats: {},
    reflections: []
  }
};

function parsePersonaProfile() {
  const defaults = {
    archetype: "generalist",
    tone: "concise",
    risk: "balanced",
    domains: ["general"],
    answerPropensity: 0.72,
    reactionPropensity: 0.38,
    minReactionConfidence: 0.63,
    confidenceBias: 0,
    evBias: 0,
    borderlineCommitRate: 0.52,
    maxDiscoveryJoinsPerPulse: 1
  };
  if (!PERSONA_JSON) return defaults;

  try {
    const parsed = JSON.parse(PERSONA_JSON);
    const risk = String(parsed?.risk ?? defaults.risk).toLowerCase();
    const riskTuned =
      risk === "conservative"
        ? { confidenceBias: 0.07, evBias: 0.08, answerPropensity: 0.58, reactionPropensity: 0.28, borderlineCommitRate: 0.32 }
        : risk === "aggressive"
          ? { confidenceBias: -0.04, evBias: -0.05, answerPropensity: 0.82, reactionPropensity: 0.5, borderlineCommitRate: 0.72 }
          : { confidenceBias: 0, evBias: 0, answerPropensity: 0.72, reactionPropensity: 0.38, borderlineCommitRate: 0.52 };

    return {
      ...defaults,
      ...riskTuned,
      archetype: String(parsed?.archetype ?? defaults.archetype),
      tone: String(parsed?.tone ?? defaults.tone),
      risk,
      domains: Array.isArray(parsed?.domains)
        ? parsed.domains.map((value) => String(value).trim().toLowerCase()).filter(Boolean).slice(0, 8)
        : defaults.domains,
      answerPropensity: clamp(Number(parsed?.answerPropensity ?? riskTuned.answerPropensity), 0.2, 0.95),
      reactionPropensity: clamp(Number(parsed?.reactionPropensity ?? riskTuned.reactionPropensity), 0.05, 0.9),
      minReactionConfidence: clamp(Number(parsed?.minReactionConfidence ?? defaults.minReactionConfidence), 0.4, 0.95),
      confidenceBias: clamp(Number(parsed?.confidenceBias ?? riskTuned.confidenceBias), -0.2, 0.2),
      evBias: clamp(Number(parsed?.evBias ?? riskTuned.evBias), -0.2, 0.2),
      borderlineCommitRate: clamp(Number(parsed?.borderlineCommitRate ?? riskTuned.borderlineCommitRate), 0.05, 0.95),
      maxDiscoveryJoinsPerPulse: Math.max(0, Math.min(3, Number(parsed?.maxDiscoveryJoinsPerPulse ?? defaults.maxDiscoveryJoinsPerPulse)))
    };
  } catch {
    return defaults;
  }
}

const PERSONA = parsePersonaProfile();

function nowIso() {
  return new Date().toISOString();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function limitString(value, max = 320) {
  return String(value ?? "").slice(0, max);
}

function stripFences(text) {
  const raw = String(text ?? "").trim();
  if (!raw.startsWith("```")) return raw;
  return raw.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();
}

function parseJsonObject(text) {
  const cleaned = stripFences(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function canRunReactionAction() {
  const minuteKey = new Date().toISOString().slice(0, 16);
  if (runtime.reactionWindow.minuteKey !== minuteKey) {
    runtime.reactionWindow.minuteKey = minuteKey;
    runtime.reactionWindow.count = 0;
  }
  if (runtime.reactionWindow.count >= MAX_EVENT_REACTIONS_PER_LOOP) {
    return false;
  }
  runtime.reactionWindow.count += 1;
  return true;
}

function getTopicList(question) {
  const text = `${String(question?.header ?? "")} ${String(question?.content ?? "")}`.toLowerCase();
  const dictionary = [
    ["crypto", ["crypto", "defi", "wallet", "ethereum", "bitcoin", "token", "web3"]],
    ["sports", ["sport", "football", "soccer", "nba", "nfl", "cricket", "tennis"]],
    ["gaming", ["game", "gaming", "steam", "xbox", "playstation", "esports"]],
    ["books", ["book", "novel", "reading", "author", "literature"]],
    ["science", ["science", "physics", "chemistry", "biology", "space", "research"]],
    ["programming", ["code", "programming", "typescript", "javascript", "python", "rust", "api"]]
  ];
  const topics = [];
  for (const [topic, tokens] of dictionary) {
    if (tokens.some((token) => text.includes(token))) topics.push(topic);
  }
  return topics.length ? topics : ["general"];
}

function getQuestionLedger(questionId) {
  const id = String(questionId ?? "").trim();
  if (!id) return null;
  if (!runtime.memory.questionLedger[id]) {
    runtime.memory.questionLedger[id] = {
      firstSeenAt: nowIso(),
      lastSeenAt: "",
      lastDecisionAt: "",
      status: "new",
      abstainCount: 0,
      answerCount: 0,
      failureCount: 0,
      reasons: []
    };
  }
  return runtime.memory.questionLedger[id];
}

function shouldRevisit(ledger) {
  if (ledger?.status === "closed-window" || ledger?.status === "settled") {
    return false;
  }
  if (!ledger?.lastDecisionAt) return true;
  const ageMs = Date.now() - new Date(ledger.lastDecisionAt).getTime();
  return ageMs >= REVISIT_MINUTES * 60 * 1000;
}

function addSeen(questionId) {
  const id = String(questionId ?? "").trim();
  if (!id) return;
  runtime.memory.seenQuestionIds.push(id);
  if (runtime.memory.seenQuestionIds.length > 5000) {
    runtime.memory.seenQuestionIds.splice(0, runtime.memory.seenQuestionIds.length - 5000);
  }
}

function readTopicPrior(topics) {
  if (!Array.isArray(topics) || topics.length === 0) return 0;
  let aggregate = 0;
  for (const topic of topics) {
    const stats = runtime.memory.topicStats[topic] ?? {
      wins: 0,
      losses: 0,
      abstains: 0,
      answers: 0,
      totalConfidence: 0,
      observations: 0
    };
    const observations = Math.max(1, Number(stats.observations ?? 0));
    const net = Number(stats.wins ?? 0) - Number(stats.losses ?? 0);
    aggregate += clamp(net / observations, -1, 1);
  }
  return aggregate / topics.length;
}

function recordTopicOutcome(topics, outcome, confidence) {
  for (const topic of topics) {
    const stats = runtime.memory.topicStats[topic] ?? {
      wins: 0,
      losses: 0,
      abstains: 0,
      answers: 0,
      totalConfidence: 0,
      observations: 0
    };
    stats.observations += 1;
    stats.totalConfidence += Number(confidence ?? 0);
    if (outcome === "success") {
      stats.wins += 1;
      stats.answers += 1;
    } else if (outcome === "abstain") {
      stats.abstains += 1;
    } else {
      stats.losses += 1;
    }
    runtime.memory.topicStats[topic] = stats;
  }
}

function noteToolStat(tool, ok, errorMessage = "") {
  const stats = runtime.memory.toolStats[tool] ?? { ok: 0, fail: 0, lastError: "", lastUsedAt: "" };
  if (ok) stats.ok += 1;
  else {
    stats.fail += 1;
    stats.lastError = limitString(errorMessage, 220);
  }
  stats.lastUsedAt = nowIso();
  runtime.memory.toolStats[tool] = stats;
}

async function ensureStorage() {
  await mkdir(LOG_DIR, { recursive: true });
  await mkdir(path.dirname(MEMORY_FILE), { recursive: true });
  await mkdir(path.dirname(HEARTBEAT_FILE), { recursive: true });
}

async function log(tag, payload = null) {
  const line = payload === null ? `[${nowIso()}] ${tag}` : `[${nowIso()}] ${tag} ${JSON.stringify(payload)}`;
  console.log(line);
  await appendFile(TRACE_FILE, `${line}\n`, "utf8");
}

async function actionLog(type, payload = {}) {
  await appendFile(ACTION_TRACE_FILE, `${JSON.stringify({ ts: nowIso(), type, payload })}\n`, "utf8");
}

async function loadMemory() {
  try {
    const raw = await readFile(MEMORY_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      runtime.memory = {
        schemaVersion: Number(parsed.schemaVersion ?? 2),
        loops: Number(parsed.loops ?? 0),
        lastLoopAt: String(parsed.lastLoopAt ?? ""),
        seenQuestionIds: Array.isArray(parsed.seenQuestionIds) ? parsed.seenQuestionIds.slice(-5000) : [],
        questionLedger: parsed.questionLedger && typeof parsed.questionLedger === "object" ? parsed.questionLedger : {},
        topicStats: parsed.topicStats && typeof parsed.topicStats === "object" ? parsed.topicStats : {},
        toolStats: parsed.toolStats && typeof parsed.toolStats === "object" ? parsed.toolStats : {},
        reflections: Array.isArray(parsed.reflections) ? parsed.reflections.slice(-1000) : []
      };
    }
  } catch {}
}

async function saveMemory() {
  await writeFile(MEMORY_FILE, JSON.stringify(runtime.memory, null, 2), "utf8");
}

async function writeHeartbeat(status, extras = {}) {
  const payload = {
    agentId: AGENT_ID,
    status,
    ts: nowIso(),
    pid: process.pid,
    model: MODEL,
    mcpUrl: PLATFORM_MCP_URL,
    loops: runtime.memory.loops,
    ...extras
  };
  await writeFile(HEARTBEAT_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function callOpenClaw(messages, temperature = 0.2) {
  const headers = { "Content-Type": "application/json" };
  if (OPENCLAW_API_KEY) headers.Authorization = `Bearer ${OPENCLAW_API_KEY}`;
  if (OPENCLAW_BASE_URL.includes("openrouter.ai")) {
    if (OPENCLAW_HTTP_REFERER) headers["HTTP-Referer"] = OPENCLAW_HTTP_REFERER;
    if (OPENCLAW_APP_TITLE) headers["X-Title"] = OPENCLAW_APP_TITLE;
  }

  const response = await fetch(`${OPENCLAW_BASE_URL}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model: MODEL, messages, temperature })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    if (response.status === 401) {
      throw new Error(`OPENCLAW_AUTH_401:${text.slice(0, 260)}`);
    }
    throw new Error(`OpenClaw request failed (${response.status}): ${text.slice(0, 260)}`);
  }

  const payload = await response.json().catch(() => ({}));
  const text = payload?.choices?.[0]?.message?.content;
  if (!text || typeof text !== "string") {
    throw new Error("OpenClaw returned empty content.");
  }
  return text.trim();
}

function isAuthError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("OPENCLAW_AUTH_401") || message.includes("request failed (401)");
}

async function callMcp(method, params = {}) {
  const response = await fetch(PLATFORM_MCP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: `mcp-${Date.now()}`, method, params })
  });
  const payload = await response.json().catch(() => ({}));
  const rpcErrorMessage = payload?.error?.message ? String(payload.error.message) : "";
  const rpcErrorData = payload?.error?.data !== undefined ? payload.error.data : undefined;
  if (!response.ok) {
    const detail = rpcErrorMessage || "unknown";
    const dataText = rpcErrorData !== undefined ? ` data=${JSON.stringify(rpcErrorData).slice(0, 260)}` : "";
    throw new Error(`MCP HTTP error (${response.status}): ${detail}${dataText}`);
  }
  if (payload?.error) {
    const dataText = rpcErrorData !== undefined ? ` data=${JSON.stringify(rpcErrorData).slice(0, 260)}` : "";
    throw new Error(limitString(`${rpcErrorMessage || "MCP call failed"}${dataText}`, 320));
  }
  return payload?.result ?? {};
}

async function callTool(name, args = {}) {
  const start = Date.now();
  try {
    const result = await callMcp("tools/call", { name, arguments: args });
    const parsed = parseJsonObject(String(result?.content?.[0]?.text ?? "{}")) ?? {};
    noteToolStat(name, true);
    await actionLog("tool_call", { tool: name, durationMs: Date.now() - start, ok: true });
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    noteToolStat(name, false, message);
    await actionLog("tool_call", { tool: name, durationMs: Date.now() - start, ok: false, error: message });
    throw error;
  }
}

function noteEventSeen(eventId) {
  const id = String(eventId ?? "").trim();
  if (!id) return false;
  const now = Date.now();
  const existing = runtime.eventSeen.get(id);
  if (existing && now - existing < 15 * 60 * 1000) {
    return true;
  }
  runtime.eventSeen.set(id, now);
  if (runtime.eventSeen.size > 3000) {
    const entries = [...runtime.eventSeen.entries()].sort((a, b) => a[1] - b[1]);
    for (const [key] of entries.slice(0, 1200)) {
      runtime.eventSeen.delete(key);
    }
  }
  return false;
}

function eventHeaders() {
  const headers = { Accept: "text/event-stream", "Cache-Control": "no-cache" };
  if (AGENT_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${AGENT_ACCESS_TOKEN}`;
  }
  return headers;
}

async function decideReaction(input) {
  const prompt = [
    "You are a fast reaction gate for an autonomous agent.",
    `Persona: ${PERSONA.archetype}, tone=${PERSONA.tone}, risk=${PERSONA.risk}, domains=${PERSONA.domains.join(",")}`,
    "Return strict JSON only.",
    'Schema: {"reaction":"like|dislike|none","confidence":0..1,"reason":"short"}',
    "Default to none unless the signal is clearly useful/strong.",
    `Context: ${JSON.stringify(input)}`
  ].join("\n");

  const text = await callOpenClaw(
    [
      { role: "system", content: "Return strict JSON only, no markdown." },
      { role: "user", content: prompt }
    ],
    0.08
  );
  const parsed = parseJsonObject(text);
  const reaction = String(parsed?.reaction ?? "none").toLowerCase();
  const confidence = clamp(Number(parsed?.confidence ?? 0), 0, 1);
  const reason = limitString(parsed?.reason ?? "no-reaction", 160);
  if (confidence < PERSONA.minReactionConfidence) {
    return { reaction: "none", confidence, reason: `below-threshold:${reason}` };
  }
  if (Math.random() > PERSONA.reactionPropensity) {
    return { reaction: "none", confidence, reason: `low-priority:${reason}` };
  }
  return {
    reaction: reaction === "like" || reaction === "dislike" ? reaction : "none",
    confidence,
    reason
  };
}

async function runDiscoveryPulse(source = "loop") {
  const now = Date.now();
  if (now - runtime.discovery.lastAt < DISCOVERY_INTERVAL_MS) {
    return;
  }
  runtime.discovery.lastAt = now;

  try {
    const discovery = await callTool("get_wiki_discovery_candidates", { limit: 12 });
    const candidates = Array.isArray(discovery?.candidates) ? discovery.candidates.slice(0, 5) : [];
    if (!candidates.length) return;

    const prompt = [
      "You decide if an autonomous agent should join any wiki right now.",
      `Persona: ${PERSONA.archetype}, domains=${PERSONA.domains.join(",")}, risk=${PERSONA.risk}`,
      "Return strict JSON only.",
      'Schema: {"joinWikiIds":[string],"reason":"short"}',
      `Join at most ${PERSONA.maxDiscoveryJoinsPerPulse} wikis only when likely useful.`,
      `Candidates: ${JSON.stringify(candidates)}`,
      `Current joined: ${JSON.stringify(discovery?.joinedWikiIds ?? [])}`,
      `Source: ${source}`
    ].join("\n");

    const text = await callOpenClaw(
      [
        { role: "system", content: "Return strict JSON only." },
        { role: "user", content: prompt }
      ],
      0.1
    );
    const parsed = parseJsonObject(text);
    const joinWikiIds = Array.isArray(parsed?.joinWikiIds)
      ? parsed.joinWikiIds
          .map((id) => String(id).trim().toLowerCase())
          .filter(Boolean)
          .slice(0, PERSONA.maxDiscoveryJoinsPerPulse)
      : [];

    if (joinWikiIds.length === 0) {
      await callTool("log_agent_event", {
        type: "discovery_abstain",
        payload: { source, reason: limitString(parsed?.reason ?? "no-join", 180) }
      });
      return;
    }

    for (const wikiId of joinWikiIds) {
      try {
        await callTool("join_wiki", { wiki_id: wikiId, idempotencyKey: `discover-join-${wikiId}` });
        await log("discovery-join", { source, wikiId });
        await callTool("log_agent_event", {
          type: "discovery_join",
          payload: { source, wikiId, reason: limitString(parsed?.reason ?? "", 180) }
        });
      } catch (error) {
        await log("discovery-join-failed", { source, wikiId, error: error instanceof Error ? error.message : String(error) });
      }
    }
  } catch (error) {
    await log("discovery-pulse-failed", { source, error: error instanceof Error ? error.message : String(error) });
  }
}

async function reactToQuestionEvent(event) {
  const postId = String(event?.postId ?? "").trim();
  if (!postId) return;
  if (!canRunReactionAction()) {
    await log("reaction-skip-rate-limit", { postId, targetType: "post" });
    return;
  }

  const reaction = await decideReaction({
    kind: "question",
    postId,
    wikiId: event?.wikiId ?? "",
    header: limitString(event?.header ?? "", 180),
    content: limitString(event?.content ?? "", MAX_EVENT_BODY_CHARS)
  });

  if (reaction.reaction === "none") {
    await callTool("log_agent_event", {
      type: "reaction_abstain",
      payload: { postId, targetType: "post", reason: reaction.reason, confidence: reaction.confidence }
    });
    await log("reaction-abstain", { postId, targetType: "post", reason: reaction.reason });
    return;
  }

  await callTool("vote_post", {
    post_id: postId,
    direction: reaction.reaction === "like" ? "up" : "down",
    idempotencyKey: `react-post-${postId}`
  });
  await callTool("log_agent_event", {
    type: "reaction_posted",
    payload: {
      postId,
      targetType: "post",
      reaction: reaction.reaction,
      reason: reaction.reason,
      confidence: reaction.confidence
    }
  });
  await log("reaction-posted", { postId, reaction: reaction.reaction, targetType: "post" });
}

async function reactToAnswerEvent(event) {
  const postId = String(event?.postId ?? "").trim();
  const answerId = String(event?.answerId ?? "").trim();
  if (!postId || !answerId) return;
  if (!canRunReactionAction()) {
    await log("reaction-skip-rate-limit", { postId, answerId, targetType: "answer" });
    return;
  }

  const reaction = await decideReaction({
    kind: "answer",
    postId,
    answerId,
    wikiId: event?.wikiId ?? "",
    agentName: event?.agentName ?? "",
    contentPreview: limitString(event?.contentPreview ?? "", MAX_EVENT_BODY_CHARS)
  });

  if (reaction.reaction === "none") {
    await callTool("log_agent_event", {
      type: "reaction_abstain",
      payload: { postId, answerId, targetType: "answer", reason: reaction.reason, confidence: reaction.confidence }
    });
    await log("reaction-abstain", { postId, answerId, targetType: "answer", reason: reaction.reason });
    return;
  }

  await callTool("vote_answer", {
    post_id: postId,
    answer_id: answerId,
    direction: reaction.reaction === "like" ? "up" : "down",
    idempotencyKey: `react-answer-${answerId}`
  });
  await callTool("log_agent_event", {
    type: "reaction_posted",
    payload: {
      postId,
      answerId,
      targetType: "answer",
      reaction: reaction.reaction,
      reason: reaction.reason,
      confidence: reaction.confidence
    }
  });
  await log("reaction-posted", { postId, answerId, reaction: reaction.reaction, targetType: "answer" });
}

async function processRealtimeEvent(event) {
  const eventType = String(event?.eventType ?? "").trim();
  const eventId = String(event?.eventId ?? "").trim();
  if (!eventType || noteEventSeen(eventId || `${eventType}:${Date.now()}`)) {
    return;
  }

  if (eventType === "question.created") {
    await log("event-question-created", { postId: event?.postId, wikiId: event?.wikiId });
    const world = await observe();
    await processQuestion({ id: event?.postId }, world);
    await reactToQuestionEvent(event);
    return;
  }

  if (eventType === "answer.created") {
    await log("event-answer-created", { postId: event?.postId, answerId: event?.answerId, wikiId: event?.wikiId });
    await reactToAnswerEvent(event);
    return;
  }

  if (eventType === "wiki.created") {
    await log("event-wiki-created", { wikiId: event?.wikiId });
    await runDiscoveryPulse("wiki-created");
  }
}

async function runEventStreamLoop() {
  if (!AGENT_ACCESS_TOKEN || !APP_BASE_URL) {
    await log("event-stream-disabled", { hasToken: Boolean(AGENT_ACCESS_TOKEN), appBaseUrl: APP_BASE_URL });
    return;
  }

  while (runtime.running) {
    try {
      const response = await fetch(`${APP_BASE_URL}/api/events/questions`, {
        headers: eventHeaders()
      });

      if (!response.ok || !response.body) {
        await log("event-stream-connect-failed", { status: response.status });
        await new Promise((resolve) => setTimeout(resolve, SSE_RECONNECT_MS));
        continue;
      }

      await log("event-stream-connected");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (runtime.running) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
          const chunk = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          boundary = buffer.indexOf("\n\n");

          const lines = chunk.split("\n").map((line) => line.trim());
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const raw = line.slice(5).trim();
            if (!raw) continue;
            const event = parseJsonObject(raw);
            if (!event || typeof event !== "object") continue;
            try {
              await processRealtimeEvent(event);
            } catch (error) {
              await log("event-process-failed", { error: error instanceof Error ? error.message : String(error) });
            }
          }
        }
      }

      await log("event-stream-disconnected");
    } catch (error) {
      await log("event-stream-error", { error: error instanceof Error ? error.message : String(error) });
    }

    if (runtime.running) {
      await new Promise((resolve) => setTimeout(resolve, SSE_RECONNECT_MS));
    }
  }
}

function buildObservationContext(question, budget, profile, similarPosts, bidState, topicPrior) {
  return {
    question: {
      id: question.id,
      wikiId: question.wikiId,
      header: question.header,
      content: question.content,
      requiredBidCents: question.requiredBidCents,
      answerCount: question.answerCount,
      settlementStatus: question.settlementStatus
    },
    budget,
    profile,
    similarPosts,
    bidState,
    topicPrior
  };
}

function normalizePlan(plan) {
  const action = String(plan?.action ?? "abstain").trim().toLowerCase();
  const vote = String(plan?.vote ?? "none").trim().toLowerCase();
  const rawBid = Math.floor(Number(plan?.bidAmountCents ?? 0));
  return {
    action: action === "answer" ? "answer" : "abstain",
    confidence: clamp(Number(plan?.confidence ?? 0), 0, 1),
    expectedValue: clamp(Number(plan?.expectedValue ?? 0), -1, 1),
    bidAmountCents: Math.max(0, Math.min(rawBid, MAX_BID_CENTS)),
    vote: vote === "up" || vote === "down" ? vote : "none",
    joinWikiIds: Array.isArray(plan?.joinWikiIds)
      ? plan.joinWikiIds.map((id) => String(id).trim().toLowerCase()).filter(Boolean).slice(0, 3)
      : [],
    researchQueries: Array.isArray(plan?.researchQueries)
      ? plan.researchQueries.map((query) => limitString(query, 120)).filter(Boolean).slice(0, MAX_RESEARCH_QUERIES)
      : [],
    reason: limitString(plan?.reason ?? "no-reason", 300),
    riskFlags: Array.isArray(plan?.riskFlags)
      ? plan.riskFlags.map((flag) => limitString(flag, 80)).filter(Boolean).slice(0, 8)
      : []
  };
}

async function proposePlan(observation) {
  const prompt = [
    "You are a continuous autonomous agent with budget constraints.",
    `Persona: ${PERSONA.archetype}, tone=${PERSONA.tone}, risk=${PERSONA.risk}, domains=${PERSONA.domains.join(",")}`,
    "Return JSON only.",
    'Schema: {"action":"answer|abstain","confidence":0..1,"expectedValue":-1..1,"bidAmountCents":int,"vote":"up|down|none","joinWikiIds":[string],"researchQueries":[string],"reason":string,"riskFlags":[string]}',
    "Requirements:",
    "- Prefer abstain when uncertain or EV is weak.",
    "- Join wiki only if it improves fit.",
    "- Use no more than two research queries.",
    `Observation JSON: ${JSON.stringify(observation)}`
  ].join("\n");

  const text = await callOpenClaw(
    [
      { role: "system", content: "Produce strict JSON only, no markdown." },
      { role: "user", content: prompt }
    ],
    0.12
  );
  const parsed = parseJsonObject(text);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Planner returned invalid JSON.");
  }
  return normalizePlan(parsed);
}

async function critiquePlan(observation, plan) {
  const prompt = [
    "You are a risk critic for an autonomous economic agent.",
    `Persona policy target: risk=${PERSONA.risk}, confidenceBias=${PERSONA.confidenceBias}, evBias=${PERSONA.evBias}`,
    "Return JSON only.",
    'Schema: {"approve":boolean,"adjustedAction":"answer|abstain","adjustedBidAmountCents":int,"adjustedVote":"up|down|none","issues":[string],"confidenceAdjustment":number}',
    "Be strict on budget and uncertainty.",
    `Observation JSON: ${JSON.stringify(observation)}`,
    `Plan JSON: ${JSON.stringify(plan)}`
  ].join("\n");

  const text = await callOpenClaw(
    [
      { role: "system", content: "Produce strict JSON only, no markdown." },
      { role: "user", content: prompt }
    ],
    0.05
  );
  const parsed = parseJsonObject(text);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Critic returned invalid JSON.");
  }
  return {
    approve: Boolean(parsed.approve),
    adjustedAction: String(parsed.adjustedAction ?? "abstain") === "answer" ? "answer" : "abstain",
    adjustedBidAmountCents: Math.max(0, Math.min(Math.floor(Number(parsed.adjustedBidAmountCents ?? 0)), MAX_BID_CENTS)),
    adjustedVote:
      String(parsed.adjustedVote ?? "none") === "up" || String(parsed.adjustedVote ?? "none") === "down"
        ? String(parsed.adjustedVote ?? "none")
        : "none",
    confidenceAdjustment: clamp(Number(parsed.confidenceAdjustment ?? 0), -0.5, 0.5),
    issues: Array.isArray(parsed.issues) ? parsed.issues.map((issue) => limitString(issue, 100)).slice(0, 8) : []
  };
}

function gatePlan(plan, critique, topicPrior, budget, requiredBidCents, marketAnswerCount) {
  const blendedConfidence = clamp(
    plan.confidence + topicPrior * 0.18 + critique.confidenceAdjustment + PERSONA.confidenceBias,
    0,
    1
  );
  const action = critique.adjustedAction;
  const bidAmountCents = critique.adjustedBidAmountCents > 0 ? critique.adjustedBidAmountCents : plan.bidAmountCents;
  const vote = critique.adjustedVote || plan.vote;
  const requiredBid = Math.max(0, Math.floor(Number(requiredBidCents ?? DEFAULT_BID_CENTS)));

  const remaining = Number(budget?.remainingDailySpendCents ?? 0);
  const lowBudget = remaining <= Math.max(20, DEFAULT_BID_CENTS);
  const answerCount = Math.max(0, Number(marketAnswerCount ?? 0));
  const crowdingPenalty = Math.min(0.22, answerCount * 0.035);
  const adjustedEv = clamp(plan.expectedValue - crowdingPenalty + PERSONA.evBias, -1, 1);
  const minEv = lowBudget ? MIN_EV_SCORE_TO_BID + 0.05 : MIN_EV_SCORE_TO_BID;
  const minConfidence = clamp(MIN_CONFIDENCE_TO_ANSWER + PERSONA.confidenceBias, 0.45, 0.92);
  let shouldAnswer =
    critique.approve &&
    action === "answer" &&
    blendedConfidence >= minConfidence &&
    adjustedEv >= minEv;

  shouldAnswer = shouldAnswer && Math.random() <= PERSONA.answerPropensity;

  if (shouldAnswer && requiredBid > MAX_BID_CENTS) {
    shouldAnswer = false;
  }

  const nearBoundary = blendedConfidence < minConfidence + 0.08 || adjustedEv < minEv + 0.1;
  if (shouldAnswer && nearBoundary && Math.random() > PERSONA.borderlineCommitRate) {
    shouldAnswer = false;
  }

  const gatedBid = shouldAnswer ? requiredBid : 0;
  const reason =
    shouldAnswer
      ? plan.reason
      : requiredBid > MAX_BID_CENTS
        ? `gated:required-bid-exceeds-max (${requiredBid} > ${MAX_BID_CENTS})`
        : `gated:${plan.reason}`;

  return {
    shouldAnswer,
    action: shouldAnswer ? "answer" : "abstain",
    confidence: blendedConfidence,
    expectedValue: adjustedEv,
    bidAmountCents: gatedBid,
    vote: shouldAnswer ? vote : "none",
    reason,
    issues: critique.issues
  };
}

async function researchEvidence(question, topics, plan) {
  const queries = [];
  for (const query of plan.researchQueries) queries.push(query);
  if (queries.length === 0) queries.push(question.header);

  const evidence = [];
  for (const query of queries.slice(0, MAX_RESEARCH_QUERIES)) {
    try {
      const result = await callTool("research_stackexchange", {
        query,
        tags: topics,
        limit: RESEARCH_ITEMS_PER_QUERY
      });
      const items = Array.isArray(result?.items) ? result.items : [];
      evidence.push({
        query,
        items: items.map((item) => ({
          title: limitString(item?.title, 140),
          link: limitString(item?.link, 240),
          score: Number(item?.score ?? 0),
          isAnswered: Boolean(item?.isAnswered)
        }))
      });
    } catch (error) {
      evidence.push({
        query,
        error: error instanceof Error ? error.message : String(error),
        items: []
      });
    }
  }
  return evidence;
}

async function composeAnswer(question, evidence, plan, topics) {
  const prompt = [
    "You are an autonomous answer writer.",
    `Persona voice: ${PERSONA.tone}, archetype=${PERSONA.archetype}.`,
    "Write a concise, practical answer with clear assumptions.",
    "Target length: 2 to 4 short paragraphs total.",
    `Hard limit: ${MAX_ANSWER_CHARS} characters.`,
    "Avoid preambles, avoid repetition, avoid filler.",
    "If evidence exists, cite the source title inline.",
    "Do not fabricate citations.",
    `Question header: ${question.header}`,
    `Question body: ${question.content}`,
    `Topics: ${JSON.stringify(topics)}`,
    `Plan rationale: ${plan.reason}`,
    `Evidence: ${JSON.stringify(evidence)}`
  ].join("\n");

  const raw = await callOpenClaw(
    [
      { role: "system", content: "Be accurate, concise, and explicit about uncertainty." },
      { role: "user", content: prompt }
    ],
    0.22
  );

  const compact = String(raw ?? "").trim().replace(/\n{3,}/g, "\n\n");
  if (compact.length <= MAX_ANSWER_CHARS) return compact;
  const sliced = compact.slice(0, MAX_ANSWER_CHARS);
  const lastPunct = Math.max(sliced.lastIndexOf("."), sliced.lastIndexOf("!"), sliced.lastIndexOf("?"));
  if (lastPunct > 140) return `${sliced.slice(0, lastPunct + 1).trim()}`;
  return `${sliced.trimEnd()}...`;
}

async function observe() {
  const [budget, profile, open] = await Promise.all([
    callTool("get_agent_budget", {}),
    callTool("get_agent_profile", {}),
    callTool("list_open_questions", { limit: MAX_QUESTIONS_PER_LOOP, onlyOpen: true })
  ]);
  const questions = Array.isArray(open?.questions) ? open.questions : [];
  return { budget, profile, questions };
}

async function processQuestion(questionRef, world) {
  const questionId = String(questionRef?.id ?? "").trim();
  if (!questionId) return { acted: false, outcome: "skip", reason: "invalid-id" };

  const ledger = getQuestionLedger(questionId);
  ledger.lastSeenAt = nowIso();

  if (!shouldRevisit(ledger)) {
    if (LOG_SKIP_REVISIT) {
      await log("skip-revisit-window", { questionId, status: ledger.status });
    }
    return { acted: false, outcome: "skip", reason: "revisit-window" };
  }

  const questionPayload = await callTool("get_question", { id: questionId });
  const question = questionPayload?.post ?? questionPayload?.question ?? null;
  if (!question?.id) {
    ledger.status = "invalid";
    ledger.lastDecisionAt = nowIso();
    return { acted: false, outcome: "skip", reason: "missing-question" };
  }

  if (String(question?.settlementStatus ?? "open") !== "open") {
    ledger.status = "settled";
    ledger.lastDecisionAt = nowIso();
    addSeen(questionId);
    await actionLog("skip_settled", { questionId });
    await log("skip-settled", { questionId });
    return { acted: false, outcome: "skip", reason: "settled" };
  }

  if (question?.answersCloseAt && Date.now() > new Date(question.answersCloseAt).getTime()) {
    ledger.status = "closed-window";
    ledger.lastDecisionAt = nowIso();
    addSeen(questionId);
    await actionLog("skip_closed_window", { questionId, answersCloseAt: question.answersCloseAt });
    await log("skip-closed-window", { questionId, answersCloseAt: question.answersCloseAt });
    return { acted: false, outcome: "skip", reason: "closed-window" };
  }

  const topics = getTopicList(question);
  const topicPrior = readTopicPrior(topics);
  const [similar, bidState] = await Promise.all([
    callTool("search_similar_questions", { query: question.header }),
    callTool("get_current_bid_state", { question_id: questionId })
  ]);
  const similarPosts = Array.isArray(similar?.posts) ? similar.posts.slice(0, 3) : [];

  const observation = buildObservationContext(question, world.budget, world.profile, similarPosts, bidState, topicPrior);

  const plan = await proposePlan(observation);
  const critique = await critiquePlan(observation, plan);
  const requiredBidCents = Math.max(
    0,
    Math.floor(Number(question?.requiredBidCents ?? bidState?.requiredBidCents ?? DEFAULT_BID_CENTS))
  );
  const gated = gatePlan(
    plan,
    critique,
    topicPrior,
    world.budget,
    requiredBidCents,
    Number(bidState?.answerCount ?? question?.answerCount ?? 0)
  );

  await log("decision-summary", {
    questionId,
    action: gated.action,
    confidence: Number(gated.confidence.toFixed(2)),
    ev: Number(gated.expectedValue.toFixed(2)),
    bidAmountCents: gated.bidAmountCents,
    requiredBidCents,
    vote: gated.vote,
    reason: limitString(gated.reason, 180)
  });

  await callTool("log_agent_event", {
    type: "cognitive_decision",
    payload: {
      questionId,
      topics,
      requiredBidCents,
      plan,
      critique,
      gated
    }
  });

  for (const wikiId of plan.joinWikiIds) {
    try {
      await callTool("join_wiki", {
        wiki_id: wikiId,
        idempotencyKey: `join-${wikiId}`
      });
      await log("joined-wiki", { questionId, wikiId });
    } catch (error) {
      await log("join-wiki-failed", {
        questionId,
        wikiId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  if (!gated.shouldAnswer) {
    ledger.status = "abstained";
    ledger.abstainCount += 1;
    ledger.lastDecisionAt = nowIso();
    ledger.reasons.push(limitString(gated.reason, 120));
    ledger.reasons = ledger.reasons.slice(-20);
    runtime.memory.reflections.push({
      ts: nowIso(),
      questionId,
      action: "abstain",
      reason: gated.reason,
      confidence: gated.confidence,
      expectedValue: gated.expectedValue,
      topics
    });
    runtime.memory.reflections = runtime.memory.reflections.slice(-1000);
    recordTopicOutcome(topics, "abstain", gated.confidence);
    addSeen(questionId);
    await actionLog("abstain", { questionId, reason: gated.reason, confidence: gated.confidence });
    await callTool("log_agent_event", {
      type: "abstain",
      payload: {
        questionId,
        reason: gated.reason,
        confidence: gated.confidence,
        expectedValue: gated.expectedValue
      }
    });
    await log("abstain", { questionId, reason: gated.reason, confidence: gated.confidence, ev: gated.expectedValue });
    return { acted: true, outcome: "abstain", reason: gated.reason };
  }

  const evidence = await researchEvidence(question, topics, plan);
  const answer = await composeAnswer(question, evidence, gated, topics);

  let posted = null;
  try {
    posted = await callTool("post_answer", {
      question_id: questionId,
      content: answer,
      bidAmountCents: gated.bidAmountCents,
      idempotencyKey: `answer-${questionId}`
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("bidding window has ended")) {
      ledger.status = "closed-window";
      ledger.lastDecisionAt = nowIso();
      addSeen(questionId);
      await actionLog("skip_closed_window", { questionId, source: "post_answer", error: message });
      await callTool("log_agent_event", {
        type: "skip_closed_window",
        payload: { questionId, source: "post_answer", error: message }
      });
      await log("skip-closed-window", { questionId, source: "post_answer" });
      return { acted: false, outcome: "skip", reason: "closed-window" };
    }
    ledger.status = "failed";
    ledger.failureCount += 1;
    ledger.lastDecisionAt = nowIso();
    recordTopicOutcome(topics, "failure", gated.confidence);
    addSeen(questionId);
    await actionLog("answer_failed", { questionId, error: message });
    await callTool("log_agent_event", {
      type: "answer_failed",
      payload: { questionId, error: message }
    });
    await log("answer-failed", { questionId, error: message });
    return { acted: true, outcome: "failure", reason: message };
  }

  if (gated.vote === "up" || gated.vote === "down") {
    try {
      await callTool("vote_post", {
        post_id: questionId,
        direction: gated.vote,
        idempotencyKey: `vote-${questionId}`
      });
    } catch (error) {
      await log("vote-failed", { questionId, error: error instanceof Error ? error.message : String(error) });
    }
  }

  let verification = { ok: true };
  try {
    const afterState = await callTool("get_current_bid_state", { question_id: questionId });
    verification = {
      ok: true,
      answerCount: Number(afterState?.answerCount ?? 0),
      poolTotalCents: Number(afterState?.poolTotalCents ?? 0),
      settlementStatus: String(afterState?.settlementStatus ?? "open")
    };
  } catch (error) {
    verification = { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  ledger.status = "answered";
  ledger.answerCount += 1;
  ledger.lastDecisionAt = nowIso();
  ledger.reasons.push(limitString(gated.reason, 120));
  ledger.reasons = ledger.reasons.slice(-20);

  runtime.memory.reflections.push({
    ts: nowIso(),
    questionId,
    action: "answered",
    confidence: gated.confidence,
    expectedValue: gated.expectedValue,
    bidAmountCents: gated.bidAmountCents,
    tx: posted?.paymentTxHash ?? null,
    verification,
    topics
  });
  runtime.memory.reflections = runtime.memory.reflections.slice(-1000);

  recordTopicOutcome(topics, "success", gated.confidence);
  addSeen(questionId);
  await actionLog("answered", {
    questionId,
    bidAmountCents: gated.bidAmountCents,
    tx: posted?.paymentTxHash ?? null,
    verification
  });
  await callTool("log_agent_event", {
    type: "answer_posted",
    payload: {
      questionId,
      bidAmountCents: gated.bidAmountCents,
      tx: posted?.paymentTxHash ?? null,
      verification,
      reason: gated.reason
    }
  });
  await log("answer-posted", {
    questionId,
    bidAmountCents: gated.bidAmountCents,
    tx: posted?.paymentTxHash ?? null,
    verification
  });
  return { acted: true, outcome: "answered", reason: gated.reason };
}

async function runLoop() {
  if (Date.now() < runtime.authBlockedUntil) {
    await log("loop-auth-cooldown", { retryAt: new Date(runtime.authBlockedUntil).toISOString() });
    return;
  }

  await runDiscoveryPulse("loop");

  if (Math.random() > SCAN_PROBABILITY) {
    await log("loop-scan-skipped", { scanProbability: SCAN_PROBABILITY });
    return;
  }

  const world = await observe();
  if (world?.budget?.paused) {
    await log("loop-paused", world.budget);
    return;
  }

  const questions = Array.isArray(world.questions) ? world.questions : [];
  if (!questions.length) {
    await log("loop-no-open-questions", { check: "fallback-poll" });
    return;
  }

  const ordered = [...questions].sort((a, b) => {
    const aLedger = getQuestionLedger(a?.id);
    const bLedger = getQuestionLedger(b?.id);
    const aFail = Number(aLedger?.failureCount ?? 0);
    const bFail = Number(bLedger?.failureCount ?? 0);
    if (aFail !== bFail) return aFail - bFail;
    return Math.random() - 0.5;
  });

  let actions = 0;
  for (const question of ordered) {
    if (actions >= MAX_ACTIONS_PER_LOOP) break;
    try {
      const result = await processQuestion(question, world);
      if (result.acted) actions += 1;
    } catch (error) {
      const questionId = String(question?.id ?? "").trim();
      const message = error instanceof Error ? error.message : String(error);
      if (isAuthError(error)) {
        runtime.authBlockedUntil = Date.now() + AUTH_COOLDOWN_MS;
        await log("openclaw-auth-error", {
          questionId,
          retryInMs: AUTH_COOLDOWN_MS,
          message
        });
        await actionLog("openclaw_auth_error", { questionId, retryInMs: AUTH_COOLDOWN_MS, message });
        break;
      }
      await log("question-loop-error", { questionId, error: message });
      await actionLog("question_loop_error", { questionId, error: message });
    }
  }
}

async function main() {
  await ensureStorage();
  await loadMemory();
  await writeHeartbeat("online", { state: "booting" });
  await log("real-openclaw-cognitive-agent-start", {
    agentId: AGENT_ID,
    model: MODEL,
    mcpUrl: PLATFORM_MCP_URL,
    persona: PERSONA,
    loopIntervalMs: LOOP_INTERVAL_MS,
    maxQuestionsPerLoop: MAX_QUESTIONS_PER_LOOP,
    maxActionsPerLoop: MAX_ACTIONS_PER_LOOP,
    minConfidence: MIN_CONFIDENCE_TO_ANSWER,
    minEv: MIN_EV_SCORE_TO_BID,
    revisitMinutes: REVISIT_MINUTES
  });

  const streamLoop = runEventStreamLoop().catch(async (error) => {
    await log("event-stream-fatal", { error: error instanceof Error ? error.message : String(error) });
  });

  while (runtime.running) {
    runtime.memory.loops += 1;
    runtime.memory.lastLoopAt = nowIso();
    await writeHeartbeat("online", { state: "loop-start" });
    try {
      await runLoop();
      await saveMemory();
      await writeHeartbeat("online", { state: "idle" });
    } catch (error) {
      await log("loop-error", { error: error instanceof Error ? error.message : String(error) });
      await writeHeartbeat("degraded", {
        state: "loop-error",
        error: limitString(error instanceof Error ? error.message : String(error), 180)
      });
    }

    const jitter = JITTER_MS > 0 ? Math.floor(Math.random() * JITTER_MS) : 0;
    await new Promise((resolve) => setTimeout(resolve, LOOP_INTERVAL_MS + jitter));
  }

  await streamLoop;
}

async function shutdown(signal) {
  runtime.running = false;
  await saveMemory();
  await writeHeartbeat("offline", { signal, state: "shutdown" });
  await log("real-openclaw-cognitive-agent-stop", { signal });
  process.exit(0);
}

process.on("SIGINT", () => {
  shutdown("SIGINT").catch(() => process.exit(0));
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM").catch(() => process.exit(0));
});

main().catch(async (error) => {
  await log("fatal", { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});

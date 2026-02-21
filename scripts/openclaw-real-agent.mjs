import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import { loadLocalEnv } from "./load-local-env.mjs";

loadLocalEnv();

const MODEL = String(process.env.OPENCLAW_MODEL ?? "openclaw-7b").trim();
const OPENCLAW_BASE_URL = String(process.env.OPENCLAW_BASE_URL ?? "http://localhost:11434/v1").trim();
const OPENCLAW_API_KEY = String(process.env.OPENCLAW_API_KEY ?? process.env.OPENAI_API_KEY ?? "").trim();

const PLATFORM_MCP_URL = String(process.env.PLATFORM_MCP_URL ?? "http://localhost:8795/mcp").trim();
const LOOP_INTERVAL_MS = Number(process.env.REAL_AGENT_LOOP_INTERVAL_MS ?? 30000);
const MAX_QUESTIONS_PER_LOOP = Number(process.env.REAL_AGENT_MAX_QUESTIONS_PER_LOOP ?? 8);
const MIN_CONFIDENCE_TO_ANSWER = Number(process.env.REAL_AGENT_MIN_CONFIDENCE ?? 0.62);
const MIN_EV_SCORE_TO_BID = Number(process.env.REAL_AGENT_MIN_EV ?? 0.08);
const DEFAULT_BID_CENTS = Number(process.env.REAL_AGENT_DEFAULT_BID_CENTS ?? 20);
const SCAN_PROBABILITY = clamp(Number(process.env.REAL_AGENT_SCAN_PROBABILITY ?? 0.75), 0, 1);
const MAX_NEW_PER_LOOP = Number(process.env.REAL_AGENT_MAX_NEW_PER_LOOP ?? 3);

const LOG_DIR = path.resolve(process.env.AGENT_LOG_DIR ?? ".agent-run-logs");
const TRACE_FILE = path.join(LOG_DIR, "real-openclaw-agent.log");
const MEMORY_FILE = path.resolve(process.env.REAL_AGENT_MEMORY_FILE ?? ".real-openclaw-memory.json");

const state = {
  memory: {
    seenQuestionIds: [],
    topicPerformance: {},
    history: [],
    lastLoopAt: "",
    loops: 0
  },
  running: true
};

function nowIso() {
  return new Date().toISOString();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

async function ensureStorage() {
  await mkdir(LOG_DIR, { recursive: true });
}

async function log(line, payload = null) {
  const entry = payload === null ? `[${nowIso()}] ${line}` : `[${nowIso()}] ${line} ${JSON.stringify(payload)}`;
  console.log(entry);
  await appendFile(TRACE_FILE, `${entry}\n`, "utf8");
}

async function loadMemory() {
  try {
    const raw = await readFile(MEMORY_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      state.memory = {
        seenQuestionIds: Array.isArray(parsed.seenQuestionIds) ? parsed.seenQuestionIds.slice(-5000) : [],
        topicPerformance: parsed.topicPerformance && typeof parsed.topicPerformance === "object" ? parsed.topicPerformance : {},
        history: Array.isArray(parsed.history) ? parsed.history.slice(-1000) : [],
        lastLoopAt: String(parsed.lastLoopAt ?? ""),
        loops: Number(parsed.loops ?? 0)
      };
    }
  } catch {}
}

async function saveMemory() {
  await writeFile(MEMORY_FILE, JSON.stringify(state.memory, null, 2), "utf8");
}

function markSeen(questionId) {
  const id = String(questionId ?? "").trim();
  if (!id) return;
  state.memory.seenQuestionIds.push(id);
  if (state.memory.seenQuestionIds.length > 5000) {
    state.memory.seenQuestionIds.splice(0, state.memory.seenQuestionIds.length - 5000);
  }
}

function hasSeen(questionId) {
  return state.memory.seenQuestionIds.includes(String(questionId ?? "").trim());
}

function inferTopics(question) {
  const text = `${String(question?.header ?? "")} ${String(question?.content ?? "")}`.toLowerCase();
  const categories = [
    ["crypto", ["crypto", "defi", "wallet", "ethereum", "bitcoin", "token", "web3"]],
    ["sports", ["sport", "football", "soccer", "nba", "nfl", "cricket", "fitness"]],
    ["gaming", ["game", "gaming", "esports", "rpg", "fps", "steam"]],
    ["books", ["book", "novel", "reading", "literature", "author"]],
    ["science", ["science", "physics", "chemistry", "biology", "space", "research"]],
    ["programming", ["code", "programming", "typescript", "javascript", "python", "rust", "api"]]
  ];
  const topics = [];
  for (const [topic, tokens] of categories) {
    if (tokens.some((token) => text.includes(token))) {
      topics.push(topic);
    }
  }
  return topics.length ? topics : ["general"];
}

function readTopicPrior(topics) {
  if (!topics.length) return 0;
  let sum = 0;
  for (const topic of topics) {
    const stats = state.memory.topicPerformance[topic] ?? { win: 0, loss: 0, seen: 0 };
    const seen = Math.max(1, Number(stats.seen ?? 0));
    const net = Number(stats.win ?? 0) - Number(stats.loss ?? 0);
    sum += clamp(net / seen, -1, 1);
  }
  return sum / topics.length;
}

function updateTopicPerformance(topics, outcome) {
  for (const topic of topics) {
    const stats = state.memory.topicPerformance[topic] ?? { win: 0, loss: 0, seen: 0 };
    stats.seen += 1;
    if (outcome === "success") stats.win += 1;
    if (outcome === "failure") stats.loss += 1;
    state.memory.topicPerformance[topic] = stats;
  }
}

async function callOpenClaw(messages, temperature = 0.2) {
  const headers = { "Content-Type": "application/json" };
  if (OPENCLAW_API_KEY) {
    headers.Authorization = `Bearer ${OPENCLAW_API_KEY}`;
  }

  const response = await fetch(`${OPENCLAW_BASE_URL}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model: MODEL, messages, temperature })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`OpenClaw request failed (${response.status}): ${text.slice(0, 260)}`);
  }

  const payload = await response.json().catch(() => ({}));
  const text = payload?.choices?.[0]?.message?.content;
  if (!text || typeof text !== "string") {
    throw new Error("OpenClaw returned no text content.");
  }

  return text.trim();
}

function parseJsonObject(text) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

async function callMcp(method, params = {}) {
  const response = await fetch(PLATFORM_MCP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: `mcp-${Date.now()}`, method, params })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`MCP HTTP error (${response.status})`);
  }
  if (payload?.error) {
    throw new Error(payload.error.message ?? "MCP call failed");
  }
  return payload?.result ?? {};
}

async function callTool(name, args = {}) {
  const result = await callMcp("tools/call", { name, arguments: args });
  const raw = String(result?.content?.[0]?.text ?? "{}");
  const parsed = parseJsonObject(raw);
  return parsed ?? {};
}

async function decide(question, context) {
  const prompt = [
    "You are a fully autonomous economic agent.",
    "Return only JSON with this exact schema:",
    '{"shouldAnswer":boolean,"confidence":number,"expectedRoi":number,"bidAmountCents":number,"vote":"up"|"down"|"none","joinWikiId":string|null,"reason":string,"researchNeeded":boolean}',
    "Use conservative confidence when uncertain.",
    `Question JSON: ${JSON.stringify(question)}`,
    `Context JSON: ${JSON.stringify(context)}`
  ].join("\n");

  const text = await callOpenClaw(
    [
      { role: "system", content: "You are an autonomous planner. Output strict JSON only." },
      { role: "user", content: prompt }
    ],
    0.1
  );
  const parsed = parseJsonObject(text);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Decision response was not valid JSON.");
  }

  const confidence = clamp(Number(parsed.confidence ?? 0), 0, 1);
  const expectedRoi = clamp(Number(parsed.expectedRoi ?? 0), -1, 1);
  const bidAmountCents = Math.max(0, Math.floor(Number(parsed.bidAmountCents ?? 0)));

  return {
    shouldAnswer: Boolean(parsed.shouldAnswer),
    confidence,
    expectedRoi,
    bidAmountCents,
    vote: ["up", "down", "none"].includes(String(parsed.vote)) ? String(parsed.vote) : "none",
    joinWikiId: parsed.joinWikiId ? String(parsed.joinWikiId).trim().toLowerCase() : null,
    reason: String(parsed.reason ?? "no-reason").slice(0, 260),
    researchNeeded: Boolean(parsed.researchNeeded)
  };
}

async function composeAnswer(question, researchItems) {
  const prompt = [
    "Answer the question with concise, high-signal content.",
    "If research evidence is provided, ground the answer in it.",
    "Avoid fabricated claims.",
    `Question: ${question.header}`,
    `Body: ${question.content}`,
    `Research: ${JSON.stringify(researchItems)}`
  ].join("\n");

  return callOpenClaw(
    [
      { role: "system", content: "You are a domain-capable assistant. Be accurate and concise." },
      { role: "user", content: prompt }
    ],
    0.2
  );
}

async function runLoop() {
  const budget = await callTool("get_agent_budget", {});
  if (budget?.paused) {
    await log("loop-paused", budget);
    return;
  }

  if (Math.random() > SCAN_PROBABILITY) {
    await log("loop-scan-skipped", { scanProbability: SCAN_PROBABILITY });
    return;
  }

  const open = await callTool("list_open_questions", { limit: MAX_QUESTIONS_PER_LOOP, onlyOpen: true });
  const questions = Array.isArray(open?.questions) ? open.questions : [];

  if (!questions.length) {
    await log("loop-no-open-questions");
    return;
  }

  let processedThisLoop = 0;
  const shuffled = [...questions].sort(() => Math.random() - 0.5);
  for (const questionRef of shuffled) {
    if (processedThisLoop >= MAX_NEW_PER_LOOP) {
      break;
    }
    const questionId = String(questionRef?.id ?? "").trim();
    if (!questionId || hasSeen(questionId)) continue;

    const questionPayload = await callTool("get_question", { id: questionId });
    const question = questionPayload?.post ?? questionPayload?.question ?? null;
    if (!question?.id) {
      markSeen(questionId);
      continue;
    }

    const topics = inferTopics(question);
    const topicPrior = readTopicPrior(topics);

    const similar = await callTool("search_similar_questions", { query: question.header });
    const similarPosts = Array.isArray(similar?.posts) ? similar.posts.slice(0, 3) : [];

    let research = [];
    const initialDecision = await decide(question, {
      budget,
      topicPrior,
      topics,
      similarPosts
    });

    if (initialDecision.joinWikiId) {
      try {
        await callTool("join_wiki", {
          wiki_id: initialDecision.joinWikiId,
          idempotencyKey: `join-${initialDecision.joinWikiId}`
        });
      } catch (error) {
        await log("join-wiki-failed", {
          wikiId: initialDecision.joinWikiId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    let decision = initialDecision;
    if (decision.researchNeeded) {
      try {
        const rs = await callTool("research_stackexchange", {
          query: question.header,
          tags: topics,
          limit: 3
        });
        research = Array.isArray(rs?.items) ? rs.items : [];
        decision = await decide(question, {
          budget,
          topicPrior,
          topics,
          similarPosts,
          research
        });
      } catch (error) {
        await log("research-failed", {
          questionId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    const blendedConfidence = clamp(decision.confidence + topicPrior * 0.18, 0, 1);
    const shouldAnswer =
      decision.shouldAnswer && blendedConfidence >= MIN_CONFIDENCE_TO_ANSWER && decision.expectedRoi >= MIN_EV_SCORE_TO_BID;

    await callTool("log_agent_event", {
      type: "decision",
      payload: {
        questionId,
        topics,
        topicPrior,
        confidence: decision.confidence,
        blendedConfidence,
        expectedRoi: decision.expectedRoi,
        shouldAnswer,
        reason: decision.reason
      }
    });

    if (!shouldAnswer) {
      state.memory.history.push({
        ts: nowIso(),
        questionId,
        action: "abstain",
        reason: decision.reason,
        confidence: blendedConfidence,
        expectedRoi: decision.expectedRoi,
        topics
      });
      updateTopicPerformance(topics, "failure");
      markSeen(questionId);
      await saveMemory();
      await log("abstain", { questionId, reason: decision.reason, confidence: blendedConfidence });
      continue;
    }

    const answer = await composeAnswer(question, research);
    const bidAmountCents = Math.max(0, Math.min(Number(decision.bidAmountCents || DEFAULT_BID_CENTS), DEFAULT_BID_CENTS * 4));

    try {
      const postResult = await callTool("post_answer", {
        question_id: questionId,
        content: answer,
        bidAmountCents,
        idempotencyKey: `answer-${questionId}`
      });

      if (decision.vote === "up" || decision.vote === "down") {
        try {
          await callTool("vote_post", {
            post_id: questionId,
            direction: decision.vote,
            idempotencyKey: `vote-${questionId}`
          });
        } catch (error) {
          await log("vote-failed", { questionId, error: error instanceof Error ? error.message : String(error) });
        }
      }

      state.memory.history.push({
        ts: nowIso(),
        questionId,
        action: "answered",
        bidAmountCents,
        tx: postResult?.paymentTxHash ?? null,
        confidence: blendedConfidence,
        expectedRoi: decision.expectedRoi,
        topics
      });
      updateTopicPerformance(topics, "success");
      markSeen(questionId);
      await saveMemory();
      await log("answer-posted", { questionId, bidAmountCents, tx: postResult?.paymentTxHash ?? null });
    } catch (error) {
      state.memory.history.push({
        ts: nowIso(),
        questionId,
        action: "answer-failed",
        error: error instanceof Error ? error.message : String(error),
        topics
      });
      updateTopicPerformance(topics, "failure");
      markSeen(questionId);
      await saveMemory();
      await log("answer-failed", { questionId, error: error instanceof Error ? error.message : String(error) });
    }
    processedThisLoop += 1;
  }
}

async function main() {
  await ensureStorage();
  await loadMemory();
  await log("real-openclaw-agent-start", {
    mcpUrl: PLATFORM_MCP_URL,
    model: MODEL,
    intervalMs: LOOP_INTERVAL_MS,
    minConfidence: MIN_CONFIDENCE_TO_ANSWER,
    minEv: MIN_EV_SCORE_TO_BID,
    scanProbability: SCAN_PROBABILITY,
    maxNewPerLoop: MAX_NEW_PER_LOOP
  });

  while (state.running) {
    state.memory.loops += 1;
    state.memory.lastLoopAt = nowIso();

    try {
      await runLoop();
      await saveMemory();
    } catch (error) {
      await log("loop-error", { error: error instanceof Error ? error.message : String(error) });
    }

    await new Promise((resolve) => setTimeout(resolve, LOOP_INTERVAL_MS));
  }
}

process.on("SIGINT", async () => {
  state.running = false;
  await log("real-openclaw-agent-stop", { signal: "SIGINT" });
  process.exit(0);
});

process.on("SIGTERM", async () => {
  state.running = false;
  await log("real-openclaw-agent-stop", { signal: "SIGTERM" });
  process.exit(0);
});

main().catch(async (error) => {
  await log("fatal", { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});

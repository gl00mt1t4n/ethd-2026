import http from "node:http";
import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import { loadLocalEnv } from "./load-local-env.mjs";

loadLocalEnv();

const PORT = Number(process.env.PLATFORM_MCP_PORT ?? 8795);
const APP_BASE_URL = String(process.env.APP_BASE_URL ?? "http://localhost:3000").trim();
const AGENT_ACCESS_TOKEN = String(process.env.AGENT_ACCESS_TOKEN ?? "").trim();
const LOG_DIR = path.resolve(process.env.AGENT_LOG_DIR ?? ".agent-run-logs");
const STATE_FILE = path.resolve(process.env.AGENT_TOOL_STATE_FILE ?? ".agent-tool-state.json");
const ACTION_LOG_FILE = path.join(LOG_DIR, "real-agent-actions.log");

const AGENT_MAX_DAILY_SPEND_CENTS = Number(process.env.AGENT_MAX_DAILY_SPEND_CENTS ?? 1000);
const AGENT_MAX_BID_CENTS = Number(process.env.AGENT_MAX_BID_CENTS ?? 200);
const TOOL_RATE_LIMIT_PER_MINUTE = Number(process.env.AGENT_TOOL_RATE_LIMIT_PER_MINUTE ?? 60);
const X402_BASE_NETWORK = String(process.env.X402_BASE_NETWORK ?? "eip155:84532").trim();
const AGENT_BASE_PRIVATE_KEY = String(process.env.AGENT_BASE_PRIVATE_KEY ?? "").trim();
const AGENTKIT_MNEMONIC = String(process.env.AGENTKIT_MNEMONIC ?? process.env.MNEMONIC_PHRASE ?? "").trim();
const AGENT_WALLET_DERIVATION_PATH = String(process.env.AGENT_WALLET_DERIVATION_PATH ?? "m/44'/60'/0'/0/0").trim();

const runtime = {
  state: {
    dayKey: "",
    dailySpendCents: 0,
    paused: false,
    idempotency: {},
    writes: []
  },
  callsByMinute: new Map()
};

let paymentAccount = null;
if (AGENT_BASE_PRIVATE_KEY) {
  paymentAccount = privateKeyToAccount(AGENT_BASE_PRIVATE_KEY);
} else if (AGENTKIT_MNEMONIC) {
  paymentAccount = mnemonicToAccount(AGENTKIT_MNEMONIC, { path: AGENT_WALLET_DERIVATION_PATH });
}
const fetchWithPayment = paymentAccount
  ? wrapFetchWithPaymentFromConfig(fetch, {
      schemes: [
        {
          network: X402_BASE_NETWORK,
          client: new ExactEvmScheme(paymentAccount)
        }
      ]
    })
  : fetch;

function nowIso() {
  return new Date().toISOString();
}

function dayKey(ts = new Date()) {
  return ts.toISOString().slice(0, 10);
}

function fail(message, status = 400, details = undefined) {
  const error = { ok: false, error: message };
  if (details !== undefined) {
    error.details = details;
  }
  return { status, body: error };
}

function ok(result) {
  return { status: 200, body: { ok: true, result } };
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function makeHeaders(extra = {}) {
  return {
    "Content-Type": "application/json",
    ...(AGENT_ACCESS_TOKEN ? { Authorization: `Bearer ${AGENT_ACCESS_TOKEN}` } : {}),
    ...extra
  };
}

async function ensureStorage() {
  await mkdir(LOG_DIR, { recursive: true });
}

async function loadState() {
  await ensureStorage();
  try {
    const raw = await readFile(STATE_FILE, "utf8");
    const parsed = parseJson(raw);
    if (parsed && typeof parsed === "object") {
      runtime.state = {
        dayKey: String(parsed.dayKey ?? ""),
        dailySpendCents: Number(parsed.dailySpendCents ?? 0),
        paused: Boolean(parsed.paused),
        idempotency: parsed.idempotency && typeof parsed.idempotency === "object" ? parsed.idempotency : {},
        writes: Array.isArray(parsed.writes) ? parsed.writes.slice(-300) : []
      };
    }
  } catch {}
  rotateDailyBudgetIfNeeded();
}

async function saveState() {
  rotateDailyBudgetIfNeeded();
  await writeFile(
    STATE_FILE,
    JSON.stringify({ ...runtime.state, updatedAt: nowIso() }, null, 2),
    "utf8"
  );
}

function rotateDailyBudgetIfNeeded() {
  const today = dayKey();
  if (runtime.state.dayKey !== today) {
    runtime.state.dayKey = today;
    runtime.state.dailySpendCents = 0;
  }
}

async function audit(type, payload) {
  const line = JSON.stringify({ ts: nowIso(), type, payload });
  await appendFile(ACTION_LOG_FILE, `${line}\n`, "utf8");
}

function enforceRateLimit(toolName) {
  const minuteBucket = new Date().toISOString().slice(0, 16);
  const key = `${toolName}:${minuteBucket}`;
  const used = runtime.callsByMinute.get(key) ?? 0;
  if (used >= TOOL_RATE_LIMIT_PER_MINUTE) {
    return fail(`Rate limit exceeded for tool ${toolName}.`, 429);
  }
  runtime.callsByMinute.set(key, used + 1);
  if (runtime.callsByMinute.size > 2048) {
    for (const [bucket] of runtime.callsByMinute) {
      if (!bucket.endsWith(minuteBucket)) {
        runtime.callsByMinute.delete(bucket);
      }
    }
  }
  return null;
}

function normalizeIdempotencyKey(value) {
  const key = String(value ?? "").trim();
  return key ? key.slice(0, 120) : "";
}

function checkIdempotency(key) {
  const normalized = normalizeIdempotencyKey(key);
  if (!normalized) return null;
  return runtime.state.idempotency[normalized] ?? null;
}

function storeIdempotency(key, value) {
  const normalized = normalizeIdempotencyKey(key);
  if (!normalized) return;
  runtime.state.idempotency[normalized] = {
    ...value,
    timestamp: nowIso()
  };
}

function requireAgentTokenForWrites() {
  if (!AGENT_ACCESS_TOKEN) {
    return fail("Missing AGENT_ACCESS_TOKEN for write tools.", 401);
  }
  return null;
}

function ensureBudgetForBid(cents) {
  rotateDailyBudgetIfNeeded();
  if (!Number.isFinite(cents) || !Number.isInteger(cents) || cents < 0) {
    return fail("bidAmountCents must be a non-negative integer.", 400);
  }
  if (cents > AGENT_MAX_BID_CENTS) {
    return fail(`Bid exceeds max per action (${AGENT_MAX_BID_CENTS} cents).`, 400);
  }
  if (runtime.state.dailySpendCents + cents > AGENT_MAX_DAILY_SPEND_CENTS) {
    return fail("Daily spend limit reached.", 400, {
      dailySpendCents: runtime.state.dailySpendCents,
      maxDailySpendCents: AGENT_MAX_DAILY_SPEND_CENTS,
      attemptedBidCents: cents
    });
  }
  return null;
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text().catch(() => "");
  const payload = text ? parseJson(text) : null;
  if (!response.ok) {
    const message = payload?.error || text.slice(0, 240) || `HTTP ${response.status}`;
    throw new Error(`${response.status}:${message}`);
  }
  return payload ?? {};
}

async function tool_list_open_questions(args) {
  const limit = Math.min(200, Math.max(1, Number(args?.limit ?? 50)));
  const wikiId = String(args?.wikiId ?? "").trim();
  const query = wikiId ? `?wikiId=${encodeURIComponent(wikiId)}` : "";
  const payload = await fetchJson(`${APP_BASE_URL}/api/posts${query}`);
  const posts = Array.isArray(payload?.posts) ? payload.posts : [];
  const nowTs = Date.now();

  const onlyOpen = args?.onlyOpen !== false;
  const filtered = onlyOpen
    ? posts.filter((post) => {
        if (String(post?.settlementStatus ?? "open") !== "open") return false;
        if (!post?.answersCloseAt) return true;
        const closeTs = new Date(post.answersCloseAt).getTime();
        if (!Number.isFinite(closeTs)) return true;
        return closeTs > nowTs;
      })
    : posts;

  return {
    count: Math.min(limit, filtered.length),
    questions: filtered.slice(0, limit).map((post) => ({
      id: post.id,
      wikiId: post.wikiId,
      header: post.header,
      createdAt: post.createdAt,
      answersCloseAt: post.answersCloseAt ?? null,
      requiredBidCents: post.requiredBidCents,
      answerCount: post.answerCount,
      settlementStatus: post.settlementStatus
    }))
  };
}

async function tool_get_question(args) {
  const id = String(args?.id ?? "").trim();
  if (!id) {
    throw new Error("id is required");
  }
  return fetchJson(`${APP_BASE_URL}/api/posts/${encodeURIComponent(id)}`);
}

async function tool_get_wiki(args) {
  const id = String(args?.id ?? "").trim().toLowerCase();
  if (!id) {
    throw new Error("id is required");
  }
  const payload = await fetchJson(`${APP_BASE_URL}/api/wikis`);
  const wikis = Array.isArray(payload?.wikis) ? payload.wikis : [];
  const wiki = wikis.find((item) => String(item?.id ?? "").toLowerCase() === id) ?? null;
  if (!wiki) {
    throw new Error("Wiki not found");
  }
  return { wiki };
}

async function tool_search_similar_questions(args) {
  const query = String(args?.query ?? "").trim();
  if (!query) {
    throw new Error("query is required");
  }
  const payload = await fetchJson(`${APP_BASE_URL}/api/search?q=${encodeURIComponent(query)}`);
  return {
    posts: Array.isArray(payload?.posts) ? payload.posts : [],
    wikis: Array.isArray(payload?.wikis) ? payload.wikis : []
  };
}

async function tool_get_agent_profile() {
  const profile = {
    paused: runtime.state.paused,
    budget: {
      dayKey: runtime.state.dayKey,
      dailySpendCents: runtime.state.dailySpendCents,
      maxDailySpendCents: AGENT_MAX_DAILY_SPEND_CENTS,
      remainingDailySpendCents: Math.max(0, AGENT_MAX_DAILY_SPEND_CENTS - runtime.state.dailySpendCents),
      maxBidCents: AGENT_MAX_BID_CENTS
    }
  };

  if (AGENT_ACCESS_TOKEN) {
    try {
      const memberships = await fetchJson(`${APP_BASE_URL}/api/agents/me/wikis`, {
        headers: makeHeaders()
      });
      profile.joinedWikiIds = Array.isArray(memberships?.wikiIds) ? memberships.wikiIds : [];
    } catch (error) {
      profile.membershipsError = error instanceof Error ? error.message : String(error);
    }
  }

  return profile;
}

async function tool_get_current_bid_state(args) {
  const questionId = String(args?.questionId ?? args?.question_id ?? "").trim();
  if (!questionId) {
    throw new Error("questionId is required");
  }
  const [postPayload, answersPayload] = await Promise.all([
    fetchJson(`${APP_BASE_URL}/api/posts/${encodeURIComponent(questionId)}`),
    fetchJson(`${APP_BASE_URL}/api/posts/${encodeURIComponent(questionId)}/answers`)
  ]);
  const post = postPayload?.post ?? null;
  const answers = Array.isArray(answersPayload?.answers) ? answersPayload.answers : [];
  const totalBidsCents = answers.reduce((sum, answer) => sum + Number(answer?.bidAmountCents ?? 0), 0);
  return {
    questionId,
    requiredBidCents: Number(post?.requiredBidCents ?? 0),
    answerCount: answers.length,
    totalBidsCents,
    poolTotalCents: Number(post?.poolTotalCents ?? 0),
    settlementStatus: String(post?.settlementStatus ?? "open")
  };
}

async function tool_research_stackexchange(args) {
  const query = String(args?.query ?? "").trim();
  if (!query) {
    throw new Error("query is required");
  }
  const site = String(args?.site ?? "stackoverflow").trim() || "stackoverflow";
  const limit = Math.min(10, Math.max(1, Number(args?.limit ?? 5)));
  const tags = Array.isArray(args?.tags)
    ? args.tags.map((tag) => String(tag).trim()).filter(Boolean)
    : String(args?.tags ?? "").split(",").map((tag) => tag.trim()).filter(Boolean);

  const url = new URL("https://api.stackexchange.com/2.3/search/advanced");
  url.searchParams.set("order", "desc");
  url.searchParams.set("sort", "relevance");
  url.searchParams.set("accepted", "True");
  url.searchParams.set("site", site);
  url.searchParams.set("q", query);
  url.searchParams.set("pagesize", String(limit));
  if (tags.length) {
    url.searchParams.set("tagged", tags.join(";"));
  }
  const apiKey = String(process.env.STACKEXCHANGE_KEY ?? "").trim();
  if (apiKey) {
    url.searchParams.set("key", apiKey);
  }

  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`StackExchange request failed (${response.status}).`);
  }

  const items = Array.isArray(payload?.items) ? payload.items : [];
  return {
    site,
    quotaRemaining: Number(payload?.quota_remaining ?? -1),
    items: items.map((item) => ({
      title: item.title,
      link: item.link,
      score: Number(item.score ?? 0),
      isAnswered: Boolean(item.is_answered),
      answerCount: Number(item.answer_count ?? 0),
      tags: Array.isArray(item.tags) ? item.tags : []
    }))
  };
}

async function tool_post_answer(args) {
  const authError = requireAgentTokenForWrites();
  if (authError) return authError;
  if (runtime.state.paused) return fail("Agent is paused.", 400);

  const questionId = String(args?.questionId ?? args?.question_id ?? "").trim();
  const content = String(args?.content ?? "").trim();
  const bidAmountCents = Number(args?.bidAmountCents ?? 0);
  const idempotencyKey = args?.idempotencyKey;

  if (!questionId) return fail("questionId is required.", 400);
  if (!content) return fail("content is required.", 400);

  const existing = checkIdempotency(idempotencyKey);
  if (existing) {
    return { status: 200, body: { ok: true, result: existing, idempotent: true } };
  }

  const budgetError = ensureBudgetForBid(bidAmountCents);
  if (budgetError) return budgetError;
  if (bidAmountCents > 0 && !paymentAccount) {
    return fail(
      "Bid requires signer wallet. Set AGENT_BASE_PRIVATE_KEY or AGENTKIT_MNEMONIC/MNEMONIC_PHRASE for x402 signing.",
      400
    );
  }

  try {
    const response = await fetchWithPayment(`${APP_BASE_URL}/api/posts/${encodeURIComponent(questionId)}/answers`, {
      method: "POST",
      headers: makeHeaders(),
      body: JSON.stringify({ content, bidAmountCents })
    });
    const text = await response.text().catch(() => "");
    const payload = text ? parseJson(text) : {};
    if (!response.ok) {
      const message = payload?.error || text.slice(0, 240) || `HTTP ${response.status}`;
      return fail(message, response.status);
    }

    runtime.state.dailySpendCents += bidAmountCents;
    const result = {
      questionId,
      bidAmountCents,
      paymentTxHash: payload?.paymentTxHash ?? null,
      answerId: payload?.answer?.id ?? null,
      postedAt: nowIso()
    };
    runtime.state.writes.push({ action: "post_answer", ...result });
    storeIdempotency(idempotencyKey, result);
    await saveState();
    await audit("post_answer", result);
    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error), 400);
  }
}

async function tool_place_bid() {
  return fail(
    "Standalone place_bid is unsupported in current backend. Use post_answer with bidAmountCents for atomic stake+answer.",
    501
  );
}

async function tool_join_wiki(args) {
  const authError = requireAgentTokenForWrites();
  if (authError) return authError;
  if (runtime.state.paused) return fail("Agent is paused.", 400);

  const wikiId = String(args?.wikiId ?? args?.wiki_id ?? "").trim();
  const idempotencyKey = args?.idempotencyKey;
  if (!wikiId) return fail("wikiId is required.", 400);

  const existing = checkIdempotency(idempotencyKey);
  if (existing) {
    return { status: 200, body: { ok: true, result: existing, idempotent: true } };
  }

  try {
    const payload = await fetchJson(`${APP_BASE_URL}/api/agents/me/wikis`, {
      method: "POST",
      headers: makeHeaders(),
      body: JSON.stringify({ wikiId })
    });
    const result = { wikiId: payload?.wikiId ?? wikiId, joinedAt: nowIso() };
    runtime.state.writes.push({ action: "join_wiki", ...result });
    storeIdempotency(idempotencyKey, result);
    await saveState();
    await audit("join_wiki", result);
    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error), 400);
  }
}

async function tool_vote_post(args) {
  const authError = requireAgentTokenForWrites();
  if (authError) return authError;
  if (runtime.state.paused) return fail("Agent is paused.", 400);

  const postId = String(args?.postId ?? args?.post_id ?? "").trim();
  const direction = String(args?.direction ?? "").trim().toLowerCase();
  const idempotencyKey = args?.idempotencyKey;
  if (!postId) return fail("postId is required.", 400);
  if (direction !== "up" && direction !== "down") return fail("direction must be up or down.", 400);

  const existing = checkIdempotency(idempotencyKey);
  if (existing) {
    return { status: 200, body: { ok: true, result: existing, idempotent: true } };
  }

  try {
    const reaction = direction === "up" ? "like" : "dislike";
    const payload = await fetchJson(`${APP_BASE_URL}/api/posts/${encodeURIComponent(postId)}/reactions`, {
      method: "POST",
      headers: makeHeaders(),
      body: JSON.stringify({ reaction })
    });

    const result = {
      postId,
      reaction,
      likesCount: Number(payload?.likesCount ?? 0),
      dislikesCount: Number(payload?.dislikesCount ?? 0),
      votedAt: nowIso()
    };
    runtime.state.writes.push({ action: "vote_post", ...result });
    storeIdempotency(idempotencyKey, result);
    await saveState();
    await audit("vote_post", result);
    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error), 400);
  }
}

async function tool_comment() {
  return fail("Comments API is not implemented in backend yet.", 501);
}

async function tool_get_agent_budget() {
  rotateDailyBudgetIfNeeded();
  return {
    dayKey: runtime.state.dayKey,
    dailySpendCents: runtime.state.dailySpendCents,
    maxDailySpendCents: AGENT_MAX_DAILY_SPEND_CENTS,
    remainingDailySpendCents: Math.max(0, AGENT_MAX_DAILY_SPEND_CENTS - runtime.state.dailySpendCents),
    maxBidCents: AGENT_MAX_BID_CENTS,
    paused: runtime.state.paused
  };
}

async function tool_set_agent_status(args) {
  const status = String(args?.status ?? "").trim().toLowerCase();
  if (status !== "active" && status !== "paused") {
    return fail("status must be active or paused", 400);
  }
  runtime.state.paused = status === "paused";
  await saveState();
  await audit("set_agent_status", { status, at: nowIso() });
  return ok({ status });
}

async function tool_log_agent_event(args) {
  const type = String(args?.type ?? "event").trim() || "event";
  const payload = args?.payload ?? {};
  await audit(`agent_event:${type}`, payload);
  return ok({ logged: true, type, at: nowIso() });
}

const tools = {
  list_open_questions: { readOnly: true, handler: tool_list_open_questions },
  get_question: { readOnly: true, handler: tool_get_question },
  get_wiki: { readOnly: true, handler: tool_get_wiki },
  search_similar_questions: { readOnly: true, handler: tool_search_similar_questions },
  get_agent_profile: { readOnly: true, handler: tool_get_agent_profile },
  get_current_bid_state: { readOnly: true, handler: tool_get_current_bid_state },
  research_stackexchange: { readOnly: true, handler: tool_research_stackexchange },
  post_answer: { readOnly: false, handler: tool_post_answer },
  place_bid: { readOnly: false, handler: tool_place_bid },
  join_wiki: { readOnly: false, handler: tool_join_wiki },
  vote_post: { readOnly: false, handler: tool_vote_post },
  comment: { readOnly: false, handler: tool_comment },
  get_agent_budget: { readOnly: true, handler: tool_get_agent_budget },
  set_agent_status: { readOnly: false, handler: tool_set_agent_status },
  log_agent_event: { readOnly: true, handler: tool_log_agent_event }
};

function toolListResult() {
  return Object.keys(tools).map((name) => ({
    name,
    description: `${name} (${tools[name].readOnly ? "read" : "write"})`,
    inputSchema: { type: "object", additionalProperties: true }
  }));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? parseJson(raw) : {};
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

async function handleRpc(body) {
  const id = body?.id ?? null;
  const method = String(body?.method ?? "");

  if (method === "initialize") {
    return {
      status: 200,
      payload: {
        jsonrpc: "2.0",
        id,
        result: {
          serverInfo: { name: "platform-mcp-server", version: "0.1.0" },
          capabilities: { tools: {} }
        }
      }
    };
  }

  if (method === "tools/list") {
    return {
      status: 200,
      payload: {
        jsonrpc: "2.0",
        id,
        result: { tools: toolListResult() }
      }
    };
  }

  if (method === "tools/call") {
    const name = String(body?.params?.name ?? "");
    const args = body?.params?.arguments ?? {};
    const tool = tools[name];
    if (!tool) {
      return {
        status: 200,
        payload: { jsonrpc: "2.0", id, error: { code: -32602, message: `Unknown tool: ${name}` } }
      };
    }

    const rateLimitError = enforceRateLimit(name);
    if (rateLimitError) {
      return {
        status: rateLimitError.status,
        payload: { jsonrpc: "2.0", id, error: { code: 429, message: rateLimitError.body.error } }
      };
    }

    try {
      const result = await tool.handler(args);
      if (result && typeof result === "object" && "status" in result && "body" in result) {
        if (!result.body.ok) {
          return {
            status: result.status,
            payload: { jsonrpc: "2.0", id, error: { code: result.status, message: result.body.error, data: result.body.details } }
          };
        }
        return {
          status: result.status,
          payload: {
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: JSON.stringify(result.body.result ?? {}) }]
            }
          }
        };
      }

      return {
        status: 200,
        payload: {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(result ?? {}) }]
          }
        }
      };
    } catch (error) {
      return {
        status: 500,
        payload: {
          jsonrpc: "2.0",
          id,
          error: { code: 500, message: error instanceof Error ? error.message : String(error) }
        }
      };
    }
  }

  return {
    status: 200,
    payload: { jsonrpc: "2.0", id, error: { code: -32601, message: `Unsupported method: ${method}` } }
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    return sendJson(res, 200, {
      ok: true,
      service: "platform-mcp-server",
      appBaseUrl: APP_BASE_URL,
      tokenConfigured: Boolean(AGENT_ACCESS_TOKEN),
      paused: runtime.state.paused,
      dayKey: runtime.state.dayKey,
      dailySpendCents: runtime.state.dailySpendCents
    });
  }

  if (req.method === "POST" && req.url === "/mcp") {
    const body = await readBody(req);
    const result = await handleRpc(body);
    return sendJson(res, result.status, result.payload);
  }

  return sendJson(res, 404, { ok: false, error: "Not found" });
});

await loadState();
server.listen(PORT, () => {
  console.log(
    `[platform-mcp] listening on http://localhost:${PORT}/mcp appBaseUrl=${APP_BASE_URL} maxDailySpendCents=${AGENT_MAX_DAILY_SPEND_CENTS} maxBidCents=${AGENT_MAX_BID_CENTS} signer=${paymentAccount?.address ?? "none"}`
  );
});

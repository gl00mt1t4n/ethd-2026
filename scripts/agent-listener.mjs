import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { buildQuestionPrompt, chooseWikiToJoin, shouldRespond } from "./agent-policy.mjs";

const AGENT_MCP_PORT = Number(process.env.AGENT_MCP_PORT ?? 8787);
const AGENT_MCP_URL = process.env.AGENT_MCP_URL ?? `http://localhost:${AGENT_MCP_PORT}/mcp`;
const APP_PORT = Number(process.env.APP_PORT ?? 3000);
const APP_BASE_URL = process.env.APP_BASE_URL ?? `http://localhost:${APP_PORT}`;
const LISTENER_STATUS_PORT = Number(process.env.LISTENER_STATUS_PORT ?? 0);
const AGENT_ACCESS_TOKEN = (process.env.AGENT_ACCESS_TOKEN ?? "").trim();
const AGENT_BASE_PRIVATE_KEY = (process.env.AGENT_BASE_PRIVATE_KEY ?? "").trim();
const X402_BASE_NETWORK = process.env.X402_BASE_NETWORK ?? "eip155:8453";
const ENABLE_STARTUP_BACKFILL = (process.env.ENABLE_STARTUP_BACKFILL ?? "0") !== "0";
const AGENT_CHECKPOINT_FILE =
  process.env.AGENT_CHECKPOINT_FILE ?? path.join(process.cwd(), ".agent-listener-checkpoint.json");
const RECONNECT_BASE_DELAY_MS = Number(process.env.RECONNECT_BASE_DELAY_MS ?? 1000);
const RECONNECT_MAX_DELAY_MS = Number(process.env.RECONNECT_MAX_DELAY_MS ?? 10000);
const ENABLE_WIKI_DISCOVERY = (process.env.ENABLE_WIKI_DISCOVERY ?? "1") !== "0";
const WIKI_DISCOVERY_INTERVAL_MS = Number(process.env.WIKI_DISCOVERY_INTERVAL_MS ?? 30 * 60 * 1000);
const WIKI_DISCOVERY_LIMIT = Number(process.env.WIKI_DISCOVERY_LIMIT ?? 25);
const WIKI_DISCOVERY_QUERY = String(process.env.WIKI_DISCOVERY_QUERY ?? "").trim();

const state = {
  connected: false,
  processedEvents: 0,
  submittedAnswers: 0,
  lastError: "",
  lastEventAt: "",
  lastEventId: ""
};

if (!AGENT_ACCESS_TOKEN) {
  console.error("Missing AGENT_ACCESS_TOKEN.");
  process.exit(1);
}

let fetchWithPayment = fetch;
if (AGENT_BASE_PRIVATE_KEY) {
  const account = privateKeyToAccount(AGENT_BASE_PRIVATE_KEY);
  fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [
      {
        network: X402_BASE_NETWORK,
        client: new ExactEvmScheme(account)
      }
    ]
  });
} else {
  console.warn("AGENT_BASE_PRIVATE_KEY not set. Paid answer submission will fail on x402-protected routes.");
}

async function callAgent(question) {
  const response = await fetch(AGENT_MCP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `tool-call-${Date.now()}`,
      method: "tools/call",
      params: {
        name: "answer_question",
        arguments: { question }
      }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Agent tool call failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const data = await response.json();
  const answer = data?.result?.content?.[0]?.text;
  return typeof answer === "string" ? answer : "No answer returned by agent";
}

async function submitAnswer(postId, answerText) {
  const response = await fetchWithPayment(`${APP_BASE_URL}/api/posts/${postId}/answers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AGENT_ACCESS_TOKEN}`
    },
    body: JSON.stringify({ content: answerText })
  });

  if (response.ok) {
    return { ok: true };
  }

  const maybeJson = await response.json().catch(() => null);
  const errorMessage = maybeJson?.error ?? `HTTP ${response.status}`;

  if (response.status === 402 && !AGENT_BASE_PRIVATE_KEY) {
    return { ok: false, error: "x402 payment required and AGENT_BASE_PRIVATE_KEY is missing." };
  }

  if (response.status === 400 && String(errorMessage).toLowerCase().includes("already answered")) {
    return { ok: true, skipped: true };
  }

  return { ok: false, error: `Failed to submit answer (${response.status}): ${errorMessage}` };
}

async function fetchPostById(postId) {
  const response = await fetch(`${APP_BASE_URL}/api/posts/${postId}`);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Failed to fetch post ${postId} (${response.status}): ${text.slice(0, 200)}`);
  }

  const data = await response.json().catch(() => null);
  const post = data?.post;
  if (!post?.id || !post?.header || !post?.content) {
    throw new Error(`Malformed post payload for ${postId}`);
  }

  return post;
}

async function discoverAndJoinWikis() {
  if (!ENABLE_WIKI_DISCOVERY) {
    return;
  }

  const url = new URL(`${APP_BASE_URL}/api/agents/me/discovery`);
  url.searchParams.set("limit", String(WIKI_DISCOVERY_LIMIT));
  if (WIKI_DISCOVERY_QUERY) {
    url.searchParams.set("q", WIKI_DISCOVERY_QUERY);
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${AGENT_ACCESS_TOKEN}`
    }
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Discovery request failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const data = await response.json().catch(() => ({}));
  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
  if (candidates.length === 0) {
    console.log("[discovery] no candidate wikis.");
    return;
  }

  const wikiId = chooseWikiToJoin(candidates);
  if (!wikiId) {
    console.log("[discovery] no wiki met join policy.");
    return;
  }

  const joinResponse = await fetch(`${APP_BASE_URL}/api/agents/me/wikis`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AGENT_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ wikiId })
  });

  if (!joinResponse.ok) {
    const text = await joinResponse.text().catch(() => "");
    throw new Error(`Join wiki failed (${joinResponse.status}): ${text.slice(0, 200)}`);
  }

  console.log(`[discovery] joined wiki w/${wikiId}`);
}

async function loadCheckpoint() {
  try {
    const raw = await fs.readFile(AGENT_CHECKPOINT_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const lastEventId = String(parsed?.lastEventId ?? "").trim();
    return lastEventId || null;
  } catch {
    return null;
  }
}

async function saveCheckpoint(eventId) {
  const payload = JSON.stringify({ lastEventId: eventId, updatedAt: new Date().toISOString() });
  await fs.writeFile(AGENT_CHECKPOINT_FILE, payload, "utf8");
  state.lastEventId = eventId;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function handleQuestionEvent(payload) {
  if (!shouldRespond(payload)) {
    return;
  }

  console.log(`[event] received eventType=${payload.eventType} postId=${payload.postId} header="${payload.header}"`);
  const post = await fetchPostById(payload.postId);
  console.log(`[event] fetched postId=${payload.postId}`);

  const questionText = buildQuestionPrompt(post);
  const answer = await callAgent(questionText);
  const submitResult = await submitAnswer(payload.postId, answer);

  if (!submitResult.ok) {
    console.warn(`[submit] failed postId=${payload.postId} error="${submitResult.error}"`);
    throw new Error(submitResult.error);
  }

  if (submitResult.skipped) {
    console.log(`[submit] skipped postId=${payload.postId} reason=already_answered`);
    return;
  }

  state.submittedAnswers += 1;
  console.log(`[submit] success postId=${payload.postId}`);
}

async function runStartupBackfill() {
  if (!ENABLE_STARTUP_BACKFILL) {
    return;
  }

  const response = await fetch(`${APP_BASE_URL}/api/posts`);
  if (!response.ok) {
    console.warn(`Backfill skipped: could not fetch posts (${response.status}).`);
    return;
  }

  const data = await response.json().catch(() => ({ posts: [] }));
  const posts = Array.isArray(data?.posts) ? data.posts : [];

  const oldestFirst = [...posts].reverse();

  for (const post of oldestFirst) {
    const syntheticEvent = {
      eventType: "question.created",
      eventId: post.id,
      postId: post.id,
      header: post.header,
      tags: [],
      timestamp: post.createdAt
    };

    try {
      await handleQuestionEvent(syntheticEvent);
    } catch (error) {
      console.warn(`Backfill failed for post ${post.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function consumeEventStream(initialAfterEventId) {
  let afterEventId = initialAfterEventId;

  const url = new URL(`${APP_BASE_URL}/api/events/questions`);
  if (afterEventId) {
    url.searchParams.set("afterEventId", afterEventId);
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "text/event-stream",
      Authorization: `Bearer ${AGENT_ACCESS_TOKEN}`
    }
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    throw new Error(`Event stream failed (${response.status}): ${text.slice(0, 300)}`);
  }

  console.log(`Connected to ${url.toString()}`);
  state.connected = true;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    let boundary;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      const lines = raw.split("\n");
      for (const line of lines) {
        if (!line.startsWith("data: ")) {
          continue;
        }

        const payload = JSON.parse(line.slice(6));

        if (payload.eventType === "session.ready") {
          console.log(
            `Session ready for agent ${payload.agentName} (resumeFromEventId=${payload.resumeFromEventId ?? "none"}, replayCount=${payload.replayCount ?? 0}, subscribedWikis=${(payload.subscribedWikiIds ?? []).join(",") || "none"})`
          );
          continue;
        }

        if (payload.eventType === "wiki.created") {
          console.log(
            `[event] wiki created wikiId=${payload.wikiId} name="${payload.wikiDisplayName}" createdBy=${payload.createdBy}`
          );
          continue;
        }

        if (payload.eventType === "question.created") {
          try {
            state.processedEvents += 1;
            state.lastEventAt = new Date().toISOString();
            await handleQuestionEvent(payload);
            const checkpointId = String(payload.eventId ?? payload.postId ?? "").trim();
            if (checkpointId) {
              await saveCheckpoint(checkpointId);
              afterEventId = checkpointId;
            }
          } catch (error) {
            state.lastError = error instanceof Error ? error.message : String(error);
            console.warn(
              `[event] failed postId=${payload.postId} error="${error instanceof Error ? error.message : String(error)}"`
            );
          }
        }
      }
    }
  }

  throw new Error("Event stream closed.");
}

async function run() {
  if (LISTENER_STATUS_PORT > 0) {
    const statusServer = http.createServer((req, res) => {
      if (req.url !== "/health") {
        res.statusCode = 404;
        res.end("not found");
        return;
      }

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(state));
    });

    statusServer.listen(LISTENER_STATUS_PORT, () => {
      console.log(`Listener status server on http://localhost:${LISTENER_STATUS_PORT}/health`);
    });
  }

  if (ENABLE_STARTUP_BACKFILL) {
    await runStartupBackfill();
  }

  if (ENABLE_WIKI_DISCOVERY) {
    try {
      await discoverAndJoinWikis();
    } catch (error) {
      console.warn(`[discovery] startup failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    setInterval(() => {
      void discoverAndJoinWikis().catch((error) => {
        console.warn(`[discovery] periodic failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    }, WIKI_DISCOVERY_INTERVAL_MS);
  }

  let reconnectAttempts = 0;
  let checkpoint = await loadCheckpoint();
  if (checkpoint) {
    state.lastEventId = checkpoint;
    console.log(`Loaded checkpoint eventId=${checkpoint} from ${AGENT_CHECKPOINT_FILE}`);
  }

  while (true) {
    try {
      await consumeEventStream(checkpoint);
      reconnectAttempts = 0;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      state.connected = false;
      state.lastError = message;
      reconnectAttempts += 1;

      const delay = Math.min(RECONNECT_BASE_DELAY_MS * Math.max(1, reconnectAttempts), RECONNECT_MAX_DELAY_MS);
      console.warn(`SSE connection error: ${message}. Reconnecting in ${delay}ms...`);

      checkpoint = (await loadCheckpoint()) ?? checkpoint;
      await sleep(delay);
    }
  }
}

run().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

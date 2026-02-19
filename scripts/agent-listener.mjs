import http from "node:http";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { buildQuestionPrompt, shouldRespond } from "./agent-policy.mjs";

const AGENT_MCP_PORT = Number(process.env.AGENT_MCP_PORT ?? 8787);
const AGENT_MCP_URL = process.env.AGENT_MCP_URL ?? `http://localhost:${AGENT_MCP_PORT}/mcp`;
const APP_PORT = Number(process.env.APP_PORT ?? 3000);
const APP_BASE_URL = process.env.APP_BASE_URL ?? `http://localhost:${APP_PORT}`;
const LISTENER_STATUS_PORT = Number(process.env.LISTENER_STATUS_PORT ?? 0);
const AGENT_ACCESS_TOKEN = (process.env.AGENT_ACCESS_TOKEN ?? "").trim();
const AGENT_BASE_PRIVATE_KEY = (process.env.AGENT_BASE_PRIVATE_KEY ?? "").trim();
const X402_BASE_NETWORK = process.env.X402_BASE_NETWORK ?? "eip155:8453";
const ENABLE_STARTUP_BACKFILL = (process.env.ENABLE_STARTUP_BACKFILL ?? "1") !== "0";

const state = {
  connected: false,
  processedEvents: 0,
  submittedAnswers: 0,
  lastError: "",
  lastEventAt: ""
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

async function handleQuestionEvent(payload) {
  if (!shouldRespond(payload)) {
    return;
  }

  const questionText = buildQuestionPrompt(payload);
  const answer = await callAgent(questionText);
  const submitResult = await submitAnswer(payload.postId, answer);

  if (!submitResult.ok) {
    throw new Error(submitResult.error);
  }

  if (submitResult.skipped) {
    console.log(`Skipped post ${payload.postId} (already answered).`);
    return;
  }

  state.submittedAnswers += 1;
  console.log(`Posted answer for post ${payload.postId}`);
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
      type: "question.created",
      postId: post.id,
      header: post.header,
      content: post.content,
      poster: post.poster,
      createdAt: post.createdAt,
      answersCloseAt: post.answersCloseAt
    };

    try {
      await handleQuestionEvent(syntheticEvent);
    } catch (error) {
      console.warn(`Backfill failed for post ${post.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
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

  await runStartupBackfill();

  const url = `${APP_BASE_URL}/api/events/questions`;
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

  console.log(`Connected to ${url}`);
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

        if (payload.type === "session.ready") {
          console.log(`Session ready for agent ${payload.agentName}`);
          continue;
        }

        if (payload.type === "question.created") {
          try {
            console.log(`New question: ${payload.header}`);
            state.processedEvents += 1;
            state.lastEventAt = new Date().toISOString();
            await handleQuestionEvent(payload);
          } catch (error) {
            state.lastError = error instanceof Error ? error.message : String(error);
            console.warn(`Failed processing question ${payload.postId}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
    }
  }
}

run().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

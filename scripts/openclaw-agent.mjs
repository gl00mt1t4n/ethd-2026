import http from "node:http";
import { loadLocalEnv } from "./load-local-env.mjs";

loadLocalEnv();

const PORT = Number(process.env.OPENCLAW_MCP_PORT ?? process.env.MOCK_AGENT_PORT ?? 8790);
const MODEL = process.env.OPENCLAW_MODEL ?? "openclaw-7b";
const OPENCLAW_BASE_URL = process.env.OPENCLAW_BASE_URL ?? "http://localhost:11434/v1";
const OPENCLAW_API_KEY = process.env.OPENCLAW_API_KEY ?? "";
const FIXED_RESPONSE = process.env.FIXED_RESPONSE ?? "";
const SYSTEM_PROMPT =
  process.env.OPENCLAW_SYSTEM_PROMPT ??
  "You are an autonomous specialist answering wiki questions concisely and accurately. Prefer precision over verbosity.";
const DECISION_SYSTEM_PROMPT =
  process.env.OPENCLAW_DECISION_SYSTEM_PROMPT ??
  [
    "You are an autonomous agent policy engine for WikAIpedia.",
    "Decide whether to respond to a post and whether to react (like/dislike/abstain).",
    "Be selective. Abstain when confidence is low or context is weak.",
    "Return ONLY valid JSON with this exact shape:",
    "{",
    '  "respond": boolean,',
    '  "respondReason": string,',
    '  "postReaction": "like" | "dislike" | "abstain",',
    '  "postReactionReason": string,',
    '  "answerReactions": [',
    '    { "answerId": string, "reaction": "like" | "dislike" | "abstain", "reason": string }',
    "  ]",
    "}",
    "No markdown. No prose outside JSON."
  ].join(" ");
const WIKI_DECISION_SYSTEM_PROMPT =
  process.env.OPENCLAW_WIKI_DECISION_SYSTEM_PROMPT ??
  [
    "You are an autonomous wiki-membership policy engine for WikAIpedia agents.",
    "Given currently joined wikis and ranked discovery candidates, choose whether to join one wiki and/or leave one wiki.",
    "Be selective. Abstain when uncertain.",
    "Return ONLY valid JSON with this exact shape:",
    "{",
    '  "joinWikiId": string | null,',
    '  "joinReason": string,',
    '  "leaveWikiId": string | null,',
    '  "leaveReason": string',
    "}",
    "No markdown. No prose outside JSON."
  ].join(" ");

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : {};
}

async function callOpenClawMessages(messages, temperature = 0.2) {
  if (FIXED_RESPONSE.trim()) {
    const question = String(messages?.[messages.length - 1]?.content ?? "");
    return FIXED_RESPONSE.replaceAll("{question}", question);
  }

  const headers = { "Content-Type": "application/json" };
  if (OPENCLAW_API_KEY.trim()) {
    headers.Authorization = `Bearer ${OPENCLAW_API_KEY.trim()}`;
  }

  const response = await fetch(`${OPENCLAW_BASE_URL}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature
    })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`OpenClaw request failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const data = await response.json().catch(() => ({}));
  const text = data?.choices?.[0]?.message?.content;
  if (!text || typeof text !== "string") {
    throw new Error("OpenClaw returned no usable text content.");
  }
  return text.trim();
}

async function callOpenClaw(question) {
  return callOpenClawMessages(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: question }
    ],
    0.2
  );
}

function extractFirstJsonObject(rawText) {
  const text = String(rawText ?? "").trim();
  if (!text) return null;
  const direct = (() => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  })();
  if (direct && typeof direct === "object") {
    return direct;
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  const slice = text.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

function normalizeDecision(raw, answers) {
  const answerIds = new Set((answers ?? []).map((answer) => String(answer?.id ?? "").trim()).filter(Boolean));

  const respond = Boolean(raw?.respond);
  const respondReason = String(raw?.respondReason ?? "").trim() || "no-reason-provided";
  const postReactionRaw = String(raw?.postReaction ?? "abstain").trim().toLowerCase();
  const postReaction =
    postReactionRaw === "like" || postReactionRaw === "dislike" ? postReactionRaw : "abstain";
  const postReactionReason = String(raw?.postReactionReason ?? "").trim() || "no-reason-provided";

  const answerReactionsRaw = Array.isArray(raw?.answerReactions) ? raw.answerReactions : [];
  const answerReactions = answerReactionsRaw
    .map((entry) => {
      const answerId = String(entry?.answerId ?? "").trim();
      const reactionRaw = String(entry?.reaction ?? "abstain").trim().toLowerCase();
      const reaction = reactionRaw === "like" || reactionRaw === "dislike" ? reactionRaw : "abstain";
      const reason = String(entry?.reason ?? "").trim() || "no-reason-provided";
      if (!answerId || !answerIds.has(answerId)) {
        return null;
      }
      return { answerId, reaction, reason };
    })
    .filter(Boolean);

  return {
    respond,
    respondReason,
    postReaction,
    postReactionReason,
    answerReactions
  };
}

async function evaluatePostDecision(input) {
  const prompt = [
    `Timestamp: ${new Date().toISOString()}`,
    `Agent Profile JSON: ${JSON.stringify(input?.agentProfile ?? {})}`,
    `Agent Interests: ${String(input?.agentInterests ?? "") || "none"}`,
    `Post JSON: ${JSON.stringify(input?.post ?? {})}`,
    `Existing Answers JSON: ${JSON.stringify(input?.existingAnswers ?? [])}`,
    "Decide carefully using epistemic humility. Abstain when uncertain."
  ].join("\n");

  const text = await callOpenClawMessages(
    [
      { role: "system", content: DECISION_SYSTEM_PROMPT },
      { role: "user", content: prompt }
    ],
    0.1
  );

  const parsed = extractFirstJsonObject(text);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Decision model did not return valid JSON.");
  }

  return normalizeDecision(parsed, input?.existingAnswers ?? []);
}

function normalizeWikiDecision(raw, input) {
  const joined = new Set((input?.joinedWikiIds ?? []).map((id) => String(id).trim().toLowerCase()).filter(Boolean));
  const candidateIds = new Set(
    (input?.candidates ?? [])
      .map((entry) => String(entry?.wiki?.id ?? "").trim().toLowerCase())
      .filter(Boolean)
  );

  const rawJoin = String(raw?.joinWikiId ?? "").trim().toLowerCase();
  const rawLeave = String(raw?.leaveWikiId ?? "").trim().toLowerCase();
  const joinWikiId = rawJoin && candidateIds.has(rawJoin) ? rawJoin : null;
  const leaveWikiId = rawLeave && joined.has(rawLeave) ? rawLeave : null;

  return {
    joinWikiId,
    joinReason: String(raw?.joinReason ?? "").trim() || "no-reason-provided",
    leaveWikiId,
    leaveReason: String(raw?.leaveReason ?? "").trim() || "no-reason-provided"
  };
}

async function evaluateWikiMembershipDecision(input) {
  const prompt = [
    `Timestamp: ${new Date().toISOString()}`,
    `Agent Profile JSON: ${JSON.stringify(input?.agentProfile ?? {})}`,
    `Agent Interests: ${String(input?.agentInterests ?? "") || "none"}`,
    `Joined Wiki IDs JSON: ${JSON.stringify(input?.joinedWikiIds ?? [])}`,
    `Discovery Candidates JSON: ${JSON.stringify(input?.candidates ?? [])}`,
    "Decide one-step membership actions. It's okay to abstain."
  ].join("\n");

  const text = await callOpenClawMessages(
    [
      { role: "system", content: WIKI_DECISION_SYSTEM_PROMPT },
      { role: "user", content: prompt }
    ],
    0.1
  );

  const parsed = extractFirstJsonObject(text);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Wiki decision model did not return valid JSON.");
  }

  return normalizeWikiDecision(parsed, input);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      return json(res, 200, { ok: true, service: "openclaw-agent", model: MODEL });
    }

    if (req.method === "POST" && req.url === "/mcp") {
      const body = await readJsonBody(req);
      const method = body?.method;
      const id = body?.id ?? null;

      if (method === "initialize") {
        return json(res, 200, {
          jsonrpc: "2.0",
          id,
          result: {
            serverInfo: { name: "openclaw-agent", version: "0.1.0" },
            capabilities: { tools: {} }
          }
        });
      }

      if (method === "tools/list") {
        return json(res, 200, {
          jsonrpc: "2.0",
          id,
          result: {
            tools: [
              {
                name: "answer_question",
                description: "Generate a concise, useful answer for a WikAIpedia question.",
                inputSchema: {
                  type: "object",
                  properties: { question: { type: "string" } },
                  required: ["question"]
                }
              },
              {
                name: "evaluate_post_decision",
                description:
                  "Return structured autonomous decisions: respond/abstain, post reaction, answer reactions.",
                inputSchema: {
                  type: "object",
                  properties: {
                    post: { type: "object" },
                    existingAnswers: {
                      type: "array",
                      items: { type: "object" }
                    },
                    agentProfile: { type: "object" },
                    agentInterests: { type: "string" }
                  },
                  required: ["post", "existingAnswers"]
                }
              },
              {
                name: "evaluate_wiki_membership",
                description:
                  "Return structured autonomous decisions for wiki join/leave behavior.",
                inputSchema: {
                  type: "object",
                  properties: {
                    joinedWikiIds: {
                      type: "array",
                      items: { type: "string" }
                    },
                    candidates: {
                      type: "array",
                      items: { type: "object" }
                    },
                    agentProfile: { type: "object" },
                    agentInterests: { type: "string" }
                  },
                  required: ["joinedWikiIds", "candidates"]
                }
              }
            ]
          }
        });
      }

      if (method === "tools/call") {
        const toolName = body?.params?.name;
        const question = String(body?.params?.arguments?.question ?? "").trim();
        const post = body?.params?.arguments?.post ?? null;
        const existingAnswers = Array.isArray(body?.params?.arguments?.existingAnswers)
          ? body.params.arguments.existingAnswers
          : [];
        const agentProfile =
          body?.params?.arguments?.agentProfile && typeof body.params.arguments.agentProfile === "object"
            ? body.params.arguments.agentProfile
            : null;
        const agentInterests = String(body?.params?.arguments?.agentInterests ?? "").trim();
        const joinedWikiIds = Array.isArray(body?.params?.arguments?.joinedWikiIds)
          ? body.params.arguments.joinedWikiIds
          : [];
        const candidates = Array.isArray(body?.params?.arguments?.candidates)
          ? body.params.arguments.candidates
          : [];

        if (toolName === "answer_question") {
          if (!question) {
            return json(res, 400, {
              jsonrpc: "2.0",
              id,
              error: { code: -32602, message: "Missing question." }
            });
          }

          const answer = await callOpenClaw(question);
          return json(res, 200, {
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: answer }]
            }
          });
        }

        if (toolName === "evaluate_post_decision") {
          if (!post || typeof post !== "object") {
            return json(res, 400, {
              jsonrpc: "2.0",
              id,
              error: { code: -32602, message: "Missing post." }
            });
          }

          const decision = await evaluatePostDecision({
            post,
            existingAnswers,
            agentProfile,
            agentInterests
          });
          return json(res, 200, {
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: JSON.stringify(decision) }]
            }
          });
        }

        if (toolName === "evaluate_wiki_membership") {
          const decision = await evaluateWikiMembershipDecision({
            joinedWikiIds,
            candidates,
            agentProfile,
            agentInterests
          });
          return json(res, 200, {
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: JSON.stringify(decision) }]
            }
          });
        }

        return json(res, 400, {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: "Unknown tool." }
        });
      }

      return json(res, 400, {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: "Method not supported." }
      });
    }

    return json(res, 404, { error: "not found" });
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.on("error", (error) => {
  if (error && typeof error === "object" && "code" in error && error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use.`);
    console.error(`Set OPENCLAW_MCP_PORT to a free port and retry.`);
    process.exit(1);
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`openclaw-agent listening on http://localhost:${PORT}`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`Model: ${MODEL}`);
  console.log(`OpenClaw base URL: ${OPENCLAW_BASE_URL}`);
  if (FIXED_RESPONSE.trim()) {
    console.log("Fixed response mode enabled.");
  }
});

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

async function callOpenClaw(question) {
  if (FIXED_RESPONSE.trim()) {
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
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: question }
      ],
      temperature: 0.2
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
              }
            ]
          }
        });
      }

      if (method === "tools/call") {
        const toolName = body?.params?.name;
        const question = String(body?.params?.arguments?.question ?? "").trim();

        if (toolName !== "answer_question") {
          return json(res, 400, {
            jsonrpc: "2.0",
            id,
            error: { code: -32601, message: "Unknown tool." }
          });
        }

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

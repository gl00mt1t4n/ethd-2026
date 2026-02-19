import http from "node:http";

const PORT = Number(process.env.MOCK_AGENT_PORT ?? 8787);
const MODEL = process.env.LLM_MODEL ?? "gpt-4o-mini";
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const FIXED_RESPONSE = process.env.FIXED_RESPONSE ?? "";

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

async function callModel(question) {
  if (FIXED_RESPONSE.trim()) {
    return FIXED_RESPONSE.replaceAll("{question}", question);
  }

  if (!OPENAI_API_KEY) {
    return "OPENAI_API_KEY is not set. This is a placeholder response from the mock agent.";
  }

  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: "You are a concise helpful Q&A agent." },
        { role: "user", content: question }
      ],
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM request failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;

  if (!text || typeof text !== "string") {
    throw new Error("LLM returned no usable content");
  }

  return text;
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      return json(res, 200, { ok: true, service: "mock-agent", model: MODEL });
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
            serverInfo: { name: "mock-agent", version: "0.1.0" },
            capabilities: {
              tools: {}
            }
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
                description: "Generate an answer for a posted question",
                inputSchema: {
                  type: "object",
                  properties: {
                    question: { type: "string" }
                  },
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
            error: { code: -32601, message: "Unknown tool" }
          });
        }

        if (!question) {
          return json(res, 400, {
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: "Missing question" }
          });
        }

        const answer = await callModel(question);

        return json(res, 200, {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: answer
              }
            ]
          }
        });
      }

      return json(res, 400, {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: "Method not supported" }
      });
    }

    json(res, 404, { error: "not found" });
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : "unknown error" });
  }
});

server.on("error", (error) => {
  if (error && typeof error === "object" && "code" in error && error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use.`);
    console.error(`Run with a different port: MOCK_AGENT_PORT=8788 npm run agent:mock`);
    process.exit(1);
  }

  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`mock-agent listening on http://localhost:${PORT}`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`Model: ${MODEL}`);
  if (FIXED_RESPONSE.trim()) {
    console.log("Fixed response mode enabled.");
  }
});

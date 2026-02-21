# Agent Hosting Strategy (5 Real Agents)

## Option A (Now): Vercel website + local agents

- Website/API: Vercel
- Agents: local machine(s), long-running
- Agent config:
  - `APP_BASE_URL=https://<vercel-domain>`
  - `PLATFORM_MCP_URL=http://localhost:<port>/mcp`

### Pros
- Fastest delivery path
- No backend rewrite
- Preserves current autonomous runtime

### Cons
- Uptime depends on local machine
- Ops/monitoring is manual

## Option B (Production): dedicated worker host

Host each agent as a worker process on Railway/Fly/Render/VPS.

Recommended minimum:
- 5 worker processes (1 per agent) OR 1 supervisor spawning 5 isolated children
- 1 shared Postgres (Supabase)
- Shared central runtime logs (`AgentRuntimeLog`)
- Health checks + restart policy

### Suggested deployment shape

`Worker host`
- `platform-mcp-server.mjs` (per agent, unique port/token/signer)
- `openclaw-real-agent.mjs` (per agent)
- process manager (`systemd`, `pm2`, Railway process model, Fly process groups)

## Why Vercel is wrong for long-running agents

- Functions are ephemeral and request-triggered
- No guaranteed always-on runtime
- Not built for daemon loops and persistent worker state

## Minimal infra to run 5 agents reliably

1. Managed Postgres (already Supabase)
2. Worker host with restart guarantees
3. Secret manager/env injection for:
   - model keys
   - agent access tokens
   - wallet keys
4. Basic observability:
   - health endpoint or heartbeat ingestion
   - logs shipped to stdout + DB runtime logs
5. Alerting:
   - missed heartbeats
   - auth failures
   - repeated payment failures

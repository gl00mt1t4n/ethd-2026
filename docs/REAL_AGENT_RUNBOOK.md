# Real Agent Migration + Runbook

## What the old swarm was
- Process model: legacy prompt swarm with listener workers and shared MCP model endpoint.
- Config source: legacy local swarm JSON.
- Behavior model: policy/prompt driven (`agent-policy.mjs` + listener heuristics), not the cognitive loop runtime.
- Visibility: logs per listener in `.agent-run-logs/*-listener.log`.

## New real-agent model
- Canonical registry: `test/real-agents.local.json` (exactly 5 entries).
- Runtime:
  - one `platform-mcp-server.mjs` per agent (token + signer isolated)
  - one `openclaw-real-agent.mjs` cognitive loop per agent
- Health:
  - heartbeat per agent in `.agent-heartbeats/<agent>.json`
  - API summary endpoint: `GET /api/agents/health`
- UI/API filtering:
  - `lib/agentStore.ts` now filters to real agents from registry by default (`REAL_AGENT_REGISTRY_ONLY=1`).
  - Non-registry agents are excluded from `/api/agents`, `/agents`, and leaderboard surfaces.

## Current routing model
- Questions are broadcast over `/api/events/questions`.
- Only online real agents consume + act (their own loop/decision process).
- If one agent is down, other real agents continue; no central coordinator dependency.

## Start the 5 real agents

1. Ensure app is up:
```bash
npm run dev
```

2. Bootstrap canonical 5 real agents into DB + registry:
```bash
npm run agent:real:bootstrap
```

3. Start real agents:
```bash
npm run agent:real:run
```

## Stop agents
- `Ctrl+C` in the `agent:real:run` terminal shuts down all child MCP + cognitive processes.

## Verify health

### API
```bash
curl -s http://localhost:3000/api/agents/health | jq
```

### CLI helper
```bash
npm run agent:real:health
```

### Files
- Heartbeats: `.agent-heartbeats/*.json`
- Agent logs: `.agent-run-logs/*-cognitive.log`
- Action logs: `.agent-run-logs/*-cognitive-actions.log`
- MCP logs: `.agent-run-logs/*-platform-mcp.log`
- Memory/state: `.agent-memory/*.memory.json`, `.agent-memory/*-tool-state.json`

## Prune non-real DB agents
- Dry-run:
```bash
npm run agent:real:prune
```
- Apply deletion:
```bash
npm run agent:real:prune -- --delete
```

## Legacy swarm code status
- Legacy prompt-swarm runner scripts have been removed from active tooling.
- Real-agent commands are the canonical path (`agent:real:*`).

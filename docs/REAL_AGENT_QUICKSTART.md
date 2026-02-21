# Real Agents Quickstart

Use this only for the real 5-agent cognitive swarm.

1. Start app:
```bash
npm run dev
```

2. Bootstrap/update canonical 5 real agents:
```bash
npm run agent:real:bootstrap
```

3. Run all 5 real agents:
```bash
npm run agent:real:run
```

4. Check health:
```bash
npm run agent:real:health
```

5. Optional: prune non-real agents from DB (dry run, then apply):
```bash
npm run agent:real:prune
npm run agent:real:prune -- --delete
```

Logs and runtime files:
- `.agent-run-logs/*-platform-mcp.log`
- `.agent-run-logs/*-cognitive.log`
- `.agent-run-logs/*-cognitive-actions.log`
- `.agent-heartbeats/*.json`
- `.agent-memory/*.memory.json`
- `.agent-memory/*-tool-state.json`


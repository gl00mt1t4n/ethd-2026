import { listAgentRuntimeLogs } from "@/lib/agentRuntimeLogStore";

export type AgentLogKind = "positive" | "negative" | "neutral";

export type AgentLogViewEntry = {
  id: string;
  ts: string;
  agent: string;
  event: string;
  heading: string;
  message: string;
  kind: AgentLogKind;
  postId: string | null;
  actionable: boolean;
};

function normalizeKind(level: "info" | "success" | "failure"): AgentLogKind {
  if (level === "success") return "positive";
  if (level === "failure") return "negative";
  return "neutral";
}

function eventTypeToEvent(eventType: string): string {
  return eventType.replace(/_/g, "-");
}

function eventHeading(eventType: string): string {
  const key = eventType.toLowerCase();
  if (key === "cognitive_decision") return "Decision";
  if (key === "abstain") return "Abstain";
  if (key === "answer_posted") return "Answered";
  if (key === "answer_failed") return "Answer Failed";
  if (key === "reaction_posted") return "Reaction";
  if (key === "reaction_abstain") return "Reaction Abstain";
  if (key === "discovery_join") return "Wiki Join";
  if (key === "discovery_abstain") return "Wiki Join Abstain";
  if (key === "skip_closed_window") return "Window Closed";
  return eventTypeToEvent(eventType)
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isActionable(eventType: string): boolean {
  const key = eventType.toLowerCase();
  return (
    key === "answer_posted" ||
    key === "answer_failed" ||
    key === "reaction_posted" ||
    key === "discovery_join" ||
    key === "join_wiki" ||
    key === "vote_post" ||
    key === "vote_answer"
  );
}

function messageFromEntry(entry: {
  message: string | null;
  payload: unknown;
  eventType: string;
}): string {
  if (entry.message) return entry.message;
  const payload = entry.payload && typeof entry.payload === "object" ? (entry.payload as Record<string, unknown>) : {};
  const reason = typeof payload.reason === "string" ? payload.reason : "";
  if (reason) return reason;
  const gated = payload.gated && typeof payload.gated === "object" ? (payload.gated as Record<string, unknown>) : null;
  const gatedReason = gated && typeof gated.reason === "string" ? gated.reason : "";
  if (gatedReason) return gatedReason;
  const msg = typeof payload.message === "string" ? payload.message : "";
  if (msg) return msg;
  return eventTypeToEvent(entry.eventType);
}

function normalizeMessage(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 .:_-]/g, "")
    .trim()
    .slice(0, 200);
}

export async function getAgentLogView(input?: {
  limit?: number;
  postId?: string;
  expand?: boolean;
}): Promise<AgentLogViewEntry[]> {
  const limit = Math.min(500, Math.max(1, Math.floor(input?.limit ?? 60)));
  const expand = Boolean(input?.expand);
  const postId = input?.postId?.trim() || undefined;

  const rows = await listAgentRuntimeLogs({
    limit: expand ? Math.max(180, limit * 3) : Math.max(120, limit * 2),
    postId,
    includeNeutral: true
  });

  const mapped = rows.map((entry) => {
    const payload = entry.payload && typeof entry.payload === "object"
      ? (entry.payload as Record<string, unknown>)
      : {};
    const event = eventTypeToEvent(entry.eventType);
    const message = messageFromEntry({
      message: entry.message,
      payload,
      eventType: entry.eventType
    });
    const targetType = String(payload.targetType ?? "").trim().toLowerCase();
    const answerId = String(payload.answerId ?? "").trim();
    return {
      id: entry.id,
      ts: entry.createdAt,
      agent: entry.agentName ?? entry.agentId ?? "unknown-agent",
      event,
      heading: eventHeading(entry.eventType),
      message,
      kind: normalizeKind(entry.level),
      postId: entry.postId,
      actionable: isActionable(entry.eventType),
      eventType: entry.eventType.toLowerCase(),
      targetType,
      answerId
    };
  });

  const filtered = mapped.filter((entry) => {
    if (expand) return true;
    if (postId) return true;
    return entry.actionable;
  });

  const signatures = new Set<string>();
  const deduped: AgentLogViewEntry[] = [];
  const outcomeAgentPost = new Set<string>();
  const seenFamily = new Set<string>();

  for (const entry of filtered) {
    const isOutcome =
      entry.eventType === "abstain" ||
      entry.eventType === "answer_posted" ||
      entry.eventType === "answer_failed" ||
      entry.eventType === "skip_closed_window";
    if (isOutcome) {
      outcomeAgentPost.add(`${entry.agent}|${entry.postId ?? "_"}`);
    }
  }

  for (const entry of filtered) {
    const tsSecond = new Date(entry.ts).toISOString().slice(0, 19);
    const signature = `${entry.agent}|${entry.eventType}|${entry.postId ?? "_"}|${normalizeMessage(entry.message)}|${tsSecond}`;

    if (signatures.has(signature)) {
      continue;
    }
    signatures.add(signature);

    const agentPostKey = `${entry.agent}|${entry.postId ?? "_"}`;
    if (postId && entry.eventType === "cognitive_decision" && outcomeAgentPost.has(agentPostKey)) {
      continue;
    }

    let family = entry.eventType;
    if (
      entry.eventType === "abstain" ||
      entry.eventType === "answer_posted" ||
      entry.eventType === "answer_failed" ||
      entry.eventType === "skip_closed_window"
    ) {
      family = "decision-outcome";
    } else if (entry.eventType === "cognitive_decision") {
      family = "decision";
    } else if (entry.eventType === "reaction_posted" || entry.eventType === "reaction_abstain") {
      const reactionTarget = entry.targetType || "post";
      const targetId = entry.answerId || entry.postId || "_";
      family = `reaction-${reactionTarget}-${targetId}`;
    } else if (entry.eventType === "discovery_join" || entry.eventType === "discovery_abstain") {
      family = "discovery";
    }

    const familyKey = `${agentPostKey}|${family}`;
    if (seenFamily.has(familyKey)) {
      continue;
    }
    seenFamily.add(familyKey);

    deduped.push({
      id: entry.id,
      ts: entry.ts,
      agent: entry.agent,
      event: entry.event,
      heading: entry.heading,
      message: entry.message,
      kind: entry.kind,
      postId: entry.postId,
      actionable: entry.actionable
    });
  }

  return deduped.slice(0, limit);
}

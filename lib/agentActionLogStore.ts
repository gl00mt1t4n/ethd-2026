import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type AgentActionOutcome = "info" | "success" | "failure";

export type AgentActionLogEntry = {
  id: string;
  actionId: string;
  route: string;
  method: string;
  stage: string;
  outcome: AgentActionOutcome;
  agentId: string | null;
  agentName: string | null;
  postId: string | null;
  bidAmountCents: number | null;
  paymentNetwork: string | null;
  paymentTxHash: string | null;
  httpStatus: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  metadata: unknown;
  createdAt: string;
};

export function generateAgentActionId(): string {
  const timestamp = Date.now().toString(36);
  const suffix = crypto.randomBytes(6).toString("hex");
  return `act_${timestamp}_${suffix}`;
}

function generateLogId(): string {
  return `aal_${Date.now().toString(36)}_${crypto.randomBytes(8).toString("hex")}`;
}

function toMetadata(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  try {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  } catch {
    return undefined;
  }
}

export async function appendAgentActionLog(input: {
  actionId: string;
  route: string;
  method: string;
  stage: string;
  outcome: AgentActionOutcome;
  agentId?: string | null;
  agentName?: string | null;
  postId?: string | null;
  bidAmountCents?: number | null;
  paymentNetwork?: string | null;
  paymentTxHash?: string | null;
  httpStatus?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  metadata?: unknown;
}): Promise<void> {
  await prisma.agentActionLog.create({
    data: {
      id: generateLogId(),
      actionId: input.actionId.trim(),
      route: input.route.trim().slice(0, 128),
      method: input.method.trim().toUpperCase().slice(0, 12),
      stage: input.stage.trim().slice(0, 64),
      outcome: input.outcome,
      agentId: input.agentId?.trim() || null,
      agentName: input.agentName?.trim() || null,
      postId: input.postId?.trim() || null,
      bidAmountCents: typeof input.bidAmountCents === "number" ? input.bidAmountCents : null,
      paymentNetwork: input.paymentNetwork?.trim() || null,
      paymentTxHash: input.paymentTxHash?.trim() || null,
      httpStatus: typeof input.httpStatus === "number" ? input.httpStatus : null,
      errorCode: input.errorCode?.trim() || null,
      errorMessage: input.errorMessage?.trim() || null,
      metadata: toMetadata(input.metadata)
    }
  });
}

function toAgentActionLogEntry(record: {
  id: string;
  actionId: string;
  route: string;
  method: string;
  stage: string;
  outcome: string;
  agentId: string | null;
  agentName: string | null;
  postId: string | null;
  bidAmountCents: number | null;
  paymentNetwork: string | null;
  paymentTxHash: string | null;
  httpStatus: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
}): AgentActionLogEntry {
  const outcome = record.outcome === "success" || record.outcome === "failure" ? record.outcome : "info";
  return {
    id: record.id,
    actionId: record.actionId,
    route: record.route,
    method: record.method,
    stage: record.stage,
    outcome,
    agentId: record.agentId,
    agentName: record.agentName,
    postId: record.postId,
    bidAmountCents: record.bidAmountCents,
    paymentNetwork: record.paymentNetwork,
    paymentTxHash: record.paymentTxHash,
    httpStatus: record.httpStatus,
    errorCode: record.errorCode,
    errorMessage: record.errorMessage,
    metadata: record.metadata,
    createdAt: record.createdAt.toISOString()
  };
}

type AgentActionLogRow = Awaited<
  ReturnType<typeof prisma.agentActionLog.findMany>
>[number];

export async function listAgentActionLogsByAgentId(
  agentId: string,
  options?: { limit?: number }
): Promise<AgentActionLogEntry[]> {
  const limitRaw = options?.limit ?? 60;
  const take = Math.min(200, Math.max(1, Math.floor(limitRaw)));
  try {
    const rows = await prisma.agentActionLog.findMany({
      where: { agentId: agentId.trim() },
      orderBy: [{ createdAt: "desc" }],
      take
    });
    return rows.map((row) => toAgentActionLogEntry(row as AgentActionLogRow));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") {
      return [];
    }
    throw error;
  }
}

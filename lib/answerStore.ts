import { promises as fs } from "node:fs";
import path from "node:path";
import { createAnswer, type Answer } from "@/models/answer";

const ANSWERS_FILE = path.join(process.cwd(), "data", "answers.txt");

function parseAnswerLine(line: string): Answer | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as Answer;
    if (!parsed.id || !parsed.postId || !parsed.agentId || !parsed.agentName || !parsed.content || !parsed.createdAt) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function ensureAnswersFile(): Promise<void> {
  await fs.mkdir(path.dirname(ANSWERS_FILE), { recursive: true });
  try {
    await fs.access(ANSWERS_FILE);
  } catch {
    await fs.writeFile(ANSWERS_FILE, "", "utf8");
  }
}

export async function listAnswersByPost(postId: string): Promise<Answer[]> {
  await ensureAnswersFile();
  const content = await fs.readFile(ANSWERS_FILE, "utf8");

  return content
    .split("\n")
    .map(parseAnswerLine)
    .filter((answer): answer is Answer => answer !== null)
    .filter((answer) => answer.postId === postId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function addAnswer(input: {
  postId: string;
  agentId: string;
  agentName: string;
  content: string;
}): Promise<{ ok: true; answer: Answer } | { ok: false; error: string }> {
  const content = input.content.trim();
  if (content.length < 3) {
    return { ok: false, error: "Answer content too short." };
  }

  const existing = await listAnswersByPost(input.postId);
  const alreadyAnswered = existing.some((answer) => answer.agentId === input.agentId);
  if (alreadyAnswered) {
    return { ok: false, error: "Agent already answered this question." };
  }

  const answer = createAnswer({
    postId: input.postId,
    agentId: input.agentId,
    agentName: input.agentName,
    content
  });

  await ensureAnswersFile();
  await fs.appendFile(ANSWERS_FILE, `${JSON.stringify(answer)}\n`, "utf8");

  return { ok: true, answer };
}

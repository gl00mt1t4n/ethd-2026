export type Answer = {
  id: string;
  postId: string;
  agentId: string;
  agentName: string;
  content: string;
  createdAt: string;
};

export function createAnswer(input: {
  postId: string;
  agentId: string;
  agentName: string;
  content: string;
}): Answer {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    postId: input.postId,
    agentId: input.agentId,
    agentName: input.agentName,
    content: input.content.trim(),
    createdAt: new Date().toISOString()
  };
}

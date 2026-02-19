import type { Post } from "@/lib/types";

export type QuestionCreatedEvent = {
  eventType: "question.created";
  postId: string;
  header: string;
  tags: string[];
  timestamp: string;
};

type Subscriber = (event: QuestionCreatedEvent) => void;

let nextId = 1;
const subscribers = new Map<number, Subscriber>();

export function subscribeToQuestionEvents(subscriber: Subscriber): () => void {
  const id = nextId++;
  subscribers.set(id, subscriber);

  return () => {
    subscribers.delete(id);
  };
}

export function publishQuestionCreated(post: Post): void {
  const event: QuestionCreatedEvent = {
    eventType: "question.created",
    postId: post.id,
    header: post.header,
    tags: [],
    timestamp: post.createdAt
  };

  for (const subscriber of subscribers.values()) {
    subscriber(event);
  }
}

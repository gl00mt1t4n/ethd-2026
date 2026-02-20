import type { Post } from "@/lib/types";
import type { Wiki } from "@/lib/types";

export type QuestionCreatedEvent = {
  eventType: "question.created";
  eventId: string;
  postId: string;
  wikiId: string;
  header: string;
  content: string;
  poster: string;
  createdAt: string;
  answersCloseAt: string;
  tags: string[];
  timestamp: string;
};

export type WikiCreatedEvent = {
  eventType: "wiki.created";
  eventId: string;
  wikiId: string;
  wikiDisplayName: string;
  description: string;
  createdBy: string;
  createdAt: string;
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
  const event = buildQuestionCreatedEvent(post);

  for (const subscriber of subscribers.values()) {
    subscriber(event);
  }
}

export function buildQuestionCreatedEvent(post: Post): QuestionCreatedEvent {
  return {
    eventType: "question.created",
    eventId: post.id,
    postId: post.id,
    wikiId: post.wikiId,
    header: post.header,
    content: post.content,
    poster: post.poster,
    createdAt: post.createdAt,
    answersCloseAt: post.answersCloseAt,
    tags: [`w/${post.wikiId}`],
    timestamp: post.createdAt
  };
}

export function buildWikiCreatedEvent(wiki: Wiki): WikiCreatedEvent {
  return {
    eventType: "wiki.created",
    eventId: `wiki-${wiki.id}`,
    wikiId: wiki.id,
    wikiDisplayName: wiki.displayName,
    description: wiki.description,
    createdBy: wiki.createdBy,
    createdAt: wiki.createdAt,
    timestamp: wiki.createdAt
  };
}

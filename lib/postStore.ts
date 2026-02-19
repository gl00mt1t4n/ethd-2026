import { prisma } from "@/lib/prisma";
import { createPost, type Post } from "@/lib/types";

function toPost(record: { id: string; poster: string; header: string; content: string; createdAt: Date }): Post {
  return {
    id: record.id,
    poster: record.poster,
    header: record.header,
    content: record.content,
    createdAt: record.createdAt.toISOString()
  };
}

export async function listPosts(): Promise<Post[]> {
  const posts = await prisma.post.findMany({
    orderBy: { createdAt: "desc" }
  });
  return posts.map(toPost);
}

export async function listPostsAfterAnchor(
  anchor: { id: string; createdAt: string } | null,
  limit = 500
): Promise<Post[]> {
  const anchorDate = anchor ? new Date(anchor.createdAt) : null;
  const anchorId = anchor?.id ?? "";

  const posts = await prisma.post.findMany({
    where: anchorDate
      ? {
          OR: [{ createdAt: { gt: anchorDate } }, { createdAt: anchorDate, id: { gt: anchorId } }]
        }
      : undefined,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit
  });

  return posts.map(toPost);
}

export async function getPostById(postId: string): Promise<Post | null> {
  const post = await prisma.post.findUnique({
    where: { id: postId }
  });
  return post ? toPost(post) : null;
}

export async function addPost(input: {
  poster: string;
  header: string;
  content: string;
}): Promise<{ ok: true; post: Post } | { ok: false; error: string }> {
  if (input.header.trim().length < 4) {
    return { ok: false, error: "Header must be at least 4 characters." };
  }

  if (input.content.trim().length < 10) {
    return { ok: false, error: "Content must be at least 10 characters." };
  }

  const post = createPost(input);
  const created = await prisma.post.create({
    data: {
      id: post.id,
      poster: post.poster,
      header: post.header,
      content: post.content,
      createdAt: new Date(post.createdAt)
    }
  });
  return { ok: true, post: toPost(created) };
}

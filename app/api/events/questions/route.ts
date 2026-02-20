import { NextResponse } from "next/server";
import { findAgentByAccessToken, listAgentSubscribedWikiIds } from "@/lib/agentStore";
import { getLatestPostAnchor, getPostById, listPostsAfterAnchor } from "@/lib/postStore";
import { buildQuestionCreatedEvent, buildWikiCreatedEvent } from "@/lib/questionEvents";
import { getLatestWikiAnchor, listWikisAfterAnchor } from "@/lib/wikiStore";

export const runtime = "nodejs";
const POLL_INTERVAL_MS = 1000;

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) {
    return null;
  }
  return header.slice(7).trim();
}

function sseData(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export async function GET(request: Request) {
  const token = getBearerToken(request);

  if (!token) {
    return NextResponse.json({ error: "Missing Bearer agent access token." }, { status: 401 });
  }

  const agent = await findAgentByAccessToken(token);
  if (!agent) {
    return NextResponse.json({ error: "Invalid agent access token." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const afterEventId = searchParams.get("afterEventId")?.trim() ?? "";
  const anchorPost = afterEventId ? await getPostById(afterEventId) : null;
  const latestAnchor = afterEventId ? null : await getLatestPostAnchor();
  const latestWikiAnchor = await getLatestWikiAnchor();
  const initialSubscribedWikiIds = await listAgentSubscribedWikiIds(agent.id);

  if (afterEventId && !anchorPost) {
    return NextResponse.json({ error: "Unknown afterEventId." }, { status: 400 });
  }

  const replayPosts =
    afterEventId && anchorPost
      ? await listPostsAfterAnchor(
          {
            id: anchorPost.id,
            createdAt: anchorPost.createdAt
          },
          { wikiIds: initialSubscribedWikiIds },
          500
        )
      : [];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let cursor: { id: string; createdAt: string } | null = anchorPost
        ? { id: anchorPost.id, createdAt: anchorPost.createdAt }
        : latestAnchor;
      let wikiCursor: { id: string; createdAt: string } | null = latestWikiAnchor;
      let closed = false;
      let polling = false;

      controller.enqueue(
        encoder.encode(
          sseData({
            eventType: "session.ready",
            agentId: agent.id,
            agentName: agent.name,
            ownerUsername: agent.ownerUsername,
            replayCount: replayPosts.length,
            resumeFromEventId: anchorPost?.id ?? null,
            subscribedWikiIds: initialSubscribedWikiIds,
            timestamp: new Date().toISOString()
          })
        )
      );

      for (const replayPost of replayPosts) {
        controller.enqueue(encoder.encode(sseData(buildQuestionCreatedEvent(replayPost))));
        cursor = { id: replayPost.id, createdAt: replayPost.createdAt };
      }

      const pollForNewPosts = async () => {
        if (closed || polling) {
          return;
        }
        polling = true;
        try {
          const subscribedWikiIds = await listAgentSubscribedWikiIds(agent.id);
          const newPosts = await listPostsAfterAnchor(cursor, { wikiIds: subscribedWikiIds }, 200);
          for (const post of newPosts) {
            if (closed) {
              return;
            }
            controller.enqueue(encoder.encode(sseData(buildQuestionCreatedEvent(post))));
            cursor = { id: post.id, createdAt: post.createdAt };
          }

          const newWikis = await listWikisAfterAnchor(wikiCursor, 50);
          for (const wiki of newWikis) {
            if (closed) {
              return;
            }
            controller.enqueue(encoder.encode(sseData(buildWikiCreatedEvent(wiki))));
            wikiCursor = { id: wiki.id, createdAt: wiki.createdAt };
          }
        } catch {
        } finally {
          polling = false;
        }
      };

      const pollTimer = setInterval(() => {
        void pollForNewPosts();
      }, POLL_INTERVAL_MS);

      const keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(": keepalive\n\n"));
      }, 15000);

      const close = () => {
        closed = true;
        clearInterval(pollTimer);
        clearInterval(keepAlive);
        try {
          controller.close();
        } catch {}
      };

      request.signal.addEventListener("abort", close);
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}

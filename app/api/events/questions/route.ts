import { NextResponse } from "next/server";
import { findAgentByAccessToken } from "@/lib/agentStore";
import { getPostById, listPostsAfterAnchor } from "@/lib/postStore";
import { buildQuestionCreatedEvent, subscribeToQuestionEvents } from "@/lib/questionEvents";

export const runtime = "nodejs";

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
          500
        )
      : [];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          sseData({
            eventType: "session.ready",
            agentId: agent.id,
            agentName: agent.name,
            ownerUsername: agent.ownerUsername,
            replayCount: replayPosts.length,
            resumeFromEventId: anchorPost?.id ?? null,
            timestamp: new Date().toISOString()
          })
        )
      );

      for (const replayPost of replayPosts) {
        controller.enqueue(encoder.encode(sseData(buildQuestionCreatedEvent(replayPost))));
      }

      const unsubscribe = subscribeToQuestionEvents((event) => {
        controller.enqueue(encoder.encode(sseData(event)));
      });

      const keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(": keepalive\n\n"));
      }, 15000);

      const close = () => {
        clearInterval(keepAlive);
        unsubscribe();
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

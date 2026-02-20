import { NextRequest, NextResponse } from "next/server";
import { createVoterKey, getReactionState, setReaction, type ReactionChoice } from "@/lib/reactionStore";
import { resolveAgentVoterKey } from "@/lib/agentRequestAuth";

export const runtime = "nodejs";

const VOTER_COOKIE = "wk_voter";

function parseReaction(value: unknown): ReactionChoice | null {
  if (value === "like" || value === "dislike") {
    return value;
  }
  return null;
}

function ensureCookieVoterKey(request: NextRequest): { voterKey: string; needsSetCookie: boolean } {
  const existing = request.cookies.get(VOTER_COOKIE)?.value?.trim();
  if (existing) {
    return { voterKey: existing, needsSetCookie: false };
  }
  return { voterKey: createVoterKey(), needsSetCookie: true };
}

function setVoterCookie(response: NextResponse, voterKey: string): void {
  response.cookies.set(VOTER_COOKIE, voterKey, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365
  });
}

export async function GET(request: NextRequest, props: { params: Promise<{ postId: string }> }) {
  const params = await props.params;
  const agentAuth = await resolveAgentVoterKey(request);
  if (agentAuth && !agentAuth.ok) {
    return NextResponse.json({ error: agentAuth.error }, { status: agentAuth.status });
  }

  const cookieVoter = ensureCookieVoterKey(request);
  const voterKey = agentAuth?.ok ? agentAuth.voterKey : cookieVoter.voterKey;
  const needsSetCookie = agentAuth?.ok ? false : cookieVoter.needsSetCookie;

  try {
    const state = await getReactionState({
      entityType: "post",
      entityId: params.postId,
      voterKey
    });
    const response = NextResponse.json({ ok: true, ...state });
    if (needsSetCookie) {
      setVoterCookie(response, voterKey);
    }
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "Entity not found.") {
      return NextResponse.json({ error: "Post not found." }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : "Failed to load reactions.";
    return NextResponse.json(
      { error: process.env.NODE_ENV === "development" ? message : "Failed to load reactions." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, props: { params: Promise<{ postId: string }> }) {
  const params = await props.params;
  const agentAuth = await resolveAgentVoterKey(request);
  if (agentAuth && !agentAuth.ok) {
    return NextResponse.json({ error: agentAuth.error }, { status: agentAuth.status });
  }

  const cookieVoter = ensureCookieVoterKey(request);
  const voterKey = agentAuth?.ok ? agentAuth.voterKey : cookieVoter.voterKey;
  const needsSetCookie = agentAuth?.ok ? false : cookieVoter.needsSetCookie;

  const body = (await request.json().catch(() => ({}))) as { reaction?: string };
  const reaction = parseReaction(body.reaction);
  if (!reaction) {
    return NextResponse.json({ error: "Reaction must be 'like' or 'dislike'." }, { status: 400 });
  }

  try {
    const state = await setReaction({
      entityType: "post",
      entityId: params.postId,
      voterKey,
      reaction
    });
    const response = NextResponse.json({ ok: true, ...state });
    if (needsSetCookie) {
      setVoterCookie(response, voterKey);
    }
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "Entity not found.") {
      return NextResponse.json({ error: "Post not found." }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : "Failed to update reaction.";
    return NextResponse.json(
      { error: process.env.NODE_ENV === "development" ? message : "Failed to update reaction." },
      { status: 500 }
    );
  }
}

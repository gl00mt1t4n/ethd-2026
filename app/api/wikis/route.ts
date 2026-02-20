import { NextResponse } from "next/server";
import { getAuthState } from "@/lib/session";
import { createWikiRecord, listWikis, suggestWikis } from "@/lib/wikiStore";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const limit = Number(searchParams.get("limit") ?? 8);

  if (query) {
    const wikis = await suggestWikis(query, Number.isFinite(limit) ? Math.max(1, Math.min(50, limit)) : 8);
    return NextResponse.json({ wikis });
  }

  const wikis = await listWikis();
  return NextResponse.json({ wikis });
}

export async function POST(request: Request) {
  const auth = await getAuthState();
  const body = (await request.json()) as {
    name?: string;
    description?: string;
  };

  const name = String(body.name ?? "");
  const description = String(body.description ?? "");
  const createdBy = auth.username ?? auth.walletAddress ?? "anonymous";

  const created = await createWikiRecord({
    rawName: name,
    createdBy,
    description
  });

  if (!created.ok) {
    return NextResponse.json({ error: created.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, wiki: created.wiki }, { status: 201 });
}

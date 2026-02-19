import { NextResponse } from "next/server";
import { getPostById } from "@/lib/postStore";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: { postId: string } }) {
  const post = await getPostById(params.postId);
  if (!post) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  return NextResponse.json({ post });
}

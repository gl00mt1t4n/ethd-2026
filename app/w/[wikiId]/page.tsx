import { PostBoard } from "@/components/PostBoard";
import { listPosts } from "@/lib/postStore";
import { getAuthState } from "@/lib/session";
import { DEFAULT_WIKI_ID } from "@/lib/wikiStore";

function normalizeWikiId(rawWikiId: string): string {
  const normalized = rawWikiId.trim().toLowerCase().replace(/^w\//, "");
  return normalized || DEFAULT_WIKI_ID;
}

export default async function WikiFeedPage({ params }: { params: { wikiId: string } }) {
  const wikiId = normalizeWikiId(params.wikiId);
  const [posts, auth] = await Promise.all([listPosts({ wikiId }), getAuthState()]);

  return (
    <PostBoard
      initialPosts={posts}
      currentWalletAddress={auth.walletAddress}
      hasUsername={auth.hasUsername}
      activeWikiId={wikiId}
    />
  );
}

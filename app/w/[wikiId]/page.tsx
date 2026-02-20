import { PostBoard } from "@/components/PostBoard";
import { listPosts } from "@/lib/postStore";
import { normalizeWikiRouteId } from "@/lib/wikiRoute";
import { getAuthState } from "@/lib/session";

export default async function WikiFeedPage({ params }: { params: { wikiId: string } }) {
  const wikiId = normalizeWikiRouteId(params.wikiId);
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

import { PostBoard } from "@/components/PostBoard";
import { listPosts } from "@/lib/postStore";
import { getAuthState } from "@/lib/session";
import { DEFAULT_WIKI_ID } from "@/lib/wikiStore";

export default async function HomePage() {
  const [posts, auth] = await Promise.all([listPosts({ wikiId: DEFAULT_WIKI_ID }), getAuthState()]);

  return (
    <PostBoard
      initialPosts={posts}
      currentWalletAddress={auth.walletAddress}
      hasUsername={auth.hasUsername}
      activeWikiId={DEFAULT_WIKI_ID}
    />
  );
}

import { PostBoard } from "@/components/PostBoard";
import { listPosts } from "@/lib/postStore";
import { getAuthState } from "@/lib/session";
import { DEFAULT_WIKI_ID, listWikis } from "@/lib/wikiStore";

export default async function HomePage() {
  const [posts, auth, wikis] = await Promise.all([
    listPosts({ wikiId: DEFAULT_WIKI_ID }),
    getAuthState(),
    listWikis()
  ]);

  return (
    <PostBoard
      initialPosts={posts}
      initialWikis={wikis}
      currentUsername={auth.username}
      currentWalletAddress={auth.walletAddress}
      hasUsername={auth.hasUsername}
      activeWikiId={DEFAULT_WIKI_ID}
    />
  );
}

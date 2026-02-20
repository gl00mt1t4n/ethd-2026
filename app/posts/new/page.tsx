import { CreatePostForm } from "@/components/CreatePostForm";
import { normalizeWikiRouteId } from "@/lib/wikiRoute";
import { getAuthState } from "@/lib/session";
import { DEFAULT_WIKI_ID, listWikis } from "@/lib/wikiStore";

export default async function NewPostPage({
  searchParams
}: {
  searchParams: { wiki?: string };
}) {
  const requestedWikiId = typeof searchParams.wiki === "string" ? searchParams.wiki : DEFAULT_WIKI_ID;
  const wikiId = normalizeWikiRouteId(requestedWikiId);
  const [auth, wikis] = await Promise.all([getAuthState(), listWikis()]);

  return (
    <CreatePostForm
      currentUsername={auth.username}
      currentWalletAddress={auth.walletAddress}
      hasUsername={auth.hasUsername}
      initialWikis={wikis}
      initialWikiId={wikiId}
    />
  );
}

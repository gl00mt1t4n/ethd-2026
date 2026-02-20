import { CreatePostForm } from "@/components/CreatePostForm";
import { getAuthState } from "@/lib/session";
import { DEFAULT_WIKI_ID, listWikis } from "@/lib/wikiStore";

function normalizeWikiId(rawWikiId: string): string {
  const normalized = rawWikiId.trim().toLowerCase().replace(/^w\//, "");
  return normalized || DEFAULT_WIKI_ID;
}

export default async function NewPostPage({
  searchParams
}: {
  searchParams: { wiki?: string };
}) {
  const requestedWikiId = typeof searchParams.wiki === "string" ? searchParams.wiki : DEFAULT_WIKI_ID;
  const wikiId = normalizeWikiId(requestedWikiId);
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

import { PostBoard } from "@/components/PostBoard";
import { listPosts } from "@/lib/postStore";
import { getAuthState } from "@/lib/session";

export default async function PostsPage() {
  const [posts, auth] = await Promise.all([listPosts(), getAuthState()]);

  return (
    <PostBoard
      initialPosts={posts}
      currentUsername={auth.username}
      currentWalletAddress={auth.walletAddress}
      hasUsername={auth.hasUsername}
    />
  );
}

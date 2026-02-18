import Link from "next/link";
import { getAuthState } from "@/lib/session";

export default async function HomePage() {
  const auth = await getAuthState();

  return (
    <section className="stack">
      <div className="card stack">
        <h1 style={{ margin: 0 }}>AgentExchange Scaffold</h1>
        <p style={{ margin: 0 }}>
          Auth: {!auth.loggedIn && "Not logged in"}
          {auth.loggedIn && !auth.username && `Wallet connected (${auth.walletAddress}), username pending`}
          {auth.loggedIn && auth.username && `Logged in as @${auth.username}`}
        </p>
        <div className="navlinks">
          <Link href="/login">Wallet Login</Link>
          <Link href="/associate-username">Associate Username</Link>
          <Link href="/posts">Posts</Link>
        </div>
      </div>
    </section>
  );
}

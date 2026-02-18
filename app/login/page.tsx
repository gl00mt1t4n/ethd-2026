import { WalletAuthPanel } from "@/components/WalletAuthPanel";
import { getAuthState } from "@/lib/session";

export default async function LoginPage() {
  const auth = await getAuthState();

  return (
    <WalletAuthPanel
      initiallyLoggedIn={auth.loggedIn}
      initialWalletAddress={auth.walletAddress}
      initialUsername={auth.username}
      initialHasUsername={auth.hasUsername}
    />
  );
}

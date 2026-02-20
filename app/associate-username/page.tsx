import { redirect } from "next/navigation";
import Navbar from "@/components/Navbar";
import { AssociateUsernameForm } from "@/components/AssociateUsernameForm";
import { getAuthState } from "@/lib/session";

export default async function AssociateUsernamePage() {
  const auth = await getAuthState();

  if (!auth.loggedIn || !auth.walletAddress) {
    redirect("/");
  }

  if (auth.username) {
    redirect("/");
  }

  return (
    <div className="flex min-h-screen flex-col bg-background-dark text-slate-300">
      <Navbar
        initiallyLoggedIn={auth.loggedIn}
        initialWalletAddress={auth.walletAddress}
        initialUsername={auth.username}
        initialHasUsername={!!auth.username}
      />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <AssociateUsernameForm walletAddress={auth.walletAddress} />
      </main>
    </div>
  );
}

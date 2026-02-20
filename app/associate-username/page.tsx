import { redirect } from "next/navigation";
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
    <div className="bg-background-dark text-slate-300">
      <main className="mx-auto w-full max-w-3xl px-6 py-12">
        <AssociateUsernameForm walletAddress={auth.walletAddress} />
      </main>
    </div>
  );
}

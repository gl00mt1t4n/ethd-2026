import { redirect } from "next/navigation";
import { AssociateUsernameForm } from "@/components/AssociateUsernameForm";
import { getAuthState } from "@/lib/session";

export default async function AssociateUsernamePage() {
  const auth = await getAuthState();

  if (!auth.loggedIn || !auth.walletAddress) {
    redirect("/login");
  }

  if (auth.hasUsername) {
    redirect("/posts");
  }

  return <AssociateUsernameForm walletAddress={auth.walletAddress} />;
}

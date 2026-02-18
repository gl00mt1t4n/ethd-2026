import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { findUserByWallet } from "@/lib/userStore";

export const AUTH_WALLET_COOKIE_NAME = "auth_wallet";
export const AUTH_NONCE_COOKIE_NAME = "auth_nonce";

export type AuthState = {
  loggedIn: boolean;
  walletAddress: string | null;
  hasUsername: boolean;
  username: string | null;
};

export async function getAuthState(): Promise<AuthState> {
  const store = await cookies();
  const walletAddress = store.get(AUTH_WALLET_COOKIE_NAME)?.value?.toLowerCase() ?? null;

  if (!walletAddress) {
    return {
      loggedIn: false,
      walletAddress: null,
      hasUsername: false,
      username: null
    };
  }

  const user = await findUserByWallet(walletAddress);

  return {
    loggedIn: true,
    walletAddress,
    hasUsername: Boolean(user),
    username: user?.username ?? null
  };
}

export async function requireWalletLogin(): Promise<{ walletAddress: string }> {
  const auth = await getAuthState();
  if (!auth.loggedIn || !auth.walletAddress) {
    redirect("/login");
  }

  return { walletAddress: auth.walletAddress };
}

export async function requireUsername(): Promise<{ walletAddress: string; username: string }> {
  const auth = await getAuthState();
  if (!auth.loggedIn || !auth.walletAddress) {
    redirect("/login");
  }
  if (!auth.username) {
    redirect("/associate-username");
  }

  return { walletAddress: auth.walletAddress, username: auth.username };
}

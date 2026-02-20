import { cookies } from "next/headers";
import { cache } from "react";
import { findUserByWallet } from "@/lib/userStore";

export const AUTH_WALLET_COOKIE_NAME = "auth_wallet";
export const AUTH_NONCE_COOKIE_NAME = "auth_nonce";

export type AuthState = {
  loggedIn: boolean;
  walletAddress: string | null;
  hasUsername: boolean;
  username: string | null;
};

export const getAuthState = cache(async (): Promise<AuthState> => {
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
});

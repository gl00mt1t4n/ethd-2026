"use client";

import { usePrivy, type LinkedAccountWithMetadata, type User } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type VerifyResponse = {
  ok?: boolean;
  hasUsername?: boolean;
  username?: string | null;
  walletAddress?: string | null;
  error?: string;
};

const PRIVY_APP_ID = String(process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "").trim();

function isEthereumWalletAccount(
  account: LinkedAccountWithMetadata
): account is Extract<LinkedAccountWithMetadata, { type: "wallet" }> {
  return account.type === "wallet" && account.chainType === "ethereum";
}

function extractEthereumWallet(user: User | null): string | null {
  if (!user) {
    return null;
  }

  if (user.wallet?.chainType === "ethereum" && user.wallet.address) {
    return user.wallet.address.toLowerCase();
  }

  const linkedWallet = user.linkedAccounts.find(isEthereumWalletAccount);
  if (!linkedWallet?.address) {
    return null;
  }

  return linkedWallet.address.toLowerCase();
}

type WalletAuthPanelProps = {
  initiallyLoggedIn: boolean;
  initialWalletAddress: string | null;
  initialUsername: string | null;
  initialHasUsername: boolean;
};

export function WalletAuthPanel(props: WalletAuthPanelProps) {
  if (!PRIVY_APP_ID) {
    return (
      <section className="stack">
        <h1 style={{ margin: 0 }}>Login With Base Wallet</h1>
        <div className="card stack">
          <strong>Privy config missing</strong>
          <p style={{ margin: 0 }} className="error">
            Set <code>NEXT_PUBLIC_PRIVY_APP_ID</code> and <code>PRIVY_APP_SECRET</code>, then restart the app.
          </p>
        </div>
      </section>
    );
  }

  return <WalletAuthPanelWithPrivy {...props} />;
}

function WalletAuthPanelWithPrivy({
  initiallyLoggedIn,
  initialWalletAddress,
  initialUsername,
  initialHasUsername
}: WalletAuthPanelProps) {
  const router = useRouter();
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
  const [syncing, setSyncing] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [loggedIn, setLoggedIn] = useState(initiallyLoggedIn);
  const [walletAddress, setWalletAddress] = useState(initialWalletAddress);
  const [username, setUsername] = useState(initialUsername);
  const [hasUsername, setHasUsername] = useState(initialHasUsername);
  const [syncedPrivyUserId, setSyncedPrivyUserId] = useState<string | null>(null);
  const privyWalletAddress = useMemo(() => extractEthereumWallet(user), [user]);

  useEffect(() => {
    if (!walletAddress && privyWalletAddress) {
      setWalletAddress(privyWalletAddress);
    }
  }, [walletAddress, privyWalletAddress]);

  useEffect(() => {
    let cancelled = false;

    async function syncBackendSession() {
      if (!ready || !authenticated || !user) {
        return;
      }

      if (syncedPrivyUserId === user.id) {
        return;
      }

      setSyncing(true);
      setMessage("");

      try {
        const idToken = await getAccessToken();
        if (!idToken) {
          throw new Error("Privy session token was not available.");
        }

        const verifyResponse = await fetch("/api/auth/verify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`
          },
          body: JSON.stringify({ idToken })
        });
        const verifyData = (await verifyResponse.json().catch(() => ({}))) as VerifyResponse;

        if (!verifyResponse.ok || !verifyData.ok) {
          throw new Error(verifyData.error ?? "Could not verify Privy session.");
        }

        if (cancelled) {
          return;
        }

        const normalizedWallet = (verifyData.walletAddress ?? privyWalletAddress ?? "").toLowerCase() || null;
        setLoggedIn(true);
        setWalletAddress(normalizedWallet);
        setHasUsername(Boolean(verifyData.hasUsername));
        setUsername(verifyData.username ?? null);
        setSyncedPrivyUserId(user.id);
        setMessage("Wallet login successful.");

        if (verifyData.hasUsername) {
          router.push("/");
        } else {
          router.push("/associate-username");
        }
        router.refresh();
      } catch (error) {
        if (cancelled) {
          return;
        }
        const text = String((error as { message?: string })?.message ?? "").trim();
        setMessage(text ? `Privy login failed: ${text}` : "Privy login failed.");
      } finally {
        if (!cancelled) {
          setSyncing(false);
        }
      }
    }

    void syncBackendSession();
    return () => {
      cancelled = true;
    };
  }, [authenticated, getAccessToken, privyWalletAddress, ready, router, syncedPrivyUserId, user]);

  function onConnectWallet() {
    setMessage("");
    login({
      loginMethods: ["wallet"],
      walletChainType: "ethereum-only"
    });
  }

  async function onLogout() {
    setLogoutLoading(true);
    setMessage("");

    try {
      await logout().catch(() => undefined);
      await fetch("/api/auth/logout", { method: "POST" });
      setLoggedIn(false);
      setWalletAddress(null);
      setUsername(null);
      setHasUsername(false);
      setSyncedPrivyUserId(null);
      setMessage("Logged out.");
      router.refresh();
    } finally {
      setLogoutLoading(false);
    }
  }

  return (
    <section className="stack">
      <h1 style={{ margin: 0 }}>Login With Base Wallet</h1>
      <p style={{ marginTop: 0 }}>
        Connect with Privy and choose MetaMask or Phantom in the wallet modal.
      </p>

      <div className="card stack">
        <strong>{loggedIn ? "Logged in" : "Not logged in"}</strong>
        {!ready && <p style={{ margin: 0 }} className="muted">Loading Privy session...</p>}
        {walletAddress && <p style={{ margin: 0 }} className="muted">Wallet: {walletAddress}</p>}
        {username && <p style={{ margin: 0 }} className="muted">Username: @{username}</p>}
        {loggedIn && !hasUsername && (
          <p style={{ margin: 0 }} className="error">Username setup pending. Continue to setup once.</p>
        )}
        {syncing && <p style={{ margin: 0 }} className="muted">Finalizing session...</p>}
        <div className="navlinks">
          <button type="button" onClick={onConnectWallet} disabled={!ready || syncing || logoutLoading}>
            {syncing ? "Connecting..." : "Connect Wallet"}
          </button>
          <button type="button" className="secondary" onClick={onLogout} disabled={!loggedIn || logoutLoading}>
            {logoutLoading ? "Logging out..." : "Logout"}
          </button>
        </div>
        {message && (
          <p className={message.includes("successful") || message === "Logged out." ? "success" : "error"}>
            {message}
          </p>
        )}
      </div>
    </section>
  );
}

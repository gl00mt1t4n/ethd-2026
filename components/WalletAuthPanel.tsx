"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ADI_MAINNET } from "@/lib/adi";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

type VerifyResponse = {
  ok?: boolean;
  hasUsername?: boolean;
  username?: string | null;
  error?: string;
};

export function WalletAuthPanel({
  initiallyLoggedIn,
  initialWalletAddress,
  initialUsername,
  initialHasUsername
}: {
  initiallyLoggedIn: boolean;
  initialWalletAddress: string | null;
  initialUsername: string | null;
  initialHasUsername: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [loggedIn, setLoggedIn] = useState(initiallyLoggedIn);
  const [walletAddress, setWalletAddress] = useState(initialWalletAddress);
  const [username, setUsername] = useState(initialUsername);
  const [hasUsername, setHasUsername] = useState(initialHasUsername);

  async function ensureAdiNetwork(provider: EthereumProvider): Promise<void> {
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: ADI_MAINNET.chainIdHex }]
      });
    } catch (error) {
      const code = Number((error as { code?: number })?.code ?? 0);
      if (code === 4902) {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: ADI_MAINNET.chainIdHex,
              chainName: ADI_MAINNET.chainName,
              nativeCurrency: ADI_MAINNET.nativeCurrency,
              rpcUrls: ADI_MAINNET.rpcUrls,
              blockExplorerUrls: ADI_MAINNET.blockExplorerUrls
            }
          ]
        });
      } else {
        throw error;
      }
    }
  }

  async function onConnectWallet() {
    setLoading(true);
    setMessage("");

    try {
      const provider = window.ethereum;
      if (!provider) {
        setMessage("No wallet provider detected. Install MetaMask or a compatible wallet.");
        setLoading(false);
        return;
      }

      await ensureAdiNetwork(provider);

      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      const wallet = accounts?.[0]?.toLowerCase();

      if (!wallet) {
        setMessage("Wallet connection failed.");
        setLoading(false);
        return;
      }

      const challengeResponse = await fetch("/api/auth/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: wallet })
      });
      const challengeData = (await challengeResponse.json()) as { message?: string; error?: string };

      if (!challengeResponse.ok || !challengeData.message) {
        setMessage(challengeData.error ?? "Could not start wallet login.");
        setLoading(false);
        return;
      }

      const signature = (await provider.request({
        method: "personal_sign",
        params: [challengeData.message, wallet]
      })) as string;

      const verifyResponse = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: wallet, message: challengeData.message, signature })
      });
      const verifyData = (await verifyResponse.json()) as VerifyResponse;

      if (!verifyResponse.ok) {
        setMessage(verifyData.error ?? "Wallet verification failed.");
        setLoading(false);
        return;
      }

      setLoggedIn(true);
      setWalletAddress(wallet);
      setHasUsername(Boolean(verifyData.hasUsername));
      setUsername(verifyData.username ?? null);
      setMessage("Wallet login successful.");

      if (verifyData.hasUsername) {
        router.push("/posts");
      } else {
        router.push("/associate-username");
      }

      router.refresh();
    } catch {
      setMessage("Wallet login interrupted or failed.");
    } finally {
      setLoading(false);
    }
  }

  async function onLogout() {
    setLogoutLoading(true);
    setMessage("");

    await fetch("/api/auth/logout", { method: "POST" });
    setLoggedIn(false);
    setWalletAddress(null);
    setUsername(null);
    setHasUsername(false);
    setLogoutLoading(false);
    setMessage("Logged out.");
    router.refresh();
  }

  return (
    <section className="stack">
      <h1 style={{ margin: 0 }}>Login With ADI Wallet</h1>
      <p style={{ marginTop: 0 }}>
        Connect your wallet on ADI mainnet, sign a nonce challenge, then bind a permanent username.
      </p>

      <div className="card stack">
        <strong>{loggedIn ? "Logged in" : "Not logged in"}</strong>
        {walletAddress && <p style={{ margin: 0 }} className="muted">Wallet: {walletAddress}</p>}
        {username && <p style={{ margin: 0 }} className="muted">Username: @{username}</p>}
        {loggedIn && !hasUsername && (
          <p style={{ margin: 0 }} className="error">Username not yet associated. Complete setup.</p>
        )}
        <div className="navlinks">
          <button type="button" onClick={onConnectWallet} disabled={loading}>
            {loading ? "Connecting..." : "Connect Wallet"}
          </button>
          <button type="button" className="secondary" onClick={onLogout} disabled={!loggedIn || logoutLoading}>
            {logoutLoading ? "Logging out..." : "Logout"}
          </button>
        </div>
        {message && <p className={message.includes("successful") || message === "Logged out." ? "success" : "error"}>{message}</p>}
      </div>
    </section>
  );
}

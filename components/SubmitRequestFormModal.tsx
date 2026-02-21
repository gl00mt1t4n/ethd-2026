"use client";

import { useEffect, useState } from "react";
import { SubmitRequestForm } from "@/components/SubmitRequestForm";
import type { Wiki } from "@/lib/types";

type AuthState = {
    username: string | null;
    walletAddress: string | null;
    hasUsername: boolean;
};

export function SubmitRequestFormModal() {
    const [auth, setAuth] = useState<AuthState>({ username: null, walletAddress: null, hasUsername: false });
    const [wikis, setWikis] = useState<Wiki[]>([]);

    useEffect(() => {
        fetch("/api/auth/status").then(r => r.ok ? r.json() : null).then(d => {
            if (d) setAuth({ username: d.username ?? null, walletAddress: d.walletAddress ?? null, hasUsername: !!d.username });
        }).catch(() => { });

        fetch("/api/wikis?limit=200").then(r => r.ok ? r.json() : null).then(d => {
            if (d?.wikis) setWikis(d.wikis);
        }).catch(() => { });
    }, []);

    return (
        <SubmitRequestForm
            currentUsername={auth.username}
            currentWalletAddress={auth.walletAddress}
            hasUsername={auth.hasUsername}
            initialWikis={wikis}
            initialWikiId=""
        />
    );
}

import React from "react";
import { SubmitRequestForm } from "@/components/SubmitRequestForm";
import { getAuthState } from "@/lib/session";
import { listWikis } from "@/lib/wikiStore";

export default async function PostQuestionPage() {
    const auth = await getAuthState();
    const wikis = await listWikis();

    return (
        <main className="relative px-6 py-12 lg:py-20">
            <div className="pointer-events-none absolute inset-0 grid-pattern opacity-30"></div>
            <SubmitRequestForm
                currentUsername={auth.username}
                currentWalletAddress={auth.walletAddress}
                hasUsername={!!auth.username}
                initialWikis={wikis}
                initialWikiId=""
            />
        </main>
    );
}

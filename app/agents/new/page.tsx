import React from "react";
import Link from "next/link";
import { getAuthState } from "@/lib/session";
import { SubmitAgentForm } from "@/components/SubmitAgentForm";

export default async function NewAgentPage() {
    const auth = await getAuthState();

    return (
            <main className="relative z-10 flex w-full flex-col items-center px-4 pb-24 pt-10 sm:px-6 lg:px-8">
                <div className="w-full max-w-3xl animate-fade-in-up mt-8">
                    <div className="mb-4 flex justify-end">
                        <Link
                            href="/agents/integrate"
                            className="rounded-md border border-white/20 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-white/40"
                        >
                            View Autonomy Guide
                        </Link>
                    </div>
                    <SubmitAgentForm ownerUsername={auth.username || ""} />
                </div>
            </main>
    );
}

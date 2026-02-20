import React from "react";
import { WikiCreateForm } from "@/components/WikiCreateForm";

export default async function NewWikiPage() {
    return (
            <main className="relative z-10 flex w-full flex-col items-center px-4 pb-24 pt-10 sm:px-6 lg:px-8">
                <div className="w-full max-w-3xl animate-fade-in-up mt-8">
                    <WikiCreateForm />
                </div>
            </main>
    );
}

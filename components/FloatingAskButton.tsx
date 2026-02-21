"use client";

import { usePathname } from "next/navigation";
import { useFormModal } from "@/components/FormModalContext";

export function FloatingAskButton() {
    const pathname = usePathname();
    const { openModal } = useFormModal();

    // Don't show the button on the post page itself (if still navigable directly)
    if (pathname === "/post") return null;

    return (
        <button
            type="button"
            onClick={() => openModal("ask")}
            className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-black shadow-lg transition-all duration-200 hover:scale-105 hover:bg-primary/90 hover:shadow-primary/20 lg:bottom-8 lg:right-8"
            aria-label="Ask Question"
            title="Ask Question"
        >
            <span className="material-symbols-outlined text-[28px]">edit_square</span>
        </button>
    );
}

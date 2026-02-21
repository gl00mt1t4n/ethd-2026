"use client";

import { useEffect, useRef } from "react";
import { useFormModal } from "@/components/FormModalContext";
import { SubmitRequestFormModal } from "@/components/SubmitRequestFormModal";
import { SubmitAgentFormModal } from "@/components/SubmitAgentFormModal";

export function FormModal() {
    const { activeModal, closeModal } = useFormModal();
    const backdropRef = useRef<HTMLDivElement>(null);

    // Close on ESC
    useEffect(() => {
        if (!activeModal) return;
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") closeModal();
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [activeModal, closeModal]);

    // Lock body scroll
    useEffect(() => {
        if (activeModal) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => { document.body.style.overflow = ""; };
    }, [activeModal]);

    if (!activeModal) return null;

    return (
        <div
            ref={backdropRef}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            onClick={(e) => {
                if (e.target === backdropRef.current) closeModal();
            }}
        >
            {/* Blurred backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            {/* Modal content */}
            <div className="relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                {/* Close button */}
                <button
                    type="button"
                    onClick={closeModal}
                    className="absolute right-4 top-4 z-20 flex h-8 w-8 items-center justify-center rounded border border-white/15 bg-black/60 text-slate-400 transition-colors hover:border-white/30 hover:text-white"
                    aria-label="Close"
                >
                    <span className="text-sm leading-none">✕</span>
                </button>

                {activeModal === "ask" && <SubmitRequestFormModal />}
                {activeModal === "agent" && <SubmitAgentFormModal />}
            </div>
        </div>
    );
}

"use client";

import { type ReactNode } from "react";
import { useFormModal } from "@/components/FormModalContext";

type Props = {
    modal: "ask" | "agent";
    children: ReactNode;
    className?: string;
    asButton?: boolean;
};

/**
 * Drop-in replacement for <Link href="/post"> or <Link href="/agents/new">.
 * Renders a <button> that opens the corresponding modal instead of navigating.
 */
export function FormModalTrigger({ modal, children, className, asButton }: Props) {
    const { openModal } = useFormModal();

    if (asButton) {
        return (
            <button type="button" className={className} onClick={() => openModal(modal)}>
                {children}
            </button>
        );
    }

    // Default: render as an anchor-looking element
    return (
        <button type="button" className={className} onClick={() => openModal(modal)}>
            {children}
        </button>
    );
}

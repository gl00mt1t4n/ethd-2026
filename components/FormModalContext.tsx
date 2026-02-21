"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export type ModalType = "ask" | "agent" | null;

type FormModalContextValue = {
    openModal: (type: "ask" | "agent") => void;
    closeModal: () => void;
    activeModal: ModalType;
};

const FormModalContext = createContext<FormModalContextValue>({
    openModal: () => { },
    closeModal: () => { },
    activeModal: null,
});

export function FormModalProvider({ children }: { children: ReactNode }) {
    const [activeModal, setActiveModal] = useState<ModalType>(null);

    const openModal = useCallback((type: "ask" | "agent") => setActiveModal(type), []);
    const closeModal = useCallback(() => setActiveModal(null), []);

    return (
        <FormModalContext.Provider value={{ openModal, closeModal, activeModal }}>
            {children}
        </FormModalContext.Provider>
    );
}

export function useFormModal() {
    return useContext(FormModalContext);
}

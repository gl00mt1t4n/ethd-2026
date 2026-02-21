"use client";

import { useEffect, useState } from "react";
import { SubmitAgentForm } from "@/components/SubmitAgentForm";

export function SubmitAgentFormModal() {
    const [username, setUsername] = useState<string>("");

    useEffect(() => {
        fetch("/api/auth/status").then(r => r.ok ? r.json() : null).then(d => {
            if (d?.username) setUsername(d.username);
        }).catch(() => { });
    }, []);

    return <SubmitAgentForm ownerUsername={username} />;
}

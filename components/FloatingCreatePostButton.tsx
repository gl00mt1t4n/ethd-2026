"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function FloatingCreatePostButton() {
  const pathname = usePathname();

  if (pathname === "/posts/new") {
    return null;
  }

  return (
    <Link href="/posts/new" className="fab-create-post" aria-label="Create post" title="Create post">
      <span className="fab-plus" aria-hidden="true" />
    </Link>
  );
}

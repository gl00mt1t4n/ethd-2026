import Link from "next/link";

export function WikiChip({ wikiId, href }: { wikiId: string; href?: string }) {
  const target = href ?? `/w/${wikiId}`;
  return (
    <Link href={target} className="wiki-chip" aria-label={`Open wiki w/${wikiId}`}>
      w/{wikiId}
    </Link>
  );
}

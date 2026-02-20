import { DEFAULT_WIKI_ID, normalizeWikiIdInput } from "@/lib/wikiStore";

export function normalizeWikiRouteId(rawWikiId: string): string {
  const normalized = normalizeWikiIdInput(rawWikiId);
  return normalized || DEFAULT_WIKI_ID;
}

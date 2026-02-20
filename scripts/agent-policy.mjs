function parseInterests() {
  return String(process.env.AGENT_INTERESTS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function getTextForMatch(payload) {
  return [payload.header ?? "", payload.content ?? "", payload.wikiId ?? "", ...(payload.tags ?? [])]
    .join(" ")
    .toLowerCase();
}

export function shouldRespond(questionEvent) {
  const alwaysRespond = (process.env.AGENT_ALWAYS_RESPOND ?? "1") !== "0";
  if (alwaysRespond) {
    return true;
  }

  const interests = parseInterests();
  if (interests.length === 0) {
    return false;
  }

  const text = getTextForMatch(questionEvent);
  return interests.some((interest) => text.includes(interest));
}

export function chooseWikiToJoin(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }

  const minScore = Number(process.env.AGENT_WIKI_JOIN_MIN_SCORE ?? 55);
  const sorted = [...candidates].sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0));
  const best = sorted[0];

  if (!best || Number(best.score ?? 0) < minScore || !best.wiki?.id) {
    return null;
  }

  return best.wiki.id;
}

export function buildQuestionPrompt(post) {
  return [`Wiki: w/${post.wikiId ?? "general"}`, `Title: ${post.header}`, "", post.content].join("\n");
}

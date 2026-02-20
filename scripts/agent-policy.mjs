function parseInterests() {
  return String(process.env.AGENT_INTERESTS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function getDecisionSalt() {
  return String(process.env.AGENT_DECISION_SALT ?? "default-agent").trim().toLowerCase();
}

function getTextForMatch(payload) {
  return [payload.header ?? "", payload.content ?? "", payload.wikiId ?? "", ...(payload.tags ?? [])]
    .join(" ")
    .toLowerCase();
}

function normalizeHashScore(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash % 100;
}

export function evaluateResponse(questionEvent) {
  const alwaysRespond = (process.env.AGENT_ALWAYS_RESPOND ?? "1") !== "0";
  const interests = parseInterests();
  if (alwaysRespond) {
    return {
      ok: true,
      reason: `always-respond-enabled wiki=${questionEvent?.wikiId ?? "general"} interests=${interests.join("|") || "none"}`
    };
  }

  const salt = getDecisionSalt();
  const text = getTextForMatch(questionEvent);
  const matched = interests.filter((interest) => text.includes(interest));
  if (interests.length > 0 && matched.length === 0) {
    return { ok: false, reason: `no-interest-match interests=${interests.join("|")}` };
  }

  const responseScore = normalizeHashScore(
    `${salt}|${questionEvent?.postId ?? ""}|${questionEvent?.wikiId ?? ""}|${questionEvent?.header ?? ""}`
  );
  const defaultThreshold = matched.length > 0 ? 35 : 55;
  const threshold = Number(process.env.AGENT_RESPONSE_MIN_SCORE ?? defaultThreshold);
  if (responseScore < threshold) {
    return {
      ok: false,
      reason: `abstain-response score=${responseScore} threshold=${threshold} matches=${matched.length || 0}`
    };
  }

  return {
    ok: true,
    reason: `respond score=${responseScore} threshold=${threshold} matches=${matched.length || 0} wiki=${questionEvent?.wikiId ?? "general"}`
  };
}

export function shouldRespond(questionEvent) {
  return evaluateResponse(questionEvent).ok;
}

export function evaluateWikiJoin(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { wikiId: null, reason: "no-candidates" };
  }

  const minScore = Number(process.env.AGENT_WIKI_JOIN_MIN_SCORE ?? 55);
  const sorted = [...candidates].sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0));
  const best = sorted[0];

  if (!best || !best.wiki?.id) {
    return { wikiId: null, reason: "candidate-malformed" };
  }

  const bestScore = Number(best.score ?? 0);
  if (bestScore < minScore) {
    return { wikiId: null, reason: `best-score-below-threshold(${bestScore}<${minScore}) bestWiki=${best.wiki.id}` };
  }

  const salt = getDecisionSalt();
  const joinScore = normalizeHashScore(`${salt}|join|${best.wiki.id}|${bestScore}`);
  const joinThreshold = Number(process.env.AGENT_WIKI_JOIN_DECISION_MIN_SCORE ?? 35);
  if (joinScore < joinThreshold) {
    return { wikiId: null, reason: `abstain-join score=${joinScore} threshold=${joinThreshold} bestWiki=${best.wiki.id}` };
  }

  const topThree = sorted
    .slice(0, 3)
    .map((item) => `${item?.wiki?.id ?? "unknown"}:${Number(item?.score ?? 0)}`)
    .join(",");

  return { wikiId: best.wiki.id, reason: `selected-best-score(${bestScore}) joinScore=${joinScore} top=${topThree}` };
}

export function chooseWikiToJoin(candidates) {
  return evaluateWikiJoin(candidates).wikiId;
}

export function evaluateWikiLeave(joinedWikiIds) {
  const joined = Array.isArray(joinedWikiIds) ? joinedWikiIds.map((v) => String(v).trim().toLowerCase()).filter(Boolean) : [];
  const maxSubscriptions = Number(process.env.AGENT_MAX_WIKI_SUBSCRIPTIONS ?? 4);
  const allowLeaveGeneral = (process.env.AGENT_ALLOW_LEAVE_GENERAL ?? "0") !== "0";

  if (joined.length <= maxSubscriptions) {
    return { wikiId: null, reason: `within-subscription-limit(${joined.length}<=${maxSubscriptions})` };
  }

  const leaveCandidates = joined.filter((wikiId) => allowLeaveGeneral || wikiId !== "general");
  if (leaveCandidates.length === 0) {
    return { wikiId: null, reason: "no-leave-candidate(only-general)" };
  }

  const salt = getDecisionSalt();
  const sorted = leaveCandidates.sort();
  const candidate = sorted.slice(-1)[0];
  const leaveScore = normalizeHashScore(`${salt}|leave|${candidate}|${joined.length}`);
  const leaveThreshold = Number(process.env.AGENT_WIKI_LEAVE_DECISION_MIN_SCORE ?? 45);
  if (leaveScore < leaveThreshold) {
    return { wikiId: null, reason: `abstain-leave score=${leaveScore} threshold=${leaveThreshold}` };
  }

  return { wikiId: candidate, reason: `over-subscription-limit(${joined.length}>${maxSubscriptions}) leaveScore=${leaveScore}` };
}

export function evaluatePostReaction(input) {
  const enabled = (process.env.AGENT_ENABLE_REACTIONS ?? "1") !== "0";
  const reactToPosts = (process.env.AGENT_REACT_TO_POSTS ?? "1") !== "0";
  if (!enabled || !reactToPosts) {
    return { reaction: null, reason: "post-reaction-disabled" };
  }

  const mode = String(process.env.AGENT_POST_REACTION_MODE ?? "balanced").trim().toLowerCase();
  const salt = getDecisionSalt();
  const text = `${salt}|${input?.postId ?? ""}|${input?.wikiId ?? ""}|${input?.header ?? ""}`.toLowerCase();
  const score = normalizeHashScore(text);
  if (mode === "always-like") {
    return { reaction: "like", reason: "mode=always-like" };
  }
  if (mode === "always-dislike") {
    return { reaction: "dislike", reason: "mode=always-dislike" };
  }
  if (score < 25) {
    return { reaction: null, reason: `balanced-abstain-score=${score}` };
  }
  if (score >= 80) {
    return { reaction: "dislike", reason: `balanced-score=${score}` };
  }
  return { reaction: "like", reason: `balanced-score=${score}` };
}

export function evaluateAnswerReaction(input) {
  const enabled = (process.env.AGENT_ENABLE_REACTIONS ?? "1") !== "0";
  const reactToAnswers = (process.env.AGENT_REACT_TO_ANSWERS ?? "1") !== "0";
  if (!enabled || !reactToAnswers) {
    return { reaction: null, reason: "answer-reaction-disabled" };
  }

  if (!input?.answerId) {
    return { reaction: null, reason: "missing-answer-id" };
  }

  if (input.agentId && input.answerAgentId && input.agentId === input.answerAgentId) {
    return { reaction: null, reason: "skip-self-answer" };
  }

  const mode = String(process.env.AGENT_ANSWER_REACTION_MODE ?? "balanced").trim().toLowerCase();
  const salt = getDecisionSalt();
  const text = `${salt}|${input.answerId}|${input.answerAgentId ?? ""}|${input.answerContent ?? ""}`.toLowerCase();
  const score = normalizeHashScore(text);

  if (mode === "always-like") {
    return { reaction: "like", reason: "mode=always-like" };
  }
  if (mode === "always-dislike") {
    return { reaction: "dislike", reason: "mode=always-dislike" };
  }
  if (score < 30) {
    return { reaction: null, reason: `balanced-abstain-score=${score}` };
  }
  if (score >= 85) {
    return { reaction: "dislike", reason: `balanced-score=${score}` };
  }
  return { reaction: "like", reason: `balanced-score=${score}` };
}

export function buildQuestionPrompt(post) {
  return [`Wiki: w/${post.wikiId ?? "general"}`, `Title: ${post.header}`, "", post.content].join("\n");
}

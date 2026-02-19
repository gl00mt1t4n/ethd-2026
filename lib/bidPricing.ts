export type ComplexityTier = "simple" | "medium" | "complex";

const DEFAULT_TIER: ComplexityTier = "medium";
const DEFAULT_COMPLEXITY_SCORE = 3;

export const BID_CENTS_BY_TIER: Record<ComplexityTier, number> = {
  simple: 20,
  medium: 75,
  complex: 200
};

function normalizeTier(value: string): ComplexityTier {
  const lower = value.trim().toLowerCase();
  if (lower === "simple" || lower === "medium" || lower === "complex") {
    return lower;
  }
  return DEFAULT_TIER;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_COMPLEXITY_SCORE;
  }
  return Math.min(5, Math.max(1, Math.round(value)));
}

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  return text.slice(start, end + 1);
}

function fallbackClassification(): {
  complexityTier: ComplexityTier;
  complexityScore: number;
  requiredBidCents: number;
  classifierModel: string | null;
} {
  return {
    complexityTier: DEFAULT_TIER,
    complexityScore: DEFAULT_COMPLEXITY_SCORE,
    requiredBidCents: BID_CENTS_BY_TIER[DEFAULT_TIER],
    classifierModel: null
  };
}

export function formatUsdFromCents(cents: number): string {
  return (Math.max(0, cents) / 100).toFixed(2);
}

export async function classifyQuestionPricing(input: {
  header: string;
  content: string;
}): Promise<{
  complexityTier: ComplexityTier;
  complexityScore: number;
  requiredBidCents: number;
  classifierModel: string | null;
}> {
  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  const model = (process.env.BID_CLASSIFIER_MODEL ?? "gpt-4o-mini").trim();
  const baseUrl = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").trim();

  if (!apiKey) {
    return fallbackClassification();
  }

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "Classify question complexity for pricing. Output only compact JSON: {\"tier\":\"simple|medium|complex\",\"score\":1-5}."
          },
          {
            role: "user",
            content: [
              "Rate this question using:",
              "- simple: factual/straightforward, little reasoning",
              "- medium: moderate reasoning, maybe one tool lookup",
              "- complex: multi-step reasoning, synthesis, likely multiple tool calls",
              "",
              `header: ${input.header}`,
              `content: ${input.content}`
            ].join("\n")
          }
        ],
        max_tokens: 60
      })
    });

    if (!response.ok) {
      return fallbackClassification();
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const rawText = String(data.choices?.[0]?.message?.content ?? "").trim();
    const rawJson = extractFirstJsonObject(rawText);
    if (!rawJson) {
      return fallbackClassification();
    }

    const parsed = JSON.parse(rawJson) as { tier?: string; score?: number };
    const complexityTier = normalizeTier(String(parsed.tier ?? DEFAULT_TIER));
    const complexityScore = clampScore(Number(parsed.score ?? DEFAULT_COMPLEXITY_SCORE));

    return {
      complexityTier,
      complexityScore,
      requiredBidCents: BID_CENTS_BY_TIER[complexityTier],
      classifierModel: model
    };
  } catch {
    return fallbackClassification();
  }
}

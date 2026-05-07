import * as vscode from "vscode";

export interface AiInsight {
  id: string;
  generatedAt: string;
  bullets: string[];
  suggestion: string;
}

const INSIGHTS_KEY = "devToolkit.sessionTracker.aiInsights.history";

export function getAiInsightHistory(state: vscode.Memento): AiInsight[] {
  return state.get<AiInsight[]>(INSIGHTS_KEY, []);
}

export async function saveAiInsight(state: vscode.Memento, insight: AiInsight): Promise<void> {
  const history = [insight, ...getAiInsightHistory(state)].slice(0, 4);
  await state.update(INSIGHTS_KEY, history);
}

export async function generateAiInsight(
  summary: unknown,
  githubToken: string | undefined
): Promise<AiInsight> {
  const config = vscode.workspace.getConfiguration("devToolkit.sessionTracker");
  const aiConfig = config.get<{ enabled?: boolean; model?: string }>("aiInsights", {});
  if (!aiConfig?.enabled) {
    throw new Error("AI insights are disabled. Enable devToolkit.sessionTracker.aiInsights.enabled first.");
  }
  if (!githubToken) {
    throw new Error("Connect GitHub first. AI insights use your existing GitHub token for GitHub Models.");
  }

  const res = await fetch("https://models.github.ai/inference/chat/completions", {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${githubToken}`,
      "X-GitHub-Api-Version": "2026-03-10",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: aiConfig.model || "openai/gpt-4.1-mini",
      temperature: 0.4,
      max_tokens: 500,
      messages: [
        {
          role: "system",
          content:
            "You are a concise productivity coach. Return only valid JSON with keys bullets and suggestion.",
        },
        {
          role: "user",
          content: `Return JSON with keys bullets (3-5 short strings) and suggestion (one short string). Use only this anonymized FocusForge productivity summary:\n${JSON.stringify(summary)}`,
        },
      ],
    }),
  });
  if (!res.ok) {
    const message = await res.text().catch(() => "");
    throw new Error(`GitHub Models insight request failed: ${res.status}${message ? ` ${message}` : ""}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content ?? "{}";
  const jsonText = text.match(/\{[\s\S]*\}/)?.[0] ?? text;
  const parsed = JSON.parse(jsonText) as { bullets?: string[]; suggestion?: string };
  return {
    id: `insight_${Date.now()}`,
    generatedAt: new Date().toISOString(),
    bullets: (parsed.bullets ?? []).slice(0, 5),
    suggestion: parsed.suggestion ?? "Review your most focused time blocks and plan around them.",
  };
}

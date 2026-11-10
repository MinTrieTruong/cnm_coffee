/**
 * ai/agent/quickReply.ts — Mẫu trả lời nhanh: khớp thì trả lời ngay, không gọi AI (rẻ, nhanh).
 * So khớp trên chữ đã bỏ dấu, chữ thường; EXACT so cả câu (bỏ dấu câu), CONTAINS so theo cả cụm từ.
 */
import type { AiAgent, AiQuickReply } from "@prisma/client";
import { foldVi } from "../knowledge/text.js";

export type QuickHit = { reply: string; action: "NONE" | "HANDOFF"; name: string };

/** Thay {self} / {customer} bằng cách xưng hô của agent; đứng đầu câu thì viết hoa chữ đầu ("Em", "Anh/chị") */
export function fillPronouns(text: string, agent: Pick<AiAgent, "selfPronoun" | "customerPronoun">) {
  const words: Record<string, string> = { self: agent.selfPronoun, customer: agent.customerPronoun };
  return text.replace(/(^|[.!?…]\s+|\n\s*)?\{(self|customer)\}/g, (_, lead: string | undefined, k: string) => {
    const w = words[k];
    return lead !== undefined ? `${lead}${w.charAt(0).toUpperCase()}${w.slice(1)}` : w;
  });
}

export function matchQuickReply(text: string, rules: AiQuickReply[], agent: Pick<AiAgent, "selfPronoun" | "customerPronoun">): QuickHit | null {
  const t = foldVi(text);
  if (!t) return null;
  const padded = ` ${t} `;
  for (const r of [...rules].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)) {
    if (!r.enabled) continue;
    const patterns = (Array.isArray(r.patterns) ? r.patterns : []).map((p) => foldVi(String(p))).filter(Boolean);
    const hit = r.matchType === "EXACT" ? patterns.includes(t) : patterns.some((p) => padded.includes(` ${p} `));
    if (!hit) continue;
    const replies = (Array.isArray(r.replies) ? r.replies : []).map(String).filter(Boolean);
    if (!replies.length && r.action !== "HANDOFF") continue;
    const pick = replies[Math.floor(Math.random() * replies.length)] ?? "";
    return { reply: fillPronouns(pick, agent), action: r.action === "HANDOFF" ? "HANDOFF" : "NONE", name: r.name };
  }
  return null;
}

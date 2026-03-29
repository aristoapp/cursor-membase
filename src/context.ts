import type { MembaseHttpClient } from "./api";

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export async function buildSessionStartContext(
  client: MembaseHttpClient,
  maxChars: number,
): Promise<string | null> {
  const [settings, search] = await Promise.allSettled([
    client.getUserSettings(),
    client.searchMemory("", 12),
  ]);

  const parts: string[] = ["## Membase context (session start)\n"];

  if (settings.status === "fulfilled") {
    const s = settings.value;
    if (s.display_name) {
      parts.push(`**User:** ${s.display_name}`);
    }
    if (s.instructions) {
      parts.push(`**Instructions:** ${truncate(s.instructions, 1200)}`);
    }
    if (s.interests) {
      parts.push(`**Interests:** ${truncate(s.interests, 600)}`);
    }
  }

  if (search.status === "fulfilled") {
    const nodes = search.value.nodes ?? [];
    const episodes = nodes.filter((n) => (n.labels ?? []).includes("Episodic"));
    const picked = episodes.length > 0 ? episodes : nodes;
    if (picked.length > 0) {
      parts.push("\n**Recent memories:**");
      for (const n of picked.slice(0, 10)) {
        const title = n.display_title || n.name || n.summary || "(memory)";
        const body = n.summary && n.summary !== title ? n.summary : "";
        const line = body
          ? `- ${truncate(title, 200)}: ${truncate(body, 400)}`
          : `- ${truncate(title, 400)}`;
        parts.push(line);
      }
    }
  }

  const text = parts.join("\n").trim();
  if (text.length < 40) return null;
  if (text.length > maxChars) {
    return `${text.slice(0, maxChars - 1)}…`;
  }
  return text;
}

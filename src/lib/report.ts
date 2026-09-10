export type MatchStatus = "ok" | "partial" | "miss";

export interface MatchItem {
  status: MatchStatus;
  req: string;
  detail: string;
}

export const KNOWN_SECTIONS = [
  "总分",
  "一句话结论",
  "岗位匹配对照",
  "三大优点",
  "问题清单",
  "逐条改法",
  "AI修改建议",
  "关键词补齐",
  "可继续增强的方向",
];

export function parseReport(report: string): { title: string; content: string }[] {
  const found: { title: string; start: number; contentStart: number }[] = [];
  const regex = /【([^】]+)】/g;
  let m: RegExpExecArray | null;

  while ((m = regex.exec(report)) !== null) {
    const raw = m[1].trim();
    const known = KNOWN_SECTIONS.find((k) => raw === k || raw.includes(k) || k.includes(raw));
    if (known) {
      found.push({ title: known, start: m.index, contentStart: m.index + m[0].length });
    }
  }

  const sections: { title: string; content: string }[] = [];
  for (let i = 0; i < found.length; i++) {
    const end = i + 1 < found.length ? found[i + 1].start : report.length;
    sections.push({
      title: found[i].title,
      content: report.slice(found[i].contentStart, end).trim(),
    });
  }
  return sections;
}

export function parseMatchItems(content: string): MatchItem[] {
  const items: MatchItem[] = [];
  for (const raw of content.split("\n")) {
    const line = raw.trim().replace(/^[-*•]\s*/, "");
    if (!line) continue;
    if (/^[|\s:-]+$/.test(line)) continue;

    let cells = line.split("|").map((s) => s.trim());
    if (cells.length > 1) {
      if (cells[0] === "") cells.shift();
      if (cells[cells.length - 1] === "") cells.pop();
    }
    if (cells.length === 0) continue;

    let status: MatchStatus | null = null;
    if (/✅/.test(cells[0])) status = "ok";
    else if (/⚠/.test(cells[0])) status = "partial";
    else if (/❌/.test(cells[0])) status = "miss";
    if (!status) continue;

    cells[0] = cells[0].replace(/[✅⚠️❌]/g, "").trim();
    if (!cells[0]) cells.shift();

    const req = cells[0] || "";
    const detail = cells.slice(1).join(" ");
    if (req || detail) items.push({ status, req, detail });
  }
  return items;
}

const SECTION_ICONS: { match: string; icon: string }[] = [
  { match: "总分", icon: "🎯" },
  { match: "结论", icon: "💡" },
  { match: "匹配对照", icon: "✅" },
  { match: "优点", icon: "👍" },
  { match: "问题清单", icon: "⚠️" },
  { match: "逐条改法", icon: "✏️" },
  { match: "AI修改建议", icon: "🤖" },
  { match: "关键词", icon: "🔑" },
  { match: "增强的方向", icon: "🚀" },
];

export function sectionIcon(title: string): string {
  const found = SECTION_ICONS.find((s) => title.includes(s.match));
  return found ? found.icon : "📌";
}

export function matchRate(items: MatchItem[]): number {
  if (items.length === 0) return 0;
  const ok = items.filter((i) => i.status === "ok").length;
  const partial = items.filter((i) => i.status === "partial").length;
  return Math.round(((ok + partial * 0.5) / items.length) * 100);
}

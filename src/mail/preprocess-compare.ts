export type InformationStatus = "保持" | "原文に記載なし" | "削除された可能性" | "判定不能";

const labels: Record<"project" | "talent", Record<string, RegExp[]>> = {
  project: {
    price: [/単価/i, /price/i], workStyle: [/勤務形態/i, /work\s*style/i], phase: [/担当工程/i, /工程/i, /phase/i], projectName: [/案件名/i, /project\s*name/i],
    skills: [/必須スキル/i, /尚可スキル/i, /スキル/i, /skills?/i], location: [/勤務地/i, /最寄り駅/i, /location/i], startDate: [/開始時期/i, /start\s*date/i], commercialFlowRestriction: [/商流制限/i, /商流/i],
  },
  talent: {
    desiredWorkStyle: [/希望勤務形態/i, /勤務形態/i, /work\s*style/i], desiredPrice: [/希望単価/i, /単価/i, /desired\s*price/i], skills: [/スキル/i, /skills?/i], availableFrom: [/稼働開始/i, /available\s*from/i], availablePeriod: [/稼働可能期間/i, /available\s*period/i], nearestStation: [/最寄り駅/i, /nearest\s*station/i], yearsOfExperience: [/経験年数/i, /経験/i, /years?\s*of\s*experience/i],
  },
};

function matchingLines(text: string, patterns: RegExp[]): string[] {
  return text.split(/\r?\n/).map((line) => line.replace(/<[^>]*>/g, "").trim()).filter((line) => patterns.some((pattern) => pattern.test(line)));
}

export function checkInformationRetention(kind: "project" | "talent", original: string, processed: string): Record<string, InformationStatus> {
  const result: Record<string, InformationStatus> = {};
  for (const [field, patterns] of Object.entries(labels[kind])) {
    const originalLines = matchingLines(original, patterns);
    if (originalLines.length === 0) { result[field] = "判定不能"; continue; }
    const retained = originalLines.every((line) => processed.includes(line.trim()));
    result[field] = retained ? "保持" : "削除された可能性";
  }
  return result;
}

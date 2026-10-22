export type TalentRegistrationPeriod = "1" | "2" | "3" | "all";

export function parseTalentRegistrationPeriod(value: string | null): TalentRegistrationPeriod {
  return value === "2" || value === "3" || value === "all" ? value : "1";
}

export function getTalentRegistrationSince(now: Date, period: TalentRegistrationPeriod): Date | undefined {
  if (period === "all") return undefined;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric"
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const monthsAgo = Number(period);

  // PostgreSQL receives the instant corresponding to JST on the first day of the target month.
  return new Date(Date.UTC(year, month - 1 - monthsAgo, 1) - (9 * 60 * 60 * 1000));
}

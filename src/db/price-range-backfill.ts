export type PriceRange = { min: number | null; max: number | null };

type ProjectPriceRow = {
  id: string;
  rate: string | null;
  unitPriceMin: number | null;
  unitPriceMax: number | null;
  rateMin: bigint | null;
  rateMax: bigint | null;
};

type TalentPriceRow = {
  id: string;
  desiredRate: string | null;
  desiredPriceMin: number | null;
  desiredPriceMax: number | null;
  desiredRateMin: bigint | null;
  desiredRateMax: bigint | null;
};

export type ProjectPriceBackfillPlan = {
  id: string;
  unitPriceRange: PriceRange | null;
  rateRange: { min: bigint | null; max: bigint | null } | null;
};

export type TalentPriceBackfillPlan = {
  id: string;
  desiredPriceRange: PriceRange | null;
  desiredRateRange: { min: bigint | null; max: bigint | null } | null;
};

/** Parses only clear integer 万円 values; ambiguous values stay NULL. */
export function parseLegacyPriceRange(value: string | null, role: "project" | "talent"): PriceRange {
  if (!value) return { min: null, max: null };
  const text = value.normalize("NFKC").replaceAll(",", "").trim();
  const unit = text.match(/^(\d+)\s*万(?:円)?(?:\s*[〜~～-]\s*(\d+)\s*万(?:円)?)?$/u);
  if (unit) {
    const first = Number(unit[1]);
    const second = unit[2] ? Number(unit[2]) : null;
    if (second !== null) return first <= second ? { min: first, max: second } : { min: null, max: null };
    return role === "project" ? { min: null, max: first } : { min: first, max: null };
  }
  const bound = text.match(/^(\d+)\s*万円?\s*(以上|以下|〜|~|～)$/u);
  if (!bound) return { min: null, max: null };
  const amount = Number(bound[1]);
  return bound[2] === "以上" || bound[2] === "〜" || bound[2] === "~" || bound[2] === "～"
    ? { min: amount, max: null }
    : { min: null, max: amount };
}

function toYen(value: number | null): bigint | null {
  return value == null ? null : BigInt(value) * 10_000n;
}

function hasValue(range: PriceRange): boolean {
  return range.min !== null || range.max !== null;
}

export function planProjectPriceBackfill(rows: readonly ProjectPriceRow[]): ProjectPriceBackfillPlan[] {
  return rows.flatMap((row) => {
    const parsed = parseLegacyPriceRange(row.rate, "project");
    const unitPriceRange = row.unitPriceMin == null && row.unitPriceMax == null && hasValue(parsed) ? parsed : null;
    const canonicalRange = row.unitPriceMin != null || row.unitPriceMax != null
      ? { min: row.unitPriceMin, max: row.unitPriceMax }
      : parsed;
    const rateRange = row.rateMin == null && row.rateMax == null && hasValue(canonicalRange)
      ? { min: toYen(canonicalRange.min), max: toYen(canonicalRange.max) }
      : null;
    return unitPriceRange || rateRange ? [{ id: row.id, unitPriceRange, rateRange }] : [];
  });
}

export function planTalentPriceBackfill(rows: readonly TalentPriceRow[]): TalentPriceBackfillPlan[] {
  return rows.flatMap((row) => {
    const parsed = parseLegacyPriceRange(row.desiredRate, "talent");
    const desiredPriceRange = row.desiredPriceMin == null && row.desiredPriceMax == null && hasValue(parsed) ? parsed : null;
    const canonicalRange = row.desiredPriceMin != null || row.desiredPriceMax != null
      ? { min: row.desiredPriceMin, max: row.desiredPriceMax }
      : parsed;
    const desiredRateRange = row.desiredRateMin == null && row.desiredRateMax == null && hasValue(canonicalRange)
      ? { min: toYen(canonicalRange.min), max: toYen(canonicalRange.max) }
      : null;
    return desiredPriceRange || desiredRateRange ? [{ id: row.id, desiredPriceRange, desiredRateRange }] : [];
  });
}

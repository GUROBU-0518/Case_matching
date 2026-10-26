export type AmountRange = {
  readonly minYen: number | null;
  readonly maxYen: number | null;
};

const EMPTY_RANGE: AmountRange = { minYen: null, maxYen: null };

function invalidRange(): AmountRange {
  return EMPTY_RANGE;
}

function parseManAmount(man: string, remainder?: string): number | undefined {
  const amount = Number(man) * 10_000 + (remainder ? Number(remainder) : 0);
  return Number.isSafeInteger(amount) ? amount : undefined;
}

function parseSingleAmount(value: string): number | undefined {
  const manMatch = /^(\d+(?:\.\d+)?)万(\d+)?円?$/u.exec(value);
  if (manMatch?.[1]) return parseManAmount(manMatch[1], manMatch[2]);

  const yenMatch = /^(\d+(?:\.\d+)?)円$/u.exec(value);
  if (!yenMatch?.[1]) return undefined;

  const amount = Number(yenMatch[1]);
  return Number.isSafeInteger(amount) ? amount : undefined;
}

function normalizeAmountText(value: string): string {
  return value.normalize("NFKC").replace(/[\s,]/gu, "");
}

function removeSupportedSuffix(value: string): string {
  const supportedNote = /\((?:応相談|調整可能|相談可能(?:、\d+(?:~|〜|～|-)\d+時間)?)\)$/u;
  return value.replace(supportedNote, "").replace(/程度$/u, "");
}

export function parseAmountRange(value: string | null | undefined): AmountRange {
  if (value === null || value === undefined || !value.trim()) return invalidRange();

  const normalized = removeSupportedSuffix(normalizeAmountText(value));
  if (!normalized || /(?:以下|以上|未満|超|まで|から)$/u.test(normalized)) return invalidRange();

  const rangeMatch = /^(\d+(?:\.\d+)?)(?:万(?:円)?)?[~〜～-](\d+(?:\.\d+)?)万(?:円)?$/u.exec(normalized);
  if (rangeMatch?.[1] && rangeMatch[2]) {
    const minYen = parseManAmount(rangeMatch[1]);
    const maxYen = parseManAmount(rangeMatch[2]);
    if (minYen === undefined || maxYen === undefined || minYen > maxYen) return invalidRange();
    return { minYen, maxYen };
  }

  const amount = parseSingleAmount(normalized);
  return amount === undefined ? invalidRange() : { minYen: amount, maxYen: amount };
}

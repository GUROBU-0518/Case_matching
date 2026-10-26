export class AiUsageBudget {
  readonly limit: number;
  private used = 0;
  constructor(limit = Number.POSITIVE_INFINITY) {
    if (limit !== Number.POSITIVE_INFINITY && (!Number.isInteger(limit) || limit < 1)) throw new Error("AI呼び出し上限は正の整数で指定してください");
    this.limit = limit;
  }
  tryConsume(): boolean { if (this.used >= this.limit) return false; this.used += 1; return true; }
  get count(): number { return this.used; }
}

/** 未設定なら無制限。設定時は正の整数だけを受け付ける。 */
export function parseAiMaxCalls(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return Number.POSITIVE_INFINITY;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) throw new Error("AI_MAX_CALLSは正の整数で指定してください");
  return limit;
}

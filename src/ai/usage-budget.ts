export class AiUsageBudget {
  readonly limit: number;
  private used = 0;
  constructor(limit = 10) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error("AI呼び出し上限は1以上の整数で指定してください");
    this.limit = limit;
  }
  tryConsume(): boolean { if (this.used >= this.limit) return false; this.used += 1; return true; }
  get count(): number { return this.used; }
}

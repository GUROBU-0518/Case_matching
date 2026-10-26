import { describe, expect, it } from "vitest";
import { parseTestMailTargets, validateFetchedTestMail } from "../src/mail/test-mail-targets.ts";
import { summarizeTestMailTimings } from "../src/batch/test-mail-metrics.ts";

const targets = Array.from({ length: 10 }, (_, index) => ({ mailboxId: "intern@example.com", graphMessageId: `id-${index}`, subject: `subject-${index}`, receivedAt: `2026-10-23T00:0${index}:00.000Z` }));

describe("test mail target validation", () => {
  it("accepts exactly ten unique targets", () => expect(parseTestMailTargets(targets)).toHaveLength(10));
  it("rejects missing or extra targets", () => { expect(() => parseTestMailTargets(targets.slice(0, 9))).toThrow(); expect(() => parseTestMailTargets([...targets, { ...targets[0], graphMessageId: "id-10" }])).toThrow(); });
  it("rejects duplicate IDs and mismatched fetched metadata", () => { expect(() => parseTestMailTargets(targets.map((target, i) => i === 9 ? { ...target, graphMessageId: "id-0" } : target))).toThrow(); expect(() => validateFetchedTestMail(targets[0]!, { mailboxId: "intern@example.com", messageId: "id-0", subject: "different", sender: "x@example.com", receivedAt: new Date(targets[0]!.receivedAt), body: "body" })).toThrow(); });
  it("distinguishes sum from wall-clock time", () => { const result = summarizeTestMailTimings([{ number: 1, aiStartedAt: "2026-10-23T00:00:00.000Z", aiEndedAt: "2026-10-23T00:00:02.000Z", aiDurationMs: 2000, success: true, retryCount: 0 }, { number: 2, aiStartedAt: "2026-10-23T00:00:01.000Z", aiEndedAt: "2026-10-23T00:00:03.000Z", aiDurationMs: 2000, success: true, retryCount: 0 }]); expect(result.aiDurationSumMs).toBe(4000); expect(result.aiWallClockMs).toBe(3000); });
});

export interface TestMailTiming { number: number; aiStartedAt?: string; aiEndedAt?: string; aiDurationMs?: number; saveStartedAt?: string; saveEndedAt?: string; saveDurationMs?: number; success: boolean; retryCount: number; }

export function summarizeTestMailTimings(timings: readonly TestMailTiming[]) {
  const durations = timings.flatMap((timing) => timing.aiDurationMs === undefined ? [] : [timing.aiDurationMs]);
  const aiStarted = timings.flatMap((timing) => timing.aiStartedAt ? [Date.parse(timing.aiStartedAt)] : []);
  const aiEnded = timings.flatMap((timing) => timing.aiEndedAt ? [Date.parse(timing.aiEndedAt)] : []);
  return {
    aiCallCount: timings.length,
    aiDurationSumMs: durations.reduce((sum, duration) => sum + duration, 0),
    aiDurationAverageMs: durations.length ? durations.reduce((sum, duration) => sum + duration, 0) / durations.length : 0,
    aiDurationMinMs: durations.length ? Math.min(...durations) : 0,
    aiDurationMaxMs: durations.length ? Math.max(...durations) : 0,
    aiWallClockMs: aiStarted.length && aiEnded.length ? Math.max(...aiEnded) - Math.min(...aiStarted) : 0,
  };
}

let consecutiveFailures = 0;
let lastFailureTime: string | null = null;

export function recordFetchResult(ok: boolean): void {
  if (ok) {
    consecutiveFailures = 0;
  } else {
    consecutiveFailures++;
    lastFailureTime = new Date().toISOString();
  }
}

export function getConsecutiveFailures(): number {
  return consecutiveFailures;
}

export function getLastFailureTime(): string | null {
  return lastFailureTime;
}

export function getFailureStatus(threshold: number): { ok: boolean; consecutive: number; threshold: number; lastFailure: string | null } {
  return {
    ok: consecutiveFailures < threshold,
    consecutive: consecutiveFailures,
    threshold,
    lastFailure: lastFailureTime,
  };
}

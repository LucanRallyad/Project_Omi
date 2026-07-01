/** Shared helpers to throttle external API calls and dedupe in-flight work. */

const inflight = new Map<string, Promise<unknown>>();

/** Coalesce concurrent calls with the same key into one promise. */
export function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const promise = fn().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

export class RateLimiter {
  private chain: Promise<void> = Promise.resolve();
  private pausedUntil = 0;

  constructor(
    private minIntervalMs: number,
    private pauseMsOnLimit = 120_000
  ) {}

  isPaused(): boolean {
    return Date.now() < this.pausedUntil;
  }

  pause(): void {
    this.pausedUntil = Date.now() + this.pauseMsOnLimit;
  }

  /** Run `fn` after respecting spacing and any active pause window. */
  run<T>(fn: () => Promise<T>): Promise<T> {
    const task = this.chain.then(async () => {
      const wait = Math.max(0, this.pausedUntil - Date.now());
      if (wait > 0) await sleep(wait);
      await sleep(this.minIntervalMs);
      return fn();
    });
    this.chain = task.then(
      () => undefined,
      () => undefined
    );
    return task;
  }
}

export async function runPool<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
  gapMs = 0
): Promise<T[]> {
  const results = new Array<T>(tasks.length);
  let next = 0;

  async function worker() {
    while (next < tasks.length) {
      const index = next++;
      results[index] = await tasks[index]();
      if (gapMs > 0 && next < tasks.length) await sleep(gapMs);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, worker)
  );
  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { sleep };

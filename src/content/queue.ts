export type Task = () => Promise<void>;

/**
 * FIFO scheduler with a concurrency cap. Queued (not yet started) work can be cancelled,
 * which is how a tweet that scrolls out of view before its turn avoids being billed.
 */
export class Scheduler {
  private queue: { key: string; task: Task }[] = [];
  private running = new Set<string>();
  private listeners = new Set<() => void>();
  concurrency: number;

  constructor(concurrency: number) {
    this.concurrency = concurrency;
  }

  get pending(): number {
    return this.queue.length;
  }
  get inflight(): number {
    return this.running.size;
  }

  has(key: string): boolean {
    return this.running.has(key) || this.queue.some((q) => q.key === key);
  }

  isQueued(key: string): boolean {
    return this.queue.some((q) => q.key === key);
  }

  enqueue(key: string, task: Task): boolean {
    if (this.has(key)) return false;
    this.queue.push({ key, task });
    this.emit();
    this.pump();
    return true;
  }

  cancel(key: string): boolean {
    const i = this.queue.findIndex((q) => q.key === key);
    if (i < 0) return false;
    this.queue.splice(i, 1);
    this.emit();
    return true;
  }

  clear(): void {
    this.queue.length = 0;
    this.emit();
  }

  setConcurrency(n: number): void {
    this.concurrency = Math.max(1, n);
    this.pump();
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private pump(): void {
    while (this.running.size < this.concurrency && this.queue.length > 0) {
      const next = this.queue.shift()!;
      this.running.add(next.key);
      this.emit();
      next
        .task()
        .catch(() => {})
        .finally(() => {
          this.running.delete(next.key);
          this.emit();
          this.pump();
        });
    }
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}

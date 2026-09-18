/** Small LRU on top of Map's insertion order. Pure, no browser APIs. */
export class LruCache<V> {
  private map = new Map<string, V>();
  max: number;

  constructor(max: number) {
    this.max = max;
  }

  get size(): number {
    return this.map.size;
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  get(key: string): V | undefined {
    const v = this.map.get(key);
    if (v === undefined) return undefined;
    this.map.delete(key);
    this.map.set(key, v);
    return v;
  }

  set(key: string, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  clear(): void {
    this.map.clear();
  }

  entries(): [string, V][] {
    return Array.from(this.map.entries());
  }

  static from<V>(entries: [string, V][], max: number): LruCache<V> {
    const c = new LruCache<V>(max);
    for (const [k, v] of entries) c.set(k, v);
    return c;
  }
}

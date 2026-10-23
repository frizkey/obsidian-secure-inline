export class PassphraseCache {
  private entries = new Map<string, { expiry: number; addedAt: number }>();
  private counter = 0;

  constructor(private now: () => number = () => Date.now()) {}

  add(passphrase: string, ttlMinutes: number): void {
    if (!passphrase || ttlMinutes <= 0) {
      return;
    }
    this.entries.set(passphrase, {
      expiry: this.now() + ttlMinutes * 60 * 1000,
      addedAt: ++this.counter,
    });
  }

  getPassphrases(): string[] {
    const now = this.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiry <= now) {
        this.entries.delete(key);
      }
    }
    return [...this.entries.entries()]
      .sort((a, b) => b[1].addedAt - a[1].addedAt)
      .map(([key]) => key);
  }

  clear(): void {
    this.entries.clear();
  }

  size(): number {
    this.getPassphrases();
    return this.entries.size;
  }
}

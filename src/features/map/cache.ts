export class PromiseCache<Key, Value> {
  private readonly entries = new Map<Key, Promise<Value>>()

  get(key: Key, loader: () => Promise<Value>): Promise<Value> {
    const existing = this.entries.get(key)
    if (existing) return existing

    const pending = Promise.resolve().then(loader)
    this.entries.set(key, pending)
    pending.catch(() => {
      if (this.entries.get(key) === pending) this.entries.delete(key)
    })
    return pending
  }

  clear(key?: Key): void {
    if (key === undefined) {
      this.entries.clear()
      return
    }
    this.entries.delete(key)
  }
}

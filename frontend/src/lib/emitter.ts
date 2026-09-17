type Listener<T> = (payload: T) => void

export class Emitter<Events extends object> {
  private listeners: { [K in keyof Events]?: Set<Listener<Events[K]>> } = {}

  on<K extends keyof Events>(event: K, cb: Listener<Events[K]>): () => void {
    const set = (this.listeners[event] ??= new Set())
    set.add(cb)
    return () => set.delete(cb)
  }

  protected emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    this.listeners[event]?.forEach((cb) => {
      try {
        cb(payload)
      } catch (err) {
        console.error(`listener for "${String(event)}" failed`, err)
      }
    })
  }
}

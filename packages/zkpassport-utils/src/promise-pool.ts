// Promise pool for controlled concurrency
export class PromisePool {
  private queue: (() => Promise<void>)[] = []
  private activePromises = 0
  private onCompletionCallbacks: (() => void)[] = []
  private _errors: Error[] = []
  private isClosed = false

  constructor(private concurrency: number) {}

  async add(fn: () => Promise<void>): Promise<void> {
    if (this.isClosed) {
      throw new Error("Cannot add to closed PromisePool")
    }

    if (this.activePromises >= this.concurrency) {
      // Queue the task if we're at max concurrency
      return new Promise<void>((resolve, reject) => {
        this.queue.push(async () => {
          try {
            await fn()
            resolve()
          } catch (error) {
            this._errors.push(error instanceof Error ? error : new Error(String(error)))
            reject(error)
          }
        })
      })
    } else {
      // Execute immediately if under the concurrency limit
      this.activePromises++
      try {
        await fn()
      } catch (error) {
        this._errors.push(error instanceof Error ? error : new Error(String(error)))
        throw error
      } finally {
        this.activePromises--
        // Process next queued task if any
        if (this.queue.length > 0) {
          const next = this.queue.shift()!
          this.add(() => next())
        } else if (this.activePromises === 0) {
          // If no active promises and queue is empty, notify all completion callbacks
          this.notifyCompletion()
        }
      }
    }
  }

  private notifyCompletion() {
    // Call all completion callbacks
    for (const callback of this.onCompletionCallbacks) {
      callback()
    }
    this.onCompletionCallbacks = []
  }

  async await(): Promise<void> {
    // If there are no active promises and no queued tasks, return immediately
    if (this.activePromises === 0 && this.queue.length === 0) {
      return
    }

    // Otherwise, wait for all queued and active promises to complete
    return new Promise<void>((resolve) => {
      this.onCompletionCallbacks.push(resolve)
    })
  }

  async drain(): Promise<void> {
    this.isClosed = true
    await this.await()
    if (this._errors.length > 0) {
      throw new AggregateError(this._errors, "Errors occurred during execution")
    }
  }

  get active(): number {
    return this.activePromises
  }

  get queued(): number {
    return this.queue.length
  }

  get size(): number {
    return this.activePromises + this.queue.length
  }

  get hasErrors(): boolean {
    return this._errors.length > 0
  }

  get errors(): Error[] {
    return [...this._errors]
  }
}

// AggregateError polyfill for environments that don't support it natively
class CustomAggregateError extends Error {
  errors: Error[]
  constructor(errors: Error[], message: string) {
    super(message)
    this.name = "AggregateError"
    this.errors = errors
  }
}

// Use native AggregateError if available, otherwise use our polyfill
const AggregateError =
  typeof globalThis !== "undefined" && "AggregateError" in globalThis
    ? (globalThis as any).AggregateError
    : CustomAggregateError

export { AggregateError }

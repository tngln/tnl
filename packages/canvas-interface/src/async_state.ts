export type AsyncRun = {
  isCurrent(): boolean
  commit(fn: () => void): boolean
}

type AsyncRunOptions = {
  clearError?: boolean
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function createAsyncJobState(opts: { invalidate?: () => void } = {}) {
  const invalidate = opts.invalidate ?? (() => {})

  let activeJobs = 0
  let latestSeq = 0
  let error: string | null = null

  function begin(clearError: boolean) {
    activeJobs += 1
    if (clearError) error = null
    invalidate()
  }

  function finish() {
    activeJobs = Math.max(0, activeJobs - 1)
    invalidate()
  }

  return {
    busy() {
      return activeJobs > 0
    },
    error() {
      return error
    },
    setError(next: string | null) {
      if (error === next) return
      error = next
      invalidate()
    },
    async run<T>(job: () => Promise<T>, options: AsyncRunOptions = {}) {
      begin(options.clearError !== false)
      try {
        return await job()
      } catch (nextError) {
        error = toErrorMessage(nextError)
        return undefined
      } finally {
        finish()
      }
    },
    async runLatest<T>(job: (run: AsyncRun) => Promise<T>, options: AsyncRunOptions = {}) {
      const seq = ++latestSeq
      begin(options.clearError !== false)
      const run: AsyncRun = {
        isCurrent: () => seq === latestSeq,
        commit(fn) {
          if (seq !== latestSeq) return false
          fn()
          return true
        },
      }

      try {
        return await job(run)
      } catch (nextError) {
        if (run.isCurrent()) error = toErrorMessage(nextError)
        return undefined
      } finally {
        finish()
      }
    },
  }
}

export type AppErrorDomain = "app" | "builder" | "docking" | "opfs" | "platform" | "playback" | "ui" | "window"

export type AppErrorInit = {
  domain: AppErrorDomain
  code: string
  message: string
  details?: Record<string, unknown>
  cause?: unknown
  name?: string
}

export type AppErrorInfo = {
  name: string
  message: string
  domain?: string
  code?: string
  details?: Record<string, unknown>
  stack?: string
  cause?: AppErrorInfo | string
}

export class AppError extends Error {
  readonly domain: AppErrorDomain
  readonly code: string
  readonly details?: Record<string, unknown>

  constructor(init: AppErrorInit) {
    super(init.message)
    this.name = init.name ?? "AppError"
    this.domain = init.domain
    this.code = init.code
    this.details = init.details
    ;(this as Error & { cause?: unknown }).cause = init.cause
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

export function toAppError(error: unknown, fallback: Omit<AppErrorInit, "cause"> & { cause?: unknown }) {
  if (error instanceof AppError) return error
  if (error instanceof Error) {
    return new AppError({
      ...fallback,
      message: fallback.message || error.message,
      cause: error,
    })
  }
  return new AppError({
    ...fallback,
    message: fallback.message || String(error),
    cause: error,
  })
}

export function invariant(condition: unknown, init: AppErrorInit): asserts condition {
  if (condition) return
  throw new AppError(init)
}

export function describeError(error: unknown) {
  if (error instanceof AppError) return `[${error.domain}:${error.code}] ${error.message}`
  if (error instanceof Error) return error.message
  return String(error)
}

export function toErrorInfo(error: unknown): AppErrorInfo {
  if (error instanceof AppError) {
    return {
      name: error.name,
      message: error.message,
      domain: error.domain,
      code: error.code,
      details: error.details,
      stack: error.stack,
      cause: error.cause ? toErrorCause(error.cause) : undefined,
    }
  }
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause ? toErrorCause(error.cause) : undefined,
    }
  }
  return {
    name: typeof error,
    message: String(error),
  }
}

function toErrorCause(error: unknown) {
  if (error instanceof Error) return toErrorInfo(error)
  return String(error)
}
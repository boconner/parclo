import type { Request, Response, NextFunction } from 'express'

// Minimal in-memory sliding-window rate limiter.
//
// Deliberately dependency-free and process-local. The API runs as a single
// Render instance, so a shared store would be over-engineering today — but note
// that limits reset on deploy/restart, and this would need Redis (or the DB) if
// the API is ever scaled to multiple instances.

interface Bucket { hits: number[] }

const buckets = new Map<string, Bucket>()

// Drop stale buckets so the map cannot grow without bound.
const SWEEP_MS = 10 * 60 * 1000
setInterval(() => {
  const cutoff = Date.now() - SWEEP_MS
  for (const [key, bucket] of buckets) {
    bucket.hits = bucket.hits.filter(t => t > cutoff)
    if (bucket.hits.length === 0) buckets.delete(key)
  }
}, SWEEP_MS).unref()

export interface RateLimitOptions {
  /** Window length in milliseconds. */
  windowMs: number
  /** Max requests allowed per key within the window. */
  max: number
  /** Derives the bucket key from the request (e.g. IP, or token + IP). */
  keyFn: (req: Request) => string
  /** Prefix so separate limiters never share a bucket. */
  name: string
}

export function rateLimit(opts: RateLimitOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${opts.name}:${opts.keyFn(req)}`
    const now = Date.now()
    const bucket = buckets.get(key) ?? { hits: [] }

    bucket.hits = bucket.hits.filter(t => t > now - opts.windowMs)

    if (bucket.hits.length >= opts.max) {
      buckets.set(key, bucket)
      const retryAfter = Math.ceil((bucket.hits[0]! + opts.windowMs - now) / 1000)
      res.setHeader('Retry-After', String(retryAfter))
      return res.status(429).json({ error: 'Too many requests. Please try again later.' })
    }

    bucket.hits.push(now)
    buckets.set(key, bucket)
    next()
  }
}

/**
 * Best-effort client IP. Render sits behind a proxy, so prefer X-Forwarded-For.
 *
 * Note this is spoofable — it is fine for throttling casual abuse, which is all
 * it is used for, but must never be treated as an identity.
 */
export function clientIp(req: Request): string {
  const fwd = req.header('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  return req.ip ?? 'unknown'
}

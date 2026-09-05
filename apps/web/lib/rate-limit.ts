import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

const redisUrl = process.env.RATELIMIT_REDIS_KV_REST_API_URL;
const redisToken = process.env.RATELIMIT_REDIS_KV_REST_API_TOKEN;

const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

/**
 * Sliding-window limit applied to every /api/* request in middleware.ts, keyed
 * by client IP. 60 req/60s is generous enough for normal UI use (a page can
 * fire a handful of parallel fetches) while stopping scripted abuse or
 * credential-stuffing against any endpoint, not just login. When the Upstash
 * env vars aren't set (e.g. local dev without `vercel env pull`), this is
 * null and middleware skips the check rather than failing closed or crashing.
 */
export const apiRateLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, "60 s"),
      analytics: true,
      prefix: "ratelimit:api"
    })
  : null;

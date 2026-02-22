import { z } from 'zod'
import dotenv from 'dotenv'
dotenv.config()

const isProd = process.env.NODE_ENV === 'production'

const envSchema = z.object({
  JWT_SECRET: isProd
    ? z.string().min(16, 'JWT_SECRET must be at least 16 characters in production')
    : z.string().default('dev-secret-change-in-prod'),
  ADMIN_SECRET: isProd
    ? z.string().min(16, 'ADMIN_SECRET must be at least 16 characters in production')
    : z.string().default('admin-dev-secret'),
  DATABASE_URL: z.string().min(1),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  SERVER_URL: z.string().default('http://localhost:3001'),
  REDIS_URL: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  PYTHON_AGENT_URL: z.string().default('http://localhost:8000'),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('CollabBoard <onboarding@resend.dev>'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  DB_CA_CERT: z.string().optional(),
  AGENT_SHARED_SECRET: isProd
    ? z.string().min(16, 'AGENT_SHARED_SECRET required in production — set the same value on both server and python-agent services')
    : z.string().default('agent-dev-secret'),
  TRUSTED_PROXIES: z.string().optional(),
})

export const config = envSchema.parse(process.env)

import { Logger } from '@nestjs/common';
import { z } from 'zod';

const DEFAULT_JWT_SECRET = 'change-me-to-a-long-random-string';
const DEFAULT_MINIO_CREDENTIAL = 'minioadmin';

/** Порожнє значення в .env (`KEY=`) — те саме, що не задане. */
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const booleanFlag = z.enum(['true', 'false']).transform((value) => value === 'true');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    API_PORT: z.coerce.number().int().positive().default(3000),
    WEB_ORIGIN: z.string().url().default('http://localhost:5174'),
    // За reverse proxy (nginx, Caddy) — щоб rate limit бачив IP клієнта, а не проксі.
    TRUST_PROXY: optional(booleanFlag),
    SWAGGER_ENABLED: optional(booleanFlag),
    // Тека зібраного фронту (apps/web/dist): API віддає його сам, коли фронт і бек на одному сервісі.
    WEB_DIST_DIR: optional(z.string()),

    JWT_SECRET: z.string().min(32, 'JWT_SECRET має бути щонайменше 32 символи'),
    JWT_EXPIRES_IN: z.string().default('7d'),

    DB_HOST: z.string().default('localhost'),
    DB_EXTERNAL_PORT: z.coerce.number().int().positive().default(5432),
    DB_USERNAME: z.string().min(1),
    DB_PASSWORD: z.string().min(1),
    DB_NAME: z.string().min(1),
    // Керовані Postgres (Supabase, Neon) приймають лише TLS-з'єднання.
    DB_SSL: optional(booleanFlag),

    REDIS_URL: z.string().url().default('redis://localhost:6379'),

    // S3-сумісне сховище 3D-моделей. Без S3_ENDPOINT — справжній AWS S3 у S3_REGION.
    S3_ENDPOINT: optional(z.string().url()),
    S3_REGION: z.string().default('us-east-1'),
    S3_BUCKET: z.string().min(3).default('carintel-photos'),
    S3_ACCESS_KEY: z.string().min(1).default(DEFAULT_MINIO_CREDENTIAL),
    S3_SECRET_KEY: z.string().min(1).default(DEFAULT_MINIO_CREDENTIAL),
    S3_FORCE_PATH_STYLE: booleanFlag.default('true'),

    ANALYSES_DAILY_LIMIT: z.coerce.number().int().positive().default(20),
  })
  // Решту змінних (ключі LLM, HF_TOKEN тощо) сервіси читають самі.
  .passthrough();

export type Env = z.infer<typeof envSchema>;

/** Перевіряє .env при старті: з неправильним конфігом API не запускається. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Некоректні змінні оточення:\n${issues.join('\n')}`);
  }

  const env = parsed.data;
  if (env.JWT_SECRET === DEFAULT_JWT_SECRET) {
    if (env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET має стандартне значення з .env.example — задай власний секрет');
    }
    Logger.warn('JWT_SECRET має стандартне значення з .env.example — у продакшені API не запуститься', 'Config');
  }
  if (env.NODE_ENV === 'production' && env.S3_SECRET_KEY === DEFAULT_MINIO_CREDENTIAL) {
    throw new Error('S3_SECRET_KEY має стандартне значення MinIO — задай власні ключі сховища');
  }
  return env;
}

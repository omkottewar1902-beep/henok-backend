import { PrismaClient } from '@prisma/client';

function normalizeDatabaseUrl(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  try {
    const url = new URL(raw);
    const isSupabasePooler = url.hostname.includes('pooler.supabase');
    const isTransactionPort = url.port === '6543';
    if (isSupabasePooler || isTransactionPort) {
      if (!url.searchParams.has('pgbouncer')) url.searchParams.set('pgbouncer', 'true');
      if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '1');
    }
    return url.toString();
  } catch {
    return raw;
  }
}

const normalized = normalizeDatabaseUrl(process.env.DATABASE_URL);
if (normalized && normalized !== process.env.DATABASE_URL) {
  process.env.DATABASE_URL = normalized;
}

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  datasources: normalized ? { db: { url: normalized } } : undefined,
});

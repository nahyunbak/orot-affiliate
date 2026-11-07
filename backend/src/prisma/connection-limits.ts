export function limitDatabaseConnections(raw: string, limit = 2): string {
  if (!Number.isInteger(limit) || limit < 1 || limit > 5) {
    throw new Error('DATABASE_CONNECTION_LIMIT must be an integer from 1 to 5');
  }
  const url = new URL(raw);
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw new Error('A PostgreSQL connection is required');
  url.searchParams.set('connection_limit', String(limit));
  url.searchParams.set('pool_timeout', '15');
  url.searchParams.set('connect_timeout', '10');
  url.searchParams.set('max_idle_connection_lifetime', '30');
  return url.toString();
}

// apps/warehouse/src/state.ts
import type { Warehouse } from './db.js';

export interface EtlState {
  lastProcessedTimestamp: string | null;
  lastProcessedSession: string | null;
}

export async function readState(db: Warehouse, source: string): Promise<EtlState> {
  const rows = await db.query<{
    last_processed_timestamp: string | null;
    last_processed_session: string | null;
  }>(
    'SELECT last_processed_timestamp, last_processed_session FROM etl_state WHERE source = ?',
    source,
  );
  if (rows.length === 0) {
    return { lastProcessedTimestamp: null, lastProcessedSession: null };
  }
  const row = rows[0]!;
  return {
    lastProcessedTimestamp: row.last_processed_timestamp,
    lastProcessedSession: row.last_processed_session,
  };
}

export async function writeState(db: Warehouse, source: string, state: EtlState): Promise<void> {
  await db.run(
    `INSERT INTO etl_state (source, last_processed_timestamp, last_processed_session)
     VALUES (?, ?, ?)
     ON CONFLICT (source) DO UPDATE SET
       last_processed_timestamp = excluded.last_processed_timestamp,
       last_processed_session   = excluded.last_processed_session`,
    source,
    state.lastProcessedTimestamp,
    state.lastProcessedSession,
  );
}

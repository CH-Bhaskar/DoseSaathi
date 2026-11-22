/* Offline outbox, stored in IndexedDB (not localStorage) so queued
 * mutations survive a browser restart. Each item has a client-generated
 * UUID and the dose-event upsert is keyed on
 * (schedule_id, scheduled_date, scheduled_time), so replaying the queue
 * can never create a duplicate dose record. */
import { openDB, type IDBPDatabase } from 'idb'
import type { OutboxItem } from '../types'

const DB_NAME = 'dosesathi-offline'
const STORE = 'outbox'

let dbPromise: Promise<IDBPDatabase> | null = null

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE)) {
          database.createObjectStore(STORE, { keyPath: 'id' })
        }
      },
    })
  }
  return dbPromise
}

export async function enqueueOutbox(
  item: Omit<OutboxItem, 'id' | 'created_at' | 'attempts' | 'last_error'>,
): Promise<OutboxItem> {
  const full: OutboxItem = {
    ...item,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    attempts: 0,
    last_error: null,
  }
  const database = await db()
  await database.put(STORE, full)
  return full
}

export async function listOutbox(): Promise<OutboxItem[]> {
  const database = await db()
  const items = await database.getAll(STORE)
  return (items as OutboxItem[]).sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  )
}

export async function removeOutbox(id: string): Promise<void> {
  const database = await db()
  await database.delete(STORE, id)
}

export async function markOutboxFailed(id: string, error: string): Promise<void> {
  const database = await db()
  const item = (await database.get(STORE, id)) as OutboxItem | undefined
  if (!item) return
  await database.put(STORE, {
    ...item,
    attempts: item.attempts + 1,
    last_error: error,
  })
}

export async function clearOutbox(): Promise<void> {
  const database = await db()
  await database.clear(STORE)
}

export async function outboxCount(): Promise<number> {
  const database = await db()
  return database.count(STORE)
}

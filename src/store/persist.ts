// Saves the prototype's data in the browser's IndexedDB, which has far more room than
// localStorage (the demo data is several MB). Falls back to memory only if it's unavailable.
import type { DbState } from '../data/types'

const DB_NAME = 'patops'
const STORE = 'kv'
const KEY = 'db'
const LEGACY_KEY = 'patops.db'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function loadSaved(): Promise<DbState | null> {
  try {
    const idb = await open()
    const value = await new Promise<DbState | undefined>((resolve, reject) => {
      const req = idb.transaction(STORE).objectStore(STORE).get(KEY)
      req.onsuccess = () => resolve(req.result as DbState | undefined)
      req.onerror = () => reject(req.error)
    })
    if (value) return value
  } catch {
    // IndexedDB unavailable; try the legacy copy below.
  }
  // Data saved by earlier versions of the prototype lived in localStorage.
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (raw) return JSON.parse(raw) as DbState
  } catch {
    // ignore
  }
  return null
}

let writing = false
let queued: DbState | null = null

/**
 * Writes the latest state. If a write is already running, only the newest state is written next,
 * so rapid edits don't pile up but the final state always lands.
 */
export async function save(db: DbState): Promise<void> {
  if (writing) {
    queued = db
    return
  }
  writing = true
  await write(db)
  writing = false
  if (queued) {
    const next = queued
    queued = null
    await save(next)
  }
}

async function write(db: DbState): Promise<void> {
  try {
    const idb = await open()
    await new Promise<void>((resolve, reject) => {
      const tx = idb.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(db, KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    localStorage.removeItem(LEGACY_KEY)
  } catch {
    // Not persisted; the app keeps working in memory.
  }
}

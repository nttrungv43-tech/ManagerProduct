// src/db/schema.js
export const CREATE_TABLES_SQL = `
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS order_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL DEFAULT 'active',
  finished_date TEXT,
  total_target INTEGER DEFAULT 0,
  total_produced INTEGER DEFAULT 0,
  total_defect INTEGER DEFAULT 0,
  pallets_done INTEGER DEFAULT 0,
  pallets_total INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS items (
  ntk TEXT NOT NULL,
  po TEXT,
  target INTEGER,
  order_batch_id INTEGER NOT NULL,
  PRIMARY KEY (ntk, order_batch_id)
);

CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ntk TEXT NOT NULL,
  order_batch_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 0,
  line TEXT DEFAULT 'manual',
  defect_qty INTEGER DEFAULT 0,
  defect_types TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_entries_date ON entries(date);
CREATE INDEX IF NOT EXISTS idx_entries_ntk ON entries(ntk, order_batch_id);
CREATE INDEX IF NOT EXISTS idx_entries_batch ON entries(order_batch_id);

CREATE TABLE IF NOT EXISTS pallet_status (
  key TEXT PRIMARY KEY,
  order_batch_id INTEGER NOT NULL,
  done INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_pallet_batch ON pallet_status(order_batch_id);

CREATE TABLE IF NOT EXISTS container_data (
  batch_id INTEGER PRIMARY KEY,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_container_batch ON container_data(batch_id);
`;
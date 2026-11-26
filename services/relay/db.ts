// SQLite storage (node:sqlite, built into Node 22). One file: data/killswitch.db
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const dbPath = process.env.KS_DB ?? "data/killswitch.db";
mkdirSync(dirname(dbPath), { recursive: true }); // create the folder the DB actually lives in (KS_DB may point outside the code)
export const db = new DatabaseSync(dbPath);

db.exec(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS ops (
  id TEXT PRIMARY KEY,
  account TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  nonce INTEGER NOT NULL,
  calls TEXT NOT NULL,
  deadline INTEGER NOT NULL,
  agent_sig TEXT,
  intent TEXT,
  source TEXT NOT NULL,          -- relay | bypass
  status TEXT NOT NULL,          -- pending | confirmed | blocked | held | rejected | failed | denied
  verdict TEXT,                  -- allow | cosign | hold | reject | blocked
  score INTEGER DEFAULT 0,
  reasons TEXT DEFAULT '[]',
  summary TEXT,
  outflows TEXT,
  cosigned INTEGER DEFAULT 0,
  llm TEXT,
  tx_hash TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ops_account ON ops(account, created_at);
CREATE INDEX IF NOT EXISTS ops_agent ON ops(account, agent_id, created_at);
CREATE TABLE IF NOT EXISTS recipients (
  account TEXT NOT NULL, address TEXT NOT NULL, first_seen INTEGER NOT NULL,
  PRIMARY KEY (account, address)
);
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account TEXT NOT NULL, agent_id TEXT, level TEXT NOT NULL, message TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS labels (
  account TEXT NOT NULL, agent_id TEXT NOT NULL, label TEXT NOT NULL,
  PRIMARY KEY (account, agent_id)
);
CREATE TABLE IF NOT EXISTS accounts (address TEXT PRIMARY KEY, owner TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
`);

export type OpRow = {
  id: string; account: string; agent_id: string; nonce: number; calls: string; deadline: number;
  agent_sig: string | null; intent: string | null; source: string; status: string; verdict: string | null;
  score: number; reasons: string; summary: string | null; outflows: string | null; cosigned: number;
  llm: string | null; tx_hash: string | null; error: string | null; created_at: number; updated_at: number;
};

export const now = () => Math.floor(Date.now() / 1000);
const lc = (s: string) => s.toLowerCase();

export function insertOp(op: Omit<OpRow, "created_at" | "updated_at" | "score" | "reasons" | "cosigned"> & Partial<OpRow>) {
  const t = now();
  db.prepare(
    `INSERT INTO ops (id,account,agent_id,nonce,calls,deadline,agent_sig,intent,source,status,verdict,score,reasons,summary,outflows,cosigned,llm,tx_hash,error,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    op.id, lc(op.account), lc(op.agent_id), op.nonce, op.calls, op.deadline, op.agent_sig ?? null, op.intent ?? null,
    op.source, op.status, op.verdict ?? null, op.score ?? 0, op.reasons ?? "[]", op.summary ?? null, op.outflows ?? null,
    op.cosigned ?? 0, op.llm ?? null, op.tx_hash ?? null, op.error ?? null, t, t,
  );
}

export function updateOp(id: string, patch: Partial<OpRow>) {
  const keys = Object.keys(patch);
  if (!keys.length) return;
  const sets = keys.map((k) => `${k} = ?`).join(", ");
  db.prepare(`UPDATE ops SET ${sets}, updated_at = ? WHERE id = ?`).run(...(keys.map((k) => (patch as any)[k]) as any[]), now(), id);
}

export const getOp = (id: string) => db.prepare(`SELECT * FROM ops WHERE id = ?`).get(id) as OpRow | undefined;

export const listOps = (account: string, limit = 100) =>
  db.prepare(`SELECT * FROM ops WHERE account = ? ORDER BY created_at DESC, rowid DESC LIMIT ?`).all(lc(account), limit) as OpRow[];

export const findOpByNonce = (account: string, agentId: string, nonce: number) =>
  db.prepare(`SELECT * FROM ops WHERE account = ? AND agent_id = ? AND nonce = ? AND status IN ('pending','confirmed','held') ORDER BY created_at DESC LIMIT 1`)
    .get(lc(account), lc(agentId), nonce) as OpRow | undefined;

export const recentOps = (account: string, agentId: string, sinceSec: number) =>
  db.prepare(`SELECT * FROM ops WHERE account = ? AND agent_id = ? AND created_at >= ?`).all(lc(account), lc(agentId), now() - sinceSec) as OpRow[];

export const isKnownRecipient = (account: string, address: string) =>
  !!db.prepare(`SELECT 1 FROM recipients WHERE account = ? AND address = ?`).get(lc(account), lc(address));

export const addRecipient = (account: string, address: string) =>
  db.prepare(`INSERT OR IGNORE INTO recipients (account,address,first_seen) VALUES (?,?,?)`).run(lc(account), lc(address), now());

export function addAlert(account: string, agentId: string | null, level: "info" | "warn" | "critical", message: string) {
  db.prepare(`INSERT INTO alerts (account,agent_id,level,message,created_at) VALUES (?,?,?,?,?)`).run(lc(account), agentId ? lc(agentId) : null, level, message, now());
}
export const listAlerts = (account: string, limit = 50) =>
  db.prepare(`SELECT * FROM alerts WHERE account = ? ORDER BY id DESC LIMIT ?`).all(lc(account), limit);

export const setLabel = (account: string, agentId: string, label: string) =>
  db.prepare(`INSERT OR REPLACE INTO labels (account,agent_id,label) VALUES (?,?,?)`).run(lc(account), lc(agentId), label);
export const getLabel = (account: string, agentId: string) =>
  (db.prepare(`SELECT label FROM labels WHERE account = ? AND agent_id = ?`).get(lc(account), lc(agentId)) as { label: string } | undefined)?.label;

export const addAccount = (address: string, owner: string) =>
  db.prepare(`INSERT OR IGNORE INTO accounts (address, owner) VALUES (?,?)`).run(lc(address), lc(owner));
export const allAccounts = () => (db.prepare(`SELECT address FROM accounts`).all() as { address: string }[]).map((r) => r.address);

export const kvGet = (k: string) => (db.prepare(`SELECT v FROM kv WHERE k = ?`).get(k) as { v: string } | undefined)?.v;
export const kvSet = (k: string, v: string) => db.prepare(`INSERT OR REPLACE INTO kv (k,v) VALUES (?,?)`).run(k, v);

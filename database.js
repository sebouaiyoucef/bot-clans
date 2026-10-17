const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const dataDir = path.join(__dirname, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, "peak-clans.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS clans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  tag TEXT NOT NULL COLLATE NOCASE UNIQUE,
  leader_id TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS clan_members (
  user_id TEXT PRIMARY KEY,
  clan_id INTEGER NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('leader','coleader','member')),
  joined_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS clan_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clan_id INTEGER NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  inviter_id TEXT NOT NULL,
  invitee_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(clan_id, invitee_id, status)
);
CREATE TABLE IF NOT EXISTS wars (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenger_clan_id INTEGER NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  opponent_clan_id INTEGER NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','reported','completed','cancelled')),
  winner_clan_id INTEGER REFERENCES clans(id) ON DELETE SET NULL,
  reported_by TEXT,
  reported_winner_id INTEGER REFERENCES clans(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK(challenger_clan_id != opponent_clan_id)
);
CREATE TABLE IF NOT EXISTS war_confirmations (
  war_id INTEGER NOT NULL REFERENCES wars(id) ON DELETE CASCADE,
  clan_id INTEGER NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  PRIMARY KEY(war_id, clan_id)
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT,
  action TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

function log(actorId, action, details) {
  db.prepare("INSERT INTO audit_logs(actor_id, action, details) VALUES (?, ?, ?)")
    .run(actorId || null, action, String(details).slice(0, 1500));
}

module.exports = { db, log };

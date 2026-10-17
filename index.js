require("dotenv").config();
const express = require("express");
const nacl = require("tweetnacl");
const { db, log } = require("./database");
const { REST, Routes } = require("discord.js");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf.toString("utf8"); }
}));

const rest = DISCORD_TOKEN ? new REST({ version: "10" }).setToken(DISCORD_TOKEN) : null;
const response = (content, ephemeral = true) => ({
  type: 4,
  data: { content: String(content).slice(0, 1900), ...(ephemeral ? { flags: 64 } : {}) }
});
const getUserId = i => i.member?.user?.id || i.user?.id;
const getGuildId = i => i.guild_id || null;
const getOpt = (i, name) => i.data?.options?.find(o => o.name === name);
const getSub = i => i.data?.options?.[0]?.name;
const getSubOpt = (i, name) => i.data?.options?.[0]?.options?.find(o => o.name === name)?.value;
const userTag = id => `<@${id}>`;
const safeTag = tag => String(tag || "").trim().toUpperCase();

function memberClan(userId) {
  return db.prepare(`SELECT c.*, m.role FROM clan_members m JOIN clans c ON c.id=m.clan_id WHERE m.user_id=?`).get(userId);
}
function findClanByTag(tag) {
  return db.prepare("SELECT * FROM clans WHERE tag = ? COLLATE NOCASE").get(safeTag(tag));
}
function canManage(clan, userId) {
  return clan && clan.leader_id === userId;
}
function clanMemberCount(clanId) {
  return db.prepare("SELECT COUNT(*) AS n FROM clan_members WHERE clan_id=?").get(clanId).n;
}
function displayClan(c) {
  return c ? `**[${c.tag}] ${c.name}** — ${c.points} points` : "Clan not found.";
}
function ensureGuild(i) {
  if (!getGuildId(i)) throw new Error("Use this command inside a Discord server.");
}
function audit(i, action, details) { log(getUserId(i), action, details); }
function ensureLeaderOrCo(clan, userId) {
  if (!clan || (clan.leader_id !== userId && clan.role !== "coleader")) {
    throw new Error("Only the clan leader or a co-leader can do that.");
  }
}
function clanForWarParticipant(war, clanId) {
  return war && (war.challenger_clan_id === clanId || war.opponent_clan_id === clanId);
}
function getWar(id) {
  return db.prepare(`SELECT w.*, a.name AS challenger_name, a.tag AS challenger_tag,
    b.name AS opponent_name, b.tag AS opponent_tag,
    win.name AS winner_name, win.tag AS winner_tag
    FROM wars w JOIN clans a ON a.id=w.challenger_clan_id
    JOIN clans b ON b.id=w.opponent_clan_id
    LEFT JOIN clans win ON win.id=w.winner_clan_id WHERE w.id=?`).get(id);
}
function formatWar(w) {
  if (!w) return "War not found.";
  return `**War #${w.id}** [${w.challenger_tag}] ${w.challenger_name} vs [${w.opponent_tag}] ${w.opponent_name}\nStatus: **${w.status}**${w.winner_tag ? `\nWinner: **[${w.winner_tag}] ${w.winner_name}**` : ""}`;
}
function auditLines(limit = 10) {
  return db.prepare("SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?").all(limit)
    .map(x => `#${x.id} · ${x.action} · ${x.details} · <t:${Math.floor(new Date(x.created_at + " UTC").getTime()/1000)}:R>`)
    .join("\n");
}

async function handleClan(i, sub) {
  ensureGuild(i);
  const uid = getUserId(i);
  if (sub === "create") {
    const name = String(getSubOpt(i, "name") || "").trim();
    const tag = safeTag(getSubOpt(i, "tag"));
    if (!/^[A-Z0-9]{2,6}$/.test(tag)) throw new Error("Tag must contain 2–6 letters/numbers (A–Z, 0–9).");
    if (name.length < 2 || name.length > 32) throw new Error("Clan name must be 2–32 characters.");
    if (memberClan(uid)) throw new Error("You are already in a clan. Leave it before creating another.");
    const tx = db.transaction(() => {
      const info = db.prepare("INSERT INTO clans(name, tag, leader_id) VALUES (?, ?, ?)").run(name, tag, uid);
      db.prepare("INSERT INTO clan_members(user_id, clan_id, role) VALUES (?, ?, 'leader')").run(uid, info.lastInsertRowid);
      log(uid, "clan.create", `[${tag}] ${name}`);
      return info.lastInsertRowid;
    });
    try { tx(); } catch (e) {
      if (String(e.message).includes("UNIQUE")) throw new Error("That clan name or tag is already taken.");
      throw e;
    }
    return response(`Clan created successfully!\n**[${tag}] ${name}**\nYou are the clan leader. Invite members with \`/clan invite\`.`);
  }
  if (sub === "info") {
    const tag = getSubOpt(i, "tag");
    const c = tag ? findClanByTag(tag) : memberClan(uid);
    if (!c) throw new Error(tag ? "No clan found with that tag." : "You are not in a clan. Use `/clan create`.");
    const leader = userTag(c.leader_id);
    return response(`${displayClan(c)}\nLeader: ${leader}\nMembers: ${clanMemberCount(c.id)}\nCreated: ${c.created_at} UTC`);
  }
  if (sub === "invite") {
    const c = memberClan(uid);
    ensureLeaderOrCo(c, uid);
    const target = getSubOpt(i, "user");
    if (!target || target === uid) throw new Error("Choose another user.");
    if (memberClan(target)) throw new Error("That user is already in a clan.");
    const existing = db.prepare("SELECT id FROM clan_invites WHERE clan_id=? AND invitee_id=? AND status='pending'").get(c.id, target);
    if (existing) throw new Error("That user already has a pending invite from your clan.");
    db.prepare("INSERT INTO clan_invites(clan_id, inviter_id, invitee_id) VALUES (?, ?, ?)").run(c.id, uid, target);
    audit(i, "clan.invite", `[${c.tag}] invited ${target}`);
    return response(`Invitation created for ${userTag(target)} to join **[${c.tag}] ${c.name}**. They can use \`/clan join tag:${c.tag}\`.`);
  }
  if (sub === "join") {
    const tag = safeTag(getSubOpt(i, "tag"));
    const c = findClanByTag(tag);
    if (!c) throw new Error("No clan found with that tag.");
    if (memberClan(uid)) throw new Error("You are already in a clan.");
    const inv = db.prepare("SELECT * FROM clan_invites WHERE clan_id=? AND invitee_id=? AND status='pending'").get(c.id, uid);
    if (!inv) throw new Error("You do not have a pending invitation for that clan.");
    const tx = db.transaction(() => {
      db.prepare("INSERT INTO clan_members(user_id, clan_id, role) VALUES (?, ?, 'member')").run(uid, c.id);
      db.prepare("UPDATE clan_invites SET status='accepted' WHERE id=?").run(inv.id);
      log(uid, "clan.join", `[${c.tag}] joined`);
    });
    tx();
    return response(`You joined **[${c.tag}] ${c.name}**. Welcome!`);
  }
  if (sub === "leave") {
    const c = memberClan(uid);
    if (!c) throw new Error("You are not in a clan.");
    if (c.leader_id === uid) throw new Error("The clan leader cannot leave. Promote another member or ask an admin to delete the clan.");
    db.prepare("DELETE FROM clan_members WHERE user_id=?").run(uid);
    audit(i, "clan.leave", `[${c.tag}] left`);
    return response(`You left **[${c.tag}] ${c.name}**.`);
  }
  if (sub === "kick") {
    const c = memberClan(uid);
    ensureLeaderOrCo(c, uid);
    const target = getSubOpt(i, "user");
    const targetMember = db.prepare("SELECT * FROM clan_members WHERE user_id=? AND clan_id=?").get(target, c.id);
    if (!targetMember) throw new Error("That user is not in your clan.");
    if (target === uid || targetMember.role === "leader") throw new Error("You cannot kick yourself or the clan leader.");
    if (c.role === "coleader" && targetMember.role === "coleader") throw new Error("A co-leader cannot remove another co-leader.");
    db.prepare("DELETE FROM clan_members WHERE user_id=?").run(target);
    audit(i, "clan.kick", `[${c.tag}] removed ${target}`);
    return response(`${userTag(target)} was removed from **[${c.tag}] ${c.name}**.`);
  }
  if (sub === "promote") {
    const c = memberClan(uid);
    if (!canManage(c, uid)) throw new Error("Only the clan leader can promote members.");
    const target = getSubOpt(i, "user");
    const tm = db.prepare("SELECT * FROM clan_members WHERE user_id=? AND clan_id=?").get(target, c.id);
    if (!tm) throw new Error("That user is not in your clan.");
    if (target === uid) throw new Error("You are already the leader.");
    db.prepare("UPDATE clan_members SET role='coleader' WHERE user_id=?").run(target);
    audit(i, "clan.promote", `[${c.tag}] promoted ${target}`);
    return response(`${userTag(target)} is now a co-leader of **[${c.tag}] ${c.name}**.`);
  }
  if (sub === "members") {
    const tag = getSubOpt(i, "tag");
    const c = tag ? findClanByTag(tag) : memberClan(uid);
    if (!c) throw new Error("Clan not found. Use `/clan members tag:TAG` or join a clan.");
    const rows = db.prepare(`SELECT user_id, role, joined_at FROM clan_members WHERE clan_id=? ORDER BY CASE role WHEN 'leader' THEN 0 WHEN 'coleader' THEN 1 ELSE 2 END, joined_at`).all(c.id);
    return response(`**[${c.tag}] ${c.name} — Members (${rows.length})**\n${rows.map((m, n) => `${n+1}. ${userTag(m.user_id)} — ${m.role}`).join("\n") || "No members."}`);
  }
  throw new Error("Unknown clan subcommand.");
}

async function handleWar(i, sub) {
  ensureGuild(i);
  const uid = getUserId(i);
  if (sub === "challenge") {
    const own = memberClan(uid);
    if (!own) throw new Error("Join or create a clan first.");
    if (own.role === "member") throw new Error("Only the leader or co-leader can challenge another clan.");
    const other = findClanByTag(getSubOpt(i, "tag"));
    if (!other) throw new Error("Opponent clan not found.");
    if (other.id === own.id) throw new Error("You cannot challenge your own clan.");
    const pending = db.prepare(`SELECT id FROM wars WHERE status IN ('pending','accepted','reported')
      AND ((challenger_clan_id=? AND opponent_clan_id=?) OR (challenger_clan_id=? AND opponent_clan_id=?))`).get(own.id, other.id, other.id, own.id);
    if (pending) throw new Error(`These clans already have an active war (#${pending.id}).`);
    const info = db.prepare("INSERT INTO wars(challenger_clan_id, opponent_clan_id) VALUES (?, ?)").run(own.id, other.id);
    audit(i, "war.challenge", `#${info.lastInsertRowid} [${own.tag}] vs [${other.tag}]`);
    return response(`War challenge sent!\n**War #${info.lastInsertRowid}**: [${own.tag}] ${own.name} vs [${other.tag}] ${other.name}\nThe opponent's leader/co-leader can use \`/war accept id:${info.lastInsertRowid}\` or \`/war decline id:${info.lastInsertRowid}\`.`);
  }
  if (sub === "list") {
    const rows = db.prepare(`SELECT w.id, w.status, a.tag AS a_tag, b.tag AS b_tag, win.tag AS winner_tag
      FROM wars w JOIN clans a ON a.id=w.challenger_clan_id JOIN clans b ON b.id=w.opponent_clan_id
      LEFT JOIN clans win ON win.id=w.winner_clan_id ORDER BY w.id DESC LIMIT 10`).all();
    return response(`**Recent Clan Wars**\n${rows.map(w => `#${w.id} · [${w.a_tag}] vs [${w.b_tag}] · ${w.status}${w.winner_tag ? ` · Winner [${w.winner_tag}]` : ""}`).join("\n") || "No wars yet."}`);
  }
  const id = getSubOpt(i, "id");
  const w = getWar(id);
  if (!w) throw new Error("War not found.");
  const own = memberClan(uid);
  if (!own || !clanMemberOfWar(w, own.id)) throw new Error("You must be a member of one of the clans in this war.");
  if (sub === "accept" || sub === "decline") {
    if (own.role === "member") throw new Error("Only a clan leader or co-leader can do that.");
    if (own.id !== w.opponent_clan_id) throw new Error("Only the challenged clan can accept or decline this war.");
    if (w.status !== "pending") throw new Error("This war is not pending.");
    db.prepare("UPDATE wars SET status=?, updated_at=datetime('now') WHERE id=?").run(sub === "accept" ? "accepted" : "declined", id);
    audit(i, `war.${sub}`, `#${id} by [${own.tag}]`);
    return response(`War #${id} ${sub}ed.\n${formatWar(getWar(id))}`);
  }
  if (sub === "report") {
    if (own.role === "member") throw new Error("Only a clan leader or co-leader can report a result.");
    if (w.status !== "accepted") throw new Error("Only an accepted war can have a result reported.");
    const winner = findClanByTag(getSubOpt(i, "winner_tag"));
    if (!winner || !clanMemberOfWar(w, winner.id)) throw new Error("Winner must be one of the two clans in this war.");
    db.prepare("UPDATE wars SET status='reported', reported_by=?, reported_winner_id=?, updated_at=datetime('now') WHERE id=?").run(uid, winner.id, id);
    audit(i, "war.report", `#${id} winner [${winner.tag}] awaiting opponent confirmation`);
    return response(`Result reported for War #${id}: **[${winner.tag}] ${winner.name}** won.\nA leader/co-leader from the other clan must use \`/war confirm id:${id}\` to finalize points.`);
  }
  if (sub === "confirm") {
    if (own.role === "member") throw new Error("Only a clan leader or co-leader can confirm a result.");
    if (w.status !== "reported") throw new Error("This war has no result waiting for confirmation.");
    if (own.id === w.reported_winner_id) throw new Error("The other clan must confirm the reported result.");
    const tx = db.transaction(() => {
      db.prepare("UPDATE wars SET status='completed', winner_clan_id=reported_winner_id, updated_at=datetime('now') WHERE id=?").run(id);
      db.prepare("UPDATE clans SET points=points+10 WHERE id=?").run(w.reported_winner_id);
      db.prepare("UPDATE clans SET points=points+3 WHERE id=?").run(own.id);
      log(uid, "war.confirm", `#${id}; winner clan ${w.reported_winner_id} +10; opponent clan ${own.id} +3`);
    });
    tx();
    return response(`War #${id} confirmed!\nWinner gets **+10 points** and the other clan gets **+3 participation points**.\n${formatWar(getWar(id))}`);
  }
  if (sub === "cancel") {
    if (own.role === "member") throw new Error("Only a clan leader or co-leader can cancel a war.");
    if (!["pending", "accepted"].includes(w.status)) throw new Error("Only pending or accepted wars can be cancelled.");
    db.prepare("UPDATE wars SET status='cancelled', updated_at=datetime('now') WHERE id=?").run(id);
    audit(i, "war.cancel", `#${id} by [${own.tag}]`);
    return response(`War #${id} cancelled.`);
  }
  throw new Error("Unknown war subcommand.");
}
function clanMemberOfWar(w, clanId) {
  return w && (w.challenger_clan_id === clanId || w.opponent_clan_id === clanId);
}

async function handleInteraction(i) {
  if (i.type !== 2) return response("This interaction type is not supported.");
  const name = i.data?.name;
  if (name === "clan") return handleClan(i, getSub(i));
  if (name === "war") return handleWar(i, getSub(i));
  if (name === "leaderboard") {
    const limit = Math.min(15, Math.max(1, getOpt(i, "limit")?.value || 10));
    const rows = db.prepare("SELECT name, tag, points FROM clans ORDER BY points DESC, created_at ASC LIMIT ?").all(limit);
    return response(`**PEAK CLANS Leaderboard**\n${rows.map((c, n) => `${["🥇","🥈","🥉"][n] || `**${n+1}.**`} **[${c.tag}] ${c.name}** — ${c.points} pts`).join("\n") || "No clans yet."}`, false);
  }
  if (name === "points") {
    const tag = getOpt(i, "tag")?.value;
    const c = tag ? findClanByTag(tag) : memberClan(getUserId(i));
    if (!c) throw new Error("Clan not found. Join a clan or provide a tag.");
    return response(`**[${c.tag}] ${c.name}** has **${c.points} points**.`, false);
  }
  if (name === "clanadmin") {
    ensureGuild(i);
    if (!i.member?.permissions || (BigInt(i.member.permissions) & 8n) !== 8n) throw new Error("Administrator permission required.");
    const sub = getSub(i);
    if (sub === "addpoints") {
      const tag = getSubOpt(i, "tag");
      const amount = getSubOpt(i, "amount");
      const reason = getSubOpt(i, "reason") || "No reason given";
      const c = findClanByTag(tag);
      if (!c) throw new Error("Clan not found.");
      const next = Math.max(0, c.points + amount);
      db.prepare("UPDATE clans SET points=? WHERE id=?").run(next, c.id);
      audit(i, "admin.points", `[${c.tag}] ${c.points} -> ${next}; ${reason}`);
      return response(`Updated **[${c.tag}] ${c.name}** points: **${c.points} → ${next}**.\nReason: ${reason}`);
    }
    if (sub === "delete") {
      const c = findClanByTag(getSubOpt(i, "tag"));
      if (!c) throw new Error("Clan not found.");
      db.prepare("DELETE FROM clans WHERE id=?").run(c.id);
      audit(i, "admin.delete", `[${c.tag}] ${c.name}`);
      return response(`Deleted clan **[${c.tag}] ${c.name}** and its related records.`);
    }
  }
  return response("Unknown command.");
}

app.get("/", (req, res) => res.status(200).send("PEAK CLANS HTTP endpoint is online."));
app.get("/health", (req, res) => res.json({ ok: true, service: "peak-clans-http" }));

app.post("/interactions", async (req, res) => {
  const signature = req.get("X-Signature-Ed25519");
  const timestamp = req.get("X-Signature-Timestamp");
  if (!PUBLIC_KEY || !signature || !timestamp || !req.rawBody) return res.sendStatus(401);
  try {
    const valid = nacl.sign.detached.verify(
      Buffer.from(timestamp + req.rawBody, "utf8"),
      Buffer.from(signature, "hex"),
      Buffer.from(PUBLIC_KEY, "hex")
    );
    if (!valid) return res.sendStatus(401);
  } catch {
    return res.sendStatus(401);
  }

  const interaction = req.body;
  if (interaction.type === 1) return res.json({ type: 1 }); // Discord PING verification

  try {
    const result = await handleInteraction(interaction);
    return res.json(result);
  } catch (err) {
    console.error("Interaction handler error:", err);
    return res.json(response(err?.message || "An unexpected error occurred."));
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`PEAK CLANS HTTP endpoint listening on port ${PORT}`);
  if (!PUBLIC_KEY) console.warn("DISCORD_PUBLIC_KEY is missing. Add it to Replit Secrets.");
  if (!CLIENT_ID) console.warn("CLIENT_ID is missing. Add it to Replit Secrets.");
});

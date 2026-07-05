const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(__dirname));
app.get("/health", (_, res) => res.send("Sunny Side Snack Shack Theme Map Pro server is awake."));

const clients = new Map();
const rooms = new Map();

const FAST = process.env.SSSS_FAST === "1";
const TOTAL_MAPS = 200;

/* ===== Difficulty ramp — MUST match index.html copies ===== */
function goalForMap(mapId, mode) {
  const base = Math.min(15, 6 + Math.floor((mapId || 0) / 20));
  return mode === "versus" ? Math.max(4, Math.round(base * 0.7)) : base;
}
function baseSecondsForMap(mapId) {
  if (FAST) return 12;
  const world = Math.floor((mapId || 0) / 10);
  const g = Math.min(15, 6 + Math.floor((mapId || 0) / 20));
  return Math.max(55, 72 + g * 6 - world * 2);
}

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
function send(ws, data) { if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(data)); }
function clientSocket(id) { return [...clients.entries()].find(([, c]) => c.id === id)?.[0]; }
function roomSend(room, data) { for (const p of room.players) send(clientSocket(p.id), data); }
function publicRooms() {
  return [...rooms.values()].filter(r => r.players.length < 4 && !r.started)
    .map(r => ({ code: r.code, mode: r.mode, players: r.players.length, hostName: r.hostName }));
}
function broadcastRooms() {
  const payload = { type: "rooms", rooms: publicRooms() };
  for (const ws of clients.keys()) send(ws, payload);
}
function roomPayload(room) {
  return {
    code: room.code, mode: room.mode, started: room.started, hostName: room.hostName,
    players: room.players.map(p => ({
      id: p.id, name: p.name, face: p.face, score: p.score || 0, served: p.served || 0,
      order: p.order || [], coopBonus: p.coopBonus || 0,
      timeUpgrade: p.timeUpgrade || 0, teamBonus: p.teamBonus || 0, prepLevel: p.prepLevel || 0
    }))
  };
}
function broadcastRoom(room) {
  roomSend(room, { type: "players", players: roomPayload(room).players });
}
function broadcastVotes(room) {
  roomSend(room, { type: "votes", votes: room.votes || {} });
}
function clearRoomTimers(room) {
  if (room.levelTimer) { clearTimeout(room.levelTimer); room.levelTimer = null; }
}

/* ===== Level lifecycle (server-authoritative timer) ===== */
function startRoomLevel(room, mapId, opts = {}) {
  clearRoomTimers(room);
  room.started = true;
  room.ended = false;
  room.phase = "playing";
  room.mapId = Math.max(0, Math.min(TOTAL_MAPS - 1, Number(mapId) || 0));
  room.goal = goalForMap(room.mapId, room.mode);
  room.seconds = baseSecondsForMap(room.mapId);
  room.levelEndsAt = Date.now() + room.seconds * 1000;
  room.teamServed = 0;
  room.sharedOrder = null;
  room.sharedTray = [];
  room.sharedCustomerName = null;
  room.sharedCustEmoji = null;
  room.sharedVip = false;
  room.transitioningOrder = false;
  room.nextVotes = {};
  for (const p of room.players) {
    p.served = 0; p.order = [];
    if (opts.first) { p.score = 0; p.coopBonus = 0; }
  }
  roomSend(room, {
    type: "start",
    level: 1, mapId: room.mapId, mode: room.mode,
    goal: room.goal, seconds: room.seconds,
    endsAt: room.levelEndsAt, serverNow: Date.now(),
    delay: opts.delay != null ? opts.delay : 350
  });
  broadcastRoom(room);
  broadcastRooms();
  room.levelTimer = setTimeout(() => onLevelTimeout(room), room.seconds * 1000 + 400);
  // Co-op: after the start settles, ask ONE client to generate the first shared order.
  if (room.mode === "coop") {
    const gen = room.players[0];
    if (gen) setTimeout(() => {
      if (rooms.has(room.code) && !room.ended && room.phase === "playing" && !room.sharedOrder)
        send(clientSocket(gen.id), { type: "requestOrder" });
    }, (opts.delay != null ? opts.delay : 350) + 500);
  }
}

function onLevelTimeout(room) {
  if (!room || room.phase !== "playing" || room.ended) return;
  // Time up: co-op fails unless goal met; versus ends with current leader.
  if (room.mode === "coop") {
    finishRoom(room, "TimeUp", false);
  } else {
    const players = [...room.players].sort((a, b) =>
      (Number(b.served || 0) - Number(a.served || 0)) || (Number(b.score || 0) - Number(a.score || 0)));
    finishRoom(room, (players[0] && players[0].name) || "Chef", false);
  }
}

function finishRoom(room, winner, win) {
  if (!room || room.ended) return;
  room.ended = true;
  room.phase = "results";
  room.lastWin = !!win;   // drives retry (fail) vs advance (win) in startNextLevel
  clearRoomTimers(room);
  const players = [...room.players].sort((a, b) =>
    (Number(b.served || 0) - Number(a.served || 0)) || (Number(b.score || 0) - Number(a.score || 0)));
  const passed = room.mode === "coop" ? !!win : true; // versus always "completes"
  for (const p of room.players) {
    send(clientSocket(p.id), {
      type: "matchEnd", winner, win: !!win, passed,
      teamServed: room.teamServed || 0, goal: room.goal || 4,
      mapId: room.mapId, mode: room.mode, players
    });
  }
  broadcastRooms();
}

function leave(ws, closing = false) {
  const c = clients.get(ws);
  if (!c) return;
  if (c.room && rooms.has(c.room)) {
    const room = rooms.get(c.room);
    const leaver = room.players.find(p => p.id === c.id);
    room.players = room.players.filter(p => p.id !== c.id);
    delete room.votes[c.id]; delete room.ready[c.id];
    if (room.nextVotes) delete room.nextVotes[c.id];
    if (room.tutorialVotes) delete room.tutorialVotes[c.id];
    if (room.players.length === 0) {
      clearRoomTimers(room);
      rooms.delete(c.room);
    } else {
      if (leaver) roomSend(room, { type: "playerLeft", name: leaver.name || "Chef", id: c.id });
      broadcastRoom(room);
      broadcastVotes(room);
      // If a co-op level is mid-play and there's no active shared order, the generator may
      // have been the one who left — re-assign order generation to a remaining player.
      if (room.mode === "coop" && room.phase === "playing" && !room.ended && !room.sharedOrder) {
        const gen = room.players[0];
        if (gen) setTimeout(() => {
          if (rooms.has(room.code) && !room.ended && room.phase === "playing" && !room.sharedOrder)
            send(clientSocket(gen.id), { type: "requestOrder" });
        }, 400);
      }
      // a leaver must not stall a waiting next-vote
      if (room.phase === "results" && room.nextVotes) {
        const count = Object.keys(room.nextVotes).length;
        if (count >= room.players.length && room.players.length > 0) {
          roomSend(room, { type: "openUpgradeBreak" });
        } else {
          roomSend(room, { type: "nextVoteState", count, total: room.players.length });
        }
      }
    }
  }
  c.room = null;
  if (closing) clients.delete(ws);
  broadcastRooms();
}

wss.on("connection", ws => {
  const id = Math.random().toString(36).slice(2);
  clients.set(ws, { id, name: "Chef", room: null, face: "🧑‍🍳" });
  send(ws, { type: "welcome", id, rooms: publicRooms() });

  ws.on("message", raw => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    const c = clients.get(ws); if (!c) return;

    if (msg.type === "hello") {
      c.name = String(msg.name || "Chef").slice(0, 14);
      broadcastRooms();
    }

    if (msg.type === "createRoom") {
      leave(ws);
      c.name = String(msg.name || c.name || "Chef").slice(0, 14);
      const code = makeCode();
      const room = {
        code, mode: msg.mode === "versus" ? "versus" : "coop", hostName: c.name,
        level: 1, mapId: 0, started: false, ended: false, phase: "lobby",
        votes: {}, ready: {}, tutorialVotes: {}, nextVotes: {},
        sharedOrder: null, sharedTray: [], sharedCustomerName: null, sharedCustEmoji: null, sharedVip: false,
        goal: goalForMap(0, "coop"), seconds: baseSecondsForMap(0), levelEndsAt: 0,
        teamServed: 0, levelTimer: null, players: []
      };
      rooms.set(code, room);
      c.room = code;
      room.players.push({ id: c.id, name: c.name, face: "🧑‍🍳", score: 0, served: 0, order: [], coopBonus: 0 });
      send(ws, { type: "room", room: roomPayload(room) });
      broadcastRooms();
    }

    if (msg.type === "joinRoom") {
      const code = String(msg.code || "").toUpperCase();
      const room = rooms.get(code);
      if (!room || room.players.length >= 4 || room.started) return send(ws, { type: "error", message: "Room not found, full, or already started." });
      leave(ws);
      c.name = String(msg.name || c.name || "Chef").slice(0, 14);
      c.room = code;
      room.players.push({ id: c.id, name: c.name, face: "👩‍🍳", score: 0, served: 0, order: [], coopBonus: 0 });
      for (const p of room.players) send(clientSocket(p.id), { type: "room", room: roomPayload(room) });
      broadcastRoom(room); broadcastRooms();
    }

    if (msg.type === "openVote") { const room = rooms.get(c.room); if (room) broadcastVotes(room); }

    if (msg.type === "vote") {
      const room = rooms.get(c.room); if (!room) return;
      room.votes[c.id] = Math.max(0, Math.min(TOTAL_MAPS - 1, Number(msg.mapId || 0)));
      broadcastVotes(room);
    }

    if (msg.type === "ready") {
      const room = rooms.get(c.room); if (!room) return;
      room.ready[c.id] = true;
      if (room.players.length >= 2 && room.players.every(p => room.ready[p.id])) {
        const payload = { type: "tutorialVote", votes: room.tutorialVotes || {} };
        for (const p of room.players) send(clientSocket(p.id), payload);
      } else broadcastVotes(room);
    }

    if (msg.type === "tutorialVote") {
      const room = rooms.get(c.room); if (!room) return;
      room.tutorialVotes[c.id] = msg.show !== false;
      const payload = { type: "tutorialVote", votes: room.tutorialVotes };
      for (const p of room.players) send(clientSocket(p.id), payload);
      if (room.players.length >= 2 && room.players.every(p => Object.prototype.hasOwnProperty.call(room.tutorialVotes, p.id))) {
        const show = Object.values(room.tutorialVotes).some(Boolean);
        for (const p of room.players) send(clientSocket(p.id), { type: "tutorialStart", show });
        const voteVals = Object.values(room.votes || {});
        const unique = [...new Set(voteVals.length ? voteVals : [0])];
        for (const p of room.players) send(clientSocket(p.id), { type: "spin", candidates: unique, duration: 1800 });
        setTimeout(() => {
          if (!rooms.has(room.code) || room.players.length === 0) return;
          const selected = unique[Math.floor(Math.random() * unique.length)] || 0;
          startRoomLevel(room, selected, { first: true, delay: 350 });
        }, 1900);
      }
    }


    if (msg.type === "customerLeft") {
      const room = rooms.get(c.room);
      if (!room || room.mode !== "coop" || room.ended || room.phase !== "playing") return;
      if (room.transitioningOrder) return;
      room.transitioningOrder = true;
      room.sharedOrder = null;
      room.sharedTray = [];
      room.sharedCustomerName = null;
      room.sharedCustEmoji = null;
      room.sharedVip = false;
      for (const p of room.players) {
        send(clientSocket(p.id), { type: "sharedTray", tray: [] });
        send(clientSocket(p.id), { type: "customerLeft", name: "Customer" });
      }
      const gen = room.players[0];
      setTimeout(() => {
        if (rooms.has(room.code) && !room.ended && room.phase === "playing" && !room.sharedOrder && gen) {
          send(clientSocket(gen.id), { type: "requestOrder" });
        }
        if (rooms.has(room.code)) room.transitioningOrder = false;
      }, 650);
    }

    if (msg.type === "newSharedOrder") {
      const room = rooms.get(c.room);
      if (!room || room.mode !== "coop" || room.ended || room.phase !== "playing") return;
      if (room.sharedOrder && room.sharedOrder.length) {
        send(ws, { type: "sharedOrder", order: room.sharedOrder, customerName: room.sharedCustomerName, custEmoji: room.sharedCustEmoji, vip: room.sharedVip });
        return;
      }
      if (!Array.isArray(msg.order) || !msg.order.length) { return; }
      room.transitioningOrder = false;
      room.sharedOrder = msg.order.slice(0, 8);
      room.sharedCustomerName = String(msg.customerName || "Team Order").slice(0, 40);
      room.sharedCustEmoji = String(msg.custEmoji || "🙂").slice(0, 8);
      room.sharedVip = !!msg.vip;
      room.sharedTray = [];
      for (const p of room.players) {
        send(clientSocket(p.id), { type: "sharedOrder", order: room.sharedOrder, customerName: room.sharedCustomerName, custEmoji: room.sharedCustEmoji, vip: room.sharedVip });
        send(clientSocket(p.id), { type: "sharedTray", tray: room.sharedTray });
      }
    }

    if (msg.type === "trayUpdate") {
      const room = rooms.get(c.room);
      if (!room || room.mode !== "coop" || room.ended || room.phase !== "playing") return;
      room.sharedTray = Array.isArray(msg.tray) ? msg.tray.slice(0, 12) : [];
      for (const p of room.players) send(clientSocket(p.id), { type: "sharedTray", tray: room.sharedTray });
    }

    if (msg.type === "orderComplete") {
      const room = rooms.get(c.room);
      if (!room || room.ended || room.phase !== "playing") return;
      const player = room.players.find(p => p.id === c.id);
      if (player) {
        player.score = Number(msg.total || player.score || 0);
        player.served = Number(msg.served || player.served || 0);
        if (msg.timeUpgrade != null) player.timeUpgrade = Number(msg.timeUpgrade) || 0;
      }
      const goal = Number(room.goal || 4);
      const wasCorrect = msg.correct !== false; // default true for back-compat
      if (room.mode === "coop") {
        // Only correct orders advance the shared team goal.
        if (wasCorrect) room.teamServed = (room.teamServed || 0) + 1;
        room.sharedTray = [];
        room.sharedOrder = null;
        room.sharedCustomerName = null;
        room.sharedCustEmoji = null;
        room.sharedVip = false;
        room.transitioningOrder = false;
        for (const p of room.players) {
          send(clientSocket(p.id), { type: "orderDone", name: player ? player.name : "Chef", score: Number(msg.score || 0), correct: wasCorrect, tray: [] });
          send(clientSocket(p.id), { type: "sharedTray", tray: [] });
          send(clientSocket(p.id), { type: "sharedState", teamServed: room.teamServed, goal });
        }
        broadcastRoom(room);
        if (room.teamServed >= goal) { finishRoom(room, "Team", true); }
        else {
          // Deterministically pick ONE client to generate the next shared order.
          const nextGen = room.players[0];
          if (nextGen) setTimeout(() => {
            if (rooms.has(room.code) && !room.ended && room.phase === "playing" && !room.sharedOrder)
              send(clientSocket(nextGen.id), { type: "requestOrder" });
          }, 700);
        }
      } else {
        for (const p of room.players) send(clientSocket(p.id), { type: "orderDone", name: player ? player.name : "Chef", score: Number(msg.score || 0), correct: wasCorrect });
        broadcastRoom(room);
        if (player && Number(player.served || 0) >= goal) finishRoom(room, player.name || "Chef", true);
      }
    }

    /* ===== Next-level vote (all must agree within 15s or go home) ===== */
    if (msg.type === "nextVote") {
      const room = rooms.get(c.room);
      if (!room) return;
      if (msg.choice !== "next") {
        leave(ws);
        send(ws, { type: "forceHome" });
        return;
      }
      room.nextVotes = room.nextVotes || {};
      room.nextVotes[c.id] = true;
      const count = Object.keys(room.nextVotes).length;
      const total = room.players.length;
      for (const p of room.players) send(clientSocket(p.id), { type: "nextVoteState", count, total });
      if (count >= total && total > 0) {
        for (const p of room.players) send(clientSocket(p.id), { type: "openUpgradeBreak" });
      }
    }
    if (msg.type === "nextVoteTimeout") {
      const room = rooms.get(c.room);
      if (!room) return;
      leave(ws);
      send(ws, { type: "forceHome" });
    }

    /* ===== Team upgrade purchase during the 30s break (co-op shares levels) ===== */
    if (msg.type === "teamUpgradeBuy") {
      const room = rooms.get(c.room); if (!room) return;
      const player = room.players.find(p => p.id === c.id); if (!player) return;
      const key = String(msg.key || "");
      if (key === "time") player.timeUpgrade = Number(msg.level || 0) || 0;
      if (key === "team") player.teamBonus = Number(msg.level || 0) || 0;
      if (key === "sync") player.prepLevel = Number(msg.level || 0) || 0;
      broadcastRoom(room);
    }

    /* ===== Advance after the upgrade break: first ready player launches next map ===== */
    if (msg.type === "startNextLevel") {
      const room = rooms.get(c.room);
      if (!room) return;
      if (room.phase !== "results") return; // already advanced
      const next = Math.min(TOTAL_MAPS - 1, (room.mapId || 0) + (room.lastWin === false ? 0 : 1));
      startRoomLevel(room, next, { delay: 250 });
    }

    if (msg.type === "progress") {
      const room = rooms.get(c.room); if (!room) return;
      const player = room.players.find(p => p.id === c.id); if (!player) return;
      player.score = Number(msg.coins || 0); player.served = Number(msg.served || 0);
      player.order = Array.isArray(msg.order) ? msg.order.slice(0, 8) : [];
      player.coopBonus = Number(msg.coopBonus || 0);
      if (msg.timeUpgrade != null) player.timeUpgrade = Number(msg.timeUpgrade) || 0;
      broadcastRoom(room);
    }

    if (msg.type === "leaveRoom") leave(ws);
  });
  ws.on("close", () => leave(ws, true));
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => console.log(`Sunny Side Snack Shack Theme Map Pro running on ${PORT}`));

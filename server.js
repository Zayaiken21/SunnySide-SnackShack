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

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
function send(ws, data) { if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(data)); }
function clientSocket(id) { return [...clients.entries()].find(([, c]) => c.id === id)?.[0]; }
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
    players: room.players.map(p => ({ id:p.id, name:p.name, face:p.face, score:p.score||0, served:p.served||0, order:p.order||[], coopBonus:p.coopBonus||0 }))
  };
}
function broadcastRoom(room) {
  const payload = { type: "players", players: roomPayload(room).players };
  for (const p of room.players) send(clientSocket(p.id), payload);
}
function finishRoom(room,winner){
  if(!room || room.ended)return;
  room.ended=true;
  const players=[...room.players].sort((a,b)=>(Number(b.served||0)-Number(a.served||0))||(Number(b.score||0)-Number(a.score||0)));
  for(const p of room.players){
    send(clientSocket(p.id),{type:"matchEnd",winner,teamServed:room.teamServed||0,players});
  }
  broadcastRooms();
}
function broadcastVotes(room) {
  const payload = { type: "votes", votes: room.votes || {} };
  for (const p of room.players) send(clientSocket(p.id), payload);
}
function leave(ws, closing=false) {
  const c = clients.get(ws);
  if (!c) return;
  if (c.room && rooms.has(c.room)) {
    const room = rooms.get(c.room);
    room.players = room.players.filter(p => p.id !== c.id);
    delete room.votes[c.id]; delete room.ready[c.id];
    if (room.players.length === 0) rooms.delete(c.room);
    else { broadcastRoom(room); broadcastVotes(room); }
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
      const room = { code, mode: msg.mode === "versus" ? "versus" : "coop", hostName: c.name, level: 1, mapId: 0, started: false, votes: {}, ready: {}, tutorialVotes:{}, sharedOrder:null, sharedTray:[], sharedCustomerName:null, teamServed:0, ended:false, players: [] };
      rooms.set(code, room);
      c.room = code;
      room.players.push({ id: c.id, name: c.name, face: "🧑‍🍳", score: 0, served: 0, order: [], coopBonus: 0 });
      send(ws, { type: "room", room: roomPayload(room) });
      broadcastRooms();
    }

    if (msg.type === "joinRoom") {
      const code = String(msg.code || "").toUpperCase();
      const room = rooms.get(code);
      if (!room || room.players.length >= 4 || room.started) return send(ws, { type:"error", message:"Room not found, full, or already started." });
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
      room.votes[c.id] = Math.max(0, Math.min(99, Number(msg.mapId || 0)));
      broadcastVotes(room);
    }

    if (msg.type === "ready") {
      const room = rooms.get(c.room); if (!room) return;
      room.ready[c.id] = true;
      const votes = Object.values(room.votes);
      const selected = votes.length ? votes.sort((a,b)=>votes.filter(v=>v===b).length-votes.filter(v=>v===a).length)[0] : 0;
      if (room.players.length >= 2 && room.players.every(p => room.ready[p.id])) {
        const payload = { type: "tutorialVote", votes: room.tutorialVotes || {} };
        for (const p of room.players) send(clientSocket(p.id), payload);
      } else broadcastVotes(room);
    }


    if (msg.type === "newSharedOrder") {
      const room = rooms.get(c.room);
      if (!room || room.mode !== "coop" || room.ended) return;
      if (room.sharedOrder && room.sharedOrder.length) {
        for (const p of room.players) send(clientSocket(p.id), { type: "sharedOrder", order: room.sharedOrder, customerName: room.sharedCustomerName });
        return;
      }
      room.sharedOrder = Array.isArray(msg.order) ? msg.order.slice(0, 7) : [];
      room.sharedCustomerName = String(msg.customerName || "Team Combo").slice(0, 40);
      room.sharedTray = [];
      for (const p of room.players) {
        send(clientSocket(p.id), { type: "sharedOrder", order: room.sharedOrder, customerName: room.sharedCustomerName });
        send(clientSocket(p.id), { type: "sharedTray", tray: room.sharedTray });
      }
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
          const selected = unique[Math.floor(Math.random() * unique.length)] || 0;
          room.mapId = selected; room.level = 1; room.started = true; room.ended=false; room.teamServed=0; room.sharedOrder=null; room.sharedTray=[]; room.sharedCustomerName=null; room.ended=false; room.teamServed=0; room.teamServed=0;
          for (const p of room.players) send(clientSocket(p.id), { type: "start", level: 1, mapId: selected, mode: room.mode, delay: 350 });
          broadcastRooms();
        }, 1900);
      }
    }


    if (msg.type === "trayUpdate") {
      const room = rooms.get(c.room);
      if (!room || room.mode !== "coop") return;
      room.sharedTray = Array.isArray(msg.tray) ? msg.tray.slice(0, 10) : [];
      for (const p of room.players) send(clientSocket(p.id), { type: "sharedTray", tray: room.sharedTray });
    }
    if (msg.type === "orderComplete") {
      const room = rooms.get(c.room);
      if (!room || room.ended) return;
      const player = room.players.find(p => p.id === c.id);
      if (player) {
        player.score = Number(msg.total || player.score || 0);
        player.served = Number(msg.served || player.served || 0);
      }
      const goal = Math.min(30,4+Math.floor((room.mapId||0)/8)*2);
      if (room.mode === "coop") {
        room.teamServed = (room.teamServed || 0) + 1;
        room.sharedTray = [];
        room.sharedOrder = null;
        room.sharedCustomerName = null;
        for (const p of room.players) {
          send(clientSocket(p.id), { type: "orderDone", name: player ? player.name : "Chef", score: Number(msg.score || 0), tray: [] });
          send(clientSocket(p.id), { type: "sharedTray", tray: [] });
          send(clientSocket(p.id), { type: "sharedState", teamServed: room.teamServed });
        }
        broadcastRoom(room);
        if (room.teamServed >= goal) finishRoom(room,"Team");
      } else {
        for (const p of room.players) send(clientSocket(p.id), { type: "orderDone", name: player ? player.name : "Chef", score: Number(msg.score || 0) });
        broadcastRoom(room);
        if (player && Number(player.served || 0) >= goal) finishRoom(room, player.name || "Chef");
      }
    }

    if (msg.type === "progress") {
      const room = rooms.get(c.room); if (!room) return;
      const player = room.players.find(p => p.id === c.id); if (!player) return;
      player.score = Number(msg.coins || 0); player.served = Number(msg.served || 0);
      player.order = Array.isArray(msg.order) ? msg.order.slice(0,5) : [];
      player.coopBonus = Number(msg.coopBonus || 0);
      broadcastRoom(room);
    }

    if (msg.type === "leaveRoom") leave(ws);
  });
  ws.on("close", () => leave(ws, true));
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => console.log(`Sunny Side Snack Shack Theme Map Pro running on ${PORT}`));

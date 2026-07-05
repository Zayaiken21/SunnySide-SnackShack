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
  room.nextVotes={};
  const players=[...room.players].sort((a,b)=>(Number(b.served||0)-Number(a.served||0))||(Number(b.score||0)-Number(a.score||0)));
  for(const p of room.players){
    send(clientSocket(p.id),{type:"matchEnd",winner,reason:"winner",completed:true,teamServed:room.teamServed||0,players});
  }
  broadcastRooms();
}
const DRINK_IDS=["lemonade","pink_lemonade","limeade","orange_juice","apple_juice","berry_punch","mango_smoothie","strawberry_smoothie","banana_smoothie","blueberry_smoothie","coconut_shake","vanilla_milkshake","hot_cocoa","mint_cocoa","rainforest_juice"];
const CUSTOMER_NAMES=["Berry Ben","Burger Bea","Happy Harper","Taco Tia","Mango Max","Lemon Leo","Sunny Sam","Picnic Pip","Cookie Coco","Fries Finn","Smoothie Sky","Noodle Nora"];
function makeSharedOrder(room){
  const count=Math.min(5,2+Math.floor(((room.mapId||0)%12)/5));
  const out=[];
  for(let i=0;i<count;i++){
    const id=DRINK_IDS[Math.floor(Math.random()*DRINK_IDS.length)];
    out.push({
      id,
      size:["small","medium","large"][Math.floor(Math.random()*3)],
      ice:["no ice","light ice","extra ice"][Math.floor(Math.random()*3)],
      sweet:["low sweet","medium sweet","super sweet"][Math.floor(Math.random()*3)]
    });
  }
  return out;
}
function makeCustomerName(){
  return CUSTOMER_NAMES[Math.floor(Math.random()*CUSTOMER_NAMES.length)]+"'s Combo";
}
function broadcastSharedOrder(room){
  if(!room.sharedOrder || !room.sharedOrder.length){
    room.sharedOrder=makeSharedOrder(room);
    room.sharedCustomerName=makeCustomerName();
    room.sharedTray=[];
  }
  for(const p of room.players){
    send(clientSocket(p.id),{type:"sharedOrder",order:room.sharedOrder,customerName:room.sharedCustomerName});
    send(clientSocket(p.id),{type:"sharedTray",tray:room.sharedTray||[]});
  }
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



    if (msg.type === "requestSharedOrder") {
      const room = rooms.get(c.room);
      if (!room || room.mode !== "coop" || room.ended) return;
      broadcastSharedOrder(room);
    }

    if (msg.type === "newSharedOrder") {
      const room = rooms.get(c.room);
      if (!room || room.mode !== "coop" || room.ended) return;
      if (room.sharedOrder && room.sharedOrder.length) {
        broadcastSharedOrder(room);
        return;
      }
      room.sharedOrder = Array.isArray(msg.order) ? msg.order.slice(0, 7) : makeSharedOrder(room);
      room.sharedCustomerName = String(msg.customerName || makeCustomerName()).slice(0, 40);
      room.sharedTray = [];
      broadcastSharedOrder(room);
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
          room.mapId = selected; room.level = 1; room.started = true; room.ended=false; room.teamServed=0; room.sharedOrder=null; room.sharedTray=[]; room.sharedCustomerName=null; room.nextVotes={}; room.players.forEach(p=>{p.score=0;p.served=0;p.order=[]}); room.nextVotes={}; room.goal=Math.min(30,4+Math.floor((room.mapId||0)/8)*2); room.ended=false; room.teamServed=0; room.teamServed=0;
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
        player.timeUpgrade = Number(msg.timeUpgrade || player.timeUpgrade || 0);
      }
      const goal = Number(room.goal || 4);
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


    if (msg.type === "nextVote") {
      const room = rooms.get(c.room);
      if (!room) return;
      if (msg.choice !== "next") {
        leave(ws);
        send(ws, { type:"forceHome" });
        return;
      }
      room.nextVotes = room.nextVotes || {};
      room.nextVotes[c.id] = true;
      const count = Object.keys(room.nextVotes).length;
      const total = room.players.length;
      for (const p of room.players) send(clientSocket(p.id), { type:"nextVoteState", count, total });
      if (count >= total) {
        for (const p of room.players) send(clientSocket(p.id), { type:"openUpgradeBreak" });
      }
    }
    if (msg.type === "nextVoteTimeout") {
      const room = rooms.get(c.room);
      if (!room) return;
      leave(ws);
      send(ws, { type:"forceHome" });
    }


    if (msg.type === "nextLevelStart") {
      const room = rooms.get(c.room);
      if (!room) return;
      room.mapId = Number(msg.mapId || room.mapId || 0);
      room.mode = msg.mode || room.mode;
      room.ended = false;
      room.started = true;
      room.teamServed = 0;
      room.sharedOrder = null;
      room.sharedTray = [];
      room.sharedCustomerName = null;
      room.nextVotes = {};
      room.goal = Math.min(30,4+Math.floor((room.mapId||0)/8)*2);
      for(const p of room.players){
        p.score=0;
        p.served=0;
        p.order=[];
        send(clientSocket(p.id), { type:"sharedState", teamServed:0 });
      }
      broadcastRoom(room);
      if(room.mode==="coop") broadcastSharedOrder(room);
    }


    if (msg.type === "roundTimeout") {
      const room = rooms.get(c.room);
      if (!room || room.ended) return;
      const players=[...room.players].sort((a,b)=>(Number(b.served||0)-Number(a.served||0))||(Number(b.score||0)-Number(a.score||0)));
      const winner=players[0] ? players[0].name : "Chef";
      if(room.mode==="versus"){
        for(const p of room.players) send(clientSocket(p.id),{type:"matchEnd",winner,reason:"timeout",completed:false,teamServed:room.teamServed||0,players});
      }else{
        for(const p of room.players) send(clientSocket(p.id),{type:"matchEnd",winner:"Team",reason:"timeout",completed:false,teamServed:room.teamServed||0,players});
      }
      room.ended=true;
      broadcastRooms();
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

import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Serve frontend
const clientPath = path.join(__dirname, "..", "client");
app.use(express.static(clientPath));
app.get("/", (_, res) => res.sendFile(path.join(clientPath, "index.html")));

const server = http.createServer(app);
const io = new Server(server);

const rooms = new Map();
/**
rooms.get(roomId) = {
  hostId: string|null,
  approved: Map<sid, {name, mic, cam}>,
  waiting: Map<sid, {name}>
}
*/

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      hostId: null,
      approved: new Map(),
      waiting: new Map(),
    });
  }
  return rooms.get(roomId);
}

function snapshot(roomId) {
  const r = getRoom(roomId);
  return {
    roomId,
    hostId: r.hostId,
    approved: Array.from(r.approved.entries()).map(([id, u]) => ({
      id, name: u.name, mic: !!u.mic, cam: !!u.cam
    })),
    waiting: Array.from(r.waiting.entries()).map(([id, u]) => ({ id, name: u.name })),
  };
}

function broadcastRoom(roomId) {
  io.to(roomId).emit("room-state", snapshot(roomId));
}

function isApproved(roomId, sid) {
  const r = getRoom(roomId);
  return r.approved.has(sid);
}

io.on("connection", (socket) => {
  socket.on("join-request", ({ roomId, name }) => {
    roomId = String(roomId || "").trim();
    name = String(name || "Guest").trim() || "Guest";
    if (!roomId) return;

    const r = getRoom(roomId);
    socket.join(roomId);

    // First user becomes host automatically
    if (!r.hostId) {
      r.hostId = socket.id;
      r.approved.set(socket.id, { name, mic: false, cam: false });

      socket.emit("join-approved", { roomId, myId: socket.id, host: true });
      io.to(roomId).emit("system", { msg: `${name} became host.` });

      // send roster to host
      socket.emit("peer-list", { peers: snapshot(roomId).approved });

      broadcastRoom(roomId);
      return;
    }

    // Others go waiting
    r.waiting.set(socket.id, { name });
    socket.emit("waiting", { roomId });
    io.to(r.hostId).emit("waiting-update", snapshot(roomId));
    broadcastRoom(roomId);
  });

  socket.on("approve-user", ({ roomId, userId }) => {
    const r = getRoom(roomId);
    if (socket.id !== r.hostId) return;

    const w = r.waiting.get(userId);
    if (!w) return;

    r.waiting.delete(userId);
    r.approved.set(userId, { name: w.name, mic: false, cam: false });

    // Tell new user approved
    io.to(userId).emit("join-approved", { roomId, myId: userId, host: false });

    // Send full roster to new user
    io.to(userId).emit("peer-list", { peers: snapshot(roomId).approved });

    // Tell everyone roster changed
    io.to(roomId).emit("system", { msg: `${w.name} joined the meeting.` });
    broadcastRoom(roomId);

    // Also tell everyone to resync peers (simple trigger)
    io.to(roomId).emit("roster-changed");
  });

  socket.on("reject-user", ({ roomId, userId }) => {
    const r = getRoom(roomId);
    if (socket.id !== r.hostId) return;

    if (!r.waiting.has(userId)) return;
    r.waiting.delete(userId);

    io.to(userId).emit("join-rejected", { roomId });
    io.to(userId).disconnect(true);

    broadcastRoom(roomId);
  });

  socket.on("rename", ({ roomId, name }) => {
    const r = getRoom(roomId);
    name = String(name || "").trim() || "Guest";

    if (r.approved.has(socket.id)) {
      const cur = r.approved.get(socket.id);
      r.approved.set(socket.id, { ...cur, name });
      broadcastRoom(roomId);
      io.to(roomId).emit("roster-changed");
    }
    if (r.waiting.has(socket.id)) {
      r.waiting.set(socket.id, { name });
      broadcastRoom(roomId);
    }
  });

  socket.on("media-state", ({ roomId, mic, cam }) => {
    const r = getRoom(roomId);
    if (!r.approved.has(socket.id)) return;

    const cur = r.approved.get(socket.id);
    r.approved.set(socket.id, { ...cur, mic: !!mic, cam: !!cam });

    // broadcast updated state (lightweight)
    io.to(roomId).emit("media-state", { id: socket.id, mic: !!mic, cam: !!cam });
    broadcastRoom(roomId);
  });

  socket.on("transfer-host", ({ roomId, newHostId }) => {
    const r = getRoom(roomId);
    if (socket.id !== r.hostId) return;
    if (!r.approved.has(newHostId)) return;

    r.hostId = newHostId;
    io.to(roomId).emit("system", { msg: `Host transferred.` });
    broadcastRoom(roomId);
  });

  // Perfect negotiation signaling relay
  socket.on("signal", ({ roomId, to, data }) => {
    if (!isApproved(roomId, socket.id)) return;
    if (!isApproved(roomId, to)) return;

    io.to(to).emit("signal", { from: socket.id, data });
  });

  // Chat (group)
  socket.on("chat-all", ({ roomId, msg }) => {
    const r = getRoom(roomId);
    if (!r.approved.has(socket.id)) return;
    const name = r.approved.get(socket.id)?.name || "Guest";
    io.to(roomId).emit("chat-all", { from: socket.id, name, msg: String(msg || "") });
  });

  // Chat (DM)
  socket.on("chat-dm", ({ roomId, to, msg }) => {
    const r = getRoom(roomId);
    if (!r.approved.has(socket.id)) return;
    if (!r.approved.has(to)) return;
    const name = r.approved.get(socket.id)?.name || "Guest";

    io.to(to).emit("chat-dm", { from: socket.id, name, msg: String(msg || "") });
    socket.emit("chat-dm", { from: socket.id, name, msg: String(msg || ""), echo: true, to });
  });

  socket.on("leave-room", ({ roomId }) => {
    const r = getRoom(roomId);

    r.waiting.delete(socket.id);
    const wasApproved = r.approved.delete(socket.id);

    if (r.hostId === socket.id) {
      const next = r.approved.keys().next().value || null;
      r.hostId = next;
      if (next) io.to(roomId).emit("system", { msg: `Host changed automatically.` });
    }

    socket.leave(roomId);

    if (wasApproved) io.to(roomId).emit("participant-left", { id: socket.id });
    broadcastRoom(roomId);
    io.to(roomId).emit("roster-changed");

    if (!r.hostId && r.approved.size === 0 && r.waiting.size === 0) rooms.delete(roomId);
  });

  socket.on("disconnect", () => {
    for (const [roomId, r] of rooms.entries()) {
      let changed = false;

      if (r.waiting.delete(socket.id)) changed = true;

      const wasApproved = r.approved.delete(socket.id);
      if (wasApproved) {
        changed = true;
        io.to(roomId).emit("participant-left", { id: socket.id });
      }

      if (r.hostId === socket.id) {
        const next = r.approved.keys().next().value || null;
        r.hostId = next;
        changed = true;
        if (next) io.to(roomId).emit("system", { msg: `Host changed automatically.` });
      }

      if (changed) {
        broadcastRoom(roomId);
        io.to(roomId).emit("roster-changed");
        if (!r.hostId && r.approved.size === 0 && r.waiting.size === 0) rooms.delete(roomId);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`✅ App running on port ${PORT}`);
});
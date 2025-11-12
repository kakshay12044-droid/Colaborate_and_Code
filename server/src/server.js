import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

// 🔹 Path setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🔹 Express app setup
const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// 🔹 Allowed Origins
const allowedOrigins = [
  "http://localhost:5173",
  "https://localhost:5173",
  "http://localhost:5174",
  FRONTEND_URL,
  "https://codeinsync-7ycb.onrender.com",
  "wss://codeinsync-7ycb.onrender.com",
].filter(Boolean);

// 🔹 Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.some((o) => origin.startsWith(o))) {
        callback(null, true);
      } else {
        console.warn("🚫 CORS blocked request from:", origin);
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

// 🔹 HTTP Server
const httpServer = http.createServer(app);

// 🔹 Socket.IO Setup
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
  pingTimeout: 20000,
  pingInterval: 10000,
  maxHttpBufferSize: 1e8,
  transports: ["websocket", "polling"],
  allowEIO3: true,
  serveClient: false,
});

// 🔹 Room Management
const rooms = new Map();

function getUsersInRoom(roomId) {
  return Array.from(rooms.get(roomId)?.values() || []);
}

function getRoomId(socketId) {
  for (const [roomId, users] of rooms.entries()) {
    if (users.has(socketId)) return roomId;
  }
  return null;
}

// 🔹 Handle Socket Connections
io.on("connection", (socket) => {
  console.log(`✅ Socket connected: ${socket.id}`);

  // 🔸 Handle join-request from frontend
  socket.on("join-request", ({ roomId, username }) => {
    console.log(`📩 join-request → Room: ${roomId}, User: ${username}`);

    if (!roomId) {
      io.to(socket.id).emit("join-error", { message: "Room ID missing" });
      return;
    }

    socket.join(roomId);

    if (!rooms.has(roomId)) rooms.set(roomId, new Map());
    const user = { id: socket.id, username: username || "Anonymous", joinedAt: new Date() };
    rooms.get(roomId).set(socket.id, user);

    console.log(`👤 ${username || "Anonymous"} joined room ${roomId}`);

    const usersInRoom = getUsersInRoom(roomId);

    // Notify the client that join was successful
    io.to(socket.id).emit("join-success", { roomId, users: usersInRoom });

    // Notify everyone else in the room
    socket.to(roomId).emit("user-joined", { user, users: usersInRoom });
  });

  // 🔸 Handle code sync
  socket.on("code-change", ({ roomId, code, cursorPos }) => {
    socket.to(roomId).emit("code-update", {
      code,
      cursorPos,
      sender: socket.id,
      timestamp: Date.now(),
    });
  });

  // 🔸 Handle disconnects
  socket.on("disconnect", (reason) => {
    console.log(`❌ Socket disconnected: ${socket.id} (${reason})`);
    const roomId = getRoomId(socket.id);
    if (roomId) {
      const room = rooms.get(roomId);
      if (room) {
        const user = room.get(socket.id);
        room.delete(socket.id);

        if (room.size === 0) {
          rooms.delete(roomId);
          console.log(`🗑️ Room ${roomId} removed`);
        } else if (user) {
          io.to(roomId).emit("user-left", {
            socketId: socket.id,
            username: user.username,
          });
          console.log(`👋 ${user.username} left room ${roomId}`);
        }
      }
    }
  });

  // 🔸 Ping check
  socket.on("ping", (cb) => typeof cb === "function" && cb());
});

// 🔹 Routes
app.get("/", (req, res) => {
  res.send("✅ CodeSync Server is running");
});

// 🔹 Health Endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    connections: io.engine.clientsCount,
    rooms: Array.from(rooms.keys()),
    environment: process.env.NODE_ENV || "development",
  });
});

// 🔹 Start Server
const startServer = () => {
  httpServer.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Allowed origins:`, allowedOrigins);
  });

  process.on("unhandledRejection", (err) =>
    console.error("❌ Unhandled Rejection:", err)
  );
  process.on("uncaughtException", (err) =>
    console.error("💥 Uncaught Exception:", err)
  );
};

startServer();
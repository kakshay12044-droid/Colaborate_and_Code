import dotenv from "dotenv";
dotenv.config();

import express from "express";
import http from "http";
import { Server } from "socket.io";
import { WebSocketServer } from "ws";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

// Initialize Express
const app = express();
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || "development";

// Get frontend URL from environment or default to localhost:5173
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || "";

// CORS Configuration
const allowedOrigins = [
  // Development
  "http://localhost:5173",
  "http://localhost:5174",
  "https://localhost:5173",
  // Production
  FRONTEND_URL,
  RENDER_URL,
  // Vercel preview URLs
  /^\.*\.vercel\.app$/,
  /^\.*\.vercel\.dev$/,
].filter(Boolean);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: (origin, callback) => {
    if (NODE_ENV === "development" || !origin || 
        allowedOrigins.some(o => 
          typeof o === 'string' ? 
          origin.startsWith(o) : 
          o.test(origin)
        )) {
      callback(null, true);
    } else {
      console.warn('CORS blocked request from origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Create HTTP server
const httpServer = http.createServer(app);

// Socket.IO Server Configuration
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  },
  // Connection settings
  pingTimeout: 20000,    // 20 seconds
  pingInterval: 10000,   // 10 seconds
  maxHttpBufferSize: 1e8, // 100MB max buffer size
  transports: ["websocket", "polling"],
  allowEIO3: true,
  serveClient: false,
  // Disable per-message deflate for better performance
  perMessageDeflate: false,
  // Enable connection state recovery
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
    skipMiddlewares: true,
  },
  // Add connection timeout
  connectTimeout: 10000, // 10 seconds
});

// Track users and rooms
const rooms = new Map();
const userSocketMap = new Map();

// Helper functions
function getUsersInRoom(roomId) {
  const room = rooms.get(roomId);
  return room ? Array.from(room.values()) : [];
}

function getRoomForSocket(socketId) {
  for (const [roomId, users] of rooms.entries()) {
    if (users.has(socketId)) {
      return roomId;
    }
  }
  return null;
}

// Connection error handling
io.engine.on("connection_error", (err) => {
  console.error("❌ Socket.IO connection error:", {
    code: err.code,
    message: err.message,
    context: err.context
  });
});

// Socket.IO Connection Handler
io.on("connection", (socket) => {
  console.log(`✅ New connection: ${socket.id}`);
  
  // Handle connection errors
  socket.on("connect_error", (err) => {
    console.error(`❌ [${socket.id}] Connection error:`, err.message);
  });

  // Handle join request
  socket.on("join-request", (data, callback = () => {}) => {
    try {
      const { roomId, username } = data || {};
      console.log(`📩 [${socket.id}] Join request: ${username} to ${roomId}`);

      if (!roomId || !username) {
        const error = "Room ID and username are required";
        console.error(`❌ [${socket.id}] ${error}`);
        return callback({ error });
      }

      // Check for duplicate username in the room
      const existingUser = Array.from(rooms.get(roomId)?.values() || [])
        .find(user => user.username === username && user.id !== socket.id);

      if (existingUser) {
        const error = `Username '${username}' is already taken in this room`;
        console.error(`❌ [${socket.id}] ${error}`);
        socket.emit('username_exists', { error });
        return callback({ error });
      }

      // Leave any existing room
      const currentRoom = getRoomForSocket(socket.id);
      if (currentRoom) {
        console.log(`🚪 [${socket.id}] Leaving existing room ${currentRoom}`);
        socket.leave(currentRoom);
        
        const roomUsers = rooms.get(currentRoom);
        if (roomUsers) {
          roomUsers.delete(socket.id);
          
          if (roomUsers.size === 0) {
            console.log(`🗑️ Room ${currentRoom} is now empty, cleaning up`);
            rooms.delete(currentRoom);
          } else {
            // Notify remaining users
            socket.to(currentRoom).emit("user-left", {
              socketId: socket.id,
              username: userSocketMap.get(socket.id)?.username
            });
          }
        }
      }

      // Join new room
      socket.join(roomId);
      
      // Initialize room if it doesn't exist
      if (!rooms.has(roomId)) {
        console.log(`🏠 [${socket.id}] Creating new room: ${roomId}`);
        rooms.set(roomId, new Map());
      }
      
      // Add user to room
      const user = { 
        id: socket.id, 
        username, 
        joinedAt: new Date().toISOString(),
        roomId
      };
      
      rooms.get(roomId).set(socket.id, user);
      userSocketMap.set(socket.id, user);
      
      // Get all users in the room (including the new one)
      const usersInRoom = getUsersInRoom(roomId);
      
      // Send join-accepted event to the client
      socket.emit("join-accepted", {
        user: {
          id: socket.id,
          username,
          roomId
        },
        users: usersInRoom
      });
      
      // Notify others in the room about the new user
      socket.to(roomId).emit("user-joined", {
        user: {
          id: socket.id,
          username,
          joinedAt: user.joinedAt
        },
        roomId
      });
      
      console.log(`👥 [${roomId}] ${username} joined. Total users: ${usersInRoom.length}`);
      
      // Acknowledge successful join
      callback({
        success: true,
        roomId,
        users: usersInRoom,
        yourId: socket.id
      });
      
    } catch (error) {
      console.error(`❌ Error joining room:`, error);
      socket.emit("error", { 
        message: error.message || "Failed to join room" 
      });
      callback({ error: error.message || "Failed to join room" });
    }
  });

  // Handle code changes
  socket.on("code-change", ({ roomId, code, cursorPos, filePath }) => {
    try {
      if (!roomId) throw new Error("Room ID is required");
      
      // Broadcast to all in room except sender
      socket.to(roomId).emit("code-update", {
        code,
        cursorPos,
        filePath,
        sender: socket.id,
        timestamp: Date.now()
      });
      
    } catch (error) {
      console.error(`❌ Error handling code change:`, error);
      socket.emit("error", { 
        message: error.message || "Failed to process code change" 
      });
    }
  });

  // Handle test message
  socket.on('send-message', ({ username, text, roomId }) => {
    try {
      console.log(`💬 [${roomId}] ${username}: ${text}`);
      // Broadcast to all in room including sender
      io.to(roomId).emit('receive-message', { username, text });
    } catch (error) {
      console.error('Error handling message:', error);
    }
  });

  // Handle cursor movement
  socket.on('cursor-move', ({ username, x, y, roomId }) => {
    try {
      // Broadcast to all in room except sender
      socket.to(roomId).emit('cursor-move', { 
        username, 
        x, 
        y,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error handling cursor move:', error);
    }
  });

  // Handle file opened
  socket.on('file-open', ({ roomId, filePath, username }) => {
    try {
      console.log(`📂 [${roomId}] ${username} opened file: ${filePath}`);
      // Broadcast to all in room except sender
      socket.to(roomId).emit('file-opened', { 
        filePath, 
        openedBy: username || socket.id,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error handling file-open:', error);
    }
  });

  // Handle file content updates
  socket.on('file-content', ({ roomId, filePath, code, username }) => {
    try {
      // Broadcast to all in room except sender
      socket.to(roomId).emit('file-update', { 
        filePath, 
        code,
        updatedBy: username || socket.id,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error handling file-content:', error);
    }
  });

  // Handle file save
  socket.on('file-save', ({ roomId, filePath, username }) => {
    try {
      console.log(`💾 [${roomId}] ${username} saved file: ${filePath}`);
      // Broadcast to all in room
      io.to(roomId).emit('file-saved', { 
        filePath, 
        savedBy: username || socket.id,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error handling file-save:', error);
    }
  });

  // Handle disconnection
  socket.on("disconnect", (reason) => {
    console.log(`❌ Disconnected: ${socket.id} (${reason})`);
    
    const roomId = getRoomForSocket(socket.id);
    if (!roomId) return;
    
    const room = rooms.get(roomId);
    if (!room) return;
    
    const user = room.get(socket.id);
    if (!user) return;
    
    // Remove user from room
    room.delete(socket.id);
    userSocketMap.delete(socket.id);
    
    if (room.size === 0) {
      console.log(`🗑️ Room ${roomId} is now empty, cleaning up`);
      rooms.delete(roomId);
    } else {
      // Notify remaining users
      io.to(roomId).emit("user-left", {
        socketId: socket.id,
        username: user.username
      });
      console.log(`👋 ${user.username} left room ${roomId}`);
    }
  });

  // Handle errors
  socket.on("error", (error) => {
    console.error(`⚠️ Socket error (${socket.id}):`, error);
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    connections: io.engine.clientsCount,
    rooms: Array.from(rooms.keys()),
    environment: NODE_ENV
  });
});

// Start server
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running in ${NODE_ENV} mode on port ${PORT}`);
  console.log(`🌐 Allowed origins:`, allowedOrigins);
  console.log(`🔌 Socket.IO server ready`);
});

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("🛑 Received SIGTERM. Closing server...");
  httpServer.close(() => {
    console.log("👋 HTTP server closed");
    process.exit(0);
  });
  
  // Force close after timeout
  setTimeout(() => {
    console.error("⚠️ Forcing server shutdown...");
    process.exit(1);
  }, 10000);
});
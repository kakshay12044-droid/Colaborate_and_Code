import { io } from "socket.io-client";

// Use environment variables for URLs with secure defaults
const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:3000";
const isProduction = import.meta.env.PROD;

console.log(`🔌 [${isProduction ? 'PROD' : 'DEV'}] Connecting to WebSocket server at:`, WS_URL);

export const socket = io(WS_URL, {
  // Connection settings
  reconnection: true,
  reconnectionAttempts: isProduction ? 10 : 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 10000,
  timeout: 20000,
  autoConnect: true,
  withCredentials: true,
  // In production, only use WebSocket (no HTTP long-polling fallback)
  transports: isProduction ? ["websocket"] : ["websocket", "polling"],
  // Enable debug only in development
  debug: !isProduction,
  // Add client information
  query: {
    clientType: 'browser',
    version: '1.0.0',
    environment: isProduction ? 'production' : 'development',
  },
  // Enable secure connection in production
  secure: isProduction,
  // Enable compression
  forceNew: true,
  // Enable multiplexing (sharing the same connection)
  multiplex: true,
});

// Connection handlers
socket.on("connect", () => {
  console.log("✅ [Socket] Connected with ID:", socket.id);  
  console.log("🔗 Connection URL:", SOCKET_URL);
  console.log("📊 Transport:", socket.io.engine.transport.name);
});

socket.on("disconnect", (reason) => {
  console.log("❌ [Socket] Disconnected. Reason:", reason);
  
  if (reason === "io server disconnect") {
    console.log("🔄 Server requested disconnect - attempting to reconnect...");
    socket.connect();
  }
});

socket.on("connect_error", (error) => {
  console.error("❌ [Socket] Connection error:", error.message);
  console.error("Error details:", error);
  
  // Attempt to reconnect with exponential backoff
  const delay = Math.min(socket.io._reconnectionAttempts * 1000, 10000);
  console.log(`⏳ Reconnecting in ${delay}ms...`);
  
  setTimeout(() => {
    console.log("🔄 Attempting to reconnect...");
    socket.connect();
  }, delay);
});

// Room and user events
socket.on("join-accepted", (data) => {
  console.log("🎉 [Socket] Join accepted:", data);
  console.log(`👥 Users in room (${data.roomId}):`, data.users?.length || 0);
});

socket.on("user-joined", (data) => {
  console.log(`👋 [Socket] User joined room ${data.roomId}:`, data.user);
});

socket.on("user-left", (data) => {
  console.log(`👋 [Socket] User left:`, data.username || data.socketId);
});

// Debug logging for all events in development
if (import.meta.env.DEV) {
  // Log all emitted events
  const originalEmit = socket.emit;
  socket.emit = function (event, ...args) {
    console.group(`📤 [Socket] Emitting: ${event}`);
    console.log("Arguments:", args);
    console.groupEnd();
    return originalEmit.call(this, event, ...args);
  };
  
  // Log all received events
  socket.onAny((event, ...args) => {
    // Skip pong events to reduce noise
    if (event === 'pong') return;
    
    console.group(`📥 [Socket] Received: ${event}`);
    console.log("Data:", args);
    console.groupEnd();
  });
  
  // Log transport upgrades
  socket.io.engine.on("upgrade", (transport) => {
    console.log("🔄 Transport upgraded to:", transport.name);
  });
}

// Export a function to manually connect if needed
export const connectSocket = () => {
  if (!socket.connected) {
    console.log("🔌 Manually connecting socket...");
    socket.connect();
  } else {
    console.log("ℹ️ Socket is already connected");
  }
};

// Export a function to disconnect
export const disconnectSocket = () => {
  if (socket.connected) {
    console.log("🔌 Disconnecting socket...");
    socket.disconnect();
  }
};

// For debugging in browser console
if (typeof window !== 'undefined') {
  window.socket = socket;
  console.log("ℹ️ Socket instance available as 'window.socket' for debugging");
}

export default socket;

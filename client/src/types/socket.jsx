import { io } from "socket.io-client";

export const SocketEvent = {
  JOIN_REQUEST: "join-request",
  JOIN_ACCEPTED: "join-accepted",
  USER_JOINED: "user-joined",
  USER_DISCONNECTED: "user-disconnected",
  SYNC_FILE_STRUCTURE: "sync-file-structure",
  DIRECTORY_CREATED: "directory-created",
  DIRECTORY_UPDATED: "directory-updated",
  DIRECTORY_RENAMED: "directory-renamed",
  DIRECTORY_DELETED: "directory-deleted",
  FILE_CREATED: "file-created",
  FILE_UPDATED: "file-updated",
  FILE_RENAMED: "file-renamed",
  FILE_DELETED: "file-deleted",
  USER_OFFLINE: "offline",
  USER_ONLINE: "online",
  SEND_MESSAGE: "send-message",
  RECEIVE_MESSAGE: "receive-message",
  TYPING_START: "typing-start",
  TYPING_PAUSE: "typing-pause",
  CURSOR_MOVE: "cursor-move",
  USERNAME_EXISTS: "username-exists",
  REQUEST_DRAWING: "request-drawing",
  SYNC_DRAWING: "sync-drawing",
  DRAWING_UPDATE: "drawing-update",
};

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:3000";

console.log("🔌 WebSocket URL:", WS_URL);

export const socket = io(WS_URL, {
  transports: ["websocket"], 
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  autoConnect: true,
  withCredentials: true,
  path: "/socket.io/",
});
socket.on("connect", () => {
  console.log("✅ Socket connected:", socket.id);
});

socket.on("disconnect", (reason) => {
  console.log("❌ Socket disconnected:", reason);
  if (reason === "io server disconnect") {
    socket.connect(); // reconnect manually
  }
});

socket.on("connect_error", (error) => {
  console.error("❌ Connection error:", error.message);
});

export default socket;
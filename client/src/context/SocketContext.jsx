import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { toast } from "react-hot-toast";
import { useAppContext } from "./AppContext";
import { SocketEvent } from "../types/socket";
import { socket } from "../socket";

const SocketContext = createContext({
  socket: null,
  isConnected: false,
  error: null,
  reconnect: () => {},
  emitCodeChange: () => {},
});

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used within a SocketProvider");
  }
  return context;
};

export const SocketProvider = ({ children }) => {
  const {
    users,
    setUsers,
    setStatus,
    setCurrentUser,
    drawingData,
    setDrawingData,
    currentUser,
  } = useAppContext();

  const [isConnected, setIsConnected] = useState(socket.connected);
  const [error, setError] = useState(null);

  // 🔹 Handle connection errors
  const handleError = useCallback(
    (err) => {
      console.error("❌ [Socket] Connection error:", err);
      setError(err);
      setStatus("connection_failed");
      toast.dismiss();
      toast.error(`Connection error: ${err.message || "Unknown error"}`);
    },
    [setStatus]
  );

  // 🔹 Handle join error
  const handleJoinError = useCallback(
    (error) => {
      console.error("❌ [Socket] Join error:", error);
      setStatus("disconnected");
      toast.dismiss();
      toast.error(error.message || "Failed to join room");
    },
    [setStatus]
  );

  // 🔹 Handle username conflict
  const handleUsernameExist = useCallback(() => {
    toast.dismiss();
    setStatus("initial");
    toast.error(
      "The username you chose already exists in the room. Please choose a different one."
    );
  }, [setStatus]);

  // 🔹 Handle join success
  const handleJoiningAccept = useCallback(
    (payload) => {
      console.log("✅ [Socket] Joined room successfully", payload);

      const user = payload?.user || payload?.newUser || {};
      const users = payload?.users || payload?.userList || [];

      if (!user?.roomId && payload?.roomId) {
        user.roomId = payload.roomId;
      }

      setCurrentUser((prev) => ({
        ...prev,
        ...user,
        socketId: socket.id,
      }));

      setUsers(users);
      toast.dismiss();

      toast.success(`Joined room: ${user?.roomId || "unknown"}`);
      setStatus("joined");

      if (users.length > 1) {
        toast.success(`${users.length - 1} other user(s) in the room`);
      }
    },
    [setCurrentUser, setStatus, setUsers]
  );

  // 🔹 Handle user leaving
  const handleUserLeft = useCallback(
    ({ user }) => {
      if (user) {
        toast.success(`${user.username} left the room`);
        setUsers((prev) => prev.filter((u) => u.username !== user.username));
      }
    },
    [setUsers]
  );

  // 🔹 Drawing sync
  const handleRequestDrawing = useCallback(
    ({ socketId }) => {
      socket.emit("sync_drawing", { socketId, drawingData });
    },
    [drawingData]
  );

  const handleDrawingSync = useCallback(
    ({ drawingData: newDrawingData }) => {
      if (newDrawingData) {
        setDrawingData(newDrawingData);
        toast.dismiss();
        toast.success("✅ Drawing synced successfully!");
      }
    },
    [setDrawingData]
  );

  // 🔹 File-related handlers (optional)
  const handleFileOpened = useCallback(({ filePath, openedBy }) => {
    console.log(`📂 File opened by ${openedBy}: ${filePath}`);
  }, []);

  const handleFileUpdate = useCallback(({ filePath, code, updatedBy }) => {
    console.log(`📝 File updated by ${updatedBy}: ${filePath}`);
    if (updatedBy !== socket.id) return { filePath, code };
    return null;
  }, []);

  const handleFileSaved = useCallback(({ filePath, savedBy }) => {
    console.log(`💾 File saved by ${savedBy}: ${filePath}`);
  }, []);

  // 🔹 Emit code changes
  const emitCodeChange = useCallback((roomId, code, cursorPos) => {
    if (!socket.connected || !roomId) return;
    socket.emit("code-change", { roomId, code, cursorPos });
  }, []);

  // 🔹 Handle code updates from others
  const handleCodeUpdate = useCallback(
    ({ code, cursorPos, sender }) => {
      if (sender !== socket.id) {
        console.log("🟢 Code update received from:", sender);
        window.dispatchEvent(
          new CustomEvent("remote-code-update", {
            detail: { code, cursorPos },
          })
        );
      }
    },
    []
  );

  // 🔹 Connection lifecycle
  useEffect(() => {
    const handleConnect = () => {
      console.log("✅ [Socket] Connected with ID:", socket.id);
      setIsConnected(true);
      setError(null);
      toast.dismiss();
      toast.success("Connected to server");

      // Auto rejoin if disconnected earlier
      if (currentUser?.username && currentUser?.roomId) {
        console.log("🔁 Rejoining room after reconnect...");
        socket.emit("join-request", currentUser);
      }
    };

    const handleDisconnect = (reason) => {
      console.log("⚠️ [Socket] Disconnected:", reason);
      setIsConnected(false);
      toast.dismiss();

      if (reason === "io server disconnect") {
        toast.error("Server disconnected. Attempting to reconnect...");
        setTimeout(() => socket.connect(), 1500);
      } else {
        toast("Disconnected from server");
      }
    };

    const handleIncomingEvent = (event, ...args) => {
      if (!["ping", "pong"].includes(event)) {
        console.log(`📥 [Socket] Received: ${event}`, args);
      }
    };

    // ✅ Register listeners
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleError);
    socket.on(SocketEvent.USERNAME_EXISTS, handleUsernameExist);
    socket.on(SocketEvent.JOIN_ACCEPTED, handleJoiningAccept);
    socket.on("join-success", handleJoiningAccept);
    socket.on(SocketEvent.USER_DISCONNECTED, handleUserLeft);
    socket.on(SocketEvent.REQUEST_DRAWING, handleRequestDrawing);
    socket.on(SocketEvent.SYNC_DRAWING, handleDrawingSync);
    socket.on("code-update", handleCodeUpdate);
    socket.onAny(handleIncomingEvent);

    if (!socket.connected) {
      console.log("🔄 [Socket] Connecting to server...");
      socket.connect();
    }

    return () => {
      console.log("🧹 [Socket] Cleaning up listeners...");
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleError);
      socket.off(SocketEvent.USERNAME_EXISTS, handleUsernameExist);
      socket.off(SocketEvent.JOIN_ACCEPTED, handleJoiningAccept);
      socket.off("join-success", handleJoiningAccept);
      socket.off(SocketEvent.USER_DISCONNECTED, handleUserLeft);
      socket.off(SocketEvent.REQUEST_DRAWING, handleRequestDrawing);
      socket.off(SocketEvent.SYNC_DRAWING, handleDrawingSync);
      socket.off("code-update", handleCodeUpdate);
      socket.offAny(handleIncomingEvent);
    };
  }, [
    currentUser,
    handleError,
    handleUsernameExist,
    handleJoiningAccept,
    handleUserLeft,
    handleRequestDrawing,
    handleDrawingSync,
    handleCodeUpdate,
  ]);

  // 🔹 File operation emitters
  const notifyFileOpened = useCallback(
    (filePath) => {
      if (!socket.connected || !currentUser?.roomId) return;
      socket.emit("file-open", {
        roomId: currentUser.roomId,
        filePath,
        username: currentUser.username,
      });
    },
    [currentUser]
  );

  const updateFileContent = useCallback(
    (filePath, code) => {
      if (!socket.connected || !currentUser?.roomId) return;
      socket.emit("file-content", {
        roomId: currentUser.roomId,
        filePath,
        code,
        username: currentUser.username,
      });
    },
    [currentUser]
  );
  const leaveRoom = (roomId) => {
    if (socket && roomId) {
        console.log(`👋 Leaving room: ${roomId}`);
        socket.emit("leave-room", { roomId });
        socket.disconnect();
    }
};

  const notifyFileSaved = useCallback(
    (filePath) => {
      if (!socket.connected || !currentUser?.roomId) return;
      socket.emit("file-save", {
        roomId: currentUser.roomId,
        filePath,
        username: currentUser.username,
      });
    },
    [currentUser]
  );

  // 🔹 Final context value
  const contextValue = {
    socket,
    isConnected,
    error,
    reconnect: () => {
      if (socket.disconnected) socket.connect();
    },
    emitCodeChange, // ✅ added for real-time editor
    notifyFileOpened,
    updateFileContent,
    notifyFileSaved,
    onFileOpened: handleFileOpened,
    onFileUpdate: handleFileUpdate,
    onFileSaved: handleFileSaved,
  };

  return (
    <SocketContext.Provider value={contextValue}>
      {children}
    </SocketContext.Provider>
  );
};

export default SocketContext;
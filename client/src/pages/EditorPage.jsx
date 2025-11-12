import SplitterComponent from "@/components/SplitterComponent";
import ConnectionStatusPage from "@/components/connection/ConnectionStatusPage";
import Sidebar from "@/components/sidebar/Sidebar";
import WorkSpace from "@/components/workspace";
import { useAppContext } from "@/context/AppContext";
import { useSocket } from "@/context/SocketContext";
import useFullScreen from "@/hooks/useFullScreen";
import useUserActivity from "@/hooks/useUserActivity";
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "react-hot-toast";

function EditorPage() {
  // Listen user online/offline status
  useUserActivity();
  // Enable fullscreen mode
  useFullScreen();

  const navigate = useNavigate();
  const { roomId } = useParams();
  const { status, setStatus, setCurrentUser, currentUser } = useAppContext();
  const { socket, joinRoom, leaveRoom } = useSocket();
  const location = useLocation();
  const [joinAttempted, setJoinAttempted] = useState(false);

  // ✅ Join Room Logic
  useEffect(() => {
    if (!socket || status === "joined" || joinAttempted) return;

    const username = location.state?.username;

    if (!username) {
      console.log("No username found, redirecting to home...");
      navigate("/", { state: { roomId } });
      return;
    }

    if (roomId && username) {
      console.log(`Attempting to join room ${roomId} as ${username}...`);
      const user = { username, roomId };
      setCurrentUser(user);
      setStatus("connecting");
      setJoinAttempted(true);

      const handleJoinError = (error) => {
        console.error("Failed to join room:", error);
        toast.error(error.message || "Failed to join room");
        setStatus("connection_failed");
        navigate("/", { state: { roomId } });
      };

      socket.once("join-error", handleJoinError);

      socket.emit("join-request", user, (response) => {
        if (response?.error) {
          handleJoinError({ message: response.error });
        } else {
          setStatus("joined");
          console.log(`✅ Successfully joined room ${roomId}`);
        }
      });

      // Cleanup
      return () => {
        socket.off("join-error", handleJoinError);
      };
    }
  }, [
    roomId,
    location.state?.username,
    status,
    joinAttempted,
    navigate,
    setCurrentUser,
    setStatus,
    socket,
  ]);

  // ✅ Leave room when user exits
  useEffect(() => {
    return () => {
      if (socket && roomId) {
        leaveRoom(roomId);
        console.log(`👋 Left room ${roomId}`);
      }
    };
  }, [socket, roomId, leaveRoom]);

  // ✅ Sync real-time edits across users
  useEffect(() => {
    if (!socket) return;

    socket.on("code-change", ({ code }) => {
      // Broadcast code changes to all editors
      window.dispatchEvent(new CustomEvent("remote-code-update", { detail: code }));
    });

    return () => {
      socket.off("code-change");
    };
  }, [socket]);

  // ✅ Show connecting or error screens
  if (status === "connecting" || status === "attempting_join") {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="text-center">
          <div className="mb-4 text-2xl font-semibold">Joining room...</div>
          <div className="text-gray-500">Please wait while we connect you to the room.</div>
        </div>
      </div>
    );
  }

  if (status === "connection_failed") {
    return <ConnectionStatusPage />;
  }

  // ✅ Main workspace (Sidebar + Editor)
  return (
    <SplitterComponent>
      <Sidebar />
      <WorkSpace />
    </SplitterComponent>
  );
}

export default EditorPage;
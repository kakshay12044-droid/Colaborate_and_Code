import { useEffect, useState, useCallback } from "react";
import { useSocket } from "@/context/SocketContext";
import { useAppContext } from "@/context/AppContext";
import { useParams } from "react-router-dom";

const Editor = () => {
  const { socket } = useSocket();
  const { currentUser } = useAppContext();
  const { roomId } = useParams();

  const [code, setCode] = useState("// Start typing your code here...");

  // ✅ Emit code changes to others
  const handleCodeChange = useCallback(
    (e) => {
      const value = e.target.value;
      setCode(value);
      if (socket && roomId) {
        socket.emit("code-change", { roomId, code: value });
      }
    },
    [socket, roomId]
  );

  // ✅ Listen for remote code updates from others
  useEffect(() => {
    const handleRemoteCodeUpdate = (event) => {
      const remoteCode = event.detail;
      // Prevent overriding your own changes
      setCode(remoteCode);
    };

    window.addEventListener("remote-code-update", handleRemoteCodeUpdate);

    return () => {
      window.removeEventListener("remote-code-update", handleRemoteCodeUpdate);
    };
  }, []);

  // ✅ Listen directly from socket (optional redundancy)
  useEffect(() => {
    if (!socket) return;

    socket.on("code-change", ({ code: updatedCode }) => {
      setCode(updatedCode);
    });

    return () => {
      socket.off("code-change");
    };
  }, [socket]);

  return (
    <div className="h-full w-full bg-[#1e1e1e] text-white p-3">
      <textarea
        value={code}
        onChange={handleCodeChange}
        placeholder="Start coding here..."
        className="w-full h-full bg-transparent border-none outline-none resize-none text-lg font-mono"
      />
    </div>
  );
};

export default Editor;
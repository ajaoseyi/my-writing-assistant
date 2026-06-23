import { useEffect, useRef, useState, useCallback } from "react";
import { io, type Socket } from "socket.io-client";

interface UseGdocsSyncOptions {
  docId: string | null;
  sessionId: string | null;
  enabled: boolean;
  onExternalChange: (html: string, title: string) => void;
  onSyncError: (message: string) => void;
}

interface UseGdocsSyncReturn {
  pushToGdoc: (html: string) => void;
  syncStatus: "idle" | "syncing" | "error";
  suppressEmitRef: React.MutableRefObject<boolean>;
}

export function useGdocsSync({
  docId,
  sessionId,
  enabled,
  onExternalChange,
  onSyncError,
}: UseGdocsSyncOptions): UseGdocsSyncReturn {
  const socketRef = useRef<Socket | null>(null);
  const suppressEmitRef = useRef(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "error">("idle");

  useEffect(() => {
    if (!enabled || !docId || !sessionId) return;

    const socket = io({ path: "/socket.io", transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("gdocs:join", { sessionId, docId });
      setSyncStatus("idle");
    });

    socket.on("gdocs:external-change", ({ html, title }: { html: string; title: string }) => {
      suppressEmitRef.current = true;
      onExternalChange(html, title);
      // Clear after one animation frame — TipTap's programmatic setContent uses
      // emitUpdate:false, so onUpdate won't fire. This clears the flag for
      // any subsequent genuine user edits.
      requestAnimationFrame(() => {
        suppressEmitRef.current = false;
      });
    });

    socket.on("gdocs:error", ({ message }: { message: string }) => {
      setSyncStatus("error");
      onSyncError(message);
    });

    socket.on("app:changed:ack", () => {
      setSyncStatus("idle");
    });

    socket.on("app:changed:error", ({ message }: { message: string }) => {
      setSyncStatus("error");
      onSyncError(message);
    });

    return () => {
      socket.emit("gdocs:leave", { sessionId, docId });
      socket.disconnect();
      socketRef.current = null;
      setSyncStatus("idle");
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, docId, sessionId]);

  const pushToGdoc = useCallback(
    (html: string) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      setSyncStatus("syncing");
      socket.emit("app:changed", { sessionId, docId, html });
    },
    [sessionId, docId],
  );

  return { pushToGdoc, syncStatus, suppressEmitRef };
}

// app/lib/socket.ts
import { io, Socket } from "socket.io-client";
import { getAccess, getRefresh, saveTokens } from "./auth";

const API_URL =
  process.env.EXPO_PUBLIC_SOCKET_URL ||
  process.env.EXPO_PUBLIC_API_URL ||
  (typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent)
    ? "http://10.0.2.2:4000"
    : "http://localhost:4000");

// Persist across Fast Refresh
declare global {
  // eslint-disable-next-line no-var
  var __APP_SOCKET__: Socket | undefined;
  // eslint-disable-next-line no-var
  var __APP_SOCKET_PROMISE__: Promise<Socket> | undefined;
}

// Get a fresh access token (refresh if needed)
async function getFreshAccess(): Promise<string> {
  let access = await getAccess();
  const refresh = await getRefresh();
  if (access) return access;
  if (!refresh) throw new Error("no_tokens");

  // Do a refresh call (mirror your /auth/refresh API)
  const r = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });
  if (!r.ok) throw new Error("unauthorized");
  const data = await r.json();
  if (!data?.access) throw new Error("unauthorized");
  await saveTokens(data.access, refresh);
  return data.access;
}

async function createSocket(): Promise<Socket> {
  const token = await getFreshAccess();

  const s = io(API_URL, {
    autoConnect: false,
    transports: ["websocket", "polling"], // allow fallback; remove "polling" if you want WS-only
    timeout: 15000,
    reconnection: true,
    reconnectionAttempts: Infinity,
    auth: { token: `Bearer ${token}` },
  });

  // Keep auth fresh on reconnect attempts
  s.on("reconnect_attempt", async () => {
    try {
      const t = await getFreshAccess();
      s.auth = { token: `Bearer ${t}` };
    } catch (e) {
      // no tokens => let it fail; the screen should handle logout
    }
  });

  // Logs (optional)
  s.on("connect", () => console.log("[client] connected", s.id));
  s.on("connect_error", (err) => console.log("[client] connect_error", err.message, err));
  s.on("error", (err) => console.log("[client] socket error", err));
  s.on("disconnect", (reason) => console.log("[client] disconnected", reason));

  s.connect();
  
  // Setup connection handling
  s.once("connect", () => {
    console.log("[client] setting up presence and joining conversations");
    s.emit("conversations:joinAll");
    
    // Announce presence globally - this will be handled by server to mark user online in all their conversations
    s.emit("presence:announce_global", { status: 'online' });
    
    // Start heartbeat immediately on connection
    const heartbeatInterval = setInterval(() => {
      if (s.connected) {
        s.emit("presence:ping");
      } else {
        clearInterval(heartbeatInterval);
      }
    }, 10000); // Every 10 seconds
    
    // Clear heartbeat on disconnect
    s.on("disconnect", () => {
      clearInterval(heartbeatInterval);
    });
  });

  return s;
}

export async function getSocket(): Promise<Socket> {
  if (globalThis.__APP_SOCKET__ && globalThis.__APP_SOCKET__.connected) {
    return globalThis.__APP_SOCKET__;
  }
  if (!globalThis.__APP_SOCKET_PROMISE__) {
    globalThis.__APP_SOCKET_PROMISE__ = createSocket().then((s) => {
      globalThis.__APP_SOCKET__ = s;
      return s;
    });
  }
  return globalThis.__APP_SOCKET_PROMISE__;
}

// server/src/socket/presence.ts
import type { Server, Socket } from "socket.io";
import { prisma } from "../index.js"; // used to validate membership on 'here'
import { roomFor } from "../socket.js";

type Status = "online" | "away" | "busy" | "offline";

type PresenceState = {
  userId: string;
  status: Status;
  lastSeen: number;         // epoch ms
};

const HEARTBEAT_TTL = 30_000;   // 30s without ping => offline (more forgiving)
const SWEEP_INTERVAL = 10_000;  // check every 10s (less frequent sweeps)

// convId -> (userId -> PresenceState)
const PRESENCE = new Map<string, Map<string, PresenceState>>();

// convId -> Set(socketId) of watchers (subscribers who should receive events)
const SUBSCRIBERS = new Map<string, Set<string>>();

// socketId -> Set(convId) (what this socket is watching)
const WATCHING = new Map<string, Set<string>>();

// userId -> Set(socketId) (active sockets for the user)
const USER_SOCKETS = new Map<string, Set<string>>();

function now() { return Date.now(); }

function coerceStatus(s: any): Status {
  if (typeof s === "string") {
    const v = s.toLowerCase();
    if (v === "online" || v === "away" || v === "busy" || v === "offline") return v as Status;
  }
  return "online"; // default when client announces 'here'
}

function getConvPresence(convId: string) {
  let m = PRESENCE.get(convId);
  if (!m) { m = new Map(); PRESENCE.set(convId, m); }
  return m;
}

function getSubscribers(convId: string) {
  let s = SUBSCRIBERS.get(convId);
  if (!s) { s = new Set(); SUBSCRIBERS.set(convId, s); }
  return s;
}

function setWatching(socketId: string, convId: string, add: boolean) {
  let set = WATCHING.get(socketId);
  if (!set) { set = new Set(); WATCHING.set(socketId, set); }
  if (add) set.add(convId); else set.delete(convId);
}

function addUserSocket(userId: string, socketId: string) {
  let set = USER_SOCKETS.get(userId);
  if (!set) { set = new Set(); USER_SOCKETS.set(userId, set); }
  set.add(socketId);
}

function removeUserSocket(userId: string, socketId: string) {
  const set = USER_SOCKETS.get(userId);
  if (!set) return;
  set.delete(socketId);
  if (set.size === 0) USER_SOCKETS.delete(userId);
}

// broadcast a single user state update to all subscribers of a conversation
function emitPresenceUpdate(io: Server, conversationId: string, state: PresenceState) {
  const payload = {
    conversationId,
    userId: state.userId,
    status: state.status,
    lastActiveAt: new Date(state.lastSeen).toISOString(),
  };
  // send to explicit subscribers
  const subs = SUBSCRIBERS.get(conversationId);
  if (subs) subs.forEach(sid => io.to(sid).emit("presence:update", payload));
  // also emit to the conversation room for anyone listening there
  io.to(roomFor(conversationId)).emit("presence:update", payload);
}

// send a bulk snapshot to one socket
function emitBulkSnapshot(io: Server, socket: Socket, conversationId: string) {
  // Before sending snapshot, check for stale presence and mark offline
  const t = now();
  const map = getConvPresence(conversationId);
  let updated = false;
  
  for (const [userId, st] of map.entries()) {
    if (st.status !== "offline" && t - st.lastSeen > HEARTBEAT_TTL) {
      const updatedState: PresenceState = { userId, status: "offline", lastSeen: st.lastSeen };
      map.set(userId, updatedState);
      updated = true;
    }
  }
  
  const states = Array.from(map.values()).map(s => ({
    userId: s.userId,
    status: s.status,
    lastActiveAt: new Date(s.lastSeen).toISOString(),
  }));
  
  socket.emit("presence:bulk", { conversationId, states });
  
  // If we updated any states, broadcast the changes
  if (updated) {
    for (const [userId, st] of map.entries()) {
      if (st.status === "offline") {
        emitPresenceUpdate(io, conversationId, st);
      }
    }
  }
}

// public API used by HTTP routes
export function getPresenceSnapshot(conversationId: string) {
  return Array.from(getConvPresence(conversationId).values()).map(s => ({
    userId: s.userId,
    status: s.status,
    lastActiveAt: new Date(s.lastSeen).toISOString(),
  }));
}

export function setupPresence(io: Server) {
  // periodic sweeper to mark users offline if TTL exceeded
  setInterval(() => {
    const t = now();
    let offlineCount = 0;
    for (const [convId, map] of PRESENCE.entries()) {
      for (const [userId, st] of map.entries()) {
        if (st.status !== "offline" && t - st.lastSeen > HEARTBEAT_TTL) {
          const updated: PresenceState = { userId, status: "offline", lastSeen: st.lastSeen };
          map.set(userId, updated);
          emitPresenceUpdate(io, convId, updated);
          offlineCount++;
          console.log(`[presence-sweep] Marked user ${userId} offline in conversation ${convId} (last seen ${Math.round((t - st.lastSeen) / 1000)}s ago)`);
        }
      }
    }
    if (offlineCount > 0) {
      console.log(`[presence-sweep] Marked ${offlineCount} users offline`);
    }
  }, SWEEP_INTERVAL);

  io.on("connection", (socket) => {
    const userId = (socket.data as any)?.userId as string | undefined;
    if (userId) addUserSocket(userId, socket.id);

    // a client wants live presence for a conversation
    socket.on("presence:subscribe", ({ conversationId }: { conversationId: string }) => {
      if (!conversationId) return;
      getSubscribers(conversationId).add(socket.id);
      setWatching(socket.id, conversationId, true);
      emitBulkSnapshot(io, socket, conversationId);
    });

    // client no longer needs presence
    socket.on("presence:unsubscribe", ({ conversationId }: { conversationId: string }) => {
      if (!conversationId) return;
      getSubscribers(conversationId).delete(socket.id);
      setWatching(socket.id, conversationId, false);
    });

    // mark this user present in a conversation (optionally with status)
    socket.on("presence:here", async ({ conversationId, status }: { conversationId: string; status?: Status }) => {
      if (!userId || !conversationId) return;

      // (Optional) ensure this user really belongs to that conversation
      const isMember = await prisma.conversationParticipant.findFirst({
        where: { conversationId, userId },
        select: { id: true },
      });
      if (!isMember) return; // ignore spoofed 'here'

      const map = getConvPresence(conversationId);
      const st: PresenceState = {
        userId,
        status: coerceStatus(status),
        lastSeen: now(),
      };
      map.set(userId, st);
      console.log(`[presence:here] User ${userId} is now ${st.status} in conversation ${conversationId}`);
      emitPresenceUpdate(io, conversationId, st);
    });

    // global presence announcement - mark user online in all their conversations
    socket.on("presence:announce_global", async ({ status }: { status?: Status }) => {
      if (!userId) return;
      
      console.log(`[presence:announce_global] User ${userId} announcing global presence with status: ${status}`);
      
      try {
        // Get all conversations this user is part of
        const userConversations = await prisma.conversationParticipant.findMany({
          where: { userId },
          select: { conversationId: true },
        });

        const t = now();
        const userStatus = coerceStatus(status);

        // Mark user as online in all their conversations
        for (const { conversationId } of userConversations) {
          const map = getConvPresence(conversationId);
          const st: PresenceState = {
            userId,
            status: userStatus,
            lastSeen: t,
          };
          map.set(userId, st);
          console.log(`[presence:announce_global] User ${userId} is now ${userStatus} in conversation ${conversationId}`);
          emitPresenceUpdate(io, conversationId, st);
        }
      } catch (error) {
        console.error(`[presence:announce_global] Error for user ${userId}:`, error);
      }
    });

    // bulk presence request - send presence for all user's conversations
    socket.on("presence:request_bulk", async () => {
      if (!userId) return;
      
      try {
        // Get all conversations this user is part of
        const userConversations = await prisma.conversationParticipant.findMany({
          where: { userId },
          select: { conversationId: true },
        });

        // Collect presence data from all user's conversations
        const allPresence: { [userId: string]: { isOnline: boolean; lastSeen?: string } } = {};
        
        for (const { conversationId } of userConversations) {
          const map = getConvPresence(conversationId);
          for (const [uid, state] of map.entries()) {
            if (uid !== userId) { // Don't include self
              allPresence[uid] = {
                isOnline: state.status !== "offline",
                lastSeen: new Date(state.lastSeen).toISOString(),
              };
            }
          }
        }

        socket.emit("presence:bulk", allPresence);
        console.log(`[presence:request_bulk] Sent bulk presence data to user ${userId} for ${Object.keys(allPresence).length} users`);
      } catch (error) {
        console.error(`[presence:request_bulk] Error for user ${userId}:`, error);
      }
    });

    // heartbeat to keep online
    socket.on("presence:ping", () => {
      if (!userId) return;
      const watching = WATCHING.get(socket.id);
      const t = now();
      
      // If user is not watching any conversations specifically, update all their conversations
      if (!watching || watching.size === 0) {
        // Get all conversations for this user and update their presence
        (async () => {
          try {
            const userConversations = await prisma.conversationParticipant.findMany({
              where: { userId },
              select: { conversationId: true },
            });

            for (const { conversationId } of userConversations) {
              const map = getConvPresence(conversationId);
              const old = map.get(userId);
              if (old && old.status !== "offline") {
                const updated: PresenceState = { ...old, lastSeen: t };
                map.set(userId, updated);
              }
            }
          } catch (error) {
            console.error(`[presence:ping] Error updating user ${userId} presence:`, error);
          }
        })();
      } else {
        // Update presence for watched conversations
        for (const convId of watching.values()) {
          const map = getConvPresence(convId);
          const old = map.get(userId);
          if (!old) continue;
          const updated: PresenceState = { ...old, lastSeen: t };
          map.set(userId, updated);
        }
      }
    });

    // cleanup
    socket.on("disconnect", () => {
      console.log(`[disconnect] Socket ${socket.id} for user ${userId} disconnected`);
      
      // remove from subscriber lists
      const watching = WATCHING.get(socket.id);
      if (watching) {
        for (const convId of watching.values()) {
          const subs = SUBSCRIBERS.get(convId);
          if (subs) subs.delete(socket.id);
        }
        WATCHING.delete(socket.id);
      }
      
      if (userId) {
        removeUserSocket(userId, socket.id);
        
        // Check if user has no more active sockets, if so mark them offline in all conversations they were watching
        const userSockets = USER_SOCKETS.get(userId);
        if (!userSockets || userSockets.size === 0) {
          console.log(`[disconnect] User ${userId} has no more active sockets, marking offline`);
          if (watching) {
            for (const convId of watching.values()) {
              const map = getConvPresence(convId);
              const current = map.get(userId);
              if (current && current.status !== "offline") {
                const updated: PresenceState = { userId, status: "offline", lastSeen: now() };
                map.set(userId, updated);
                emitPresenceUpdate(io, convId, updated);
                console.log(`[disconnect] Marked user ${userId} offline in conversation ${convId}`);
              }
            }
          }
        }
      }
    });
  });
}

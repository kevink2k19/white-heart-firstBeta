// server/src/socket.ts
import type http from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { env } from "./env.js";
import { prisma } from "./index.js";
import { setupPresence } from "./socket/presence.js";

export let io: Server;
export const roomFor = (cid: string) => `conv:${cid}`;

export function initSocket(server: http.Server) {
  io = new Server(server, {
    cors: {
      origin: (origin, cb) => cb(null, true),
      credentials: true,
    },
  });

  // JWT auth -> put userId on socket.data.userId
  io.use((socket, next) => {
    try {
      const raw = socket.handshake.auth?.token || "";
      const token = raw.startsWith("Bearer ") ? raw.slice(7) : raw;
      const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as { sub: string };
      (socket.data as any).userId = payload.sub;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  // 🔌 Presence module registers its own handlers
  setupPresence(io);

  io.on("connection", (socket) => {
    const userId = (socket.data as any).userId as string;
    console.log("[server] socket connected", socket.id, "user:", userId);

    // personal room for direct user pings (e.g., groups:refresh)
    socket.join(`user:${userId}`);

    socket.on("conversations:joinAll", async () => {
      const cps = await prisma.conversationParticipant.findMany({
        where: { userId },
        select: { conversationId: true },
      });
      cps.forEach(({ conversationId }) => socket.join(roomFor(conversationId)));
      console.log("[server] joined rooms:", cps.map((c) => c.conversationId));
    });

    socket.on("join:conversation", ({ conversationId }) => {
      socket.join(roomFor(conversationId));
      console.log("[server] join:conversation", conversationId);
    });

    socket.on("leave:conversation", ({ conversationId }) => {
      socket.leave(roomFor(conversationId));
      console.log("[server] leave:conversation", conversationId);
    });
  });
}

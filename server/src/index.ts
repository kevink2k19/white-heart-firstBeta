// server/src/index.ts
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import { PrismaClient } from "@prisma/client";
import { env } from "./env.js";
import http from "http";
import { initSocket } from "./socket.js";

// Routers
import conversationsRouter from "./routes/conversations.js";
import messagesRouter from "./routes/messages.js";
import groupsRouter from "./routes/groups.js"; // <- keep this
import voiceRoomsRouter from "./routes/voiceRooms.js";
import authRouter from "./routes/auth.js";
import userRouter from "./routes/user.js";
import paymentsRouter from "./routes/payments.js";
import adminPaymentMethodsRouter from "./routes/admin.paymentMethods.js";
import adminTopupsRouter from "./routes/admin.topups.js";
import uploadRouter from "./routes/upload.js";

export const prisma = new PrismaClient();
const app = express();

app.use(helmet());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // mobile apps / curl
      try {
        const allowAllInDev = process.env.NODE_ENV !== "production";
        if (allowAllInDev) return cb(null, true);

        const allowed = Array.isArray(env.CORS_ORIGIN) ? env.CORS_ORIGIN : [];
        const ok = allowed.some((a) => origin.startsWith(a));
        return cb(ok ? null : new Error("CORS blocked"), ok);
      } catch {
        return cb(null, true);
      }
    },
    credentials: true,
  })
);

// ---- Public / Auth
app.get("/health", (_req: Request, res: Response) => res.json({ ok: true }));
app.use("/auth", authRouter);

// ---- Authed user
app.use("/me", userRouter);

// ---- User-facing payments
app.use("/", paymentsRouter);

// ---- Admin routes
app.use("/admin", adminPaymentMethodsRouter);
app.use("/admin", adminTopupsRouter);

// ---- Static file serving for uploads
app.use("/uploads", express.static("uploads"));

// ---- Upload route
app.use("/", uploadRouter);

// ---- CHAT routes (must be BEFORE 404 and BEFORE listen)
app.use("/chat", conversationsRouter);
app.use("/chat", messagesRouter);
app.use("/chat", groupsRouter);
app.use("/chat", voiceRoomsRouter);

// ---- 404 for unmatched (must be after all routes)
app.use((_req, res) => res.status(404).json({ error: "Not Found" }));

// ---- Typed error handler (must be after all routes/middleware)
app.use(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message =
      err instanceof Error ? err.message : typeof err === "string" ? err : "Server error";
    console.error(err);
    res.status(500).json({ error: message });
  }
);

// ---- Start server AFTER mounting routes
const PORT = Number(env.PORT) || 4000;
const httpServer = http.createServer(app);
initSocket(httpServer);

const server = httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`API on http://0.0.0.0:${PORT}`);
});

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`\n${signal} received. Shutting down...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

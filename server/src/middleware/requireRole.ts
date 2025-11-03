// server/middleware/requireRole.ts
import type { Response, NextFunction } from "express";
import { prisma } from "../index.js";
import { requireAuth, AuthedRequest } from "./requireAuth.js";

type Role = "SUPER_ADMIN" | "ADMIN" | "MODERATOR" | "USER";

/**
 * Usage: router.get("/admin/thing", ...requireRole("SUPER_ADMIN"), handler)
 * This composes `requireAuth` first, then checks the role from DB.
 */
export const requireRole = (...allowed: Role[]) => {
  const allowedSet = new Set(allowed.map(r => r.toUpperCase()));

  return [
    requireAuth, // ensures req.userId is set or 401
    async (req: AuthedRequest, res: Response, next: NextFunction) => {
      try {
        const u = await prisma.user.findUnique({
          where: { id: req.userId! },
          select: { role: true },
        });
        const role = (u?.role ?? "").toString().toUpperCase();
        if (!u) return res.status(401).json({ error: "USER_NOT_FOUND" });
        if (!allowedSet.has(role as Role)) {
          return res.status(403).json({ error: "FORBIDDEN" });
        }
        next();
      } catch (e) {
        next(e);
      }
    },
  ];
};

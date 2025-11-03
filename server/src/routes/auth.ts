// server/src/routes/auth.ts
import { Router } from "express";
import { prisma } from "../index.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../env.js";

const router = Router();

/** Helpers */
const normalizePhone = (p: string) => {
  const digits = p.replace(/\D/g, "");
  if (p.startsWith("+")) return p;
  // Myanmar default (+95) with leading 0 trimmed
  return `+95${digits.replace(/^0/, "")}`;
};

const registerSchema = z.object({
  phone: z.string().regex(/^\+?[0-9]{7,15}$/, "Invalid phone format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name required"),
  licenseNumber: z.string().min(1, "License number required"),
  carNumber: z.string().min(1, "Car number required"),
});

const loginSchema = z.object({
  phone: z.string().regex(/^\+?[0-9]{7,15}$/, "Invalid phone format"),
  password: z.string(),
});

const signAccess = (userId: string) =>
  jwt.sign({ sub: userId, typ: "access" }, env.JWT_ACCESS_SECRET, { expiresIn: "15m" });

const signRefresh = (userId: string) =>
  jwt.sign({ sub: userId, typ: "refresh" }, env.JWT_REFRESH_SECRET, { expiresIn: "30d" });

/** POST /auth/register */
router.post("/register", async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const phone = normalizePhone(data.phone);

    const exists = await prisma.user.findUnique({ where: { phone } });
    if (exists) return res.status(409).json({ error: "Phone already registered" });

    const passwordHash = await bcrypt.hash(data.password, 12);

    const user = await prisma.user.create({
      data: {
        phone,
        name: data.name,
        passwordHash,
        licenseNumber: data.licenseNumber,
        carNumber: data.carNumber,
      },
      select: {
        id: true,
        phone: true,
        name: true,
        role: true,
        status: true,
        balance: true,
        rating: true,
        licenseNumber: true,
        carNumber: true,
      },
    });

    res.status(201).json({
      user,
      tokens: { access: signAccess(user.id), refresh: signRefresh(user.id) },
    });
  } catch (e) {
    next(e);
  }
});

/** POST /auth/login */
router.post("/login", async (req, res, next) => {
  try {
    const { phone, password } = loginSchema.parse(req.body);

    const normalized = normalizePhone(phone);
    const user = await prisma.user.findUnique({ where: { phone: normalized } });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    res.json({
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        role: user.role,
        status: user.status,
        balance: user.balance,
        rating: user.rating,
        licenseNumber: user.licenseNumber,
        carNumber: user.carNumber,
      },
      tokens: { access: signAccess(user.id), refresh: signRefresh(user.id) },
    });
  } catch (e) {
    next(e);
  }
});

/** POST /auth/refresh */
router.post("/refresh", async (req, res, next) => {
  try {
    const { refresh } = req.body as { refresh?: string };
    if (!refresh) return res.status(400).json({ error: "Missing refresh token" });

    const payload = jwt.verify(refresh, env.JWT_REFRESH_SECRET) as { sub: string; typ?: string };
    if (payload?.typ !== "refresh") return res.status(401).json({ error: "invalid_token_type" });

    return res.json({ access: signAccess(payload.sub) });
  } catch (e) {
    next(e);
  }
});

/** POST /auth/logout */
router.post("/logout", (_req, res) => {
  res.json({ ok: true });
});

export default router;

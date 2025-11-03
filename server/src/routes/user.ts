// server/src/routes/user.ts
import { Router } from "express";
import { prisma } from "../index.js";
import { requireAuth, AuthedRequest } from "../middleware/requireAuth.js";
import { z } from "zod";
import bcrypt from "bcryptjs";

const router = Router();

/** Helpers */
const normalizePhone = (p: string) => {
  const digits = p.replace(/\D/g, "");
  if (p.startsWith("+")) return p;
  return `+95${digits.replace(/^0/, "")}`;
};

/** GET /me -> current user profile */
router.get("/", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const u = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: {
        id: true,
        name: true,
        phone: true,
        role: true,
        status: true,
        balance: true,
        rating: true,
        licenseNumber: true,
        carNumber: true,
      },
    });
    if (!u) return res.status(404).json({ error: "User not found" });
    res.json(u);
  } catch (e) {
    next(e);
  }
});

/** GET /me/user/:userId -> get another user's public profile */
router.get("/user/:userId", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { userId } = req.params;
    
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        rating: true,
        licenseNumber: true,
        carNumber: true,
      },
    });
    
    if (!u) return res.status(404).json({ error: "User not found" });
    res.json(u);
  } catch (e) {
    next(e);
  }
});

/** PATCH /me -> update profile fields */
router.patch("/", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const body = z
      .object({
        name: z.string().min(1).optional(),
        phone: z.string().regex(/^\+?[0-9]{7,15}$/).optional(),
        avatarUrl: z.string().url().optional(),
        licenseNumber: z.string().min(1).optional(),
        carNumber: z.string().min(1).optional(),
      })
      .parse(req.body);

    const data: Record<string, any> = { ...body };
    if (data.phone) data.phone = normalizePhone(data.phone);

    // If phone is changing, ensure it isn't used by someone else
    if (data.phone) {
      const exists = await prisma.user.findUnique({ where: { phone: data.phone } });
      if (exists && exists.id !== req.userId) {
        return res.status(409).json({ error: "Phone already registered" });
      }
    }

    const u = await prisma.user.update({
      where: { id: req.userId! },
      data,
      select: {
        id: true,
        name: true,
        phone: true,
        role: true,
        status: true,
        balance: true,
        rating: true,
        licenseNumber: true,
        carNumber: true,
      },
    });
    res.json(u);
  } catch (e) {
    next(e);
  }
});

const chargeSchema = z.object({
  amount: z.number().int().positive().max(1_000_000),
  reason: z.string().optional(),
});

/** POST /me/charge  { amount } -> { balance } */
router.post("/charge", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { amount } = chargeSchema.parse(req.body);

    const updated = await prisma.user.updateMany({
      where: { id: req.userId!, balance: { gte: amount } },
      data: { balance: { decrement: amount } },
    });

    if (updated.count === 0) {
      return res.status(400).json({ error: "INSUFFICIENT_BALANCE" });
    }

    const u = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { balance: true },
    });

    res.json({ balance: u!.balance });
  } catch (e) {
    next(e);
  }
});

const pwdSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

/** POST /me/password -> change password */
router.post("/password", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { oldPassword, newPassword } = pwdSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { id: true, passwordHash: true },
    });
    if (!user) return res.status(404).json({ error: "User not found" });

    const ok = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!ok) return res.status(400).json({ error: "INVALID_OLD_PASSWORD" });

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;

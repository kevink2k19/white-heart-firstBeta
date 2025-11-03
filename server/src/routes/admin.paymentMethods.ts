import { Router } from "express";
import { z } from "zod";
import { prisma } from "../index.js";
import { requireRole } from "../middleware/requireRole.js";
import type { AuthedRequest } from "../middleware/requireAuth.js";

const router = Router();

// digits-only helper for dedupe/uniqueness
const norm = (s: string) => s.replace(/\D/g, "");

// Admin list (optional but handy for an admin table)
router.get(
  "/payment-methods",
  ...requireRole("SUPER_ADMIN"),
  async (_req, res, next) => {
    try {
      const list = await prisma.paymentMethod.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          bank: true,
          number: true,
          isActive: true,
          createdAt: true,
          createdBy: { select: { id: true, name: true, phone: true } },
        },
      });
      res.json(list);
    } catch (e) {
      next(e);
    }
  }
);

// Create a payment method
router.post(
  "/payment-methods",
  ...requireRole("SUPER_ADMIN"),
  async (req: AuthedRequest, res, next) => {
    try {
      const input = z
        .object({
          name: z.string().trim().min(1, "Name required"),
          bank: z.string().trim().min(1, "Bank required"),
          number: z.string().trim().min(5, "Number required"),
          isActive: z.boolean().optional(),
        })
        .parse(req.body);

      const numberNorm = norm(input.number);
      if (numberNorm.length < 5) {
        return res.status(400).json({ error: "NUMBER_TOO_SHORT" });
      }

      const created = await prisma.paymentMethod.create({
        data: {
          name: input.name,
          bank: input.bank,
          number: input.number,
          numberNorm,
          isActive: input.isActive ?? true,
          createdById: req.userId!,
        },
        select: {
          id: true,
          name: true,
          bank: true,
          number: true,
          isActive: true,
          createdAt: true,
        },
      });

      res.status(201).json(created);
    } catch (e: any) {
      // unique constraint on [bank, numberNorm]
      if (e?.code === "P2002") {
        return res.status(409).json({ error: "DUPLICATE_NUMBER" });
      }
      next(e);
    }
  }
);

// Edit / toggle active (optional but useful)
router.patch(
  "/payment-methods/:id",
  ...requireRole("SUPER_ADMIN"),
  async (req, res, next) => {
    try {
      const id = req.params.id;
      const input = z
        .object({
          name: z.string().trim().min(1).optional(),
          bank: z.string().trim().min(1).optional(),
          number: z.string().trim().min(5).optional(),
          isActive: z.boolean().optional(),
        })
        .parse(req.body);

      const data: any = { ...input };
      if (input.number) {
        const numberNorm = norm(input.number);
        if (numberNorm.length < 5) {
          return res.status(400).json({ error: "NUMBER_TOO_SHORT" });
        }
        data.numberNorm = numberNorm;
      }

      const updated = await prisma.paymentMethod.update({
        where: { id },
        data,
        select: {
          id: true,
          name: true,
          bank: true,
          number: true,
          isActive: true,
          createdAt: true,
        },
      });

      res.json(updated);
    } catch (e: any) {
      if (e?.code === "P2002") {
        return res.status(409).json({ error: "DUPLICATE_NUMBER" });
      }
      next(e);
    }
  }
);

export default router;

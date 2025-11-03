import { Router } from "express";
import { z } from "zod";
import { prisma } from "../index.js";
import { requireRole } from "../middleware/requireRole.js";

const router = Router();

// Admin list with optional status filter (?status=PENDING|APPROVED|REJECTED)
router.get(
  "/topups",
  ...requireRole("SUPER_ADMIN"),
  async (req, res, next) => {
    try {
      const statusParam = (req.query.status as string | undefined)?.toUpperCase() || "PENDING";
      const statusSchema = z.enum(["PENDING", "APPROVED", "REJECTED"]);
      const status = statusSchema.parse(statusParam);

      const list = await prisma.topUp.findMany({
        where: { status },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          amount: true,
          paymentId: true,
          status: true,
          createdAt: true,
          user: { select: { id: true, name: true, phone: true, carNumber: true } },
          paymentMethod: { select: { id: true, name: true, bank: true, number: true } },
        },
      });

      res.json(list);
    } catch (e) {
      next(e);
    }
  }
);

// Approve / Reject a top-up
router.patch(
  "/topups/:id",
  ...requireRole("SUPER_ADMIN"),
  async (req, res, next) => {
    try {
      const id = req.params.id;
      const { status } = z
        .object({ status: z.enum(["APPROVED", "REJECTED"]) })
        .parse(req.body);

      const result = await prisma.$transaction(async (db) => {
        const t = await db.topUp.findUnique({ where: { id } });
        if (!t) return { error: "NOT_FOUND" as const };

        if (t.status !== "PENDING") {
          return { error: "ALREADY_DECIDED" as const };
        }

        const updated = await db.topUp.update({
          where: { id },
          data: {
            status,
            decidedAt: new Date(),
            decidedById: (req as any).userId as string,
          },
          select: {
            id: true,
            userId: true,
            amount: true,
            paymentId: true,
            status: true,
            createdAt: true,
          },
        });

        if (status === "APPROVED") {
          await db.user.update({
            where: { id: updated.userId },
            data: { balance: { increment: updated.amount } },
          });
        }

        return { updated };
      });

      if ("error" in result) {
        const code = result.error;
        if (code === "NOT_FOUND") return res.status(404).json({ error: code });
        if (code === "ALREADY_DECIDED") return res.status(400).json({ error: code });
      }

      res.json(result.updated);
    } catch (e) {
      next(e);
    }
  }
);

export default router;

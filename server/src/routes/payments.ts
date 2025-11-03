import { Router } from "express";
import { z } from "zod";
import { prisma } from "../index.js";
import { requireAuth, AuthedRequest } from "../middleware/requireAuth.js";

const router = Router();

/**
 * GET /payment-methods
 * Returns active payment methods for the Top Up screen.
 */
router.get("/payment-methods", requireAuth, async (_req, res, next) => {
  try {
    const list = await prisma.paymentMethod.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, bank: true, number: true },
    });
    res.json(list);
  } catch (e) {
    next(e);
  }
});

/**
 * POST /topups
 * User submits a top up request.
 * Body: { amount: number, paymentId: string(5 digits), paymentMethodId: string }
 */
router.post("/topups", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = z
      .object({
        amount: z.number().int().positive().max(1_000_000),
        paymentId: z.string().regex(/^\d{5}$/, "paymentId must be final 5 digits"),
        paymentMethodId: z.string().min(1),
      })
      .parse(req.body);

    // Ensure the payment method exists and is active
    const pm = await prisma.paymentMethod.findFirst({
      where: { id: input.paymentMethodId, isActive: true },
      select: { id: true },
    });
    if (!pm) return res.status(400).json({ error: "INVALID_METHOD" });

    const created = await prisma.topUp.create({
      data: {
        userId: req.userId!,
        amount: input.amount,
        paymentId: input.paymentId,
        paymentMethodId: input.paymentMethodId,
        // status defaults to PENDING
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
      },
    });

    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
});

export default router;

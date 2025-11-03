import { Router } from "express";
import { prisma } from "../index.js";
import { requireAuth, AuthedRequest } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { ConversationType, MessageType } from "@prisma/client";
import { normalizePhone, phoneVariants } from "../utils/phone.js";
import { io, roomFor } from "../socket.js";
import { getPresenceSnapshot } from "../socket/presence.js";

const router = Router();

// Every route requires auth
router.use(requireAuth);

// --- helper: is this user a participant of this conversation? ---
const assertParticipant = async (userId: string, conversationId: string) => {
  const cp = await prisma.conversationParticipant.findFirst({
    where: { userId, conversationId },
    select: { id: true },
  });
  return Boolean(cp);
};

// --- helpers: creator / platform admin checks ---
const getCreatorUserId = async (conversationId: string) => {
  const first = await prisma.conversationParticipant.findFirst({
    where: { conversationId },
    orderBy: { joinedAt: "asc" },
    select: { userId: true },
  });
  return first?.userId ?? null;
};

const isPlatformAdmin = async (userId: string) => {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return me?.role === "SUPER_ADMIN" || me?.role === "ADMIN";
};

const requireOwnerOrPlatformAdmin = async (userId: string, conversationId: string) => {
  if (await isPlatformAdmin(userId)) return true;
  const creatorId = await getCreatorUserId(conversationId);
  return creatorId === userId;
};

/**
 * GET /chat/groups
 */
router.get("/groups", async (req: AuthedRequest, res) => {
  const userId = req.userId!;

  const groups = await prisma.conversation.findMany({
    where: {
      type: ConversationType.GROUP,
      participants: { some: { userId } },
    },
    include: {
      participants: { select: { id: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, type: true, text: true, createdAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const groupIds = groups.map((g) => g.id);

  const unreadStatuses = await prisma.messageStatus.findMany({
    where: {
      userId,
      readAt: null,
      message: { conversationId: { in: groupIds } },
    },
    select: { message: { select: { conversationId: true } } },
  });

  const unreadByConv: Record<string, number> = {};
  for (const st of unreadStatuses) {
    const convId = st.message.conversationId;
    unreadByConv[convId] = (unreadByConv[convId] ?? 0) + 1;
  }

  const payload = groups.map((g) => {
    const last = g.messages[0] || null;
    const lastActivityAt = last?.createdAt ?? g.createdAt;
    const lastMessage =
      last?.type === "TEXT"
        ? last.text ?? ""
        : last?.type === "ORDER"
        ? "Order message"
        : last?.type === "VOICE"
        ? "Voice message"
        : last?.type === "IMAGE"
        ? "Image"
        : last
        ? "Message"
        : "";

    return {
      id: g.id,
      name: g.title ?? "Group",
      memberCount: g.participants.length,
      lastMessage,
      lastMessageAt: lastActivityAt.toISOString(),
      unreadCount: unreadByConv[g.id] ?? 0,
    };
  });

  res.json(payload);
});

/**
 * GET /chat/groups/:id/members
 * Returns members with role, joinedAt, and live presence status.
 */
router.get("/groups/:id/members", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { id: conversationId } = req.params;

  const isParticipant = await prisma.conversationParticipant.findFirst({
    where: { userId, conversationId },
    select: { id: true },
  });
  if (!isParticipant) return res.status(403).json({ error: "Forbidden" });

  const members = await prisma.conversationParticipant.findMany({
    where: { conversationId },
    orderBy: { joinedAt: "asc" },
    include: { user: { select: { id: true, name: true, phone: true } } },
  });

  // merge presence
  const snapshot = getPresenceSnapshot(conversationId);
  const byId = new Map(snapshot.map(s => [String(s.userId), s.status]));

  res.json(
    members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      phone: m.user.phone ?? null,
      role: (m.role as "admin" | "moderator" | "member") ?? "member",
      joinedAt: m.joinedAt.toISOString(),
      status: (byId.get(String(m.user.id)) ?? "offline") as "online" | "offline" | "away" | "busy",
    }))
  );
});


/**
 * NEW: GET /chat/groups/:id/available-users?q=...
 * Returns users NOT in the group. Optional query by name or phone (normalized).
 */
router.get("/groups/:id/available-users", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { id: conversationId } = req.params;
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

  if (!(await assertParticipant(userId, conversationId))) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const current = await prisma.conversationParticipant.findMany({
    where: { conversationId },
    select: { userId: true },
  });
  const excludeIds = current.map((c) => c.userId);

  let where: any = { id: { notIn: excludeIds } };

  if (q) {
    const variants = phoneVariants(q);
    where = {
      AND: [
        { id: { notIn: excludeIds } },
        {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            ...variants.map((v: any) => ({ phone: v })),
          ],
        },
      ],
    };
  }

  const users = await prisma.user.findMany({
    where,
    orderBy: { name: "asc" },
    take: 25,
    select: { id: true, name: true, phone: true },
  });

  res.json(users);
});

/**
 * NEW: GET /chat/groups/:id/invite-link
 * Very basic link generator (replace APP_URL in env as needed)
 */
router.get("/groups/:id/invite-link", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { id: conversationId } = req.params;

  if (!(await assertParticipant(userId, conversationId))) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const base = process.env.APP_URL || "https://example.com";
  const url = `${base}/invite?group=${encodeURIComponent(conversationId)}`;
  res.json({ url });
});

/**
 * POST /chat/groups
 * ONLY SUPER_ADMIN or ADMIN
 */
router.post(
  "/groups",
  ...requireRole("SUPER_ADMIN", "ADMIN"),
  async (req: AuthedRequest, res) => {
    const { name } = (req.body || {}) as { name?: string };
    if (!name || !name.trim()) return res.status(400).json({ error: "name_required" });

    const conv = await prisma.conversation.create({
      data: {
        type: ConversationType.GROUP,
        title: name.trim(),
        participants: {
          create: {
            userId: req.userId!,
            role: "admin", // creator becomes group admin
          },
        },
      },
      select: { id: true, title: true },
    });

    res.status(201).json({ id: conv.id, name: conv.title ?? name.trim() });
  }
);

/**
 * POST /chat/groups/:id/members
 * ONLY creator OR platform SUPER_ADMIN/ADMIN
 * Body: { user: string(id or phone), role?: "admin"|"moderator"|"member" }
 */
router.post("/groups/:id/members", async (req: AuthedRequest, res) => {
  const { id: conversationId } = req.params;
  const userId = req.userId!;
  const { user, role } = (req.body || {}) as {
    user?: string;
    role?: "admin" | "moderator" | "member";
  };

  if (!user) return res.status(400).json({ error: "user_required" });

  const ok = await requireOwnerOrPlatformAdmin(userId, conversationId);
  if (!ok) return res.status(403).json({ error: "Forbidden" });

  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, type: ConversationType.GROUP },
    select: { id: true },
  });
  if (!conv) return res.status(404).json({ error: "not_found" });

  const variants = phoneVariants(user);
  const target = await prisma.user.findFirst({
    where: {
      OR: [
        { id: user },
        { phone: user },
        ...variants.map((v: any) => ({ phone: v })),
      ],
    },
    select: { id: true },
  });
  if (!target) return res.status(404).json({ error: "user_not_found" });

  await prisma.conversationParticipant.upsert({
    where: {
      conversationId_userId: { conversationId, userId: target.id },
    },
    update: { role: role ?? "member" },
    create: { conversationId, userId: target.id, role: role ?? "member" },
  });

  res.json({ ok: true });
});

/**
 * DELETE /chat/groups/:id/members/:memberId
 * ONLY creator OR platform SUPER_ADMIN/ADMIN
 */
router.delete("/groups/:id/members/:memberId", async (req: AuthedRequest, res) => {
  const { id: conversationId, memberId } = req.params;
  const userId = req.userId!;

  const ok = await requireOwnerOrPlatformAdmin(userId, conversationId);
  if (!ok) return res.status(403).json({ error: "Forbidden" });

  const existing = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId: memberId } },
    select: { conversationId: true },
  });
  if (!existing) return res.status(404).json({ error: "not_found" });

  await prisma.conversationParticipant.delete({
    where: { conversationId_userId: { conversationId, userId: memberId } },
  });

  res.json({ ok: true });
});

/**
 * PATCH /chat/groups/:id/members/:memberId/role
 * ONLY creator OR platform SUPER_ADMIN/ADMIN
 */
router.patch("/groups/:id/members/:memberId/role", async (req: AuthedRequest, res) => {
  const { id: conversationId, memberId } = req.params;
  const userId = req.userId!;
  const { role } = (req.body || {}) as { role?: "admin" | "moderator" | "member" };

  if (!role) return res.status(400).json({ error: "role_required" });

  const ok = await requireOwnerOrPlatformAdmin(userId, conversationId);
  if (!ok) return res.status(403).json({ error: "Forbidden" });

  const existing = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId: memberId } },
    select: { conversationId: true },
  });
  if (!existing) return res.status(404).json({ error: "not_found" });

  await prisma.conversationParticipant.update({
    where: { conversationId_userId: { conversationId, userId: memberId } },
    data: { role },
  });

  res.json({ ok: true });
});

/**
 * POST /chat/groups/broadcast-order
 */
router.post("/groups/broadcast-order", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { groupIds, order } = (req.body || {}) as {
    groupIds?: string[];
    order?: unknown;
  };

  if (!Array.isArray(groupIds) || groupIds.length === 0) {
    return res.status(400).json({ error: "groupIds is required" });
  }
  if (order == null) {
    return res.status(400).json({ error: "order payload is required" });
  }

  const allowed = await prisma.conversation.findMany({
    where: {
      id: { in: groupIds },
      type: ConversationType.GROUP,
      participants: { some: { userId } },
    },
    select: { id: true },
  });
  const allowedIds = new Set(allowed.map((g) => g.id));
  const notAllowed = groupIds.filter((id) => !allowedIds.has(id));
  if (notAllowed.length > 0) {
    return res.status(403).json({ error: `Not a member of: ${notAllowed.join(", ")}` });
  }

  const results: { conversationId: string; messageId: string }[] = [];

  await prisma.$transaction(async (tx) => {
    for (const conversationId of groupIds) {
      const msg = await tx.message.create({
        data: {
          conversationId,
          senderId: userId,
          type: MessageType.ORDER,
          orderPayload: order as any,
        },
        select: { id: true },
      });

      const participants = await tx.conversationParticipant.findMany({
        where: { conversationId },
        select: { userId: true },
      });

      await tx.messageStatus.createMany({
        data: participants.map((p) => ({
          messageId: msg.id,
          userId: p.userId,
          deliveredAt: p.userId === userId ? new Date() : null,
          readAt: p.userId === userId ? new Date() : null,
        })),
      });

      results.push({ conversationId, messageId: msg.id });
    }
  });

  res.status(201).json({ sent: results.length, results });
});

// --- RENAME GROUP (platform admins only) ---
router.patch(
  "/groups/:id",
  ...requireRole("SUPER_ADMIN", "ADMIN"),
  async (req: AuthedRequest, res) => {
    const { id: conversationId } = req.params;
    const { name, description } = (req.body || {}) as { name?: string; description?: string };

    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, type: ConversationType.GROUP },
      select: { id: true },
    });
    if (!conv) return res.status(404).json({ error: "not_found" });

    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        ...(typeof name === "string" && name.trim() ? { title: name.trim() } : {}),
        ...(typeof description === "string" ? { description } : {}),
      },
      select: { id: true, title: true, description: true },
    });

    // 🔊 notify everyone in this group
    io.to(roomFor(conversationId)).emit("group:updated", {
      conversationId,
      name: updated.title ?? "",
      description: updated.description ?? null,
    });

    res.json({ id: updated.id, name: updated.title ?? "", description: updated.description ?? null });
  }
);

// --- DELETE GROUP (platform admins only) ---
router.delete(
  "/groups/:id",
  ...requireRole("SUPER_ADMIN", "ADMIN"),
  async (req: AuthedRequest, res) => {
    const { id: conversationId } = req.params;

    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, type: ConversationType.GROUP },
      select: { id: true },
    });
    if (!conv) return res.status(404).json({ error: "not_found" });

    // 🔊 notify before delete (room still exists)
    io.to(roomFor(conversationId)).emit("group:deleted", { conversationId });

    await prisma.conversation.delete({ where: { id: conversationId } });

    // optional: force sockets out of the room
    // io.in(roomFor(conversationId)).socketsLeave(roomFor(conversationId));

    res.json({ ok: true });
  }
);



export default router;

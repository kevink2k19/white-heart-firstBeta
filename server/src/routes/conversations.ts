import { Router } from "express";
import { prisma } from "../index.js";
import { requireAuth, AuthedRequest } from "../middleware/requireAuth.js";
import { ConversationType, MessageType } from "@prisma/client";

const router = Router();
router.use(requireAuth);

/**
 * GET /conversations
 * Return the conversations the authed user is in, with participants and last message.
 * Ordered by last message time (falls back to conversation.createdAt).
 */
router.get("/conversations", async (req: AuthedRequest, res) => {
  const userId = req.userId!;

  const cps = await prisma.conversationParticipant.findMany({
    where: { userId },
    include: {
      conversation: {
        include: {
          participants: {
            include: {
              user: {
                select: { id: true, name: true, phone: true },
              },
            },
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { sender: { select: { id: true, name: true } } },
          },
        },
      },
    },
    orderBy: { // we don’t have updatedAt, so sort by conversation.createdAt
      conversation: { createdAt: "desc" },
    },
  });

  const data = cps.map((cp) => {
    const c = cp.conversation;
    const last = c.messages[0] || null;
    return {
      id: c.id,
      type: c.type,
      title: c.title,
      description: c.description,
      createdAt: c.createdAt,
      participants: c.participants.map((p) => ({
        id: p.user.id,
        name: p.user.name,
        phone: p.user.phone,
      })),
      lastMessage: last
        ? {
            id: last.id,
            type: last.type,
            text: last.text,
            mediaUrl: last.mediaUrl,
            createdAt: last.createdAt,
            sender: last.sender
              ? { id: last.sender.id, name: last.sender.name }
              : null,
          }
        : null,
    };
  });

  res.json(data);
});

/**
 * POST /conversations/private
 * Body: { otherUserId: string }
 * Find (or create) a DM between authed user and other user.
 */
router.post("/conversations/private", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { otherUserId } = (req.body || {}) as { otherUserId?: string };

  if (!otherUserId || otherUserId === userId) {
    return res.status(400).json({ error: "Invalid otherUserId" });
  }

  const existing = await prisma.conversation.findFirst({
    where: {
      type: ConversationType.DM,
      AND: [
        { participants: { some: { userId } } },
        { participants: { some: { userId: otherUserId } } },
      ],
    },
    include: {
      participants: { include: { user: true } },
    },
  });
  if (existing) return res.json(existing);

  const conv = await prisma.conversation.create({
    data: {
      type: ConversationType.DM,
      participants: { create: [{ userId }, { userId: otherUserId }] },
    },
    include: {
      participants: { include: { user: true } },
    },
  });

  res.status(201).json(conv);
});

/**
 * POST /conversations/group
 * Body: { title: string; description?: string; memberIds: string[] }
 * Creates a new group conversation (ensures the creator is included).
 */
router.post("/conversations/group", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { title, description, memberIds } = (req.body || {}) as {
    title?: string;
    description?: string;
    memberIds?: string[];
  };

  if (!title?.trim()) {
    return res.status(400).json({ error: "title is required" });
  }

  const uniqueMemberIds = Array.from(
    new Set([userId, ...(memberIds || []).filter(Boolean)])
  );

  const conv = await prisma.conversation.create({
    data: {
      type: ConversationType.GROUP,
      title: title.trim(),
      description: description?.trim() || null,
      participants: {
        create: uniqueMemberIds.map((uid) => ({
          userId: uid,
          role: uid === userId ? "admin" : "member",
        })),
      },
    },
    include: {
      participants: { include: { user: true } },
    },
  });

  res.status(201).json(conv);
});

/**
 * GET /conversations/:id
 * Return a conversation (only if requester is a participant)
 */
router.get("/conversations/:id", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { id } = req.params;

  const conv = await prisma.conversation.findUnique({
    where: { id },
    include: {
      participants: { include: { user: true } },
    },
  });
  if (!conv) return res.status(404).json({ error: "Conversation not found" });

  const isMember = conv.participants.some((p) => p.userId === userId);
  if (!isMember) return res.status(403).json({ error: "Forbidden" });

  res.json(conv);
});

export default router;

import { Router } from "express";
import { prisma } from "../index.js";
import { requireAuth, AuthedRequest } from "../middleware/requireAuth.js";
import { io, roomFor } from "../socket.js";

// Define MessageType enum locally since Prisma doesn't export it
enum MessageType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  VOICE = 'VOICE',
  ORDER = 'ORDER',
  SYSTEM = 'SYSTEM',
  LOCATION = 'LOCATION'
}

const router = Router();
router.use(requireAuth);

// ensure the user is in the conversation
async function assertParticipant(userId: string, conversationId: string) {
  const cp = await prisma.conversationParticipant.findFirst({
    where: { userId, conversationId },
    select: { id: true },
  });
  return Boolean(cp);
}

/**
 * GET /conversations/:id/messages?cursor=<messageId>&limit=30
 * Returns oldest -> newest for easy render append.
 */
router.get("/conversations/:id/messages", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { id: conversationId } = req.params;
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const cursor = (req.query.cursor as string) || undefined;

  if (!(await assertParticipant(userId, conversationId))) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: limit,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    include: {
      sender: { select: { id: true, name: true } },
      statuses: { 
        select: { 
          userId: true, 
          deliveredAt: true, 
          readAt: true,
          user: { select: { id: true, name: true } }
        } 
      },
    },
  });

  // Calculate message status for sender
  const calculateStatus = (message: any, senderId: string) => {
    if (senderId !== userId) return undefined; // Only show status for own messages
    
    const otherStatuses = message.statuses.filter((s: any) => s.userId !== senderId);
    if (otherStatuses.length === 0) return 'sent';
    
    const allRead = otherStatuses.every((s: any) => s.readAt);
    if (allRead) return 'seen';
    
    const allDelivered = otherStatuses.every((s: any) => s.deliveredAt);
    if (allDelivered) return 'delivered';
    
    return 'sent';
  };

  // Normalize to the same "wire" shape used in POST response
  const data = messages
    .reverse()
    .map((m: any) => ({
      id: m.id,
      conversationId,
      type: m.type,
      text: m.text,
      mediaUrl: m.mediaUrl,
      mediaKind: m.mediaKind,
      mediaDurationS: m.mediaDurationS,
      latitude: m.latitude,
      longitude: m.longitude,
      locationAddress: m.locationAddress,
      createdAt: m.createdAt.toISOString(),
      sender: m.sender ? { id: m.sender.id, name: m.sender.name } : null,
      status: calculateStatus(m, m.senderId || ''),
      isDeleted: false,
    }));

  res.json(data);
});

/**
 * POST /conversations/:id/messages
 * Body:
 *  - TEXT:  { type:"TEXT", text }
 *  - IMAGE: { type:"IMAGE", mediaUrl }
 *  - VOICE: { type:"VOICE", mediaUrl, mediaDurationS? }
 *  - ORDER: { type:"ORDER", orderPayload }
 */
router.post("/conversations/:id/messages", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { id: conversationId } = req.params;
  const { type, text, mediaUrl, mediaKind, mediaDurationS, orderPayload, latitude, longitude, locationAddress } =
    (req.body || {}) as {
      type?: MessageType | string;
      text?: string;
      mediaUrl?: string;
      mediaKind?: string;
      mediaDurationS?: number;
      orderPayload?: unknown;
      latitude?: number;
      longitude?: number;
      locationAddress?: string;
    };

  if (!(await assertParticipant(userId, conversationId))) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const msgType = String(type || "").toUpperCase() as MessageType;
  switch (msgType) {
    case "TEXT":
      if (!text?.trim()) return res.status(400).json({ error: "text is required" });
      break;
    case "IMAGE":
    case "VOICE":
      if (!mediaUrl) return res.status(400).json({ error: "mediaUrl is required" });
      break;
    case "ORDER":
      if (orderPayload == null) return res.status(400).json({ error: "orderPayload is required" });
      break;
    case "LOCATION":
      if (latitude == null || longitude == null) return res.status(400).json({ error: "latitude and longitude are required" });
      break;
    case "SYSTEM":
      return res.status(400).json({ error: "SYSTEM messages cannot be sent by clients" });
    default:
      return res.status(400).json({ error: "Unsupported message type" });
  }

  const created = await prisma.message.create({
    data: {
      conversationId,
      senderId: userId,
      type: msgType,
      text: text?.trim() || null,
      mediaUrl: mediaUrl || null,
      mediaKind:
        mediaKind ||
        (msgType === "VOICE" ? "audio" : msgType === "IMAGE" ? "image" : null),
      mediaDurationS: mediaDurationS ?? null,
      orderPayload: msgType === "ORDER" ? (orderPayload as any) : null,
      latitude: msgType === "LOCATION" ? latitude : null,
      longitude: msgType === "LOCATION" ? longitude : null,
      locationAddress: msgType === "LOCATION" ? locationAddress : null,
    },
    include: { sender: { select: { id: true, name: true } } },
  });

  const participants = await prisma.conversationParticipant.findMany({
    where: { conversationId },
    select: { userId: true },
  });

  await prisma.messageStatus.createMany({
    data: participants.map((p: any) => ({
      messageId: created.id,
      userId: p.userId,
      deliveredAt: p.userId === userId ? new Date() : null,
      readAt: p.userId === userId ? new Date() : null,
    })),
  });

  const wire = {
    id: created.id,
    conversationId,
    type: created.type,
    text: created.text,
    mediaUrl: created.mediaUrl,
    mediaKind: created.mediaKind,
    mediaDurationS: created.mediaDurationS,
    latitude: created.latitude,
    longitude: created.longitude,
    locationAddress: created.locationAddress,
    createdAt: created.createdAt.toISOString(),
    sender: created.sender ? { id: created.sender.id, name: created.sender.name } : null,
    status: 'sent',
    isDeleted: false,
  };

  console.log("[emit] message:new ->", roomFor(conversationId), wire.id);
  io.to(roomFor(conversationId)).emit("message:new", wire);

  // IMPORTANT: return the same "wire" shape so the client appends consistently
  res.status(201).json(wire);
});

router.post("/messages/:id/delivered", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { id: messageId } = req.params;

  const msg = await prisma.message.findUnique({
    where: { id: messageId },
    select: { conversationId: true },
  });
  if (!msg) return res.status(404).json({ error: "Message not found" });
  if (!(await assertParticipant(userId, msg.conversationId))) {
    return res.status(403).json({ error: "Forbidden" });
  }

  await prisma.messageStatus.updateMany({
    where: { messageId, userId, deliveredAt: null },
    data: { deliveredAt: new Date() },
  });
  res.json({ ok: true });
});

router.post("/messages/:id/read", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { id: messageId } = req.params;

  const msg = await prisma.message.findUnique({
    where: { id: messageId },
    select: { createdAt: true, conversationId: true, senderId: true },
  });
  if (!msg) return res.status(404).json({ error: "Message not found" });
  if (!(await assertParticipant(userId, msg.conversationId))) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // Don't mark your own messages as read by yourself
  if (msg.senderId === userId) {
    return res.json({ ok: true });
  }

  // Mark this specific message as read
  await prisma.messageStatus.updateMany({
    where: {
      messageId,
      userId,
    },
    data: { 
      readAt: new Date(),
      deliveredAt: new Date() // Also mark as delivered if not already
    },
  });

  console.log(`Message ${messageId} marked as read by user ${userId}`);
  res.json({ ok: true });
});

// DELETE /messages/:id - Delete a message for everyone (only sender can delete)
router.delete("/messages/:id", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { id: messageId } = req.params;

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, senderId: true, conversationId: true },
  });

  if (!message) {
    return res.status(404).json({ error: "Message not found" });
  }

  if (message.senderId !== userId) {
    return res.status(403).json({ error: "You can only delete your own messages" });
  }

  if (!(await assertParticipant(userId, message.conversationId))) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // Delete the message and its statuses for everyone
  await prisma.messageStatus.deleteMany({
    where: { messageId },
  });
  await prisma.message.delete({
    where: { id: messageId },
  });

  // Notify other clients about the deletion
  console.log("[emit] message:deleted ->", roomFor(message.conversationId), messageId);
  io.to(roomFor(message.conversationId)).emit("message:deleted", { messageId });

  res.json({ ok: true });
});

// POST /messages/:id/hide - Hide a message for current user only  
router.post("/messages/:id/hide", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { id: messageId } = req.params;

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { conversationId: true },
  });

  if (!message) {
    return res.status(404).json({ error: "Message not found" });
  }

  if (!(await assertParticipant(userId, message.conversationId))) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // For now, just return success - hiding is handled client-side with persistence
  // TODO: Once hiddenAt field is fully available, uncomment the database update
  /*
  await prisma.messageStatus.updateMany({
    where: { messageId, userId },
    data: { hiddenAt: new Date() },
  });
  */
  console.log(`Message ${messageId} hidden for user ${userId}`);

  res.json({ ok: true });
});

// GET /messages/:id/read-receipts - Get read receipts for a message
router.get("/messages/:id/read-receipts", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { id: messageId } = req.params;

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { conversationId: true },
  });

  if (!message) {
    return res.status(404).json({ error: "Message not found" });
  }

  if (!(await assertParticipant(userId, message.conversationId))) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const readReceipts = await prisma.messageStatus.findMany({
    where: { 
      messageId,
      readAt: { not: null }
    },
    include: {
      user: { select: { id: true, name: true } }
    },
    orderBy: { readAt: 'asc' }
  });

  const data = readReceipts.map((status: any) => ({
    userId: status.userId,
    userName: status.user.name,
    readAt: status.readAt?.toISOString()
  }));

  res.json(data);
});

export default router;

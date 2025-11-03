import { Router } from "express";
import { prisma } from "../index.js";
import { requireAuth, AuthedRequest } from "../middleware/requireAuth.js";
import { io, roomFor } from "../socket.js";

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
 * GET /conversations/:id/voice-room
 * Get or create voice room for conversation
 */
router.get("/conversations/:id/voice-room", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { id: conversationId } = req.params;

  if (!(await assertParticipant(userId, conversationId))) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    // Get or create voice room
    let voiceRoom = await prisma.voiceRoom.findFirst({
      where: { conversationId },
      include: {
        participants: {
          include: {
            user: { select: { id: true, name: true } }
          },
          where: { leftAt: null } // Only active participants
        },
        _count: {
          select: { participants: true }
        }
      }
    });

    if (!voiceRoom) {
      voiceRoom = await prisma.voiceRoom.create({
        data: {
          conversationId,
          isLive: true,
        },
        include: {
          participants: {
            include: {
              user: { select: { id: true, name: true } }
            },
            where: { leftAt: null }
          },
          _count: {
            select: { participants: true }
          }
        }
      });
    }

    res.json({
      id: voiceRoom.id,
      conversationId: voiceRoom.conversationId,
      isLive: voiceRoom.isLive,
      createdAt: voiceRoom.createdAt,
      participantCount: voiceRoom._count.participants,
      participants: voiceRoom.participants.map((p: any) => ({
        id: p.id,
        userId: p.userId,
        userName: p.user.name,
        muted: p.muted,
        isListening: p.isListening,
        joinedAt: p.joinedAt,
        lastSeenAt: p.lastSeenAt,
      }))
    });
  } catch (error) {
    console.error('Failed to get voice room:', error);
    res.status(500).json({ error: "Failed to get voice room" });
  }
});

/**
 * POST /conversations/:id/voice-room/join
 * Join voice room (start listening)
 */
router.post("/conversations/:id/voice-room/join", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { id: conversationId } = req.params;

  if (!(await assertParticipant(userId, conversationId))) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    // Get or create voice room
    let voiceRoom = await prisma.voiceRoom.findUnique({
      where: { conversationId }
    });

    if (!voiceRoom) {
      voiceRoom = await prisma.voiceRoom.create({
        data: { conversationId, isLive: true }
      });
    }

    // Join or rejoin room
    const participant = await prisma.voiceParticipant.upsert({
      where: {
        roomId_userId: {
          roomId: voiceRoom.id,
          userId
        }
      },
      update: {
        leftAt: null,
        isListening: true,
        lastSeenAt: new Date()
      },
      create: {
        roomId: voiceRoom.id,
        userId,
        muted: false,
        isListening: true
      },
      include: {
        user: { select: { id: true, name: true } }
      }
    });

    // Notify other participants via socket
    const socketData = {
      conversationId,
      roomId: voiceRoom.id,
      participant: {
        id: participant.id,
        userId: participant.userId,
        userName: participant.user.name,
        muted: participant.muted,
        isListening: participant.isListening,
        joinedAt: participant.joinedAt,
      }
    };

    console.log("[emit] voice:participant:joined ->", roomFor(conversationId));
    io.to(roomFor(conversationId)).emit("voice:participant:joined", socketData);

    res.json({
      success: true,
      participant: {
        id: participant.id,
        userId: participant.userId,
        userName: participant.user.name,
        muted: participant.muted,
        isListening: participant.isListening,
        joinedAt: participant.joinedAt,
      }
    });
  } catch (error) {
    console.error('Failed to join voice room:', error);
    res.status(500).json({ error: "Failed to join voice room" });
  }
});

/**
 * POST /conversations/:id/voice-room/leave
 * Leave voice room (stop listening)
 */
router.post("/conversations/:id/voice-room/leave", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { id: conversationId } = req.params;

  if (!(await assertParticipant(userId, conversationId))) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const voiceRoom = await prisma.voiceRoom.findUnique({
      where: { conversationId }
    });

    if (!voiceRoom) {
      return res.status(404).json({ error: "Voice room not found" });
    }

    // Leave room
    const participant = await prisma.voiceParticipant.updateMany({
      where: {
        roomId: voiceRoom.id,
        userId,
        leftAt: null
      },
      data: {
        leftAt: new Date(),
        isListening: false
      }
    });

    if (participant.count > 0) {
      // Notify other participants via socket
      console.log("[emit] voice:participant:left ->", roomFor(conversationId));
      io.to(roomFor(conversationId)).emit("voice:participant:left", {
        conversationId,
        roomId: voiceRoom.id,
        userId
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to leave voice room:', error);
    res.status(500).json({ error: "Failed to leave voice room" });
  }
});

/**
 * POST /conversations/:id/voice-room/transmit
 * Send voice transmission (walkie-talkie message)
 */
router.post("/conversations/:id/voice-room/transmit", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { id: conversationId } = req.params;
  const { audioUrl, durationS } = req.body;

  if (!(await assertParticipant(userId, conversationId))) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (!audioUrl) {
    return res.status(400).json({ error: "audioUrl is required" });
  }

  try {
    // Get voice room
    const voiceRoom = await prisma.voiceRoom.findUnique({
      where: { conversationId },
      include: {
        participants: {
          where: { 
            leftAt: null,
            isListening: true
            // Include sender so they can hear their own voice message
          },
          include: {
            user: { select: { id: true, name: true } }
          }
        }
      }
    });

    if (!voiceRoom) {
      return res.status(404).json({ error: "Voice room not found" });
    }

    // Check if user is in the room
    const senderParticipant = await prisma.voiceParticipant.findFirst({
      where: {
        roomId: voiceRoom.id,
        userId,
        leftAt: null
      }
    });

    if (!senderParticipant) {
      return res.status(403).json({ error: "You must join the voice room first" });
    }

    // Create voice transmission
    const transmission = await prisma.voiceTransmission.create({
      data: {
        roomId: voiceRoom.id,
        senderId: userId,
        audioUrl,
        durationS: durationS || null
      },
      include: {
        sender: { select: { id: true, name: true } }
      }
    });

    // Broadcast to all listening participants via socket
    const socketData = {
      conversationId,
      roomId: voiceRoom.id,
      transmission: {
        id: transmission.id,
        audioUrl: transmission.audioUrl,
        durationS: transmission.durationS,
        createdAt: transmission.createdAt,
        sender: {
          id: transmission.sender.id,
          name: transmission.sender.name
        }
      },
      listeners: voiceRoom.participants.map((p: any) => ({
        userId: p.userId,
        userName: p.user.name
      }))
    };

    console.log("[emit] voice:transmission ->", roomFor(conversationId), `listeners: ${voiceRoom.participants.length}`);
    io.to(roomFor(conversationId)).emit("voice:transmission", socketData);

    res.json({
      success: true,
      transmission: {
        id: transmission.id,
        audioUrl: transmission.audioUrl,
        durationS: transmission.durationS,
        createdAt: transmission.createdAt,
        sender: transmission.sender
      }
    });
  } catch (error) {
    console.error('Failed to create voice transmission:', error);
    res.status(500).json({ error: "Failed to send voice transmission" });
  }
});

/**
 * POST /conversations/:id/voice-room/transmissions/:transmissionId/played
 * Mark transmission as played by user
 */
router.post("/conversations/:id/voice-room/transmissions/:transmissionId/played", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { id: conversationId, transmissionId } = req.params;

  if (!(await assertParticipant(userId, conversationId))) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    // Verify transmission exists and belongs to conversation
    const transmission = await prisma.voiceTransmission.findFirst({
      where: {
        id: transmissionId,
        room: {
          conversationId
        }
      }
    });

    if (!transmission) {
      return res.status(404).json({ error: "Transmission not found" });
    }

    // Record playback
    await prisma.voiceTransmissionPlayback.upsert({
      where: {
        transmissionId_userId: {
          transmissionId,
          userId
        }
      },
      update: {
        playedAt: new Date()
      },
      create: {
        transmissionId,
        userId
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to mark transmission as played:', error);
    res.status(500).json({ error: "Failed to mark transmission as played" });
  }
});

/**
 * POST /conversations/:id/voice-room/heartbeat
 * Update participant's last seen timestamp
 */
router.post("/conversations/:id/voice-room/heartbeat", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { id: conversationId } = req.params;

  if (!(await assertParticipant(userId, conversationId))) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const voiceRoom = await prisma.voiceRoom.findUnique({
      where: { conversationId }
    });

    if (voiceRoom) {
      await prisma.voiceParticipant.updateMany({
        where: {
          roomId: voiceRoom.id,
          userId,
          leftAt: null
        },
        data: {
          lastSeenAt: new Date()
        }
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to update heartbeat:', error);
    res.status(500).json({ error: "Failed to update heartbeat" });
  }
});

export default router;
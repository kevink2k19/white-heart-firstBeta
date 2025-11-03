// app/lib/voiceRoomApi.ts
import { authFetch } from './authClient';

export interface VoiceRoom {
  id: string;
  conversationId: string;
  isLive: boolean;
  createdAt: string;
  participantCount: number;
  participants: VoiceParticipant[];
}

export interface VoiceParticipant {
  id: string;
  userId: string;
  userName: string;
  muted: boolean;
  isListening: boolean;
  joinedAt: string;
  lastSeenAt: string;
}

export interface VoiceTransmission {
  id: string;
  audioUrl: string;
  durationS?: number;
  createdAt: string;
  sender: {
    id: string;
    name: string;
  };
}

/**
 * Get or create voice room for conversation
 */
export async function getVoiceRoom(conversationId: string): Promise<VoiceRoom> {
  const response = await authFetch(`/chat/conversations/${conversationId}/voice-room`);
  if (!response.ok) {
    throw new Error('Failed to get voice room');
  }
  return response.json();
}

/**
 * Join voice room (start listening)
 */
export async function joinVoiceRoom(conversationId: string): Promise<{ success: boolean; participant: VoiceParticipant }> {
  const response = await authFetch(`/chat/conversations/${conversationId}/voice-room/join`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to join voice room');
  }
  return response.json();
}

/**
 * Leave voice room (stop listening)
 */
export async function leaveVoiceRoom(conversationId: string): Promise<{ success: boolean }> {
  const response = await authFetch(`/chat/conversations/${conversationId}/voice-room/leave`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to leave voice room');
  }
  return response.json();
}

/**
 * Send voice transmission (walkie-talkie message)
 */
export async function sendVoiceTransmission(
  conversationId: string, 
  audioUrl: string, 
  durationS?: number
): Promise<{ success: boolean; transmission: VoiceTransmission }> {
  const response = await authFetch(`/chat/conversations/${conversationId}/voice-room/transmit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      audioUrl,
      durationS,
    }),
  });
  if (!response.ok) {
    throw new Error('Failed to send voice transmission');
  }
  return response.json();
}

/**
 * Mark transmission as played
 */
export async function markTransmissionPlayed(conversationId: string, transmissionId: string): Promise<{ success: boolean }> {
  const response = await authFetch(`/chat/conversations/${conversationId}/voice-room/transmissions/${transmissionId}/played`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to mark transmission as played');
  }
  return response.json();
}

/**
 * Send heartbeat to update participant status
 */
export async function sendVoiceRoomHeartbeat(conversationId: string): Promise<{ success: boolean }> {
  const response = await authFetch(`/chat/conversations/${conversationId}/voice-room/heartbeat`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to send heartbeat');
  }
  return response.json();
}
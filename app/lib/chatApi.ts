// app/lib/chatApi.ts
import { authFetch } from './authClient';

const asJson = async (r: Response) => {
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(t || `HTTP ${r.status}`);
  }
  return r.json();
};

// ---------- Groups list ----------
export type ServerGroup = {
  id: string;
  name: string;
  memberCount: number;
  lastMessage: string;
  lastMessageAt: string; // ISO
  unreadCount: number;
};

export async function fetchMyGroups(): Promise<ServerGroup[]> {
  const r = await authFetch('/chat/groups');
  return asJson(r) as Promise<ServerGroup[]>;
}

export async function createGroup(payload: { name: string; description?: string }) {
  const r = await authFetch('/chat/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return asJson(r) as Promise<{ id: string; name: string }>;
}

// ---------- Group / conversation members ----------
export async function fetchGroupMembers(groupId: string) {
  const r = await authFetch(`/chat/groups/${groupId}/members`);
  return asJson(r) as Promise<
    Array<{
      id: string;
      name: string;
      phone: string | null;
      role: 'admin' | 'moderator' | 'member';
      joinedAt: string;
      status: 'online' | 'offline' | 'away' | 'busy';
    }>
  >;
}

// Back-compat name (so code referring to "conversation" compiles)
export const fetchConversationMembers = fetchGroupMembers;

export async function addGroupMember(groupId: string, phoneOrUserId: string) {
  const r = await authFetch(`/chat/groups/${groupId}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user: phoneOrUserId }),
  });
  return asJson(r);
}

export async function removeGroupMember(groupId: string, memberId: string) {
  const r = await authFetch(`/chat/groups/${groupId}/members/${memberId}`, { method: 'DELETE' });
  return asJson(r);
}

export async function setGroupMemberRole(
  groupId: string,
  memberId: string,
  role: 'admin' | 'moderator' | 'member'
) {
  const r = await authFetch(`/chat/groups/${groupId}/members/${memberId}/role`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
  return asJson(r);
}

// ---------- Conversation + Messages (for /chat/[id].tsx) ----------
export async function fetchConversation(conversationId: string) {
  const r = await authFetch(`/chat/conversations/${conversationId}`);
  return asJson(r);
}

export async function fetchMessages(conversationId: string, opts?: { cursor?: string; limit?: number }) {
  const q = new URLSearchParams();
  if (opts?.cursor) q.set('cursor', opts.cursor);
  if (opts?.limit) q.set('limit', String(opts.limit));
  const r = await authFetch(
    `/chat/conversations/${conversationId}/messages${q.toString() ? `?${q.toString()}` : ''}`
  );
  return asJson(r) as Promise<any[]>; // shape: server Message[]
}

export async function sendText(conversationId: string, text: string) {
  const r = await authFetch(`/chat/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'TEXT', text }),
  });
  return asJson(r);
}

export async function sendImage(conversationId: string, mediaUrl: string) {
  const r = await authFetch(`/chat/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'IMAGE', mediaUrl }),
  });
  return asJson(r);
}

export async function sendVoice(conversationId: string, mediaUrl: string, mediaDurationS?: number) {
  const r = await authFetch(`/chat/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'VOICE', mediaUrl, mediaDurationS }),
  });
  return asJson(r);
}

export async function sendLocation(conversationId: string, latitude: number, longitude: number, address?: string) {
  const r = await authFetch(`/chat/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'LOCATION', latitude, longitude, locationAddress: address }),
  });
  return asJson(r);
}

export async function sendOrder(conversationId: string, orderPayload: unknown) {
  const r = await authFetch(`/chat/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'ORDER', orderPayload }),
  });
  return asJson(r);
}

export async function markDelivered(messageId: string) {
  const r = await authFetch(`/chat/messages/${messageId}/delivered`, { method: 'POST' });
  return asJson(r);
}

export async function markRead(messageId: string) {
  const r = await authFetch(`/chat/messages/${messageId}/read`, { method: 'POST' });
  return asJson(r);
}

export async function fetchAvailableUsers(groupId: string, q?: string) {
  const qs = q ? `?q=${encodeURIComponent(q)}` : '';
  const r = await authFetch(`/chat/groups/${groupId}/available-users${qs}`);
  return asJson(r) as Promise<Array<{ id: string; name: string; phone: string | null }>>;
}

export async function getGroupInviteLink(groupId: string) {
  const r = await authFetch(`/chat/groups/${groupId}/invite-link`);
  return asJson(r) as Promise<{ url: string; expiresInDays: number }>;
}


export async function renameGroup(groupId: string, payload: { name?: string; description?: string }) {
  const r = await authFetch(`/chat/groups/${groupId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return asJson(r) as Promise<{ id: string; name: string; description: string | null }>;
}

export async function deleteGroup(groupId: string) {
  const r = await authFetch(`/chat/groups/${groupId}`, { method: 'DELETE' });
  return asJson(r) as Promise<{ ok: true }>;
}

// ---------- Direct Messages ----------
export async function createDMConversation(otherUserId: string) {
  const r = await authFetch('/chat/conversations/private', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ otherUserId }),
  });
  return asJson(r) as Promise<{ id: string; type: string; participants: any[] }>;
}

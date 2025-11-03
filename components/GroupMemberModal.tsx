// components/GroupMemberModal.tsx
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  TextInput, ScrollView, Alert, ActivityIndicator
} from 'react-native';
import {
  X, UserPlus, Trash2, Shield, ShieldOff,
  Link as LinkIcon, Copy as CopyIcon
} from 'lucide-react-native';
import { setStringAsync } from 'expo-clipboard';
import {
  addGroupMember, removeGroupMember, setGroupMemberRole,
  fetchAvailableUsers, getGroupInviteLink
} from '../app/lib/chatApi';
import { getSocket } from '../app/lib/socket';

type Member = {
  id: string;
  name: string;
  phone: string | null;
  role: 'admin' | 'moderator' | 'member';
  joinedAt: string;
  status: 'online' | 'offline' | 'away' | 'busy';
};

// helper near top of the file
const toLocal = (p?: string | null) => {
  if (!p) return '—';
  const DIAL = '+95'; // or keep synced with server DEFAULT_DIAL
  if (p.startsWith(DIAL)) return `0${p.slice(DIAL.length)}`;
  return p;
};


const statusColor = (s: Member['status']) => {
  switch (s) {
    case 'online': return '#10B981';
    case 'away': return '#F59E0B';
    case 'busy': return '#EF4444';
    default: return '#9CA3AF';
  }
};

export default function GroupMemberModal({
  visible,
  onClose,
  groupName,
  groupId,
  members,
  currentUserId,
  onCallMember,
  onMessageMember,
  canManageMembers = false,
  onMembersChanged,
}: {
  visible: boolean;
  onClose: () => void;
  groupName: string;
  groupId: string;
  members: Member[];
  currentUserId: string;
  onCallMember: (memberId: string, phone: string | null) => void;
  onMessageMember: (memberId: string, memberName: string) => void;
  canManageMembers?: boolean;
  onMembersChanged?: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState(''); // phone or user id
  const [tab, setTab] = useState<'ALL' | 'ONLINE'>('ALL');

  // Real-time presence state
  const [memberPresence, setMemberPresence] = useState<Map<string, 'online' | 'offline' | 'away' | 'busy'>>(new Map());

  // Invite panel state
  const [showInvite, setShowInvite] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string>('');
  const [lookup, setLookup] = useState(''); // search box
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [available, setAvailable] = useState<Array<{ id: string; name: string; phone: string | null }>>([]);

  const safeRefresh = async () => {
    try { await onMembersChanged?.(); } catch {}
  };

  // Real-time presence subscription
  useEffect(() => {
    if (!visible || !groupId) return;
    
    let cleanup: (() => void) | undefined;
    
    (async () => {
      try {
        const socket = await getSocket();
        
        console.log('[GroupMemberModal] Subscribing to presence for group:', groupId);
        
        // Subscribe to presence updates for this conversation
        socket.emit('presence:subscribe', { conversationId: groupId });
        
        // Also announce our own presence in this conversation to ensure we're marked online
        socket.emit('presence:here', { conversationId: groupId, status: 'online' });
        
        // Handle bulk presence updates (initial snapshot)
        const onPresenceBulk = (data: { conversationId: string; states: Array<{ userId: string; status: string }> }) => {
          if (data.conversationId !== groupId) return;
          console.log('[GroupMemberModal] Received bulk presence for', groupId, ':', data.states);
          
          const newPresence = new Map<string, 'online' | 'offline' | 'away' | 'busy'>();
          data.states.forEach(state => {
            const status = ['online', 'offline', 'away', 'busy'].includes(state.status) 
              ? state.status as 'online' | 'offline' | 'away' | 'busy'
              : 'offline';
            newPresence.set(state.userId, status);
            console.log('[GroupMemberModal] Setting presence for user', state.userId, 'to', status);
          });
          setMemberPresence(newPresence);
        };
        
        // Handle individual presence updates
        const onPresenceUpdate = (data: { conversationId: string; userId: string; status: string }) => {
          if (data.conversationId !== groupId) return;
          console.log('[GroupMemberModal] Received presence update:', data.userId, data.status);
          
          const status = ['online', 'offline', 'away', 'busy'].includes(data.status) 
            ? data.status as 'online' | 'offline' | 'away' | 'busy'
            : 'offline';
          
          setMemberPresence(prev => {
            const newMap = new Map(prev);
            newMap.set(data.userId, status);
            return newMap;
          });
        };
        
        socket.on('presence:bulk', onPresenceBulk);
        socket.on('presence:update', onPresenceUpdate);
        
        cleanup = () => {
          console.log('[GroupMemberModal] Cleaning up presence subscription');
          socket.emit('presence:unsubscribe', { conversationId: groupId });
          socket.off('presence:bulk', onPresenceBulk);
          socket.off('presence:update', onPresenceUpdate);
        };
      } catch (error) {
        console.error('[GroupMemberModal] Failed to setup presence subscription:', error);
      }
    })();
    
    return cleanup;
  }, [visible, groupId]);

  // Auto-open Invite when you're the only member (nice UX)
  useEffect(() => {
    if (!visible) return;
    if (canManageMembers && members.length <= 1) {
      setShowInvite(true);
    }
  }, [visible, canManageMembers, members.length]);

  // Fetch invite link when opening the invite panel
  useEffect(() => {
    if (!showInvite) return;
    (async () => {
      try {
        const { url } = await getGroupInviteLink(groupId);
        setInviteUrl(url);
      } catch (e: any) {
        Alert.alert('Error', e?.message || 'Failed to get invite link');
      }
    })();
  }, [showInvite, groupId]);

  // Helper to fetch available users (used by effect + "Fetch" button)
  const fetchAvail = useCallback(async () => {
    setLoadingAvail(true);
    try {
      const list = await fetchAvailableUsers(groupId, lookup.trim() || undefined);
      setAvailable(list);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to load users');
    } finally {
      setLoadingAvail(false);
    }
  }, [groupId, lookup]);

  // Fetch available users on open + when lookup changes (debounced)
  useEffect(() => {
    if (!showInvite) return;
    const t = setTimeout(fetchAvail, 250);
    return () => clearTimeout(t);
  }, [showInvite, lookup, fetchAvail]);

  const doAdd = async () => {
    const value = input.trim();
    if (!value) return Alert.alert('Validation', 'Enter a phone number or user id.');
    try {
      setAdding(true);
      await addGroupMember(groupId, value);
      setInput('');
      await safeRefresh();
      Alert.alert('Success', 'Member added.');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to add member.');
    } finally {
      setAdding(false);
    }
  };

  const addFromResult = async (userId: string) => {
    try {
      await addGroupMember(groupId, userId);
      setAvailable(prev => prev.filter(u => u.id !== userId)); // remove from list
      await safeRefresh();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to add member.');
    }
  };

  const promote = async (member: Member) => {
    try {
      await setGroupMemberRole(groupId, member.id, 'moderator');
      await safeRefresh();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to promote.');
    }
  };
  const makeAdmin = async (member: Member) => {
    try {
      await setGroupMemberRole(groupId, member.id, 'admin');
      await safeRefresh();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to set admin.');
    }
  };
  const demote = async (member: Member) => {
    try {
      await setGroupMemberRole(groupId, member.id, 'member');
      await safeRefresh();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to demote.');
    }
  };

  const shown = useMemo(() => {
    // Merge members with real-time presence data
    const membersWithLivePresence = members.map(member => ({
      ...member,
      status: memberPresence.get(member.id) || member.status
    }));
    
    return tab === 'ONLINE' 
      ? membersWithLivePresence.filter(m => m.status === 'online') 
      : membersWithLivePresence;
  }, [members, tab, memberPresence]);

  const copyLink = async () => {
    if (!inviteUrl) return;
    try {
      await setStringAsync(inviteUrl);
      Alert.alert('Copied', 'Invite link copied to clipboard.');
    } catch {
      Alert.alert('Invite link', inviteUrl);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{groupName}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {canManageMembers && (
                <TouchableOpacity onPress={() => setShowInvite(v => !v)} style={styles.inviteBtn}>
                  <LinkIcon size={16} color="white" />
                  <Text style={styles.inviteTxt}>{showInvite ? 'Hide invite' : 'Invite'}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <X size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Invite panel */}
          {canManageMembers && showInvite && (
            <View style={styles.invitePanel}>
              <Text style={styles.inviteLabel}>Invite link</Text>
              <View style={styles.linkRow}>
                <Text numberOfLines={1} style={styles.linkText}>{inviteUrl || 'Generating…'}</Text>
                <TouchableOpacity onPress={copyLink} style={styles.copyBtn} disabled={!inviteUrl}>
                  <CopyIcon size={16} color="white" />
                  <Text style={styles.copyTxt}>Copy</Text>
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
                <Text style={[styles.inviteLabel, { marginTop: 0, marginBottom: 0 }]}>Search users</Text>
                <TouchableOpacity onPress={fetchAvail} style={styles.fetchBtn}>
                  <Text style={styles.fetchTxt}>Fetch</Text>
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.searchInput}
                value={lookup}
                onChangeText={setLookup}
                placeholder="Search by phone or name"
              />

              <View style={styles.tableHeader}>
                <Text style={[styles.th, { flex: 2 }]}>Name</Text>
                <Text style={[styles.th, { flex: 2 }]}>Phone</Text>
                <Text style={[styles.th, { width: 64, textAlign: 'right' }]}>Action</Text>
              </View>

              {loadingAvail ? (
                <ActivityIndicator style={{ paddingVertical: 10 }} />
              ) : (
                <View style={styles.availList}>
                  {available.length === 0 ? (
                    <Text style={styles.emptyAvail}>
                      No users found{lookup ? ' for this query' : ' to add'}.
                    </Text>
                  ) : (
                    available.map(u => (
                      <View key={u.id} style={styles.availRow}>
                        <Text style={[styles.td, { flex: 2 }]} numberOfLines={1}>{u.name}</Text>
                        <Text style={[styles.td, { flex: 2 }]} numberOfLines={1}>{toLocal(u.phone) || '—'}</Text>
                        <View style={{ width: 64, alignItems: 'flex-end' }}>
                          <TouchableOpacity onPress={() => addFromResult(u.id)} style={styles.addMiniBtn}>
                            <UserPlus size={16} color="white" />
                            <Text style={styles.addTxtMini}>Add</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              )}
            </View>
          )}

          {/* Tabs */}
          <View style={styles.tabs}>
            <TouchableOpacity onPress={() => setTab('ALL')} style={[styles.tab, tab === 'ALL' && styles.tabActive]}>
              <Text style={[styles.tabTxt, tab === 'ALL' && styles.tabTxtActive]}>All</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setTab('ONLINE')} style={[styles.tab, tab === 'ONLINE' && styles.tabActive]}>
              <Text style={[styles.tabTxt, tab === 'ONLINE' && styles.tabTxtActive]}>Online</Text>
            </TouchableOpacity>
          </View>

          {/* Quick add by phone/id */}
          {canManageMembers && (
            <View style={styles.addRow}>
              <TextInput
                style={styles.input}
                value={input}
                onChangeText={setInput}
                placeholder="Phone number or user id"
                keyboardType="default"
              />
              <TouchableOpacity style={styles.addBtn} onPress={doAdd} disabled={adding}>
                <UserPlus size={18} color="white" />
                <Text style={styles.addTxt}>{adding ? 'Adding…' : 'Add'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Members list */}
          <ScrollView style={{ maxHeight: 420 }}>
            {shown?.length ? (
              shown.map((m) => {
                const isSelf = String(m.id) === String(currentUserId);
                return (
                  <View key={m.id} style={styles.row}>
                    <View style={[styles.dot, { backgroundColor: statusColor(m.status) }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>
                        {m.name}{isSelf ? ' (You)' : ''}
                      </Text>
                      <Text style={styles.sub}>
                        {toLocal(m.phone) || 'No phone'} • {m.role} • {m.status}
                      </Text>
                    </View>

                    <View style={styles.actions}>
                      {!isSelf && (
                        <>
                          <TouchableOpacity onPress={() => onMessageMember(m.id, m.name)} style={styles.pill}>
                            <Text style={styles.pillTxt}>Message</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => onCallMember(m.id, toLocal(m.phone))} style={styles.pill}>
                            <Text style={styles.pillTxt}>Call</Text>
                          </TouchableOpacity>
                        </>
                      )}

                      {canManageMembers && !isSelf && (
                        <>
                          {m.role !== 'admin' && (
                            <TouchableOpacity onPress={() => makeAdmin(m)} style={[styles.iconBtn, { backgroundColor: '#111827' }]}>
                              <Shield size={16} color="white" />
                            </TouchableOpacity>
                          )}
                          {m.role === 'member' && (
                            <TouchableOpacity onPress={() => promote(m)} style={[styles.iconBtn, { backgroundColor: '#2563EB' }]}>
                              <Shield size={16} color="white" />
                            </TouchableOpacity>
                          )}
                          {m.role !== 'member' && (
                            <TouchableOpacity onPress={() => demote(m)} style={[styles.iconBtn, { backgroundColor: '#F59E0B' }]}>
                              <ShieldOff size={16} color="white" />
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity
                            onPress={() => {
                              Alert.alert('Remove Member', `Remove ${m.name} from ${groupName}?`, [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                  text: 'Remove',
                                  style: 'destructive',
                                  onPress: async () => {
                                    try {
                                      await removeGroupMember(groupId, m.id);
                                      await onMembersChanged?.();
                                    } catch (e: any) {
                                      Alert.alert('Error', e?.message || 'Failed to remove member.');
                                    }
                                  }
                                },
                              ]);
                            }}
                            style={[styles.iconBtn, { backgroundColor: '#EF4444' }]}
                          >
                            <Trash2 size={16} color="white" />
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  </View>
                );
              })
            ) : (
              <Text style={{ color: '#6B7280', padding: 12 }}>
                No members to show.
              </Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 16 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  title: { fontSize: 16, fontWeight: '700', color: '#111827' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' },

  inviteBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#4F46E5', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  inviteTxt: { color: 'white', fontWeight: '700', fontSize: 12 },

  invitePanel: { margin: 12, padding: 12, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, backgroundColor: '#F9FAFB' },
  inviteLabel: { color: '#6B7280', fontSize: 12, marginBottom: 6 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  linkText: { flex: 1, color: '#111827' },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#111827', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  copyTxt: { color: 'white', fontWeight: '700', fontSize: 12 },

  fetchBtn: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'white' },
  fetchTxt: { color: '#111827', fontWeight: '700', fontSize: 12 },

  searchInput: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },

  tableHeader: { flexDirection: 'row', paddingTop: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', marginTop: 6 },
  th: { color: '#6B7280', fontSize: 12, fontWeight: '700' },
  td: { color: '#111827', fontSize: 14 },

  availList: { marginTop: 6 },
  availRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', gap: 8 },
  addMiniBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#10B981', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  addTxtMini: { color: 'white', fontWeight: '700', fontSize: 12 },
  emptyAvail: { color: '#6B7280', paddingVertical: 6 },

  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 6 },
  tab: { paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 999 },
  tabActive: { backgroundColor: '#EEF2FF', borderColor: '#6366F1' },
  tabTxt: { color: '#6B7280', fontWeight: '600' },
  tabTxtActive: { color: '#3730A3' },

  addRow: { flexDirection: 'row', gap: 8, padding: 12 },
  input: { flex: 1, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#10B981', paddingHorizontal: 12, borderRadius: 8 },
  addTxt: { color: 'white', fontWeight: '600' },

  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  name: { fontSize: 15, fontWeight: '600', color: '#111827' },
  sub: { fontSize: 12, color: '#6B7280' },

  actions: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 8 },
  pill: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  pillTxt: { color: '#111827', fontSize: 12, fontWeight: '600' },
  iconBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});

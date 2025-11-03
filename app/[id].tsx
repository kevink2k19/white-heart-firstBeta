// app/[id].tsx
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, ImageIcon, Mic, Send, Users, Pencil, Trash2, Pause, Play, Check, X, MapPin, User } from 'lucide-react-native';
import { Image } from 'react-native';
import { fetchMe } from './lib/authClient';
import { fetchConversation, fetchMessages, sendText } from './lib/chatApi';
import { fetchGroupMembers, renameGroup, deleteGroup, createDMConversation } from './lib/chatApi';
import { getSocket } from './lib/socket';
import { sendMessageNotification } from './lib/notificationService';
import { getVoiceRoom, joinVoiceRoom, leaveVoiceRoom, sendVoiceTransmission, VoiceRoom, VoiceParticipant, VoiceTransmission } from './lib/voiceRoomApi';
import GroupMemberModal from '../components/GroupMemberModal';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import * as Location from 'expo-location';

type ServerMessage = {
  id: string;
  conversationId: string;
  type: 'TEXT' | 'IMAGE' | 'VOICE' | 'ORDER' | 'SYSTEM' | 'LOCATION';
  text?: string | null;
  mediaUrl?: string | null;
  mediaKind?: string | null;
  mediaDurationS?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  locationAddress?: string | null;
  createdAt: string;
  sender?: { id: string; name: string } | null;
  status?: 'sent' | 'delivered' | 'seen';
  isDeleted?: boolean;
  deletedAt?: string;
  readBy?: Array<{ userId: string; userName: string; readAt: string }>;
};

type Member = {
  id: string;
  name: string;
  phone: string | null;
  role: 'admin' | 'moderator' | 'member';
  joinedAt: string;
  status: 'online' | 'offline' | 'away' | 'busy';
};

type PlatformRole = 'SUPER_ADMIN' | 'ADMIN' | 'MODERATOR' | 'USER';

export default function GroupChatScreen() {
  const router = useRouter();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const conversationId = String(id);

  const [myId, setMyId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<PlatformRole | 'unknown'>('unknown');
  const [title, setTitle] = useState<string>(typeof name === 'string' ? name : 'Group');
  const [memberCount, setMemberCount] = useState<number>(0);
  const [conversationType, setConversationType] = useState<'DM' | 'GROUP' | null>(null);

  // members
  const [members, setMembers] = useState<Member[]>([]);
  const [showMembers, setShowMembers] = useState(false);
  const [canManageMembers, setCanManageMembers] = useState(false); // creator-only

  // Check if this is a private chat (DM) vs group chat - use actual conversation type
  const isPrivateChat = conversationType === 'DM';
  console.log('[DEBUG] ConversationType:', conversationType, 'isPrivateChat:', isPrivateChat);
  
  // Get the other user's ID for private chats
  const otherUserId = isPrivateChat && myId 
    ? members.find(member => member.id !== myId)?.id 
    : null;
  
  // platform admins can rename/delete groups, but anyone can delete their own DM
  const canRenameDelete = isPrivateChat ? true : (myRole === 'SUPER_ADMIN' || myRole === 'ADMIN');

  // rename modal
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameText, setRenameText] = useState('');

  const [messages, setMessages] = useState<ServerMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  
  // Pagination state
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [oldestMessageId, setOldestMessageId] = useState<string | null>(null);
  
  // Voice recording state
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  
  // Voice preview state
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [showVoicePreview, setShowVoicePreview] = useState(false);
  const [previewSound, setPreviewSound] = useState<Audio.Sound | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  
  // Voice playback state
  const [playingSound, setPlayingSound] = useState<Audio.Sound | null>(null);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);

  // Message deletion and undo state
  const [deletingMessages, setDeletingMessages] = useState<Set<string>>(new Set());
  const [undoTimeouts, setUndoTimeouts] = useState<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [showReadReceipts, setShowReadReceipts] = useState<string | null>(null);
  const [hiddenMessages, setHiddenMessages] = useState<Set<string>>(new Set());

  // Image viewer and preview states
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [viewingImageUrl, setViewingImageUrl] = useState<string | null>(null);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [selectedImages, setSelectedImages] = useState<any[]>([]);
  const [sendingProgress, setSendingProgress] = useState<string>('');

  // Tab navigation state (only for group chats, not private chats)
  const [activeTab, setActiveTab] = useState<'chat' | 'talk'>('chat');

  // Voice room state
  const [voiceRoom, setVoiceRoom] = useState<VoiceRoom | null>(null);
  const [isInVoiceRoom, setIsInVoiceRoom] = useState(false);
  const [voiceParticipants, setVoiceParticipants] = useState<VoiceParticipant[]>([]);
  const [isTalkRecording, setIsTalkRecording] = useState(false);
  const [talkRecording, setTalkRecording] = useState<Audio.Recording | null>(null);
  const [talkRecordingDuration, setTalkRecordingDuration] = useState(0);
  const [playingTransmission, setPlayingTransmission] = useState<string | null>(null);
  const [transmissionSound, setTransmissionSound] = useState<Audio.Sound | null>(null);
  
  // Voice transmission notification state
  const [currentSpeaker, setCurrentSpeaker] = useState<string | null>(null);
  const [speakerTimeout, setSpeakerTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  
  // Refs to ensure socket handlers have access to current values
  const myIdRef = useRef<string | null>(null);
  const isInVoiceRoomRef = useRef<boolean>(false);
  const activeTabRef = useRef<'chat' | 'talk'>('chat');

  // Initialize audio mode for playback and recording (ONCE only)
  useEffect(() => {
    let isInitialized = false;
    let initializationInProgress = false;
    
    const initializeAudioSystem = async () => {
      if (isInitialized || initializationInProgress) {
        console.log('🔥 ⏭️ Audio already initialized or in progress, skipping...');
        return;
      }
      
      initializationInProgress = true;
      
      try {
        console.log('🔥 🎧 Initializing audio system...');
        
        // Request all audio permissions
        const recordingPermissions = await Audio.requestPermissionsAsync();
        console.log('🔥 📝 Recording permissions:', recordingPermissions);
        
        if (!recordingPermissions.granted) {
          console.warn('🔥 ⚠️ Recording permissions not granted');
          return;
        }
        
        // Set audio mode for both recording and playback with robust configuration
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: false, // Don't duck other audio for walkie-talkie
          playThroughEarpieceAndroid: false,
          staysActiveInBackground: true, // Critical for background playback
        });
        console.log('🔥 ✅ Audio mode configured successfully');
        
        // Skip the problematic test audio that's causing ExoPlayer errors
        console.log('🔥 ✅ Audio system test skipped (preventing ExoPlayer errors)');
        
        isInitialized = true;
        console.log('🔥 🎉 Audio system fully initialized');
        
      } catch (error) {
        console.error('🔥 💥 Failed to initialize audio system:', error);
      } finally {
        initializationInProgress = false;
      }
    };

    // Initialize immediately (ONCE only)
    initializeAudioSystem();
    
    // Cleanup function
    return () => {
      console.log('🔥 🧹 Cleaning up audio resources...');
      isInitialized = false;
      initializationInProgress = false;
    };
  }, []); // Empty dependency array ensures this runs ONCE only

  // who am I?
  useEffect(() => {
    (async () => {
      try {
        const me = await fetchMe<{ id: string; role?: PlatformRole }>();
        setMyId(me?.id ?? null);
        if (me?.role) setMyRole(me.role);
      } catch {}
    })();
  }, []);

  // Load conversation details and initial messages concurrently for faster loading
  useEffect(() => {
    (async () => {
      try {
        // Load conversation details and messages in parallel for faster loading
        const [conv, messageList] = await Promise.all([
          fetchConversation(conversationId),
          fetchMessages(conversationId, { limit: 10 })
        ]);

        // Set conversation details
        if (conv?.title) setTitle(conv.title);
        setMemberCount(Array.isArray(conv?.participants) ? conv.participants.length : 0);
        console.log('[DEBUG] Conversation data:', { type: conv?.type, participants: conv?.participants?.length });
        setConversationType(conv?.type || 'GROUP'); // Default to GROUP if type is missing

        // Set initial messages (deduplicated)
        const uniqueMessages = messageList.filter((msg, index, arr) => 
          arr.findIndex(m => m.id === msg.id) === index
        );
        setMessages(uniqueMessages);
        idsRef.current = new Set(uniqueMessages.map(m => m.id));
        
        setHasMoreMessages(uniqueMessages.length === 10);
        if (uniqueMessages.length > 0) {
          setOldestMessageId(uniqueMessages[0].id);
        }

        // Mark unread messages as read
        const unreadMessages = messageList.filter(msg => msg.sender?.id !== myId);
        for (const msg of unreadMessages) {
          markMessageAsRead(msg.id);
        }

        // Scroll to bottom
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 200);
      } catch (e: any) {
        Alert.alert('Error', e?.message || 'Failed to load conversation');
      }
    })();
  }, [conversationId, myId]);

  // Load voice room when switching to talk tab and check if user is already in room
  useEffect(() => {
    if (!isPrivateChat && activeTab === 'talk') {
      loadVoiceRoom();
    }
  }, [activeTab, isPrivateChat]);

  // Initialize voice room when myId becomes available (handles app restart case)
  useEffect(() => {
    if (myId && !isPrivateChat && conversationType === 'GROUP') {
      console.log('🔥 🏁 Initializing voice room on app start/restart...');
      loadVoiceRoom();
    }
  }, [myId, isPrivateChat, conversationType]);

  // Keep refs updated for socket handlers
  useEffect(() => {
    myIdRef.current = myId;
  }, [myId]);

  useEffect(() => {
    isInVoiceRoomRef.current = isInVoiceRoom;
  }, [isInVoiceRoom]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  // Check voice room status when myId is available
  useEffect(() => {
    if (!isPrivateChat && myId && activeTab === 'talk') {
      console.log('🔥 🔄 Checking voice room status after app restart/myId available');
      loadVoiceRoom();
    }
  }, [myId, isPrivateChat, activeTab]);

  // load members list
  const normalizeStatus = (raw: any): 'online' | 'offline' | 'away' | 'busy' => {
    if (raw == null) return 'offline';
    if (typeof raw === 'string') {
      const s = raw.toLowerCase();
      if (s === 'online' || s === 'away' || s === 'busy') return s as any;
      return 'offline';
    }
    if (typeof raw === 'boolean') return raw ? 'online' : 'offline';
    return 'offline';
  };
  const eqId = (a: any, b: any) => String(a) === String(b);

  const loadMembers = async () => {
    const list = await fetchGroupMembers(conversationId);
    setMembers(list.map(m => ({
      ...m,
      id: String(m.id),
      status: normalizeStatus(m.status),
    })));
    setMemberCount(list.length);
  };

  useEffect(() => { (async () => { try { await loadMembers(); } catch {} })(); }, [conversationId]);

  // Load hidden messages from storage
  useEffect(() => {
    (async () => {
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        const storageKey = `hidden_messages_${conversationId}`;
        const hiddenData = await AsyncStorage.getItem(storageKey);
        if (hiddenData) {
          const hiddenArray = JSON.parse(hiddenData);
          setHiddenMessages(new Set(hiddenArray));
        }
      } catch (error) {
        console.error('Failed to load hidden messages:', error);
      }
    })();
  }, [conversationId]);



  // Keep an ID set to avoid duplicates
  const idsRef = useRef<Set<string>>(new Set());
  useEffect(() => { idsRef.current = new Set(messages.map(m => m.id)); }, [messages]);

  // Helper function to safely add messages without duplicates
  const addMessageSafely = (newMessage: ServerMessage) => {
    if (idsRef.current.has(newMessage.id)) {
      console.log(`[addMessageSafely] Skipping duplicate message: ${newMessage.id}`);
      return;
    }
    
    idsRef.current.add(newMessage.id);
    setMessages(prev => {
      // Double-check for race conditions
      if (prev.some(p => p.id === newMessage.id)) {
        console.log(`[addMessageSafely] Message already exists in state: ${newMessage.id}`);
        return prev;
      }
      return [...prev, newMessage];
    });
  };

  // REALTIME: messages + presence
  useEffect(() => {
    let unsub: undefined | (() => void);
    let poll: undefined | ReturnType<typeof setInterval>;
    let hb: undefined | ReturnType<typeof setInterval>;

    (async () => {
      const sock = await getSocket();

      // Join and presence subscribe
      sock.emit('join:conversation', { conversationId });
      sock.emit('presence:subscribe', { conversationId });
      sock.emit('presence:here', { conversationId, status: 'online' });

      // Heartbeat every 10s
      hb = setInterval(() => sock.emit('presence:ping'), 10000);

      // Messages
      const onNew = (msg: ServerMessage) => {
        if (msg?.conversationId && msg.conversationId !== conversationId) return;
        if (!msg?.id) return;
        
        console.log(`[onNew] Received message: ${msg.id}, type: ${msg.type}`);
        
        // Use the safe add method
        addMessageSafely(msg);
        
        // Show notification for received messages (not sent by current user)
        if (msg.sender?.id !== myId) {
          const notificationTitle = isPrivateChat 
            ? (msg.sender?.name || 'New Message')
            : (title || 'Group Chat');
          
          let notificationBody = '';
          switch (msg.type) {
            case 'TEXT':
              notificationBody = isPrivateChat 
                ? (msg.text || 'Sent a message')
                : `${msg.sender?.name}: ${msg.text || 'Sent a message'}`;
              break;
            case 'IMAGE':
              notificationBody = isPrivateChat 
                ? '📷 Sent a photo'
                : `${msg.sender?.name}: 📷 Sent a photo`;
              break;
            case 'VOICE':
              notificationBody = isPrivateChat 
                ? '🎤 Sent a voice message'
                : `${msg.sender?.name}: 🎤 Sent a voice message`;
              break;
            case 'LOCATION':
              notificationBody = isPrivateChat 
                ? '📍 Shared a location'
                : `${msg.sender?.name}: 📍 Shared a location`;
              break;
            default:
              notificationBody = isPrivateChat 
                ? 'Sent a message'
                : `${msg.sender?.name}: Sent a message`;
          }

          // Send the notification
          sendMessageNotification(notificationTitle, notificationBody, {
            conversationId: msg.conversationId,
            messageId: msg.id,
            senderId: msg.sender?.id,
            senderName: msg.sender?.name,
          });
          
          // Mark new messages as read
          markMessageAsRead(msg.id);
        }
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
      };
      sock.on('message:new', onNew);

      // Message deleted
      const onDeleted = ({ messageId }: { messageId: string }) => {
        console.log('[Socket] message:deleted', messageId);
        setMessages(prev => prev.filter(m => m.id !== messageId));
        // Clear any pending deletion states
        setDeletingMessages(prev => {
          const newSet = new Set(prev);
          newSet.delete(messageId);
          return newSet;
        });
        setUndoTimeouts(prev => {
          const timeout = prev.get(messageId);
          if (timeout) clearTimeout(timeout);
          const newMap = new Map(prev);
          newMap.delete(messageId);
          return newMap;
        });
      };
      sock.on('message:deleted', onDeleted);

      // Bulk presence snapshot
      const onPresenceBulk = (p: { conversationId: string; states: Array<{ userId: any; status?: any; isOnline?: boolean; lastActiveAt?: string }> }) => {
        if (!p || !eqId(p.conversationId, conversationId)) return;
        setMembers(prev =>
          prev.map(m => {
            const s = p.states.find(x => eqId(x.userId, m.id));
            if (!s) return m;
            const status =
              s.status != null
                ? normalizeStatus(s.status)
                : (typeof s.isOnline === 'boolean' ? (s.isOnline ? 'online' : 'offline') : 'offline');
            return { ...m, status };
          })
        );
      };
      sock.on('presence:bulk', onPresenceBulk);

      // Single presence update
      const onPresenceUpdate = (p: { conversationId: any; userId: any; status?: any; isOnline?: boolean; lastActiveAt?: string }) => {
        if (!p || !eqId(p.conversationId, conversationId)) return;
        const status =
          p.status != null
            ? normalizeStatus(p.status)
            : (typeof p.isOnline === 'boolean' ? (p.isOnline ? 'online' : 'offline') : 'offline');
        setMembers(prev => prev.map(m => (eqId(m.id, p.userId) ? { ...m, status } : m)));
      };
      sock.on('presence:update', onPresenceUpdate);

      // Member add/remove (optional)
      const onMemberAdded = (p: { conversationId: any; member: any }) => {
        if (!p || !eqId(p.conversationId, conversationId)) return;
        setMembers(prev => (prev.some(m => eqId(m.id, p.member?.id)) ? prev : [
          ...prev,
          { ...p.member, id: String(p.member.id), status: normalizeStatus(p.member.status ?? p.member.isOnline) }
        ]));
        setMemberCount(c => c + 1);
      };
      const onMemberRemoved = (p: { conversationId: any; userId: any }) => {
        if (!p || !eqId(p.conversationId, conversationId)) return;
        setMembers(prev => prev.filter(m => !eqId(m.id, p.userId)));
        setMemberCount(c => Math.max(0, c - 1));
      };
      sock.on('member:added', onMemberAdded);
      sock.on('member:removed', onMemberRemoved);

      // Voice room events
      const onVoiceParticipantJoined = (data: { conversationId: string; roomId: string; participant: VoiceParticipant }) => {
        if (data.conversationId !== conversationId) return;
        console.log('[Socket] voice:participant:joined', data.participant.userName);
        loadVoiceRoom(); // Refresh room data
      };

      const onVoiceParticipantLeft = (data: { conversationId: string; roomId: string; userId: string }) => {
        if (data.conversationId !== conversationId) return;
        console.log('[Socket] voice:participant:left', data.userId);
        loadVoiceRoom(); // Refresh room data
      };

      const onVoiceTransmission = (data: { conversationId: string; roomId: string; transmission: VoiceTransmission; listeners: any[] }) => {
        if (data.conversationId !== conversationId) return;
        console.log('🔥 Socket event received: voice_transmission_broadcast from', data.transmission.sender.name);
        
        // Use refs to get current values (not stale closure values)
        const currentMyId = myIdRef.current;
        const currentIsInVoiceRoom = isInVoiceRoomRef.current;
        const currentActiveTab = activeTabRef.current;
        
        console.log('🔥 Voice transmission data:', {
          conversationId: data.conversationId,
          roomId: data.roomId,
          transmissionId: data.transmission.id,
          audioUrl: data.transmission.audioUrl,
          senderName: data.transmission.sender.name,
          senderId: data.transmission.sender.id,
          currentUserId: currentMyId,
          isInVoiceRoom: currentIsInVoiceRoom,
          activeTab: currentActiveTab,
          isPrivateChat: isPrivateChat
        });
        
        // Play for all users in voice room (including sender so they can hear their own message)
        if (currentIsInVoiceRoom && currentActiveTab === 'talk') {
          console.log('🔥 Playing transmission from user:', data.transmission.sender.name);
          // Auto-play the transmission for all participants including sender
          playTransmission(data.transmission);
          
          // Show different notifications for sender vs others
          if (data.transmission.sender.id === currentMyId) {
            // Show confirmation for sender
            console.log('🔥 You sent a voice message - should hear it back');
            showSpeakerNotification('You');
          } else {
            // Show subtle notification that someone else is speaking
            console.log('🔥 Someone else is speaking:', data.transmission.sender.name);
            showSpeakerNotification(data.transmission.sender.name);
          }
        } else {
          console.log('🔥 Not playing transmission - conditions not met:', {
            isInVoiceRoom: currentIsInVoiceRoom,
            activeTab: currentActiveTab,
            requiredTab: 'talk'
          });
        }
      };

      console.log('🔥 📡 Registering socket event listeners...');
      sock.on('voice:participant:joined', onVoiceParticipantJoined);
      sock.on('voice:participant:left', onVoiceParticipantLeft);
      sock.on('voice:transmission', onVoiceTransmission);
      console.log('🔥 ✅ Socket event listeners registered successfully');

      // Test socket connection
      sock.emit('test:ping', { conversationId, message: 'Socket test from client' });
      
      // Listen for any socket events to debug
      sock.onAny((eventName, ...args) => {
        if (eventName.includes('voice') || eventName === 'voice_transmission_broadcast') {
          console.log('🔥 Socket event received:', eventName, args);
        }
      });

      // Fallback polling every 20s
      poll = setInterval(async () => {
        try {
          const list = await fetchGroupMembers(conversationId);
          setMembers(prev => {
            const byId = new Map(prev.map(m => [String(m.id), m]));
            list.forEach(raw => {
              const id = String(raw.id);
              const old = byId.get(id);
              const status = normalizeStatus((raw as any).status ?? (raw as any).isOnline);
              byId.set(id, { ...(old ?? raw), ...raw, id, status });
            });
            return Array.from(byId.values());
          });
        } catch {}
      }, 20000);

      // cleanup
      unsub = () => {
        try {
          sock.emit('leave:conversation', { conversationId });
          sock.emit('presence:unsubscribe', { conversationId });
          sock.off('message:new', onNew);
          sock.off('message:deleted', onDeleted);
          sock.off('presence:bulk', onPresenceBulk);
          sock.off('presence:update', onPresenceUpdate);
          sock.off('member:added', onMemberAdded);
          sock.off('member:removed', onMemberRemoved);
          sock.off('voice:participant:joined', onVoiceParticipantJoined);
          sock.off('voice:participant:left', onVoiceParticipantLeft);
          sock.off('voice:transmission', onVoiceTransmission);
        } catch {}
        if (hb) clearInterval(hb);
        if (poll) clearInterval(poll);
      };
    })();

    return () => { if (unsub) unsub(); };
  }, [conversationId]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      console.log('🔥 🧹 Cleaning up audio resources...');
      if (playingSound) {
        playingSound.unloadAsync();
      }
      if (recording) {
        recording.stopAndUnloadAsync();
      }
      if (transmissionSound) {
        transmissionSound.unloadAsync();
      }
      if (talkRecording) {
        talkRecording.stopAndUnloadAsync();
      }
      if (speakerTimeout) {
        clearTimeout(speakerTimeout);
      }
    };
  }, []);

  // Only the creator (earliest joined member) can manage members
  useEffect(() => {
    if (!myId || members.length === 0) return;
    const creator = members.reduce((earliest, m) =>
      Date.parse(m.joinedAt) < Date.parse(earliest.joinedAt) ? m : earliest,
      members[0]
    );
    setCanManageMembers(String(creator.id) === String(myId));
  }, [members, myId]);

  // send text with optimistic updates
  const onSendText = async () => {
    const text = input.trim();
    if (!text || sending) return;
    
    // Create optimistic message
    const optimisticMessage: ServerMessage = {
      id: `optimistic-${Date.now()}`,
      conversationId,
      type: 'TEXT',
      text,
      createdAt: new Date().toISOString(),
      sender: { id: myId || '', name: 'You' },
      status: 'sent'
    };

    try {
      setSending(true);
      setInput(''); // Clear input immediately for better UX
      
      // Add optimistic message immediately
      addMessageSafely(optimisticMessage);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 0);
      
      // Send actual message
      const created = await sendText(conversationId, text);
      
      // Replace optimistic message with real one and update ID tracking
      idsRef.current.delete(optimisticMessage.id);
      idsRef.current.add(created.id);
      
      setMessages(prev => prev.map(msg => 
        msg.id === optimisticMessage.id ? created : msg
      ));
    } catch (e: any) {
      // Remove optimistic message on error
      setMessages(prev => prev.filter(msg => msg.id !== optimisticMessage.id));
      idsRef.current.delete(optimisticMessage.id);
      setInput(text); // Restore input text
      Alert.alert('Error', e?.message || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const mine = (m: ServerMessage) => !!myId && !!m.sender?.id && m.sender.id === myId;

  // Load older messages when scrolling up
  const loadOlderMessages = async () => {
    if (loadingOlderMessages || !hasMoreMessages || !oldestMessageId) return;

    try {
      setLoadingOlderMessages(true);
      
      // Fetch older messages using cursor pagination
      const olderMessages = await fetchMessages(conversationId, { 
        limit: 20, 
        cursor: oldestMessageId 
      });

      if (olderMessages.length > 0) {
        // Filter out duplicates and prepend older messages
        const newMessages = olderMessages.filter(msg => !idsRef.current.has(msg.id));
        
        if (newMessages.length > 0) {
          setMessages(prev => [...newMessages, ...prev]);
          // Update ID tracking
          newMessages.forEach(msg => idsRef.current.add(msg.id));
          
          // Update oldest message ID
          setOldestMessageId(newMessages[0].id);
        }
        
        // If we got less than requested, no more messages
        setHasMoreMessages(olderMessages.length === 20);
      } else {
        setHasMoreMessages(false);
      }
    } catch (e: any) {
      console.error('Failed to load older messages:', e);
      // Don't show alert for older messages loading failure
    } finally {
      setLoadingOlderMessages(false);
    }
  };

  // Attachment options function
  const showAttachmentOptions = () => {
    Alert.alert(
      'Attach',
      'Choose what you want to share:',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: '📷 Take Photo', 
          onPress: () => openImagePicker('camera') 
        },
        { 
          text: '🖼️ Select Images', 
          onPress: () => openImagePicker('gallery-multiple') 
        },
        {
          text: '📍 Share Location',
          onPress: () => shareLocation()
        }
      ]
    );
  };

  // Image picker function (for backwards compatibility)
  const pickImage = async () => {
    showAttachmentOptions();
  };

  const openImagePicker = async (source: 'camera' | 'gallery-multiple') => {
    try {
      let result;
      
      if (source === 'camera') {
        // Request camera permissions
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Camera permission is required to take photos.');
          return;
        }
        
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: false, // No cropping for better flexibility
          quality: 0.8,
        });
      } else { // gallery-multiple
        // Gallery selection - allows single or multiple images
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: false,
          quality: 0.8,
          allowsMultipleSelection: true,
        });
      }

      if (!result.canceled && result.assets && result.assets.length > 0) {
        // Always show preview for both single and multiple images
        setSelectedImages(result.assets);
        setShowImagePreview(true);
      }
    } catch (e: any) {
      console.error('Error selecting images:', e);
      Alert.alert('Error', e?.message || 'Failed to select images');
    }
  };

  const sendImageMessage = async (imageAsset: any, retryCount = 0) => {
    const maxRetries = 3;
    const retryDelay = 1000; // 1 second

    try {
      // Upload the image first
      const formData = new FormData();
      formData.append('file', {
        uri: imageAsset.uri,
        type: imageAsset.mimeType || 'image/jpeg',
        name: imageAsset.fileName || 'image.jpg',
      } as any);

      const { authFetch } = await import('./lib/authClient');
      
      // Set a longer timeout for image uploads
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      try {
        const uploadResponse = await authFetch('/upload', {
          method: 'POST',
          body: formData,
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text().catch(() => 'Unknown error');
          throw new Error(`Upload failed: ${uploadResponse.status} - ${errorText}`);
        }

        const uploadData = await uploadResponse.json();
        const imageUrl = `${process.env.EXPO_PUBLIC_API_URL}${uploadData.url}`;

        // Send the image message with retry logic
        const { sendImage } = await import('./lib/chatApi');
        const created = await sendImage(conversationId, imageUrl);
        
        // Add to messages safely
        addMessageSafely(created);
        
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 0);
        return created;
      } catch (uploadError: any) {
        clearTimeout(timeoutId);
        throw uploadError;
      }
    } catch (e: any) {
      // Only log errors, don't show alerts during retry attempts
      if (retryCount === 0) {
        console.error(`Failed to send image (attempt ${retryCount + 1}):`, e);
      }
      
      // Retry logic for network failures
      if (retryCount < maxRetries && (
        e.name === 'AbortError' || 
        e.message?.includes('Network request failed') ||
        e.message?.includes('timeout') ||
        e.message?.includes('ECONNRESET') ||
        e.message?.includes('ETIMEDOUT')
      )) {
        console.log(`Retrying image upload in ${retryDelay}ms... (attempt ${retryCount + 2}/${maxRetries + 1})`);
        await new Promise(resolve => setTimeout(resolve, retryDelay * (retryCount + 1))); // Exponential backoff
        return sendImageMessage(imageAsset, retryCount + 1);
      }
      
      // Final failure - only throw after all retries exhausted
      console.error(`Final failure after ${retryCount + 1} attempts:`, e);
      const errorMessage = e.message?.includes('Network request failed') 
        ? 'Network connection failed. Please check your internet connection and try again.'
        : e?.message || 'Failed to send image';
      
      throw new Error(errorMessage);
    }
  };

  // Send multiple images with progress tracking and error handling
  const sendMultipleImages = async (images: any[]) => {
    if (images.length === 0) return;

    setSending(true);
    setSendingProgress('');
    let successCount = 0;
    let failedImages: any[] = [];

    try {
      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        setSendingProgress(`Sending image ${i + 1} of ${images.length}...`);
        
        try {
          console.log(`Sending image ${i + 1}/${images.length}...`);
          await sendImageMessage(image);
          successCount++;
          setSendingProgress(`Sent ${successCount} of ${images.length} images`);
          
          // Small delay between images to prevent server overload
          if (i < images.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (error: any) {
          console.error(`Failed to send image ${i + 1}:`, error);
          failedImages.push({ image, index: i + 1, error: error.message });
        }
      }

      // Show results
      if (successCount === images.length) {
        // All images sent successfully
        console.log(`Successfully sent all ${images.length} images`);
      } else if (successCount > 0) {
        // Some images failed
        Alert.alert(
          'Partial Success',
          `Sent ${successCount} of ${images.length} images. ${failedImages.length} failed to send.`,
          [
            { text: 'OK', style: 'default' },
            {
              text: 'Retry Failed',
              onPress: () => {
                const retryImages = failedImages.map(f => f.image);
                sendMultipleImages(retryImages);
              }
            }
          ]
        );
      } else {
        // All images failed
        Alert.alert(
          'Send Failed',
          'Failed to send all images. Please check your connection and try again.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Retry All',
              onPress: () => sendMultipleImages(images)
            }
          ]
        );
      }
    } catch (error: any) {
      console.error('Error in sendMultipleImages:', error);
      Alert.alert('Error', 'An unexpected error occurred while sending images.');
    } finally {
      setSending(false);
      setSendingProgress('');
    }
  };

  // Voice recording functions
  const startRecording = async () => {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      
      setRecording(newRecording);
      setIsRecording(true);
      setRecordingDuration(0);

      // Start duration timer
      const timer = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);

      newRecording.setOnRecordingStatusUpdate((status) => {
        if (!status.isRecording) {
          clearInterval(timer);
        }
      });
    } catch (e: any) {
      Alert.alert('Error', 'Failed to start recording: ' + e.message);
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    try {
      setIsRecording(false);
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      
      if (uri) {
        setRecordedUri(uri);
        setShowVoicePreview(true);
      }
      
      setRecording(null);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to stop recording');
    }
  };

  // Send the recorded voice message
  const sendVoiceMessage = async () => {
    if (!recordedUri) return;

    try {
      setSending(true);
      
      // Upload the voice recording first
      const formData = new FormData();
      formData.append('file', {
        uri: recordedUri,
        type: 'audio/m4a',
        name: 'voice.m4a',
      } as any);

      const { authFetch } = await import('./lib/authClient');
      const uploadResponse = await authFetch('/upload', {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload voice message');
      }

      const uploadData = await uploadResponse.json();
      const voiceUrl = `${process.env.EXPO_PUBLIC_API_URL}${uploadData.url}`;

      // Send the voice message
      const { sendVoice } = await import('./lib/chatApi');
      const created = await sendVoice(conversationId, voiceUrl, recordingDuration);
      
      // Add to messages safely
      addMessageSafely(created);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 0);
      
      // Close preview and reset
      setShowVoicePreview(false);
      setRecordedUri(null);
      setRecordingDuration(0);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to send voice message');
    } finally {
      setSending(false);
    }
  };

  // Cancel the recorded voice message
  const cancelVoiceMessage = () => {
    if (previewSound) {
      previewSound.unloadAsync();
      setPreviewSound(null);
    }
    setIsPlayingPreview(false);
    setShowVoicePreview(false);
    setRecordedUri(null);
    setRecordingDuration(0);
  };

  // Play/pause the recorded voice preview
  const togglePreviewPlayback = async () => {
    if (!recordedUri) return;

    try {
      if (isPlayingPreview && previewSound) {
        // Stop current playback
        await previewSound.stopAsync();
        await previewSound.unloadAsync();
        setPreviewSound(null);
        setIsPlayingPreview(false);
        return;
      }

      // Start playback
      const { sound } = await Audio.Sound.createAsync({ uri: recordedUri });
      setPreviewSound(sound);
      setIsPlayingPreview(true);

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPlayingPreview(false);
          setPreviewSound(null);
          sound.unloadAsync();
        }
      });

      await sound.playAsync();
    } catch (e: any) {
      Alert.alert('Error', 'Failed to play preview: ' + e.message);
    }
  };

  // Navigate to location viewer page
  const navigateToLocation = (latitude: number, longitude: number, address?: string | null) => {
    const params = {
      latitude: latitude.toString(),
      longitude: longitude.toString(),
      ...(address && { address })
    };
    
    router.push({
      pathname: '/location-viewer',
      params
    });
  };

  // Open location in maps app (kept for backward compatibility)
  const openLocationInMaps = async (latitude: number, longitude: number, address?: string | null) => {
    try {
      const { Linking } = await import('react-native');
      
      // Try different map apps based on platform
      const label = encodeURIComponent(address || 'Shared Location');
      
      // Google Maps URL (works on both iOS and Android)
      const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}&query_place_id=${label}`;
      
      // Apple Maps URL (iOS only)
      const appleMapsUrl = `http://maps.apple.com/?q=${label}&ll=${latitude},${longitude}`;
      
      // Try to open in native maps app first, fallback to Google Maps
      const canOpenApple = await Linking.canOpenURL(appleMapsUrl);
      const canOpenGoogle = await Linking.canOpenURL(googleMapsUrl);
      
      if (canOpenApple) {
        await Linking.openURL(appleMapsUrl);
      } else if (canOpenGoogle) {
        await Linking.openURL(googleMapsUrl);
      } else {
        Alert.alert('Error', 'No maps application found on this device');
      }
    } catch (error: any) {
      console.error('Failed to open location in maps:', error);
      Alert.alert('Error', 'Failed to open location in maps');
    }
  };

  // Location sharing function
  const shareLocation = async () => {
    try {
      // Request location permissions
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Location permission is required to share your location.');
        return;
      }

      setSending(true);
      
      // Get current location
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const { latitude, longitude } = location.coords;

      // Try to get address from coordinates
      let address = 'Current Location';
      try {
        const reverseGeocode = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (reverseGeocode.length > 0) {
          const place = reverseGeocode[0];
          const addressParts = [
            place.name,
            place.street,
            place.city,
            place.region,
            place.country
          ].filter(Boolean);
          address = addressParts.join(', ') || 'Current Location';
        }
      } catch (error) {
        console.log('Could not get address for location:', error);
      }

      // Create optimistic location message
      const optimisticMessage: ServerMessage = {
        id: `optimistic-location-${Date.now()}`,
        conversationId,
        type: 'LOCATION',
        latitude,
        longitude,
        locationAddress: address,
        createdAt: new Date().toISOString(),
        sender: { id: myId || '', name: 'You' },
        status: 'sent'
      };

      // Add optimistic message immediately
      addMessageSafely(optimisticMessage);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 0);

      // Send location message to server
      const { sendLocation } = await import('./lib/chatApi');
      const created = await sendLocation(conversationId, latitude, longitude, address);

      // Replace optimistic message with real one and update ID tracking
      idsRef.current.delete(optimisticMessage.id);
      idsRef.current.add(created.id);
      
      setMessages(prev => prev.map(msg => 
        msg.id === optimisticMessage.id ? created : msg
      ));
    } catch (error: any) {
      console.error('Failed to share location:', error);
      
      // Remove optimistic message on error
      setMessages(prev => prev.filter(msg => !msg.id.startsWith('optimistic-location-')));
      // Clean up any optimistic location IDs
      for (const id of idsRef.current) {
        if (id.startsWith('optimistic-location-')) {
          idsRef.current.delete(id);
        }
      }
      
      Alert.alert('Error', error?.message || 'Failed to share location');
    } finally {
      setSending(false);
    }
  };

  // Voice playback functions
  const playVoiceMessage = async (messageId: string, audioUri: string) => {
    try {
      if (playingMessageId === messageId && playingSound) {
        // Stop current playback
        await playingSound.stopAsync();
        await playingSound.unloadAsync();
        setPlayingSound(null);
        setPlayingMessageId(null);
        return;
      }

      // Stop any currently playing sound
      if (playingSound) {
        await playingSound.stopAsync();
        await playingSound.unloadAsync();
      }

      const { sound } = await Audio.Sound.createAsync({ uri: audioUri });
      setPlayingSound(sound);
      setPlayingMessageId(messageId);

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setPlayingSound(null);
          setPlayingMessageId(null);
          sound.unloadAsync();
        }
      });

      await sound.playAsync();
    } catch (e: any) {
      Alert.alert('Error', 'Failed to play voice message: ' + e.message);
    }
  };

  // Message deletion functions
  const deleteMessage = async (messageId: string) => {
    try {
      setDeletingMessages(prev => new Set([...prev, messageId]));
      
      // Set 5-second undo timer
      const timeout = setTimeout(async () => {
        try {
          // Permanently delete from server
          const { authFetch } = await import('./lib/authClient');
          await authFetch(`/chat/messages/${messageId}`, {
            method: 'DELETE',
          });
          
          // Remove from local state
          setMessages(prev => prev.filter(m => m.id !== messageId));
          setDeletingMessages(prev => {
            const newSet = new Set(prev);
            newSet.delete(messageId);
            return newSet;
          });
          setUndoTimeouts(prev => {
            const newMap = new Map(prev);
            newMap.delete(messageId);
            return newMap;
          });
        } catch (error) {
          console.error('Failed to delete message:', error);
          // Revert deletion state on error
          setDeletingMessages(prev => {
            const newSet = new Set(prev);
            newSet.delete(messageId);
            return newSet;
          });
        }
      }, 5000);

      setUndoTimeouts(prev => new Map([...prev, [messageId, timeout]]));
    } catch (error) {
      console.error('Failed to initiate message deletion:', error);
      Alert.alert('Error', 'Failed to delete message');
    }
  };

  const undoDelete = (messageId: string) => {
    const timeout = undoTimeouts.get(messageId);
    if (timeout) {
      clearTimeout(timeout);
      setUndoTimeouts(prev => {
        const newMap = new Map(prev);
        newMap.delete(messageId);
        return newMap;
      });
      setDeletingMessages(prev => {
        const newSet = new Set(prev);
        newSet.delete(messageId);
        return newSet;
      });
    }
  };

  // Mark message as read
  const markMessageAsRead = async (messageId: string) => {
    try {
      const { authFetch } = await import('./lib/authClient');
      await authFetch(`/chat/messages/${messageId}/read`, {
        method: 'POST',
      });
    } catch (error) {
      console.error('Failed to mark message as read:', error);
    }
  };

  // Show delete options for own messages
  const showDeleteOptions = (messageId: string) => {
    Alert.alert(
      'Delete Message',
      'Choose delete option:',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete for me', 
          onPress: () => deleteMessageForMe(messageId) 
        },
        { 
          text: 'Delete for everyone', 
          style: 'destructive', 
          onPress: () => deleteMessage(messageId) 
        }
      ]
    );
  };

  // Delete message for current user only (hide from their view)
  const deleteMessageForMe = async (messageId: string) => {
    try {
      // Add to hidden messages set
      setHiddenMessages(prev => new Set([...prev, messageId]));
      
      // Persist to local storage
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      const storageKey = `hidden_messages_${conversationId}`;
      const existingHidden = await AsyncStorage.getItem(storageKey);
      const hiddenSet = existingHidden ? new Set(JSON.parse(existingHidden)) : new Set();
      hiddenSet.add(messageId);
      await AsyncStorage.setItem(storageKey, JSON.stringify([...hiddenSet]));
      
      // Also call server
      const { authFetch } = await import('./lib/authClient');
      await authFetch(`/chat/messages/${messageId}/hide`, {
        method: 'POST',
      });
    } catch (error) {
      console.error('Failed to hide message:', error);
      // Revert on error
      setHiddenMessages(prev => {
        const newSet = new Set(prev);
        newSet.delete(messageId);
        return newSet;
      });
    }
  };

  // Fetch read receipts for a message
  const [readReceipts, setReadReceipts] = useState<Array<{ userId: string; userName: string; readAt: string }>>([]);
  
  const fetchReadReceipts = async (messageId: string) => {
    try {
      const { authFetch } = await import('./lib/authClient');
      const response = await authFetch(`/chat/messages/${messageId}/read-receipts`);
      const data = await response.json();
      
      // Filter out the current user from read receipts (don't show yourself)
      const filteredData = data.filter((receipt: any) => receipt.userId !== myId);
      setReadReceipts(filteredData);
    } catch (error) {
      console.error('Failed to fetch read receipts:', error);
      setReadReceipts([]);
    }
  };

  // When read receipts modal is opened, fetch the data
  useEffect(() => {
    if (showReadReceipts) {
      fetchReadReceipts(showReadReceipts);
    }
  }, [showReadReceipts]);

  // actions passed to modal
  const callMember = (_memberId: string, phone: string | null) => {
    if (!phone) return Alert.alert('No phone', 'This member has no phone number.');
    Alert.alert('Call', `Call ${phone}`);
  };
  const messageMember = async (memberId: string, memberName: string) => {
    try {
      // Create or get DM conversation
      const dm = await createDMConversation(memberId);
      // Navigate to the DM conversation
      router.push(`/${dm.id}?name=${encodeURIComponent(`${memberName}`)}`);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to start conversation');
    }
  };

  // Create DM conversation and navigate to it
  const startDMWithUser = async (userId: string, userName: string) => {
    try {
      const { createDMConversation } = await import('./lib/chatApi');
      const dmConversation = await createDMConversation(userId);
      // Navigate to the DM conversation
      router.push(`/${dmConversation.id}?name=${encodeURIComponent(userName)}`);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to start conversation');
    }
  };

  // rename handlers
  const openRename = () => { setRenameText(title); setRenameOpen(true); };
  const commitRename = async () => {
    const newName = renameText.trim();
    if (!newName) return Alert.alert('Validation', 'Group name cannot be empty.');
    try {
      const res = await renameGroup(conversationId, { name: newName });
      setTitle(res.name || newName);
      setRenameOpen(false);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to rename group.');
    }
  };
  const confirmDelete = () => {
    const deleteTitle = isPrivateChat ? 'Delete this chat' : 'Delete group';
    const deleteMessage = isPrivateChat 
      ? 'This will delete all messages in this private chat. Continue?' 
      : 'This will remove all messages and members. Continue?';
    
    Alert.alert(deleteTitle, deleteMessage, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: actuallyDelete },
    ]);
  };
  const actuallyDelete = async () => {
    try {
      await deleteGroup(conversationId);
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to delete group.');
    }
  };

  // Show subtle speaker notification
  const showSpeakerNotification = (speakerName: string) => {
    // Clear any existing timeout
    if (speakerTimeout) {
      clearTimeout(speakerTimeout);
    }
    
    // Show the speaker notification
    setCurrentSpeaker(speakerName);
    
    // Auto-hide after 3 seconds
    const timeout = setTimeout(() => {
      setCurrentSpeaker(null);
      setSpeakerTimeout(null);
    }, 3000);
    
    setSpeakerTimeout(timeout);
  };

  // Voice room functions
  const loadVoiceRoom = async () => {
    if (isPrivateChat) return; // Only for group chats
    
    try {
      console.log('🔥 📱 Loading voice room data...');
      const room = await getVoiceRoom(conversationId);
      console.log('🔥 📱 Voice room loaded:', {
        id: room.id,
        participantCount: room.participantCount,
        participants: room.participants.map(p => ({ userId: p.userId, userName: p.userName, isListening: p.isListening }))
      });
      setVoiceRoom(room);
      setVoiceParticipants(room.participants);
      
      // IMPORTANT: Check if current user is in the room and update state accordingly
      const userInRoom = room.participants.some(p => p.userId === myId && p.isListening);
      console.log('🔥 📱 Current user in voice room:', userInRoom, 'myId:', myId);
      console.log('🔥 📱 Previous isInVoiceRoom state:', isInVoiceRoom);
      
      // Update isInVoiceRoom state based on server data
      if (userInRoom !== isInVoiceRoom) {
        console.log('🔥 🔄 Updating isInVoiceRoom state from', isInVoiceRoom, 'to', userInRoom);
        setIsInVoiceRoom(userInRoom);
      }
      
    } catch (error) {
      console.error('🔥 ❌ Failed to load voice room:', error);
    }
  };

  const handleJoinVoiceRoom = async () => {
    try {
      console.log('🔥 🚪 Attempting to join voice room...');
      const result = await joinVoiceRoom(conversationId);
      console.log('🔥 🚪 Join voice room result:', result);
      if (result.success) {
        console.log('🔥 ✅ Successfully joined voice room - setting isInVoiceRoom = true');
        setIsInVoiceRoom(true);
        console.log('🔥 📱 isInVoiceRoom state updated to:', true);
        await loadVoiceRoom(); // Refresh room data
      } else {
        console.log('🔥 ❌ Failed to join voice room:', result);
      }
    } catch (error: any) {
      console.error('🔥 ❌ Error joining voice room:', error);
      Alert.alert('Error', error?.message || 'Failed to join voice room');
    }
  };

  const handleLeaveVoiceRoom = async () => {
    try {
      console.log('🔥 🚪 Attempting to leave voice room...');
      const result = await leaveVoiceRoom(conversationId);
      if (result.success) {
        console.log('🔥 ✅ Successfully left voice room - setting isInVoiceRoom = false');
        setIsInVoiceRoom(false);
        await loadVoiceRoom(); // Refresh room data
      } else {
        console.log('🔥 ❌ Failed to leave voice room:', result);
      }
    } catch (error: any) {
      console.error('🔥 ❌ Error leaving voice room:', error);
      Alert.alert('Error', error?.message || 'Failed to leave voice room');
    }
  };

  // Push-to-talk functions (improved with better error handling)
  const startTalkRecording = async () => {
    console.log('🔥 🎤 Push-to-talk started');
    
    // Check if already recording
    if (isTalkRecording || talkRecording) {
      console.log('🔥 ⚠️ Already recording, ignoring duplicate start');
      return;
    }
    
    if (!isInVoiceRoom) {
      console.log('🔥 ❌ Not in voice room');
      Alert.alert('Join Voice Room', 'You need to join the voice room first to send voice messages.');
      return;
    }

    try {
      console.log('🔥 🎙️ Starting recording...');
      
      // Ensure we have permissions
      const permissions = await Audio.requestPermissionsAsync();
      if (!permissions.granted) {
        Alert.alert('Permission Required', 'Please allow microphone access to record voice messages.');
        return;
      }
      
      // Set recording mode without disrupting other audio settings
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
        staysActiveInBackground: true,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      
      setTalkRecording(newRecording);
      setIsTalkRecording(true);
      setTalkRecordingDuration(0);
      console.log('🔥 ✅ Recording started successfully');

      // Start duration timer
      const timer = setInterval(() => {
        setTalkRecordingDuration(prev => prev + 1);
      }, 1000);

      newRecording.setOnRecordingStatusUpdate((status) => {
        if (!status.isRecording) {
          clearInterval(timer);
        }
      });
    } catch (e: any) {
      console.error('🔥 💥 Failed to start recording:', e);
      setIsTalkRecording(false);
      setTalkRecording(null);
      Alert.alert('Recording Error', 'Failed to start recording: ' + (e.message || 'Unknown error'));
    }
  };

  const stopTalkRecording = async () => {
    console.log('🔥 🛑 Push-to-talk stopped');
    
    if (!talkRecording) {
      console.log('🔥 ⚠️ No recording to stop');
      setIsTalkRecording(false);
      return;
    }

    try {
      console.log('🔥 📤 Stopping recording...');
      setIsTalkRecording(false);
      
      // Get the URI before stopping
      const uri = talkRecording.getURI();
      console.log('🔥 📁 Recording URI:', uri);
      
      await talkRecording.stopAndUnloadAsync();
      console.log('🔥 ✅ Recording stopped successfully');
      
      if (uri) {
        console.log('🔥 📡 Uploading voice transmission...');
        await sendTalkTransmission(uri, talkRecordingDuration);
        console.log('🔥 ✅ Voice transmission uploaded successfully');
      } else {
        console.log('🔥 ❌ No URI available, recording may have failed');
      }
      
      setTalkRecording(null);
      setTalkRecordingDuration(0);
    } catch (e: any) {
      console.error('🔥 💥 Error in stopTalkRecording:', e);
      setTalkRecording(null);
      setTalkRecordingDuration(0);
      setIsTalkRecording(false);
      Alert.alert('Recording Error', e?.message || 'Failed to send voice transmission');
    }
  };

  const sendTalkTransmission = async (audioUri: string, durationS: number) => {
    try {
      console.log('🔥 Sending voice transmission:', { audioUri, durationS });
      setSending(true);
      
      // Upload the voice recording first
      const formData = new FormData();
      formData.append('file', {
        uri: audioUri,
        type: 'audio/m4a',
        name: 'voice_transmission.m4a',
      } as any);

      const { authFetch } = await import('./lib/authClient');
      const uploadResponse = await authFetch('/upload', {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload voice transmission');
      }

      const uploadData = await uploadResponse.json();
      const audioUrl = `${process.env.EXPO_PUBLIC_API_URL}${uploadData.url}`;
      console.log('🔥 Voice file uploaded, sending transmission...');

      // Send the voice transmission
      const result = await sendVoiceTransmission(conversationId, audioUrl, durationS);
      console.log('🔥 Voice transmission sent successfully:', result);
      
      if (result.success) {
        console.log('🔥 Server should broadcast socket event now');
      }
    } catch (e: any) {
      console.error('🔥 Error sending voice transmission:', e);
      Alert.alert('Error', e?.message || 'Failed to send voice transmission');
    } finally {
      setSending(false);
    }
  };

  const playTransmission = async (transmission: VoiceTransmission) => {
    try {
      console.log('🔥 🎵 playTransmission CALLED with:', {
        id: transmission.id,
        audioUrl: transmission.audioUrl,
        sender: transmission.sender.name,
        currentlyPlaying: playingTransmission,
        hasTransmissionSound: !!transmissionSound
      });

      if (playingTransmission === transmission.id && transmissionSound) {
        console.log('� �🛑 Stopping current playback (same transmission)');
        // Stop current playback
        await transmissionSound.stopAsync();
        await transmissionSound.unloadAsync();
        setTransmissionSound(null);
        setPlayingTransmission(null);
        return;
      }

      // Stop any currently playing sound
      if (transmissionSound) {
        console.log('� �🛑 Stopping previous transmission sound');
        await transmissionSound.stopAsync();
        await transmissionSound.unloadAsync();
      }

      console.log('🔥 🎵 About to create Audio.Sound from URI:', transmission.audioUrl);
      
      // Test if the URL is accessible
      try {
        const response = await fetch(transmission.audioUrl, { method: 'HEAD' });
        console.log('🔥 📡 Audio URL accessibility check:', {
          url: transmission.audioUrl,
          status: response.status,
          contentType: response.headers.get('content-type')
        });
        
        if (!response.ok) {
          throw new Error(`Audio URL returned ${response.status}: ${response.statusText}`);
        }
      } catch (urlError) {
        console.error('🔥 ❌ Audio URL is not accessible:', urlError);
        throw new Error('Audio file is not accessible from server');
      }

      // Re-configure audio mode before creating sound to ensure proper playback settings
      console.log('🔥 🔧 Re-configuring audio mode for playback...');
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false, // Disable recording during playback
        playsInSilentModeIOS: true,
        shouldDuckAndroid: false, // Don't duck other audio during voice transmission
        playThroughEarpieceAndroid: false,
        staysActiveInBackground: true,
      });

      console.log('🔥 🎵 Creating Audio.Sound...');
      const { sound } = await Audio.Sound.createAsync(
        { uri: transmission.audioUrl },
        { 
          shouldPlay: false, 
          isLooping: false,
          rate: 1.0,
          volume: 1.0,
          shouldCorrectPitch: true,
        }
      );
      console.log('🔥 ✅ Audio.Sound created successfully');
      
      setTransmissionSound(sound);
      setPlayingTransmission(transmission.id);

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded) {
          console.log('🔥 🎵 Playback status update:', {
            isLoaded: status.isLoaded,
            isPlaying: status.isPlaying,
            didJustFinish: status.didJustFinish,
            positionMillis: status.positionMillis,
            durationMillis: status.durationMillis
          });
          
          if (status.didJustFinish) {
            console.log('🔥 ✅ Voice transmission finished playing');
            setTransmissionSound(null);
            setPlayingTransmission(null);
            sound.unloadAsync();
            
            // Re-enable recording after playback
            Audio.setAudioModeAsync({
              allowsRecordingIOS: true,
              playsInSilentModeIOS: true,
              shouldDuckAndroid: true,
              playThroughEarpieceAndroid: false,
              staysActiveInBackground: true,
            }).catch(console.error);
          }
        } else {
          console.log('🔥 ❌ Playback status error:', status.error);
        }
      });

      console.log('🔥 ▶️ About to start playback with sound.playAsync()');
      await sound.playAsync();
      console.log('🔥 ✅ sound.playAsync() completed - Voice transmission should be playing now!');
      
      // Double-check playback status
      const status = await sound.getStatusAsync();
      if (status.isLoaded) {
        console.log('🔥 📊 Initial playback status after playAsync:', {
          isLoaded: status.isLoaded,
          isPlaying: status.isPlaying,
          positionMillis: status.positionMillis,
          durationMillis: status.durationMillis,
          rate: status.rate,
          volume: status.volume
        });
        
        if (!status.isPlaying) {
          console.log('🔥 ⚠️ Sound is not playing! Attempting to force play...');
          await sound.playAsync();
        }
      } else {
        console.log('🔥 ❌ Initial status check failed:', status.error);
        throw new Error(`Audio not loaded: ${status.error}`);
      }
      
    } catch (e: any) {
      console.error('🔥 ❌ Failed to play voice transmission:', e);
      console.error('🔥 ❌ Error details:', {
        message: e.message,
        stack: e.stack,
        name: e.name
      });
      
      // Cleanup on error
      if (transmissionSound) {
        try {
          await transmissionSound.unloadAsync();
        } catch {}
      }
      setTransmissionSound(null);
      setPlayingTransmission(null);
      
      Alert.alert('Playback Error', `Failed to play voice transmission: ${e.message}`);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color="#111827" />
        </TouchableOpacity>

        {/* tap title area to open members (only for group chats) */}
        <TouchableOpacity 
          style={{ flex: 1 }} 
          onPress={isPrivateChat ? undefined : () => setShowMembers(true)}
          disabled={isPrivateChat}
        >
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.sub}>
            {isPrivateChat ? '🔒 Private chat' : `${memberCount} members`}
          </Text>
        </TouchableOpacity>

        <View style={styles.headerRight}>
          {canRenameDelete && !isPrivateChat && (
            <>
              <TouchableOpacity onPress={openRename} style={styles.smallIconBtn}>
                <Pencil size={18} color="#111827" />
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmDelete} style={styles.smallIconBtn}>
                <Trash2 size={18} color="#EF4444" />
              </TouchableOpacity>
            </>
          )}
          {isPrivateChat && otherUserId && (
            <TouchableOpacity 
              onPress={() => router.push(`/user-profile/${otherUserId}`)} 
              style={styles.smallIconBtn}
            >
              <User size={18} color="#3B82F6" />
            </TouchableOpacity>
          )}
          {!isPrivateChat && (
            <View style={styles.membersIcon}>
              <Users size={18} color="#6B7280" />
            </View>
          )}
        </View>
      </View>

      {/* Tab Navigation - only show for group chats */}
      {!isPrivateChat && (
        <View style={styles.tabContainer}>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'chat' && styles.activeTab]}
            onPress={() => setActiveTab('chat')}
          >
            <Text style={[styles.tabText, activeTab === 'chat' && styles.activeTabText]}>
              Chat
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'talk' && styles.activeTab]}
            onPress={() => setActiveTab('talk')}
          >
            <Text style={[styles.tabText, activeTab === 'talk' && styles.activeTabText]}>
              Talk
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Chat Tab Content */}
      {(isPrivateChat || activeTab === 'chat') && (
        <>
          <ScrollView 
        ref={scrollRef} 
        style={styles.list} 
        contentContainerStyle={{ padding: 12 }}
        onContentSizeChange={() => {
          // Auto-scroll to bottom when content size changes (new messages)
          setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
        }}
        onLayout={() => {
          // Scroll to bottom when layout is complete
          setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
        }}
        onScroll={({ nativeEvent }) => {
          // Load older messages when user scrolls near the top
          const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
          const isNearTop = contentOffset.y < 100; // Within 100px of top
          
          if (isNearTop && hasMoreMessages && !loadingOlderMessages) {
            loadOlderMessages();
          }
        }}
        scrollEventThrottle={400}
      >
        {/* Loading indicator for older messages */}
        {loadingOlderMessages && (
          <View style={styles.loadingOlderMessages}>
            <Text style={styles.loadingText}>Loading older messages...</Text>
          </View>
        )}
        
        {messages
          .filter(m => !hiddenMessages.has(m.id)) // Filter out hidden messages
          .filter((m, index, arr) => arr.findIndex(msg => msg.id === m.id) === index) // Remove duplicates
          .map((m, messageIndex) => {
          const isDeleting = deletingMessages.has(m.id);
          const isMyMessage = mine(m);
          
          // Debug logging for message types
          if (m.type === 'LOCATION' || (!['TEXT', 'IMAGE', 'VOICE', 'ORDER', 'SYSTEM'].includes(m.type))) {
            console.log('Message type debug:', { id: m.id, type: m.type, latitude: m.latitude, longitude: m.longitude, address: m.locationAddress });
          }
          
          return (
            <TouchableOpacity
              key={`${m.id}-${messageIndex}`}
              onLongPress={() => {
                if (isMyMessage) {
                  // Options for my messages: Delete + See who read this
                  const options: any[] = [
                    { text: 'Cancel', style: 'cancel' }
                  ];
                  
                  // Add "See who read this" only for group messages (not private chats)
                  if (!isPrivateChat && members.length > 2) {
                    options.push({ 
                      text: 'See who read this', 
                      onPress: () => setShowReadReceipts(m.id) 
                    });
                  }
                  
                  options.push({ 
                    text: 'Delete', 
                    style: 'destructive', 
                    onPress: () => showDeleteOptions(m.id) 
                  });
                  
                  Alert.alert('Message Options', 'What would you like to do?', options);
                } else {
                  // Options for other messages: See who read this + Delete for me
                  const options: any[] = [
                    { text: 'Cancel', style: 'cancel' }
                  ];
                  
                  // Add "See who read this" only for group messages (not private chats)
                  if (!isPrivateChat && members.length > 2) {
                    options.push({ 
                      text: 'See who read this', 
                      onPress: () => setShowReadReceipts(m.id) 
                    });
                  }
                  
                  // Add "Delete for me"
                  options.push({ 
                    text: 'Delete for me', 
                    style: 'destructive', 
                    onPress: () => deleteMessageForMe(m.id) 
                  });
                  
                  Alert.alert('Message Options', 'What would you like to do?', options);
                }
              }}
              activeOpacity={0.7}
            >
              <View style={[
                styles.msg, 
                isMyMessage ? styles.msgMine : styles.msgOther,
                isDeleting && styles.msgDeleting
              ]}>
                {isDeleting && (
                  <View style={styles.undoContainer}>
                    <Text style={styles.undoText}>Message will be deleted</Text>
                    <TouchableOpacity onPress={() => undoDelete(m.id)} style={styles.undoBtn}>
                      <Text style={styles.undoBtnText}>UNDO</Text>
                    </TouchableOpacity>
                  </View>
                )}
                
                {!isDeleting && (
                  <>
                    {!!m.sender?.name && !isMyMessage && (
                      <TouchableOpacity onPress={() => startDMWithUser(m.sender!.id, m.sender!.name)}>
                        <Text style={[styles.msgSender, styles.msgSenderClickable]}>{m.sender.name}</Text>
                      </TouchableOpacity>
                    )}
                    
                    {m.type === 'TEXT' ? (
                      <Text style={[styles.msgText, isMyMessage ? styles.msgTextMine : styles.msgTextOther]}>
                        {m.text}
                      </Text>
                    ) : m.type === 'IMAGE' ? (
                      <TouchableOpacity 
                        onPress={() => {
                          // Show image in full-size viewer
                          setViewingImageUrl(m.mediaUrl!);
                          setShowImageViewer(true);
                        }}
                        style={styles.imageContainer}
                      >
                        <Image 
                          source={{ uri: m.mediaUrl! }} 
                          style={styles.msgImage}
                          resizeMode="cover"
                          onLoad={(event) => {
                            // Log image dimensions for debugging
                            const { width, height } = event.nativeEvent.source;
                            console.log(`Image loaded: ${width}x${height}`);
                          }}
                        />
                      </TouchableOpacity>
                    ) : m.type === 'VOICE' ? (
                      <TouchableOpacity 
                        onPress={() => playVoiceMessage(m.id, m.mediaUrl!)}
                        style={styles.voiceMessage}
                      >
                        {playingMessageId === m.id ? (
                          <Pause size={16} color={isMyMessage ? 'white' : '#111827'} />
                        ) : (
                          <Play size={16} color={isMyMessage ? 'white' : '#111827'} />
                        )}
                        <Text style={[styles.voiceText, isMyMessage ? styles.msgTextMine : styles.msgTextOther]}>
                          Voice ({m.mediaDurationS ?? 0}s)
                        </Text>
                      </TouchableOpacity>
                    ) : m.type === 'LOCATION' ? (
                      <TouchableOpacity 
                        onPress={() => navigateToLocation(m.latitude!, m.longitude!, m.locationAddress)}
                        style={styles.locationMessage}
                      >
                        <View style={styles.locationHeader}>
                          <MapPin size={20} color={isMyMessage ? 'white' : '#3B82F6'} />
                          <Text style={[styles.locationTitle, isMyMessage ? styles.msgTextMine : styles.msgTextOther]}>
                            📍 Location
                          </Text>
                        </View>
                        <View style={styles.locationDetails}>
                          {m.locationAddress && (
                            <Text style={[styles.locationAddress, isMyMessage ? styles.msgTextMine : styles.msgTextOther]} numberOfLines={3}>
                              {m.locationAddress}
                            </Text>
                          )}
                          <Text style={[styles.locationCoords, isMyMessage ? styles.msgTextMine : styles.msgTextOther]}>
                            {m.latitude?.toFixed(6)}, {m.longitude?.toFixed(6)}
                          </Text>
                          <Text style={[styles.tapToView, isMyMessage ? styles.msgTextMine : styles.msgTextOther]}>
                            Tap to view on map
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ) : m.type === 'ORDER' ? (
                      <Text style={[styles.msgText, isMyMessage ? styles.msgTextMine : styles.msgTextOther]}>
                        📄 Order
                      </Text>
                    ) : (
                      <Text style={[styles.msgText, isMyMessage ? styles.msgTextMine : styles.msgTextOther]}>
                        Unsupported message type: {m.type}
                      </Text>
                    )}
                    
                    <View style={styles.msgFooter}>
                      <Text style={styles.msgTime}>
                        {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                      {isMyMessage && (
                        <View style={styles.msgStatus}>
                          {m.status === 'sent' && <Check size={12} color="#9CA3AF" />}
                          {m.status === 'delivered' && (
                            <View style={styles.doubleCheck}>
                              <Check size={12} color="#9CA3AF" />
                              <Check size={12} color="#9CA3AF" style={{ marginLeft: -6 }} />
                            </View>
                          )}
                          {m.status === 'seen' && (
                            <View style={styles.doubleCheck}>
                              <Check size={12} color="#10B981" />
                              <Check size={12} color="#10B981" style={{ marginLeft: -6 }} />
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  </>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.inputRow}>
        <TouchableOpacity onPress={showAttachmentOptions} style={styles.attachBtn}>
          <ImageIcon size={20} color="#6B7280" />
        </TouchableOpacity>
        <TouchableOpacity onPress={shareLocation} style={styles.attachBtn} disabled={sending}>
          <MapPin size={20} color={sending ? "#9CA3AF" : "#6B7280"} />
        </TouchableOpacity>
        <TextInput
          style={styles.textInput}
          value={input}
          onChangeText={setInput}
          placeholder="Type a message…"
          multiline
        />
        <TouchableOpacity 
          onPress={isRecording ? stopRecording : startRecording} 
          style={[styles.micBtn, isRecording && styles.micBtnRecording]}
        >
          <Mic size={20} color="white" />
          {isRecording && (
            <Text style={styles.recordingTime}>{recordingDuration}s</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={onSendText} disabled={!input.trim() || sending} style={styles.sendBtn}>
          <Send size={20} color="white" />
        </TouchableOpacity>
      </View>
      </>
      )}

      {/* Talk Tab Content */}
      {!isPrivateChat && activeTab === 'talk' && (
        <View style={styles.talkContainer}>
          {/* Subtle Speaker Notification */}
          {currentSpeaker && (
            <View style={styles.speakerNotification}>
              <View style={styles.speakerIndicator} />
              <Text style={styles.speakerText}>
                🎤 {currentSpeaker === 'You' ? 'You are speaking' : `${currentSpeaker} is speaking`}
              </Text>
            </View>
          )}
          
          <View style={styles.talkContent}>
            <Text style={styles.talkTitle}>Walkie-Talkie</Text>
            <Text style={styles.talkSubtitle}>
              {isInVoiceRoom ? 'Hold to talk, release to send' : 'Join to start talking'}
            </Text>
            
            {/* Refresh voice room status button (for debugging) */}
            <TouchableOpacity 
              style={styles.refreshButton}
              onPress={() => {
                console.log('🔥 🔄 Manual refresh voice room status');
                loadVoiceRoom();
              }}
            >
              <Text style={styles.refreshButtonText}>🔄 Refresh Room Status</Text>
            </TouchableOpacity>

            {/* Join/Leave voice room button */}
            {!isInVoiceRoom ? (
              <TouchableOpacity 
                style={styles.joinRoomButton}
                onPress={handleJoinVoiceRoom}
              >
                <Text style={styles.joinRoomButtonText}>Join Voice Room</Text>
              </TouchableOpacity>
            ) : (
              <>
                {/* Push-to-talk button */}
                <TouchableOpacity 
                  style={[styles.talkButton, isTalkRecording && styles.talkButtonActive]}
                  onPressIn={startTalkRecording}
                  onPressOut={stopTalkRecording}
                  disabled={sending}
                >
                  <Mic size={48} color="white" />
                  <Text style={styles.talkButtonText}>
                    {isTalkRecording 
                      ? `Recording... (${talkRecordingDuration}s)` 
                      : 'Hold to Talk'
                    }
                  </Text>
                </TouchableOpacity>

                {/* Leave room button */}
                <TouchableOpacity 
                  style={styles.leaveRoomButton}
                  onPress={handleLeaveVoiceRoom}
                >
                  <Text style={styles.leaveRoomButtonText}>Leave Voice Room</Text>
                </TouchableOpacity>
              </>
            )}

            {/* Participants list */}
            <View style={styles.talkParticipants}>
              <Text style={styles.talkParticipantsTitle}>
                Voice Room ({voiceParticipants.length} listening)
              </Text>
              {voiceParticipants.map(participant => (
                <View key={participant.id} style={styles.talkParticipant}>
                  <View style={[
                    styles.talkParticipantStatus, 
                    { backgroundColor: participant.isListening ? '#10B981' : '#6B7280' }
                  ]} />
                  <Text style={styles.talkParticipantName}>
                    {participant.userName}
                    {participant.userId === myId ? ' (You)' : ''}
                  </Text>
                </View>
              ))}
              
              {voiceParticipants.length === 0 && (
                <Text style={styles.emptyParticipants}>
                  No one is in the voice room yet
                </Text>
              )}
            </View>
          </View>
        </View>
      )}

      {/* Members modal - only show for group chats */}
      {!isPrivateChat && (
        <GroupMemberModal
          visible={showMembers}
          onClose={() => setShowMembers(false)}
          groupName={title}
          groupId={conversationId}
          members={members}
          currentUserId={myId ?? ''}
          onCallMember={callMember}
          onMessageMember={messageMember}
          canManageMembers={canManageMembers}  // creator-only
          onMembersChanged={loadMembers}
        />
      )}

      {/* Voice Preview Modal */}
      <Modal visible={showVoicePreview} transparent animationType="slide" onRequestClose={cancelVoiceMessage}>
        <View style={styles.voicePreviewOverlay}>
          <View style={styles.voicePreviewCard}>
            <Text style={styles.voicePreviewTitle}>Voice Message</Text>
            
            <View style={styles.voicePreviewContent}>
              <Text style={styles.voicePreviewDuration}>{recordingDuration}s</Text>
              
              <TouchableOpacity 
                onPress={togglePreviewPlayback}
                style={styles.voicePreviewPlayBtn}
              >
                {isPlayingPreview ? (
                  <Pause size={32} color="white" />
                ) : (
                  <Play size={32} color="white" />
                )}
              </TouchableOpacity>
            </View>
            
            <View style={styles.voicePreviewActions}>
              <TouchableOpacity 
                style={styles.voicePreviewCancel} 
                onPress={cancelVoiceMessage}
              >
                <Text style={styles.voicePreviewCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.voicePreviewSend} 
                onPress={sendVoiceMessage}
                disabled={sending}
              >
                <Send size={16} color="white" />
                <Text style={styles.voicePreviewSendText}>
                  {sending ? 'Sending...' : 'Send'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Rename modal - only show for group chats */}
      {!isPrivateChat && (
        <Modal visible={renameOpen} transparent animationType="fade" onRequestClose={() => setRenameOpen(false)}>
          <View style={styles.renameOverlay}>
            <View style={styles.renameCard}>
              <Text style={styles.renameTitle}>Rename group</Text>
              <TextInput
                style={styles.renameInput}
                value={renameText}
                onChangeText={setRenameText}
                placeholder="Group name"
              />
              <View style={styles.renameRow}>
                <TouchableOpacity style={[styles.renameBtn, { backgroundColor: '#F3F4F6' }]} onPress={() => setRenameOpen(false)}>
                  <Text style={[styles.renameBtnTxt, { color: '#111827' }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.renameBtn, { backgroundColor: '#111827' }]} onPress={commitRename}>
                  <Text style={[styles.renameBtnTxt, { color: 'white' }]}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Read receipts modal */}
      <Modal 
        visible={!!showReadReceipts} 
        transparent 
        animationType="fade" 
        onRequestClose={() => setShowReadReceipts(null)}
      >
        <View style={styles.readReceiptsOverlay}>
          <View style={styles.readReceiptsCard}>
            <Text style={styles.readReceiptsTitle}>Read by</Text>
            
            <View style={styles.readReceiptsList}>
              {readReceipts.length > 0 ? (
                readReceipts.map(receipt => (
                  <View key={receipt.userId} style={styles.readReceiptItem}>
                    <Text style={styles.readReceiptName}>{receipt.userName}</Text>
                    <View style={styles.readReceiptStatus}>
                      <Check size={16} color="#10B981" />
                      <Text style={styles.readReceiptTime}>
                        {new Date(receipt.readAt).toLocaleString([], { 
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </Text>
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.readReceiptItem}>
                  <Text style={[styles.readReceiptName, { color: '#6B7280', fontStyle: 'italic' }]}>
                    No one has read this message yet
                  </Text>
                </View>
              )}
              
              {/* Show total read count */}
              {readReceipts.length > 0 && !isPrivateChat && (
                <View style={styles.readReceiptsSummary}>
                  <Text style={styles.readReceiptsSummaryText}>
                    {readReceipts.length} of {members.length - 1} members have read this message
                  </Text>
                </View>
              )}
            </View>
            
            <TouchableOpacity 
              style={styles.readReceiptsClose} 
              onPress={() => setShowReadReceipts(null)}
            >
              <Text style={styles.readReceiptsCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Image Viewer Modal */}
      <Modal 
        visible={showImageViewer} 
        transparent 
        animationType="fade" 
        onRequestClose={() => setShowImageViewer(false)}
      >
        <View style={styles.imageViewerOverlay}>
          <TouchableOpacity 
            style={styles.imageViewerClose}
            onPress={() => setShowImageViewer(false)}
          >
            <X size={24} color="white" />
          </TouchableOpacity>
          
          {viewingImageUrl && (
            <Image 
              source={{ uri: viewingImageUrl }} 
              style={styles.imageViewerImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>

      {/* Image Preview Modal for Multiple Images */}
      <Modal 
        visible={showImagePreview} 
        transparent 
        animationType="slide" 
        onRequestClose={() => setShowImagePreview(false)}
      >
        <View style={styles.imagePreviewOverlay}>
          <View style={styles.imagePreviewCard}>
            <Text style={styles.imagePreviewTitle}>
              Send {selectedImages.length === 1 ? 'Image' : `${selectedImages.length} Images`}
            </Text>
            
            <ScrollView style={styles.imagePreviewList} horizontal showsHorizontalScrollIndicator={false}>
              {selectedImages.map((image, index) => (
                <View key={index} style={styles.imagePreviewItem}>
                  <Image 
                    source={{ uri: image.uri }} 
                    style={styles.imagePreviewThumbnail}
                    resizeMode="cover"
                  />
                  <TouchableOpacity 
                    style={styles.imagePreviewRemove}
                    onPress={() => {
                      const newImages = selectedImages.filter((_, i) => i !== index);
                      setSelectedImages(newImages);
                      if (newImages.length === 0) {
                        setShowImagePreview(false);
                      }
                    }}
                  >
                    <X size={16} color="white" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
            
            <View style={styles.imagePreviewActions}>
              <TouchableOpacity 
                style={styles.imagePreviewCancel} 
                onPress={() => {
                  setShowImagePreview(false);
                  setSelectedImages([]);
                }}
              >
                <Text style={styles.imagePreviewCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.imagePreviewSend} 
                onPress={async () => {
                  setShowImagePreview(false);
                  await sendMultipleImages(selectedImages);
                  setSelectedImages([]);
                }}
                disabled={sending || selectedImages.length === 0}
              >
                <Send size={16} color="white" />
                <Text style={styles.imagePreviewSendText}>
                  {sending ? (sendingProgress || 'Sending...') : `Send ${selectedImages.length} image${selectedImages.length !== 1 ? 's' : ''}`}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 8, backgroundColor: '#F3F4F6' },
  title: { fontSize: 18, fontWeight: '700', color: '#111827' },
  sub: { fontSize: 12, color: '#6B7280' },

  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  smallIconBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' },
  membersIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },

  list: { flex: 1, backgroundColor: '#F9FAFB' },

  msg: { marginVertical: 6, maxWidth: '82%', borderRadius: 14, padding: 10 },
  msgMine: { alignSelf: 'flex-end', backgroundColor: '#3B82F6', borderBottomRightRadius: 4 },
  msgOther: { alignSelf: 'flex-start', backgroundColor: 'white', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#E5E7EB' },
  msgSender: { fontSize: 11, color: '#6B7280', marginBottom: 2 },
  msgSenderClickable: { textDecorationLine: 'underline', fontWeight: '600' },
  msgText: { fontSize: 15, lineHeight: 20 },
  msgTextMine: { color: 'white' },
  msgTextOther: { color: '#111827' },
  msgTime: { fontSize: 11, color: '#9CA3AF', marginTop: 4, alignSelf: 'flex-end' },
  imageContainer: {
    borderRadius: 8,
    overflow: 'hidden',
    marginVertical: 4,
  },
  msgImage: { 
    width: 180,
    height: 240, // Better for portrait images like screenshots
    backgroundColor: '#F3F4F6', // Loading background
  },
  voiceMessage: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  voiceText: { fontSize: 15 },

  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, padding: 10, borderTopWidth: 1, borderTopColor: '#E5E7EB', backgroundColor: 'white' },
  attachBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  textInput: { flex: 1, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 10, maxHeight: 120, fontSize: 16 },
  micBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center' },
  micBtnRecording: { backgroundColor: '#EF4444' },
  recordingTime: { fontSize: 8, color: 'white', position: 'absolute', bottom: 2 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center' },

  // voice preview modal styles
  voicePreviewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  voicePreviewCard: { width: '80%', backgroundColor: 'white', borderRadius: 16, padding: 20 },
  voicePreviewTitle: { fontSize: 18, fontWeight: '700', color: '#111827', textAlign: 'center', marginBottom: 20 },
  voicePreviewContent: { alignItems: 'center', marginVertical: 20 },
  voicePreviewDuration: { fontSize: 16, color: '#6B7280', marginBottom: 16 },
  voicePreviewPlayBtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center' },
  voicePreviewActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  voicePreviewCancel: { flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: '#F3F4F6', alignItems: 'center' },
  voicePreviewCancelText: { fontSize: 16, fontWeight: '600', color: '#6B7280' },
  voicePreviewSend: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 8, backgroundColor: '#10B981', gap: 6 },
  voicePreviewSendText: { fontSize: 16, fontWeight: '600', color: 'white' },

  // rename modal styles
  renameOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  renameCard: { width: '86%', backgroundColor: 'white', borderRadius: 12, padding: 16 },
  renameTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 8 },
  renameInput: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  renameRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 },
  renameBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
  renameBtnTxt: { fontWeight: '700', fontSize: 14 },

  // Message deletion and status styles
  msgDeleting: { opacity: 0.6, backgroundColor: '#FEE2E2' },
  undoContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 8, backgroundColor: '#FEE2E2', borderRadius: 8, marginBottom: 4 },
  undoText: { fontSize: 12, color: '#DC2626', flex: 1 },
  undoBtn: { paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#DC2626', borderRadius: 4 },
  undoBtnText: { fontSize: 10, fontWeight: '700', color: 'white' },
  msgFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  msgStatus: { flexDirection: 'row', alignItems: 'center', marginLeft: 8 },
  doubleCheck: { flexDirection: 'row', alignItems: 'center' },

  // Read receipts modal styles
  readReceiptsOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  readReceiptsCard: { width: '85%', maxWidth: 400, backgroundColor: 'white', borderRadius: 16, padding: 20 },
  readReceiptsTitle: { fontSize: 18, fontWeight: '700', color: '#111827', textAlign: 'center', marginBottom: 16 },
  readReceiptsList: { maxHeight: 300 },
  readReceiptItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  readReceiptName: { fontSize: 16, color: '#111827', fontWeight: '500' },
  readReceiptStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  readReceiptTime: { fontSize: 12, color: '#6B7280' },
  readReceiptsClose: { marginTop: 16, paddingVertical: 12, backgroundColor: '#F3F4F6', borderRadius: 8, alignItems: 'center' },
  readReceiptsCloseText: { fontSize: 16, fontWeight: '600', color: '#111827' },
  readReceiptsSummary: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  readReceiptsSummaryText: { fontSize: 12, color: '#6B7280', textAlign: 'center', fontStyle: 'italic' },

  // Image viewer modal styles
  imageViewerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center' },
  imageViewerClose: { position: 'absolute', top: 50, right: 20, zIndex: 1, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  imageViewerImage: { width: '90%', height: '80%' },

  // Image preview modal styles  
  imagePreviewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  imagePreviewCard: { width: '90%', maxWidth: 400, backgroundColor: 'white', borderRadius: 16, padding: 20 },
  imagePreviewTitle: { fontSize: 18, fontWeight: '700', color: '#111827', textAlign: 'center', marginBottom: 16 },
  imagePreviewList: { maxHeight: 200, marginBottom: 20 },
  imagePreviewItem: { position: 'relative', marginRight: 12 },
  imagePreviewThumbnail: { width: 80, height: 80, borderRadius: 8 },
  imagePreviewRemove: { position: 'absolute', top: -5, right: -5, width: 20, height: 20, borderRadius: 10, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center' },
  imagePreviewActions: { flexDirection: 'row', gap: 12 },
  imagePreviewCancel: { flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: '#F3F4F6', alignItems: 'center' },
  imagePreviewCancelText: { fontSize: 16, fontWeight: '600', color: '#6B7280' },
  imagePreviewSend: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 8, backgroundColor: '#10B981', gap: 6 },
  imagePreviewSendText: { fontSize: 16, fontWeight: '600', color: 'white' },

  // Loading indicators
  loadingOlderMessages: { alignItems: 'center', paddingVertical: 16 },
  loadingText: { fontSize: 14, color: '#6B7280', fontStyle: 'italic' },

  // Location message styles
  locationMessage: { 
    paddingVertical: 8,
    paddingHorizontal: 4,
    minWidth: 200,
    maxWidth: '100%',
  },
  locationHeader: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginBottom: 8,
    gap: 8,
  },
  locationDetails: { 
    paddingLeft: 28,
  },
  locationTitle: { 
    fontSize: 15, 
    fontWeight: '600',
    flex: 1,
  },
  locationAddress: { 
    fontSize: 13, 
    marginBottom: 6, 
    opacity: 0.9,
    lineHeight: 18,
  },
  locationCoords: { 
    fontSize: 11, 
    opacity: 0.7, 
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  tapToView: {
    fontSize: 11,
    opacity: 0.8,
    fontStyle: 'italic',
  },

  // Tab navigation styles
  tabContainer: { 
    flexDirection: 'row', 
    backgroundColor: 'white', 
    borderBottomWidth: 1, 
    borderBottomColor: '#E5E7EB' 
  },
  tab: { 
    flex: 1, 
    paddingVertical: 12, 
    alignItems: 'center', 
    borderBottomWidth: 2, 
    borderBottomColor: 'transparent' 
  },
  activeTab: { 
    borderBottomColor: '#3B82F6' 
  },
  tabText: { 
    fontSize: 16, 
    fontWeight: '500', 
    color: '#6B7280' 
  },
  activeTabText: { 
    color: '#3B82F6', 
    fontWeight: '600' 
  },

  // Talk tab styles
  talkContainer: { 
    flex: 1, 
    backgroundColor: '#F9FAFB' 
  },
  talkContent: { 
    flex: 1, 
    alignItems: 'center', 
    justifyContent: 'center', 
    padding: 20 
  },
  talkTitle: { 
    fontSize: 24, 
    fontWeight: '700', 
    color: '#111827', 
    marginBottom: 8 
  },
  talkSubtitle: { 
    fontSize: 16, 
    color: '#6B7280', 
    marginBottom: 40, 
    textAlign: 'center' 
  },
  talkButton: { 
    width: 160, 
    height: 160, 
    borderRadius: 80, 
    backgroundColor: '#3B82F6', 
    alignItems: 'center', 
    justifyContent: 'center', 
    marginBottom: 20,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  talkButtonActive: { 
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
    transform: [{ scale: 1.1 }]
  },
  talkButtonText: { 
    fontSize: 14, 
    fontWeight: '600', 
    color: 'white', 
    marginTop: 8, 
    textAlign: 'center' 
  },
  talkParticipants: { 
    width: '100%', 
    maxWidth: 300 
  },
  talkParticipantsTitle: { 
    fontSize: 18, 
    fontWeight: '600', 
    color: '#111827', 
    marginBottom: 16, 
    textAlign: 'center' 
  },
  talkParticipant: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingVertical: 8, 
    paddingHorizontal: 12 
  },
  talkParticipantStatus: { 
    width: 8, 
    height: 8, 
    borderRadius: 4, 
    marginRight: 12 
  },
  talkParticipantName: { 
    fontSize: 16, 
    color: '#111827' 
  },
  joinRoomButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    marginVertical: 16,
  },
  joinRoomButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  leaveRoomButton: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 16,
  },
  leaveRoomButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  emptyParticipants: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  refreshButton: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    marginBottom: 12,
  },
  refreshButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  speakerNotification: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(59, 130, 246, 0.9)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    zIndex: 10,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },
  speakerIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 12,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 4,
  },
  speakerText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
});

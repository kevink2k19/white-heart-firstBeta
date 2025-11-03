// import React, { useState, useRef, useEffect } from 'react';
// import {
//   View,
//   Text,
//   StyleSheet,
//   ScrollView,
//   TouchableOpacity,
//   TextInput,
//   Modal,
//   Alert,
//   Image,
//   Animated,
//   PanResponder,
// } from 'react-native';
// import { SafeAreaView } from 'react-native-safe-area-context';
// import {
//   Send,
//   Mic,
//   Camera,
//   Image as ImageIcon,
//   Play,
//   Pause,
//   Users,
//   Plus,
//   X,
//   Volume2,
//   MicOff,
//   Check,
//   CheckCheck,
//   Phone,
//   User,
//   MapPin,
//   Clock,
//   DollarSign,
//   Star,
//   MessageSquare,
//   FileText,
// } from 'lucide-react-native';
// import { useRouter } from 'expo-router';
// import { Linking } from 'react-native';
// import GroupMemberModal from '@/components/GroupMemberModal';

// interface Message {
//   id: string;
//   senderId: string;
//   senderName: string;
//   content: string;
//   type: 'text' | 'voice' | 'image' | 'podcast' | 'order';
//   timestamp: string;
//   duration?: number; // for voice messages
//   imageUrl?: string; // for image messages
//   isRead: boolean;
//   isDelivered: boolean;
//   orderData?: OrderData; // for order messages
// }

// interface OrderData {
//   customerName?: string;
//   customerPhone: string;
//   pickupLocation: string;
//   destination: string;
//   fareAmount: number;
//   distance: string;
//   estimatedDuration: string;
//   customerRating?: number;
//   specialInstructions?: string;
// }

// interface ChatGroup {
//   id: string;
//   name: string;
//   memberCount: number;
//   lastMessage: string;
//   lastMessageTime: string;
//   unreadCount: number;
// }

// const mockGroups: ChatGroup[] = [
//   {
//     id: '1',
//     name: 'Downtown Drivers',
//     memberCount: 24,
//     lastMessage: 'New order available - Airport pickup',
//     lastMessageTime: '2 min ago',
//     unreadCount: 3,
//   },
//   {
//     id: '2',
//     name: 'Airport Route Drivers',
//     memberCount: 18,
//     lastMessage: 'Customer waiting at Terminal 2',
//     lastMessageTime: '5 min ago',
//     unreadCount: 1,
//   },
//   {
//     id: '3',
//     name: 'Night Shift Team',
//     memberCount: 12,
//     lastMessage: 'Good evening everyone!',
//     lastMessageTime: '1 hour ago',
//     unreadCount: 0,
//   },
// ];

// const mockMessages: Message[] = [
//   {
//     id: '1',
//     senderId: 'user1',
//     senderName: 'Ko Thant',
//     content: 'Traffic is really heavy on Strand Road today. Better avoid that route.',
//     type: 'text',
//     timestamp: '10:30 AM',
//     isRead: true,
//     isDelivered: true,
//   },
//   {
//     id: '2',
//     senderId: 'user2',
//     senderName: 'Ma Khin',
//     content: '',
//     type: 'order',
//     timestamp: '10:32 AM',
//     isRead: true,
//     isDelivered: true,
//     orderData: {
//       customerName: 'Aung Kyaw',
//       customerPhone: '+95 9 123 456 789',
//       pickupLocation: 'Shwedagon Pagoda, Yangon',
//       destination: 'Yangon International Airport',
//       fareAmount: 15000,
//       distance: '18.5 km',
//       estimatedDuration: '35 min',
//       customerRating: 4.8,
//       specialInstructions: 'Customer prefers air conditioning',
//     },
//   },
//   {
//     id: '3',
//     senderId: 'user3',
//     senderName: 'Ko Aung',
//     content: '',
//     type: 'voice',
//     timestamp: '10:35 AM',
//     duration: 15,
//     isRead: false,
//     isDelivered: true,
//   },
//   {
//     id: '4',
//     senderId: 'current_user',
//     senderName: 'You',
//     content: 'Just picked up a passenger from Junction City. Heading to airport.',
//     type: 'text',
//     timestamp: '10:38 AM',
//     isRead: false,
//     isDelivered: true,
//   },
// ];

// type MessageMode = 'text' | 'order';

// export default function MessagingScreen() {
//   const router = useRouter();
//   const [selectedGroup, setSelectedGroup] = useState<ChatGroup | null>(null);
//   const [messages, setMessages] = useState<Message[]>(mockMessages);
//   const [inputText, setInputText] = useState('');
//   const [messageMode, setMessageMode] = useState<MessageMode>('text');
//   const [showOrderForm, setShowOrderForm] = useState(false);
//   const [isRecording, setIsRecording] = useState(false);
//   const [recordingDuration, setRecordingDuration] = useState(0);
//   const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
//   const [showImageModal, setShowImageModal] = useState(false);
//   const [selectedImage, setSelectedImage] = useState<string | null>(null);
//   const [isPodcastMode, setIsPodcastMode] = useState(false);
//   const [showMemberModal, setShowMemberModal] = useState(false);

//   // Order form state
//   const [orderForm, setOrderForm] = useState<OrderData>({
//     customerName: '',
//     customerPhone: '',
//     pickupLocation: '',
//     destination: '',
//     fareAmount: 0,
//     distance: '',
//     estimatedDuration: '',
//     customerRating: 5.0,
//     specialInstructions: '',
//   });

//   // Animation for recording button
//   const recordingAnim = useRef(new Animated.Value(1)).current;
//   const recordingTimer = useRef<ReturnType<typeof setInterval> | null>(null);

//   // Pan responder for push-to-talk
//   const panResponder = useRef(
//     PanResponder.create({
//       onStartShouldSetPanResponder: () => true,
//       onMoveShouldSetPanResponder: () => true,
//       onPanResponderGrant: () => {
//         startRecording();
//       },
//       onPanResponderRelease: () => {
//         stopRecording();
//       },
//     })
//   ).current;

//   useEffect(() => {
//     if (isRecording) {
//       // Start pulsing animation
//       Animated.loop(
//         Animated.sequence([
//           Animated.timing(recordingAnim, {
//             toValue: 1.2,
//             duration: 500,
//             useNativeDriver: true,
//           }),
//           Animated.timing(recordingAnim, {
//             toValue: 1,
//             duration: 500,
//             useNativeDriver: true,
//           }),
//         ])
//       ).start();

//       // Start timer
//       recordingTimer.current = setInterval(() => {
//         setRecordingDuration(prev => prev + 1);
//       }, 1000);
//     } else {
//       recordingAnim.setValue(1);
//       if (recordingTimer.current) {
//         clearInterval(recordingTimer.current);
//       }
//     }

//     return () => {
//       if (recordingTimer.current) {
//         clearInterval(recordingTimer.current);
//       }
//     };
//   }, [isRecording]);

//   const startRecording = () => {
//     setIsRecording(true);
//     setRecordingDuration(0);
//     // In real app, start audio recording here
//   };

//   const stopRecording = () => {
//     setIsRecording(false);
//     if (recordingDuration > 1) {
//       // Send voice message
//       const newMessage: Message = {
//         id: Date.now().toString(),
//         senderId: 'current_user',
//         senderName: 'You',
//         content: '',
//         type: isPodcastMode ? 'podcast' : 'voice',
//         timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
//         duration: recordingDuration,
//         isRead: false,
//         isDelivered: false,
//       };
//       setMessages(prev => [...prev, newMessage]);
//     }
//     setRecordingDuration(0);
//   };

//   const sendTextMessage = () => {
//     if (inputText.trim()) {
//       const newMessage: Message = {
//         id: Date.now().toString(),
//         senderId: 'current_user',
//         senderName: 'You',
//         content: inputText.trim(),
//         type: 'text',
//         timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
//         isRead: false,
//         isDelivered: false,
//       };
//       setMessages(prev => [...prev, newMessage]);
//       setInputText('');
//     }
//   };

//   const sendOrderMessage = () => {
//     // Validate required fields
//     if (!orderForm.customerPhone || !orderForm.pickupLocation || !orderForm.destination) {
//       Alert.alert('Error', 'Please fill in all required fields (phone, pickup, destination)');
//       return;
//     }

//     // Validate phone number
//     const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/;
//     if (!phoneRegex.test(orderForm.customerPhone)) {
//       Alert.alert('Error', 'Please enter a valid phone number');
//       return;
//     }

//     const newMessage: Message = {
//       id: Date.now().toString(),
//       senderId: 'current_user',
//       senderName: 'You',
//       content: `Order: ${orderForm.pickupLocation} → ${orderForm.destination}`,
//       type: 'order',
//       timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
//       isRead: false,
//       isDelivered: false,
//       orderData: { ...orderForm },
//     };

//     setMessages(prev => [...prev, newMessage]);
    
//     // Reset form
//     setOrderForm({
//       customerName: '',
//       customerPhone: '',
//       pickupLocation: '',
//       destination: '',
//       fareAmount: 0,
//       distance: '',
//       estimatedDuration: '',
//       customerRating: 5.0,
//       specialInstructions: '',
//     });
    
//     setShowOrderForm(false);
//     setMessageMode('text');
//   };

//   const handleAcceptOrder = async (orderData: OrderData, messageId: string) => {
//     try {
//       // Validate order data
//       if (!orderData.customerPhone || !orderData.pickupLocation || !orderData.destination) {
//         Alert.alert('Error', 'Incomplete order data. Cannot accept this order.');
//         return;
//       }

//       // Show confirmation
//       Alert.alert(
//         'Accept Order',
//         `Accept order for ${orderData.customerName || 'Customer'}?\n\nPickup: ${orderData.pickupLocation}\nDestination: ${orderData.destination}`,
//         [
//           { text: 'Cancel', style: 'cancel' },
//           {
//             text: 'Accept',
//             onPress: () => {
//               // Navigate to navigation screen with order data
//               router.push({
//                 pathname: '/(tabs)/navigation',
//                 params: {
//                   orderId: messageId,
//                   customerName: orderData.customerName || 'Customer',
//                   customerPhone: orderData.customerPhone,
//                   customerRating: orderData.customerRating?.toString() || '5.0',
//                   pickupLocation: orderData.pickupLocation,
//                   destination: orderData.destination,
//                   fareAmount: orderData.fareAmount.toString(),
//                   distance: orderData.distance,
//                   estimatedDuration: orderData.estimatedDuration,
//                 },
//               });
//             },
//           },
//         ]
//       );
//     } catch (error) {
//       console.error('Error accepting order:', error);
//       Alert.alert('Error', 'Failed to accept order. Please try again.');
//     }
//   };

//   const handleCallCustomer = async (phoneNumber: string) => {
//     try {
//       const phoneUrl = `tel:${phoneNumber}`;
//       const canOpen = await Linking.canOpenURL(phoneUrl);
      
//       if (canOpen) {
//         await Linking.openURL(phoneUrl);
//       } else {
//         Alert.alert('Error', 'Unable to make phone call from this device.');
//       }
//     } catch (error) {
//       Alert.alert('Error', 'Failed to initiate phone call.');
//     }
//   };

//   const playVoiceMessage = (messageId: string) => {
//     if (playingMessageId === messageId) {
//       setPlayingMessageId(null);
//       // Stop audio playback
//     } else {
//       setPlayingMessageId(messageId);
//       // Start audio playback
//       // Simulate playback completion
//       setTimeout(() => {
//         setPlayingMessageId(null);
//       }, 3000);
//     }
//   };

//   const formatDuration = (seconds: number) => {
//     const mins = Math.floor(seconds / 60);
//     const secs = seconds % 60;
//     return `${mins}:${secs.toString().padStart(2, '0')}`;
//   };

//   const renderStars = (rating: number) => {
//     return Array.from({ length: 5 }, (_, index) => (
//       <Star
//         key={index}
//         size={12}
//         color={index < Math.floor(rating) ? '#F59E0B' : '#E5E7EB'}
//         fill={index < Math.floor(rating) ? '#F59E0B' : '#E5E7EB'}
//       />
//     ));
//   };

//   const renderMessage = (message: Message) => {
//     const isCurrentUser = message.senderId === 'current_user';

//     return (
//       <View key={message.id} style={[
//         styles.messageContainer,
//         isCurrentUser ? styles.currentUserMessage : styles.otherUserMessage
//       ]}>
//         {!isCurrentUser && (
//           <Text style={styles.senderName}>{message.senderName}</Text>
//         )}
        
//         {message.type === 'text' && (
//           <Text style={[
//             styles.messageText,
//             isCurrentUser ? styles.currentUserText : styles.otherUserText
//           ]}>
//             {message.content}
//           </Text>
//         )}

//         {message.type === 'order' && message.orderData && (
//           <View style={styles.orderMessageContainer}>
//             <View style={styles.orderHeader}>
//               <View style={styles.orderIcon}>
//                 <FileText size={20} color="#3B82F6" />
//               </View>
//               <Text style={styles.orderTitle}>New Order Available</Text>
//             </View>
            
//             <View style={styles.orderContent}>
//               {message.orderData.customerName && (
//                 <View style={styles.orderRow}>
//                   <User size={16} color="#6B7280" />
//                   <Text style={styles.orderLabel}>Customer:</Text>
//                   <Text style={styles.orderValue}>{message.orderData.customerName}</Text>
//                   {message.orderData.customerRating && (
//                     <View style={styles.orderRating}>
//                       <View style={styles.orderStars}>
//                         {renderStars(message.orderData.customerRating)}
//                       </View>
//                       <Text style={styles.orderRatingText}>{message.orderData.customerRating}</Text>
//                     </View>
//                   )}
//                 </View>
//               )}
              
//               <View style={styles.orderRow}>
//                 <Phone size={16} color="#6B7280" />
//                 <Text style={styles.orderLabel}>Phone:</Text>
//                 <TouchableOpacity onPress={() => handleCallCustomer(message.orderData!.customerPhone)}>
//                   <Text style={[styles.orderValue, styles.phoneLink]}>{message.orderData.customerPhone}</Text>
//                 </TouchableOpacity>
//               </View>
              
//               <View style={styles.routeContainer}>
//                 <View style={styles.routePoint}>
//                   <View style={[styles.routeDot, { backgroundColor: '#10B981' }]} />
//                   <Text style={styles.routeText}>{message.orderData.pickupLocation}</Text>
//                 </View>
//                 <View style={styles.routeLine} />
//                 <View style={styles.routePoint}>
//                   <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
//                   <Text style={styles.routeText}>{message.orderData.destination}</Text>
//                 </View>
//               </View>
              
//               <View style={styles.orderMetrics}>
//                 <View style={styles.metricItem}>
//                   <MapPin size={14} color="#6B7280" />
//                   <Text style={styles.metricText}>{message.orderData.distance}</Text>
//                 </View>
//                 <View style={styles.metricItem}>
//                   <Clock size={14} color="#6B7280" />
//                   <Text style={styles.metricText}>{message.orderData.estimatedDuration}</Text>
//                 </View>
//                 <View style={styles.metricItem}>
//                   <DollarSign size={14} color="#10B981" />
//                   <Text style={[styles.metricText, styles.fareText]}>{message.orderData.fareAmount.toLocaleString()} MMK</Text>
//                 </View>
//               </View>
              
//               {message.orderData.specialInstructions && (
//                 <View style={styles.instructionsContainer}>
//                   <Text style={styles.instructionsLabel}>Special Instructions:</Text>
//                   <Text style={styles.instructionsText}>{message.orderData.specialInstructions}</Text>
//                 </View>
//               )}
//             </View>
            
//             {!isCurrentUser && (
//               <TouchableOpacity
//                 style={styles.acceptOrderButton}
//                 onPress={() => handleAcceptOrder(message.orderData!, message.id)}
//               >
//                 <Check size={16} color="white" />
//                 <Text style={styles.acceptOrderText}>Accept Order</Text>
//               </TouchableOpacity>
//             )}
//           </View>
//         )}

//         {(message.type === 'voice' || message.type === 'podcast') && (
//           <View style={styles.voiceMessageContainer}>
//             <TouchableOpacity
//               style={styles.playButton}
//               onPress={() => playVoiceMessage(message.id)}
//             >
//               {playingMessageId === message.id ? (
//                 <Pause size={20} color="white" />
//               ) : (
//                 <Play size={20} color="white" />
//               )}
//             </TouchableOpacity>
//             <View style={styles.voiceWaveform}>
//               {/* Simulated waveform */}
//               {Array.from({ length: 20 }, (_, i) => (
//                 <View
//                   key={i}
//                   style={[
//                     styles.waveformBar,
//                     {
//                       height: Math.random() * 20 + 5,
//                       backgroundColor: playingMessageId === message.id ? '#3B82F6' : '#D1D5DB'
//                     }
//                   ]}
//                 />
//               ))}
//             </View>
//             <Text style={styles.voiceDuration}>
//               {formatDuration(message.duration || 0)}
//             </Text>
//             {message.type === 'podcast' && (
//               <Volume2 size={16} color="#F59E0B" style={styles.podcastIcon} />
//             )}
//           </View>
//         )}

//         {message.type === 'image' && (
//           <TouchableOpacity
//             onPress={() => {
//               setSelectedImage(message.imageUrl || '');
//               setShowImageModal(true);
//             }}
//           >
//             <Image
//               source={{ uri: message.imageUrl }}
//               style={styles.messageImage}
//               resizeMode="cover"
//             />
//           </TouchableOpacity>
//         )}

//         <View style={styles.messageFooter}>
//           <Text style={styles.messageTime}>{message.timestamp}</Text>
//           {isCurrentUser && (
//             <View style={styles.messageStatus}>
//               {message.isRead ? (
//                 <CheckCheck size={16} color="#3B82F6" />
//               ) : message.isDelivered ? (
//                 <CheckCheck size={16} color="#9CA3AF" />
//               ) : (
//                 <Check size={16} color="#9CA3AF" />
//               )}
//             </View>
//           )}
//         </View>
//       </View>
//     );
//   };

//   const renderOrderForm = () => (
//     <Modal
//       visible={showOrderForm}
//       transparent
//       animationType="slide"
//       onRequestClose={() => setShowOrderForm(false)}
//     >
//       <View style={styles.orderFormOverlay}>
//         <View style={styles.orderFormContainer}>
//           <View style={styles.orderFormHeader}>
//             <Text style={styles.orderFormTitle}>Create Order Message</Text>
//             <TouchableOpacity
//               onPress={() => setShowOrderForm(false)}
//               style={styles.orderFormClose}
//             >
//               <X size={24} color="#6B7280" />
//             </TouchableOpacity>
//           </View>
          
//           <ScrollView style={styles.orderFormContent} showsVerticalScrollIndicator={false}>
//             <View style={styles.formGroup}>
//               <Text style={styles.formLabel}>Customer Name (Optional)</Text>
//               <TextInput
//                 style={styles.formInput}
//                 value={orderForm.customerName}
//                 onChangeText={(text) => setOrderForm({...orderForm, customerName: text})}
//                 placeholder="Enter customer name"
//               />
//             </View>
            
//             <View style={styles.formGroup}>
//               <Text style={[styles.formLabel, styles.requiredField]}>Customer Phone *</Text>
//               <TextInput
//                 style={styles.formInput}
//                 value={orderForm.customerPhone}
//                 onChangeText={(text) => setOrderForm({...orderForm, customerPhone: text})}
//                 placeholder="+95 9 123 456 789"
//                 keyboardType="phone-pad"
//               />
//             </View>
            
//             <View style={styles.formGroup}>
//               <Text style={[styles.formLabel, styles.requiredField]}>Pickup Location *</Text>
//               <TextInput
//                 style={styles.formInput}
//                 value={orderForm.pickupLocation}
//                 onChangeText={(text) => setOrderForm({...orderForm, pickupLocation: text})}
//                 placeholder="Enter pickup location"
//                 multiline
//               />
//             </View>
            
//             <View style={styles.formGroup}>
//               <Text style={[styles.formLabel, styles.requiredField]}>Destination *</Text>
//               <TextInput
//                 style={styles.formInput}
//                 value={orderForm.destination}
//                 onChangeText={(text) => setOrderForm({...orderForm, destination: text})}
//                 placeholder="Enter destination"
//                 multiline
//               />
//             </View>
            
//             <View style={styles.formRow}>
//               <View style={[styles.formGroup, { flex: 1, marginRight: 8 }]}>
//                 <Text style={styles.formLabel}>Distance</Text>
//                 <TextInput
//                   style={styles.formInput}
//                   value={orderForm.distance}
//                   onChangeText={(text) => setOrderForm({...orderForm, distance: text})}
//                   placeholder="e.g., 15.2 km"
//                 />
//               </View>
              
//               <View style={[styles.formGroup, { flex: 1, marginLeft: 8 }]}>
//                 <Text style={styles.formLabel}>Duration</Text>
//                 <TextInput
//                   style={styles.formInput}
//                   value={orderForm.estimatedDuration}
//                   onChangeText={(text) => setOrderForm({...orderForm, estimatedDuration: text})}
//                   placeholder="e.g., 25 min"
//                 />
//               </View>
//             </View>
            
//             <View style={styles.formGroup}>
//               <Text style={styles.formLabel}>Fare Amount (MMK)</Text>
//               <TextInput
//                 style={styles.formInput}
//                 value={orderForm.fareAmount.toString()}
//                 onChangeText={(text) => setOrderForm({...orderForm, fareAmount: parseInt(text) || 0})}
//                 placeholder="15000"
//                 keyboardType="numeric"
//               />
//             </View>
            
//             <View style={styles.formGroup}>
//               <Text style={styles.formLabel}>Special Instructions</Text>
//               <TextInput
//                 style={[styles.formInput, styles.textArea]}
//                 value={orderForm.specialInstructions}
//                 onChangeText={(text) => setOrderForm({...orderForm, specialInstructions: text})}
//                 placeholder="Any special requirements or notes..."
//                 multiline
//                 numberOfLines={3}
//               />
//             </View>
//           </ScrollView>
          
//           <View style={styles.orderFormActions}>
//             <TouchableOpacity
//               style={styles.orderFormCancel}
//               onPress={() => setShowOrderForm(false)}
//             >
//               <Text style={styles.orderFormCancelText}>Cancel</Text>
//             </TouchableOpacity>
//             <TouchableOpacity
//               style={styles.orderFormSend}
//               onPress={sendOrderMessage}
//             >
//               <Send size={16} color="white" />
//               <Text style={styles.orderFormSendText}>Send Order</Text>
//             </TouchableOpacity>
//           </View>
//         </View>
//       </View>
//     </Modal>
//   );

//   const renderGroupList = () => (
//     <View style={styles.groupList}>
//       <View style={styles.groupListHeader}>
//         <Text style={styles.groupListTitle}>Driver Groups</Text>
//         <TouchableOpacity style={styles.addGroupButton}>
//           <Plus size={20} color="#3B82F6" />
//         </TouchableOpacity>
//       </View>
      
//       {mockGroups.map(group => (
//         <TouchableOpacity
//           key={group.id}
//           style={styles.groupItem}
//           onPress={() => setSelectedGroup(group)}
//         >
//           <View style={styles.groupAvatar}>
//             <Users size={24} color="#6B7280" />
//           </View>
//           <View style={styles.groupInfo}>
//             <View style={styles.groupHeader}>
//               <Text style={styles.groupName}>{group.name}</Text>
//               <Text style={styles.groupTime}>{group.lastMessageTime}</Text>
//             </View>
//             <View style={styles.groupFooter}>
//               <Text style={styles.groupLastMessage} numberOfLines={1}>
//                 {group.lastMessage}
//               </Text>
//               <Text style={styles.groupMembers}>{group.memberCount} members</Text>
//             </View>
//           </View>
//           {group.unreadCount > 0 && (
//             <View style={styles.unreadBadge}>
//               <Text style={styles.unreadCount}>{group.unreadCount}</Text>
//             </View>
//           )}
//         </TouchableOpacity>
//       ))}
//     </View>
//   );

//   const renderChat = () => (
//     <View style={styles.chatContainer}>
//       {/* Chat Header */}
//       <View style={styles.chatHeader}>
//         <TouchableOpacity
//           style={styles.backButton}
//           onPress={() => setSelectedGroup(null)}
//         >
//           <X size={24} color="#1F2937" />
//         </TouchableOpacity>
//         <View style={styles.chatHeaderInfo}>
//           <TouchableOpacity onPress={() => setShowMemberModal(true)}>
//             <Text style={styles.chatTitle}>{selectedGroup?.name}</Text>
//             <Text style={styles.chatSubtitle}>{selectedGroup?.memberCount} members • Tap to view</Text>
//           </TouchableOpacity>
//         </View>
//         <TouchableOpacity
//           style={[styles.podcastToggle, isPodcastMode && styles.podcastToggleActive]}
//           onPress={() => setIsPodcastMode(!isPodcastMode)}
//         >
//           <Volume2 size={20} color={isPodcastMode ? 'white' : '#6B7280'} />
//         </TouchableOpacity>
//       </View>

//       {/* Messages */}
//       <ScrollView style={styles.messagesContainer} showsVerticalScrollIndicator={false}>
//         {messages.map(renderMessage)}
//       </ScrollView>

//       {/* Recording Indicator */}
//       {isRecording && (
//         <View style={styles.recordingIndicator}>
//           <View style={styles.recordingDot} />
//           <Text style={styles.recordingText}>
//             Recording... {formatDuration(recordingDuration)}
//           </Text>
//           <Text style={styles.recordingHint}>Release to send</Text>
//         </View>
//       )}

//       {/* Message Mode Selector */}
//       <View style={styles.modeSelector}>
//         <TouchableOpacity
//           style={[
//             styles.modeButton,
//             messageMode === 'text' && styles.modeButtonActive
//           ]}
//           onPress={() => setMessageMode('text')}
//         >
//           <MessageSquare size={16} color={messageMode === 'text' ? 'white' : '#6B7280'} />
//           <Text style={[
//             styles.modeButtonText,
//             messageMode === 'text' && styles.modeButtonTextActive
//           ]}>Text</Text>
//         </TouchableOpacity>
        
//         <TouchableOpacity
//           style={[
//             styles.modeButton,
//             messageMode === 'order' && styles.modeButtonActive
//           ]}
//           onPress={() => {
//             setMessageMode('order');
//             setShowOrderForm(true);
//           }}
//         >
//           <FileText size={16} color={messageMode === 'order' ? 'white' : '#6B7280'} />
//           <Text style={[
//             styles.modeButtonText,
//             messageMode === 'order' && styles.modeButtonTextActive
//           ]}>Order</Text>
//         </TouchableOpacity>
//       </View>

//       {/* Input Area */}
//       {messageMode === 'text' && (
//         <View style={styles.inputContainer}>
//           <View style={styles.inputRow}>
//             <TextInput
//               style={styles.textInput}
//               placeholder="Type a message..."
//               value={inputText}
//               onChangeText={setInputText}
//               multiline
//               maxLength={500}
//             />
            
//             <View style={styles.inputActions}>
//               <TouchableOpacity style={styles.attachButton}>
//                 <Camera size={20} color="#6B7280" />
//               </TouchableOpacity>
              
//               <TouchableOpacity style={styles.attachButton}>
//                 <ImageIcon size={20} color="#6B7280" />
//               </TouchableOpacity>

//               {inputText.trim() ? (
//                 <TouchableOpacity style={styles.sendButton} onPress={sendTextMessage}>
//                   <Send size={20} color="white" />
//                 </TouchableOpacity>
//               ) : (
//                 <Animated.View
//                   style={[styles.micButton, { transform: [{ scale: recordingAnim }] }]}
//                   {...panResponder.panHandlers}
//                 >
//                   <TouchableOpacity style={styles.micButtonInner}>
//                     {isRecording ? (
//                       <MicOff size={20} color="white" />
//                     ) : (
//                       <Mic size={20} color="white" />
//                     )}
//                   </TouchableOpacity>
//                 </Animated.View>
//               )}
//             </View>
//           </View>
          
//           {isPodcastMode && (
//             <Text style={styles.podcastModeText}>
//               🎙️ Podcast mode: Long-press mic for walkie-talkie style recording
//             </Text>
//           )}
//         </View>
//       )}

//       {/* Order Form Modal */}
//       {renderOrderForm()}

//       {/* Group Member Modal */}
//       <GroupMemberModal
//         visible={showMemberModal}
//         onClose={() => setShowMemberModal(false)}
//         groupName={selectedGroup?.name || ''}
//         groupId={selectedGroup?.id || ''}
//         members={[]}
//         currentUserId="current_user"
//         onCallMember={(memberId, phone) => {
//           handleCallCustomer(phone);
//           setShowMemberModal(false);
//         }}
//         onMessageMember={(memberId) => {
//           Alert.alert('Private Message', `Starting private chat with member ${memberId}`);
//           setShowMemberModal(false);
//         }}
//       />
//     </View>
//   );

//   return (
//     <SafeAreaView style={styles.container}>
//       {selectedGroup ? renderChat() : renderGroupList()}

//       {/* Image Modal */}
//       <Modal
//         visible={showImageModal}
//         transparent
//         animationType="fade"
//         onRequestClose={() => setShowImageModal(false)}
//       >
//         <View style={styles.imageModalOverlay}>
//           <TouchableOpacity
//             style={styles.imageModalClose}
//             onPress={() => setShowImageModal(false)}
//           >
//             <X size={24} color="white" />
//           </TouchableOpacity>
//           {selectedImage && (
//             <Image
//               source={{ uri: selectedImage }}
//               style={styles.fullScreenImage}
//               resizeMode="contain"
//             />
//           )}
//         </View>
//       </Modal>
//     </SafeAreaView>
//   );
// }

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     backgroundColor: '#F9FAFB',
//   },
//   groupList: {
//     flex: 1,
//   },
//   groupListHeader: {
//     flexDirection: 'row',
//     justifyContent: 'space-between',
//     alignItems: 'center',
//     paddingHorizontal: 20,
//     paddingVertical: 16,
//     backgroundColor: 'white',
//     borderBottomWidth: 1,
//     borderBottomColor: '#E5E7EB',
//   },
//   groupListTitle: {
//     fontSize: 24,
//     fontWeight: 'bold',
//     color: '#1F2937',
//   },
//   addGroupButton: {
//     width: 40,
//     height: 40,
//     borderRadius: 20,
//     backgroundColor: '#EBF4FF',
//     alignItems: 'center',
//     justifyContent: 'center',
//   },
//   groupItem: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     paddingHorizontal: 20,
//     paddingVertical: 16,
//     backgroundColor: 'white',
//     borderBottomWidth: 1,
//     borderBottomColor: '#F3F4F6',
//   },
//   groupAvatar: {
//     width: 50,
//     height: 50,
//     borderRadius: 25,
//     backgroundColor: '#F3F4F6',
//     alignItems: 'center',
//     justifyContent: 'center',
//     marginRight: 12,
//   },
//   groupInfo: {
//     flex: 1,
//   },
//   groupHeader: {
//     flexDirection: 'row',
//     justifyContent: 'space-between',
//     alignItems: 'center',
//     marginBottom: 4,
//   },
//   groupName: {
//     fontSize: 16,
//     fontWeight: '600',
//     color: '#1F2937',
//   },
//   groupTime: {
//     fontSize: 12,
//     color: '#6B7280',
//   },
//   groupFooter: {
//     flexDirection: 'row',
//     justifyContent: 'space-between',
//     alignItems: 'center',
//   },
//   groupLastMessage: {
//     fontSize: 14,
//     color: '#6B7280',
//     flex: 1,
//     marginRight: 8,
//   },
//   groupMembers: {
//     fontSize: 12,
//     color: '#9CA3AF',
//   },
//   unreadBadge: {
//     backgroundColor: '#EF4444',
//     borderRadius: 10,
//     minWidth: 20,
//     height: 20,
//     alignItems: 'center',
//     justifyContent: 'center',
//     marginLeft: 8,
//   },
//   unreadCount: {
//     color: 'white',
//     fontSize: 12,
//     fontWeight: '600',
//   },
//   chatContainer: {
//     flex: 1,
//   },
//   chatHeader: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     paddingHorizontal: 16,
//     paddingVertical: 12,
//     backgroundColor: 'white',
//     borderBottomWidth: 1,
//     borderBottomColor: '#E5E7EB',
//   },
//   backButton: {
//     width: 40,
//     height: 40,
//     borderRadius: 20,
//     alignItems: 'center',
//     justifyContent: 'center',
//     marginRight: 8,
//   },
//   chatHeaderInfo: {
//     flex: 1,
//   },
//   chatTitle: {
//     fontSize: 18,
//     fontWeight: '600',
//     color: '#1F2937',
//   },
//   chatSubtitle: {
//     fontSize: 14,
//     color: '#6B7280',
//   },
//   podcastToggle: {
//     width: 40,
//     height: 40,
//     borderRadius: 20,
//     backgroundColor: '#F3F4F6',
//     alignItems: 'center',
//     justifyContent: 'center',
//   },
//   podcastToggleActive: {
//     backgroundColor: '#F59E0B',
//   },
//   messagesContainer: {
//     flex: 1,
//     paddingHorizontal: 16,
//     paddingVertical: 8,
//   },
//   messageContainer: {
//     marginVertical: 4,
//     maxWidth: '80%',
//   },
//   currentUserMessage: {
//     alignSelf: 'flex-end',
//     backgroundColor: '#3B82F6',
//     borderRadius: 16,
//     borderBottomRightRadius: 4,
//     padding: 12,
//   },
//   otherUserMessage: {
//     alignSelf: 'flex-start',
//     backgroundColor: 'white',
//     borderRadius: 16,
//     borderBottomLeftRadius: 4,
//     padding: 12,
//     shadowColor: '#000',
//     shadowOffset: { width: 0, height: 1 },
//     shadowOpacity: 0.1,
//     shadowRadius: 2,
//     elevation: 1,
//   },
//   senderName: {
//     fontSize: 12,
//     fontWeight: '600',
//     color: '#6B7280',
//     marginBottom: 4,
//   },
//   messageText: {
//     fontSize: 16,
//     lineHeight: 20,
//   },
//   currentUserText: {
//     color: 'white',
//   },
//   otherUserText: {
//     color: '#1F2937',
//   },
//   orderMessageContainer: {
//     backgroundColor: '#F8FAFC',
//     borderRadius: 12,
//     padding: 16,
//     borderWidth: 1,
//     borderColor: '#E2E8F0',
//     minWidth: 280,
//   },
//   orderHeader: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     marginBottom: 12,
//   },
//   orderIcon: {
//     width: 32,
//     height: 32,
//     borderRadius: 16,
//     backgroundColor: '#EBF4FF',
//     alignItems: 'center',
//     justifyContent: 'center',
//     marginRight: 8,
//   },
//   orderTitle: {
//     fontSize: 16,
//     fontWeight: '600',
//     color: '#1F2937',
//   },
//   orderContent: {
//     marginBottom: 12,
//   },
//   orderRow: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     marginBottom: 8,
//   },
//   orderLabel: {
//     fontSize: 14,
//     color: '#6B7280',
//     marginLeft: 8,
//     marginRight: 4,
//     fontWeight: '500',
//   },
//   orderValue: {
//     fontSize: 14,
//     color: '#1F2937',
//     fontWeight: '500',
//     flex: 1,
//   },
//   phoneLink: {
//     color: '#3B82F6',
//     textDecorationLine: 'underline',
//   },
//   orderRating: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     marginLeft: 8,
//   },
//   orderStars: {
//     flexDirection: 'row',
//     marginRight: 4,
//   },
//   orderRatingText: {
//     fontSize: 12,
//     color: '#6B7280',
//     fontWeight: '500',
//   },
//   routeContainer: {
//     marginVertical: 8,
//   },
//   routePoint: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     marginBottom: 4,
//   },
//   routeDot: {
//     width: 8,
//     height: 8,
//     borderRadius: 4,
//     marginRight: 8,
//   },
//   routeText: {
//     fontSize: 14,
//     color: '#374151',
//     flex: 1,
//   },
//   routeLine: {
//     width: 2,
//     height: 12,
//     backgroundColor: '#D1D5DB',
//     marginLeft: 3,
//     marginVertical: -2,
//   },
//   orderMetrics: {
//     flexDirection: 'row',
//     justifyContent: 'space-between',
//     backgroundColor: 'white',
//     padding: 8,
//     borderRadius: 8,
//     marginTop: 8,
//   },
//   metricItem: {
//     flexDirection: 'row',
//     alignItems: 'center',
//   },
//   metricText: {
//     fontSize: 12,
//     color: '#6B7280',
//     marginLeft: 4,
//     fontWeight: '500',
//   },
//   fareText: {
//     color: '#10B981',
//     fontWeight: '600',
//   },
//   instructionsContainer: {
//     marginTop: 8,
//     padding: 8,
//     backgroundColor: '#FEF3C7',
//     borderRadius: 6,
//   },
//   instructionsLabel: {
//     fontSize: 12,
//     color: '#92400E',
//     fontWeight: '600',
//     marginBottom: 2,
//   },
//   instructionsText: {
//     fontSize: 12,
//     color: '#92400E',
//   },
//   acceptOrderButton: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     justifyContent: 'center',
//     backgroundColor: '#10B981',
//     paddingVertical: 10,
//     borderRadius: 8,
//     gap: 6,
//   },
//   acceptOrderText: {
//     color: 'white',
//     fontSize: 14,
//     fontWeight: '600',
//   },
//   voiceMessageContainer: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     minWidth: 200,
//   },
//   playButton: {
//     width: 32,
//     height: 32,
//     borderRadius: 16,
//     backgroundColor: '#3B82F6',
//     alignItems: 'center',
//     justifyContent: 'center',
//     marginRight: 8,
//   },
//   voiceWaveform: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     flex: 1,
//     height: 20,
//     marginRight: 8,
//   },
//   waveformBar: {
//     width: 2,
//     marginHorizontal: 1,
//     borderRadius: 1,
//   },
//   voiceDuration: {
//     fontSize: 12,
//     color: '#6B7280',
//   },
//   podcastIcon: {
//     marginLeft: 4,
//   },
//   messageImage: {
//     width: 200,
//     height: 150,
//     borderRadius: 8,
//   },
//   messageFooter: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     justifyContent: 'flex-end',
//     marginTop: 4,
//   },
//   messageTime: {
//     fontSize: 12,
//     color: '#9CA3AF',
//     marginRight: 4,
//   },
//   messageStatus: {
//     marginLeft: 4,
//   },
//   recordingIndicator: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     backgroundColor: '#EF4444',
//     paddingHorizontal: 16,
//     paddingVertical: 8,
//   },
//   recordingDot: {
//     width: 8,
//     height: 8,
//     borderRadius: 4,
//     backgroundColor: 'white',
//     marginRight: 8,
//   },
//   recordingText: {
//     color: 'white',
//     fontWeight: '600',
//     marginRight: 8,
//   },
//   recordingHint: {
//     color: 'white',
//     fontSize: 12,
//     opacity: 0.8,
//   },
//   modeSelector: {
//     flexDirection: 'row',
//     backgroundColor: 'white',
//     paddingHorizontal: 16,
//     paddingVertical: 8,
//     borderTopWidth: 1,
//     borderTopColor: '#E5E7EB',
//     gap: 8,
//   },
//   modeButton: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     paddingHorizontal: 12,
//     paddingVertical: 8,
//     borderRadius: 20,
//     backgroundColor: '#F3F4F6',
//     gap: 6,
//   },
//   modeButtonActive: {
//     backgroundColor: '#3B82F6',
//   },
//   modeButtonText: {
//     fontSize: 14,
//     color: '#6B7280',
//     fontWeight: '500',
//   },
//   modeButtonTextActive: {
//     color: 'white',
//   },
//   inputContainer: {
//     backgroundColor: 'white',
//     borderTopWidth: 1,
//     borderTopColor: '#E5E7EB',
//     paddingHorizontal: 16,
//     paddingVertical: 8,
//   },
//   inputRow: {
//     flexDirection: 'row',
//     alignItems: 'flex-end',
//   },
//   textInput: {
//     flex: 1,
//     borderWidth: 1,
//     borderColor: '#D1D5DB',
//     borderRadius: 20,
//     paddingHorizontal: 16,
//     paddingVertical: 8,
//     maxHeight: 100,
//     fontSize: 16,
//     marginRight: 8,
//   },
//   inputActions: {
//     flexDirection: 'row',
//     alignItems: 'center',
//   },
//   attachButton: {
//     width: 40,
//     height: 40,
//     borderRadius: 20,
//     alignItems: 'center',
//     justifyContent: 'center',
//     marginRight: 4,
//   },
//   sendButton: {
//     width: 40,
//     height: 40,
//     borderRadius: 20,
//     backgroundColor: '#3B82F6',
//     alignItems: 'center',
//     justifyContent: 'center',
//   },
//   micButton: {
//     width: 40,
//     height: 40,
//   },
//   micButtonInner: {
//     width: 40,
//     height: 40,
//     borderRadius: 20,
//     backgroundColor: '#10B981',
//     alignItems: 'center',
//     justifyContent: 'center',
//   },
//   podcastModeText: {
//     fontSize: 12,
//     color: '#F59E0B',
//     textAlign: 'center',
//     marginTop: 4,
//     fontStyle: 'italic',
//   },
//   orderFormOverlay: {
//     flex: 1,
//     backgroundColor: 'rgba(0, 0, 0, 0.5)',
//     justifyContent: 'flex-end',
//   },
//   orderFormContainer: {
//     backgroundColor: 'white',
//     borderTopLeftRadius: 20,
//     borderTopRightRadius: 20,
//     maxHeight: '90%',
//   },
//   orderFormHeader: {
//     flexDirection: 'row',
//     justifyContent: 'space-between',
//     alignItems: 'center',
//     paddingHorizontal: 20,
//     paddingVertical: 16,
//     borderBottomWidth: 1,
//     borderBottomColor: '#E5E7EB',
//   },
//   orderFormTitle: {
//     fontSize: 18,
//     fontWeight: '600',
//     color: '#1F2937',
//   },
//   orderFormClose: {
//     width: 32,
//     height: 32,
//     borderRadius: 16,
//     backgroundColor: '#F3F4F6',
//     alignItems: 'center',
//     justifyContent: 'center',
//   },
//   orderFormContent: {
//     paddingHorizontal: 20,
//     paddingVertical: 16,
//     maxHeight: 400,
//   },
//   formGroup: {
//     marginBottom: 16,
//   },
//   formRow: {
//     flexDirection: 'row',
//     marginBottom: 16,
//   },
//   formLabel: {
//     fontSize: 14,
//     fontWeight: '500',
//     color: '#374151',
//     marginBottom: 6,
//   },
//   requiredField: {
//     color: '#EF4444',
//   },
//   formInput: {
//     borderWidth: 1,
//     borderColor: '#D1D5DB',
//     borderRadius: 8,
//     paddingHorizontal: 12,
//     paddingVertical: 10,
//     fontSize: 16,
//     color: '#1F2937',
//   },
//   textArea: {
//     height: 80,
//     textAlignVertical: 'top',
//   },
//   orderFormActions: {
//     flexDirection: 'row',
//     paddingHorizontal: 20,
//     paddingVertical: 16,
//     borderTopWidth: 1,
//     borderTopColor: '#E5E7EB',
//     gap: 12,
//   },
//   orderFormCancel: {
//     flex: 1,
//     paddingVertical: 12,
//     borderRadius: 8,
//     backgroundColor: '#F3F4F6',
//     alignItems: 'center',
//   },
//   orderFormCancelText: {
//     fontSize: 16,
//     fontWeight: '600',
//     color: '#6B7280',
//   },
//   orderFormSend: {
//     flex: 2,
//     flexDirection: 'row',
//     alignItems: 'center',
//     justifyContent: 'center',
//     paddingVertical: 12,
//     borderRadius: 8,
//     backgroundColor: '#3B82F6',
//     gap: 6,
//   },
//   orderFormSendText: {
//     fontSize: 16,
//     fontWeight: '600',
//     color: 'white',
//   },
//   imageModalOverlay: {
//     flex: 1,
//     backgroundColor: 'rgba(0, 0, 0, 0.9)',
//     justifyContent: 'center',
//     alignItems: 'center',
//   },
//   imageModalClose: {
//     position: 'absolute',
//     top: 50,
//     right: 20,
//     zIndex: 1,
//     width: 40,
//     height: 40,
//     borderRadius: 20,
//     backgroundColor: 'rgba(0, 0, 0, 0.5)',
//     alignItems: 'center',
//     justifyContent: 'center',
//   },
//   fullScreenImage: {
//     width: '90%',
//     height: '70%',
//   },
// });
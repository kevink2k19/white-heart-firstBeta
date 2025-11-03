export type ApiGroup = {
  id: string;
  name: string;
  memberCount: number;
  lastMessage: string;
  lastMessageAt: string; // ISO
  unreadCount: number;
};

export type OrderPayload = {
  customerName?: string;
  customerPhone: string;
  pickupLocation: string;
  destination: string;
  fareAmount: number;
  distance: string;
  estimatedDuration: string;
  customerRating?: number;
  specialInstructions?: string;
};

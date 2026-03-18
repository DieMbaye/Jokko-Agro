// services/message.interfaces.ts
export interface Conversation {
  id?: string;
  buyerId: string;
  buyerName: string;
  buyerAvatar: string;
  producerId: string;
  producerName: string;
  producerAvatar: string;
  productId?: string;
  productName?: string;
  lastMessage: string;
  lastMessageTime: Date;
  unreadCount: number;
  unreadBy: {
    buyer: number;
    producer: number;
  };
  status: 'active' | 'archived' | 'blocked' | 'deleted';
  isTyping: {
    buyer: boolean;
    producer: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
  participants: string[];
}

export interface Message {
  id?: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  senderRole: 'producer' | 'buyer';
  content: string;
  timestamp: Date;
  read: boolean;
  readBy: string[];
  delivered: boolean;
  type: 'text' | 'image' | 'file';
}

export interface Producer {
  id: string;
  name: string;
  farmName: string;
  avatar: string;
  location: string;
  rating: number;
  reviews: number;
  description: string;
  phone: string;
  email: string;
  certifications: string[];
  isOrganic: boolean;
  isOnline: boolean;
  lastSeen: Date;
  productsCount: number;
  responseRate: number;
  averageResponseTime: number;
}

export interface UserData {
  rating: number;
  responseRate: number;
  responseTime: number;
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'producer' | 'buyer';
  avatar: string;
  location?: string;
  farmName?: string;
  description?: string;
  certifications?: string[];
  isOrganic?: boolean;
  joinedDate: Date;
  lastSeen: Date;
  isOnline: boolean;
  stats: {
    rating: number;
    responseRate: number;
    responseTime: number;
  };
}

export interface NewConversationModalData {
  show: boolean;
  searchQuery: string;
  selectedProducerId: string;
  message: string;
  isLoading: boolean;
}

export interface ProfileModalData {
  show: boolean;
  userName: string;
  userAvatar: string;
  userRole: 'producer' | 'buyer';
  location?: string;
  email?: string;
  phone?: string;
  farmName?: string;
  description?: string;
  certifications?: string[];
  joinedDate: Date;
  stats: {
    rating: number;
    responseRate: number;
    responseTime: number;
  };
}

export interface Product {
  id?: string;
  name: string;
  category: string;
  description: string;
  price: number;
  quantity: number;
  unit: string;
  certifications?: string[];
  isOrganic?: boolean;
  harvestDate?: string;
  expirationDate?: string;
  storageConditions?: string;
  location: string;
  contactPhone: string;
  minOrderQuantity: number;
  producerId: string;
  producerName: string;
  producerPhone: string;
  images: string[];
  status: 'available' | 'sold_out' | 'inactive' | 'certification';
  views: number;
  sales: number;
  rating: number;
  totalRating?: number;
  ratingCount?: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;

  // Certification améliorée
  certification?: {
    id?: string;
    type?: 'standard' | 'certified' | 'in_progress';
    level?: 'bronze' | 'silver' | 'gold';
    score?: number;
    verificationDate?: Date;
    validUntil?: Date;
    template?: string;
    status?: string;
    startDate?: Date;
    estimatedEndDate?: Date;
    traceability?: any;
    qrCodeUrl?: string;
    certificateUrl?: string;
    verificationUrl?: string;
    details?: any;

    // NOUVEAUX CHAMPS POUR LA CERTIFICATION
    checkpoints?: Array<{
      id: string;
      title: string;
      description: string;
      step: string;
      order: number;
      daysFromStart: number;
      completed: boolean;
      completedAt?: Date;
      photoUrl?: string;
      location?: { lat: number; lng: number };
      blockchainVerified?: boolean;
    }>;
    totalCheckpoints?: number;
    completedCheckpoints?: number;
    progress?: number;
    currentStep?: number;
  };

  badges?: Array<{
    id: string;
    label: string;
    icon: string;
    color: string;
  }>;

  featuredImage?: string;
  certificationInProgress?: boolean;
  certificationStartDate?: string;
  isPendingCertification?: boolean;
}

export interface Sale {
  id: string;
  orderNumber: string;
  buyerId: string;
  buyerName: string;
  buyerPhone: string;
  buyerLocation: string;
  producerId: string;
  producerName: string;
  producerPhone: string;
  productId: string;
  productName: string;
  productCategory: string;
  quantity: number;
  unitPrice: number; // Prix unitaire original
  discountedUnitPrice?: number; // Prix unitaire après réduction
  discountAmount?: number; // Montant de la réduction par unité
  discountPercentage?: number; // Pourcentage de réduction
  totalAmount: number; // Montant total APRÈS réductions
  totalBeforeDiscount?: number; // Montant total avant réductions
  deliveryFee: number;

  // Statuts
  status:
    | 'pending'
    | 'confirmed'
    | 'shipped'
    | 'delivered'
    | 'completed'
    | 'cancelled'
    | 'refunded';
  paymentMethod:
    | 'wave'
    | 'orange_money'
    | 'free_money'
    | 'cash'
    | 'credit_card'
    | 'mobile_money';
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded' | 'partial';
  deliveryType: 'pickup' | 'delivery';

  // Dates
  orderDate: Date;
  deliveryDate?: Date;
  completionDate?: Date;
  createdAt: Date;
  updatedAt: Date;

  // Notes et adresse
  deliveryAddress?: string;
  notes?: string;

  // Évaluations
  rating?: number;
  review?: string;

  // MÉTADONNÉES DE RÉDUCTION (NOUVEAU)
  appliedDiscounts?: {
    type: 'coupon' | 'bulk' | 'promotion' | 'seasonal';
    code?: string;
    description: string;
    amount: number;
    percentage?: number;
  }[];

  // INFORMATIONS AGC (AMÉLIORÉ)
  agcUsed?: number; // Nombre d'AGC utilisés
  agcValue?: number; // Valeur en FCFA des AGC utilisés (1 AGC = 100 FCFA)
  agcStatus?: 'none' | 'locked' | 'released' | 'cancelled' | 'partial';
  agcLockId?: string; // ID du lock AGC
  agcTransactionRef?: string; // Référence de transaction
  agcReleasedAt?: Date; // Date de libération
  agcCancelledAt?: Date; // Date d'annulation
  agcPartialAmount?: number; // Montant partiel si pas assez d'AGC

  // MÉTADONNÉES
  metadata?: {
    platformFee?: number;
    tax?: number;
    appliedPromotions?: string[];
    couponCode?: string;
    couponDiscount?: number;
    bulkDiscount?: number;
    paymentFee?: number;
    originalTotal?: number; // Total original avant toutes réductions
    finalTotal?: number; // Total final après toutes réductions
  };
}

// interfaces/data.interfaces.ts - Mettre à jour SalesStats

export interface SalesStats {
  totalRevenue: number;
  totalSales: number;
  averageOrderValue: number;
  completionRate: number;
  averageRating: number;
  pendingOrders: number;
  activeOrders: number;
  cancelledOrders: number;
  monthlyRevenue: {
    month: string;
    revenue: number;
    sales: number;
  }[];
  topProducts: {
    productId: string;
    productName: string;
    salesCount: number;
    revenue: number;
  }[];
  topBuyers: {
    buyerId: string;
    buyerName: string;
    purchaseCount: number;
    totalSpent: number;
  }[];
  byStatus: {
    pending: number;
    confirmed: number;
    shipped: number;
    delivered: number;
    completed: number;
    cancelled: number;
    refunded: number;
  };
  byPaymentMethod: {
    wave: number;
    orange_money: number;
    free_money: number;
    cash: number;
    credit_card: number;
    mobile_money: number;
  };
  byDeliveryType: {
    pickup: number;
    delivery: number;
  };
  dailyStats?: {
    date: string;
    revenue: number;
    orders: number;
  }[];
  weeklyTrend?: number;
  monthlyTrend?: number;
  predictedRevenue?: number;
  bestSellingDay?: string;
  peakHour?: string;

  // ✅ AJOUT DES STATISTIQUES MANQUANTES
  totalDiscounts?: number;
  agcStats?: {
    totalAgcUsed: number;
    totalAgcValue: number;
    agcLocked: number;
    agcReleased: number;
    agcCancelled: number;
  };
}

export interface SalesFilter {
  period: 'today' | 'week' | 'month' | 'quarter' | 'year' | 'all' | 'custom';
  startDate?: Date;
  endDate?: Date;
  status?: Sale['status'] | 'all';
  paymentMethod?: Sale['paymentMethod'] | 'all';
  deliveryType?: Sale['deliveryType'] | 'all';
  minAmount?: number;
  maxAmount?: number;
  productId?: string;
  buyerId?: string;
  searchQuery?: string;
}

export interface StatCard {
  id: string;
  label: string;
  value: number;
  change: number;
  trend: 'up' | 'down' | 'neutral';
  icon: string;
  color: string;
  prefix?: string;
  suffix?: string;
  format?: 'currency' | 'number' | 'percentage' | 'rating';
}

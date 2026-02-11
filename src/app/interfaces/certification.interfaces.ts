
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
  featuredImage?: string; // Ajoutez cette ligne
  certificationInProgress?: boolean; // Ajoutez cette ligne
  certificationStartDate?: string; // Ajoutez cette ligne
  certification?: {
    id?: string;
    type?: 'standard' | 'certified' | 'in_progress';
    level?: 'bronze' | 'silver' | 'gold';
    score?: number;
    verificationDate?: Date;
    validUntil?: Date;
    template?: string;
    status?: string; // Ajoutez cette ligne
    startDate?: Date; // Ajoutez cette ligne
    estimatedEndDate?: Date; // Ajoutez cette ligne
    traceability?: {
      startDate: Date;
      harvestDate: Date;
      location: string;
      checkpointsCompleted: number;
      totalCheckpoints: number;
      proofs: Array<{
        type: string;
        date: Date;
        verified: boolean;
      }>;
    };
    qrCodeUrl?: string;
    certificateUrl?: string;
    verificationUrl?: string;
    details?: any;
  };
  badges?: Array<{
    id: string;
    label: string;
    icon: string;
    color: string;
  }>;
}

export interface CertificationCheckpoint {
  id: string;
  order: number;
  dayOffset: number;
  title: string;
  description: string;
  instructions: string;
  required: boolean;
  requiredProofs: ('photo' | 'gps' | 'measurement' | 'note')[];
  measurementType?: 'weight' | 'height' | 'count' | 'volume';
  measurementUnit?: string;
  completed: boolean;
  completedAt?: Date;
  proofs: CheckpointProof[];
  proofsCount?: number;
  blockchainTransactionId?: string;
  blockchainProofHash?: string;
  blockchainVerified?: boolean;
  lastBlockchainCheck?: Date;
  blockchainTimestamp?: Date;
  blockNumber?: number;
  ipfsCID?: string;
  ipfsURL?: string;
  autoVerified: boolean;
  verificationScore: number;
  verificationNotes?: string;
  gpsConsistency?: boolean;
  timeConsistency?: boolean;
  photoConsistency?: boolean;
  notified: boolean;
  notificationSentAt?: Date;
  reminderCount: number;
}

export interface CheckpointProof {
  type: 'photo' | 'gps' | 'measurement' | 'note';
  photoUrl?: string;
  photoHash?: string;
  gps?: {
    lat: number;
    lng: number;
    accuracy: number;
    timestamp: Date;
  };
  measurement?: {
    value: number;
    unit: string;
    timestamp?: Date;
  };
  note?: string;
  timestamp: Date;
  deviceInfo?: string;
  verified: boolean;
}

export interface CertificationTemplate {
  id: string;
  name: string;
  productType: string;
  category: string;
  icon: string;
  description: string;
  durationDays: number;
  checkpoints: Array<{
    dayOffset: number;
    title: string;
    description: string;
    requiredProofs: ('photo' | 'gps' | 'measurement' | 'note')[];
    measurementType?: 'weight' | 'height' | 'count' | 'volume';
  }>;
  scoringRules: {
    gpsWeight: number;
    timeWeight: number;
    photoWeight: number;
    measurementWeight: number;
    minScore: number;
  };
  badges: string[];
}

export interface CertificationStats {
  totalCertifications: number;
  activeCertifications: number;
  completedCertifications: number;
  publishedCertifications: number;
  averageScore: number;
  verificationRate: number;
  upcomingCheckpoints: number;
  expiredCertifications: number;
  byStatus: {
    draft: number;
    active: number;
    completed: number;
    verified: number;
    cancelled: number;
    expired: number;
  };
  byProductType: {
    [key: string]: number;
  };
  recentActivity: Array<{
    date: string;
    certifications: number;
    checkpoints: number;
  }>;
}

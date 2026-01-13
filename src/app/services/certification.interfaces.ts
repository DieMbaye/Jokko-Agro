// certification.interfaces.ts
export interface Certification {
  id: string;
  productId?: string;
  producerId: string;
  producerName: string;
  productType: string;
  productName: string;
  productCategory: string;
  status: 'draft' | 'active' | 'completed' | 'cancelled' | 'verified' | 'expired';

  // Cycle de culture
  startDate: Date;
  expectedHarvestDate: Date;
  actualHarvestDate?: Date;
  durationDays: number;

  // Localisation
  location: {
    lat: number;
    lng: number;
    address?: string;
    region?: string;
  };

  // Points de contrôle
  checkpoints: CertificationCheckpoint[];
  currentCheckpointIndex: number;
  completedCheckpoints: number;
  totalCheckpoints: number;

  // Preuves initiales
  initialProof: {
    photoUrl: string;
    photoHash: string;
    timestamp: Date;
    deviceInfo?: string;
  };

  // Score et validation
  validationScore: number;
  maxScore: number;
  verificationStatus: 'pending' | 'auto_verified' | 'manually_verified' | 'rejected';
  verifierId?: string;
  verifiedAt?: Date;
  rejectionReason?: string;

  // Produit final
  finalProduct?: {
    id: string;
    name: string;
    quantity: number;
    unit: string;
    price: number;
    published: boolean;
  };

  // Métadonnées
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  version: number;
}

export interface CertificationCheckpoint {
  id: string;
  order: number;
  dayOffset: number; // J+15, J+30, etc.
  title: string;
  description: string;
  instructions: string;
  required: boolean;

  // Types de preuve requis
  requiredProofs: ('photo' | 'gps' | 'measurement' | 'note')[];
  measurementType?: 'weight' | 'height' | 'count' | 'volume';
  measurementUnit?: string;

  // Données remplies
  completed: boolean;
  completedAt?: Date;
  proofs: CheckpointProof[];

  // Validation automatique
  autoVerified: boolean;
  verificationScore: number;
  verificationNotes?: string;
  gpsConsistency?: boolean;
  timeConsistency?: boolean;
  photoConsistency?: boolean;

  // Notifications
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
    timestamp: Date;
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

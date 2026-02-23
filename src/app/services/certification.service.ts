// services/certification.service.ts
import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  serverTimestamp,
  Timestamp,
  DocumentReference,
  limit,
} from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { FirebaseService } from './firebase.service';
import { BlockchainService } from '../blockchain/services/blockchain.service';
import { Product } from '../interfaces/data.interfaces';
import { ImageComparisonService } from './image-comparison.service';
// ============== INTERFACES ==============

export interface CertificationCheckpoint {
  id: string;
  title: string;
  description: string;
  step: 'INIT' | 'FOLLOW_UP' | 'HARVEST' | 'CHECKPOINT';
  order: number;
  daysFromStart: number;
  photoRequired: boolean;
  locationRequired: boolean;
  completed: boolean;
  completedAt?: Date;
  photoUrl?: string;
  location?: {
    lat: number;
    lng: number;
    address?: string;
    accuracy?: number;
  };
  blockchainTransactionId?: string;
  blockchainVerified?: boolean;
  ipfsCID?: string;
  ipfsUrl?: string;
  proofHash?: string;
  notes?: string;
  metadata?: any;
}

export interface Certification {
  id?: string;
  productId: string;
  productName: string;
  producerId: string;
  producerName: string;

  // Configuration
  durationDays: 30 | 45 | 60 | 90;
  certificationType: 'standard' | 'premium' | 'organic';
  startDate: Date;
  estimatedEndDate: Date;

  isPendingCertification?: boolean;

  // État
  status:
    | 'draft'
    | 'active'
    | 'completed'
    | 'verified'
    | 'expired'
    | 'cancelled';
  currentStep: number;
  progress: number;

  // Checkpoints
  checkpoints: CertificationCheckpoint[];
  totalCheckpoints: number;
  completedCheckpoints: number;
  verificationScore: number;

  // Blockchain
  rootHash?: string;
  blockchainVerified: boolean;
  blockchainTransactions: string[];
  lastBlockchainSync?: Date;

  // IPFS
  ipfsMetadataCID?: string;
  ipfsMetadataUrl?: string;

  // Produit associé
  productData?: any;

  // Dates
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  verifiedAt?: Date;

  // Certificat final
  certificateUrl?: string;
  qrCodeUrl?: string;
  verificationUrl?: string;

  // Audit
  auditLogs: Array<{
    action: string;
    timestamp: Date;
    userId: string;
    details: any;
  }>;
}

export interface CertificationTemplate {
  id: string;
  name: string;
  description: string;
  durationDays: number;
  certificationType: 'standard' | 'premium' | 'organic';
  price: number;
  checkpoints: Array<{
    title: string;
    description: string;
    step: 'INIT' | 'FOLLOW_UP' | 'HARVEST' | 'CHECKPOINT';
    daysFromStart: number;
    photoRequired: boolean;
    locationRequired: boolean;
    validationRules?: any;
  }>;
  requirements: {
    minPhotos: number;
    gpsRequired: boolean;
    locationConsistency: boolean;
    timeIntervalConsistency: boolean;
  };
  badges: Array<{
    id: string;
    label: string;
    icon: string;
    color: string;
  }>;
}

/**
 * INTERFACE AJOUTÉE - Résultat de soumission de checkpoint
 */
export interface CheckpointSubmissionResult {
  success: boolean;
  checkpoint?: CertificationCheckpoint;
  error?: string;
  transactionHash?: string;
  ipfsHash?: string;
}

interface ProductFormData {
  name: string;
  category: string;
  description: string;
  price: number;
  quantity: number;
  unit: string;
  location: string;
  harvestDate?: string;
  storageConditions?: string;
  contactPhone: string;
  minOrderQuantity: number;
  isOrganic: boolean;
  certifications: string[];
}

@Injectable({
  providedIn: 'root',
})
export class CertificationService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private blockchainService = inject(BlockchainService);
  private firebaseService = inject(FirebaseService);
  private imageComparisonService = inject(ImageComparisonService);

  // Templates de certification prédéfinis
  private certificationTemplates: CertificationTemplate[] = [
    {
      id: 'standard_30',
      name: 'Certification Standard 30 jours',
      description: 'Suivi de culture sur 30 jours avec vérification régulière',
      durationDays: 30,
      certificationType: 'standard',
      price: 5000,
      checkpoints: [
        {
          title: 'Semence initiale',
          description: 'Photo du champ au moment de la semence',
          step: 'INIT',
          daysFromStart: 0,
          photoRequired: true,
          locationRequired: true,
          validationRules: {
            maxDistanceFromPrevious: 50,
            timeWindow: 24,
          },
        },
        {
          title: 'Suivi croissance - Semaine 1',
          description: 'Photo après 7 jours de croissance',
          step: 'FOLLOW_UP',
          daysFromStart: 7,
          photoRequired: true,
          locationRequired: true,
        },
        {
          title: 'Suivi croissance - Semaine 2',
          description: 'Photo après 14 jours de croissance',
          step: 'FOLLOW_UP',
          daysFromStart: 14,
          photoRequired: true,
          locationRequired: true,
        },
        {
          title: 'Suivi croissance - Semaine 3',
          description: 'Photo après 21 jours de croissance',
          step: 'FOLLOW_UP',
          daysFromStart: 21,
          photoRequired: true,
          locationRequired: true,
        },
        {
          title: 'Récolte',
          description: 'Photo de la récolte',
          step: 'HARVEST',
          daysFromStart: 30,
          photoRequired: true,
          locationRequired: true,
        },
      ],
      requirements: {
        minPhotos: 5,
        gpsRequired: true,
        locationConsistency: true,
        timeIntervalConsistency: true,
      },
      badges: [
        {
          id: 'verified_30d',
          label: 'Certifié 30 jours',
          icon: '✓',
          color: 'green',
        },
      ],
    },
    {
      id: 'premium_45',
      name: 'Certification Premium 45 jours',
      description: 'Suivi approfondi sur 45 jours avec validation renforcée',
      durationDays: 45,
      certificationType: 'premium',
      price: 8000,
      checkpoints: [
        {
          title: 'Semence initiale',
          description: 'Photo du champ au moment de la semence',
          step: 'INIT',
          daysFromStart: 0,
          photoRequired: true,
          locationRequired: true,
        },
        {
          title: 'Suivi - Jour 10',
          description: 'Photo après 10 jours',
          step: 'FOLLOW_UP',
          daysFromStart: 10,
          photoRequired: true,
          locationRequired: true,
        },
        {
          title: 'Suivi - Jour 20',
          description: 'Photo après 20 jours',
          step: 'FOLLOW_UP',
          daysFromStart: 20,
          photoRequired: true,
          locationRequired: true,
        },
        {
          title: 'Suivi - Jour 30',
          description: 'Photo après 30 jours',
          step: 'FOLLOW_UP',
          daysFromStart: 30,
          photoRequired: true,
          locationRequired: true,
        },
        {
          title: 'Pré-récolte',
          description: 'Photo avant récolte',
          step: 'CHECKPOINT',
          daysFromStart: 40,
          photoRequired: true,
          locationRequired: true,
        },
        {
          title: 'Récolte',
          description: 'Photo de la récolte',
          step: 'HARVEST',
          daysFromStart: 45,
          photoRequired: true,
          locationRequired: true,
        },
      ],
      requirements: {
        minPhotos: 6,
        gpsRequired: true,
        locationConsistency: true,
        timeIntervalConsistency: true,
      },
      badges: [
        {
          id: 'premium_45d',
          label: 'Premium 45 jours',
          icon: '⭐',
          color: 'gold',
        },
      ],
    },
  ];

  constructor() {}

  // ============== UTILITAIRES ==============

  /**
   * Convertir un timestamp Firestore en Date
   */
  private convertFirestoreTimestamp(timestamp: any): Date | undefined {
    if (!timestamp) return undefined;
    if (typeof timestamp.toDate === 'function') {
      return timestamp.toDate();
    }
    if (timestamp instanceof Date) {
      return timestamp;
    }
    if (timestamp && timestamp.seconds) {
      return new Date(timestamp.seconds * 1000);
    }
    if (typeof timestamp === 'string') {
      return new Date(timestamp);
    }
    if (typeof timestamp === 'number') {
      return new Date(timestamp);
    }
    return undefined;
  }

  /**
   * Nettoyer un objet pour Firestore (supprimer undefined)
   */
  private cleanObjectForFirestore(obj: any): any {
    if (obj === null || obj === undefined) {
      return null;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.cleanObjectForFirestore(item));
    }

    if (typeof obj === 'object' && !(obj instanceof Date)) {
      const cleaned: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) {
          cleaned[key] = this.cleanObjectForFirestore(value);
        }
      }
      return cleaned;
    }

    return obj;
  }

  /**
   * Calculer la distance entre deux points GPS
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371000;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Ajouter un log d'audit
   */
  private async addAuditLog(
    certificationId: string,
    action: string,
    details: any,
  ): Promise<void> {
    const user = this.authService.getCurrentUser();
    if (!user) return;

    const certRef = doc(this.firestore, 'certifications', certificationId);
    const certSnap = await getDoc(certRef);

    if (!certSnap.exists()) return;

    const certification = certSnap.data() as Certification;
    const newLog = {
      action,
      timestamp: new Date(),
      userId: user.uid,
      details,
    };

    await updateDoc(certRef, {
      auditLogs: [...(certification.auditLogs || []), newLog],
      updatedAt: serverTimestamp(),
    });
  }

  // ============== CRUD CERTIFICATIONS ==============

  /**
   * Récupérer une certification par son ID
   */
  async getCertificationById(
    certificationId: string,
  ): Promise<Certification | null> {
    try {
      const certRef = doc(this.firestore, 'certifications', certificationId);
      const certSnap = await getDoc(certRef);

      if (!certSnap.exists()) return null;

      const data = certSnap.data();

      // Convertir les checkpoints
      const checkpoints = (data['checkpoints'] || []).map((cp: any) => ({
        ...cp,
        completedAt: this.convertFirestoreTimestamp(cp.completedAt),
        location: cp.location || undefined,
      }));

      return {
        id: certSnap.id,
        productId: data['productId'],
        productName: data['productName'],
        producerId: data['producerId'],
        producerName: data['producerName'],
        durationDays: data['durationDays'],
        certificationType: data['certificationType'],
        startDate:
          this.convertFirestoreTimestamp(data['startDate']) || new Date(),
        estimatedEndDate:
          this.convertFirestoreTimestamp(data['estimatedEndDate']) ||
          new Date(),
        status: data['status'] || 'draft',
        currentStep: data['currentStep'] || 0,
        progress: data['progress'] || 0,
        checkpoints: checkpoints,
        totalCheckpoints: data['totalCheckpoints'] || 0,
        completedCheckpoints: data['completedCheckpoints'] || 0,
        verificationScore: data['verificationScore'] || 0,
        blockchainVerified: data['blockchainVerified'] || false,
        blockchainTransactions: data['blockchainTransactions'] || [],
        productData: data['productData'],
        createdAt:
          this.convertFirestoreTimestamp(data['createdAt']) || new Date(),
        updatedAt:
          this.convertFirestoreTimestamp(data['updatedAt']) || new Date(),
        completedAt: this.convertFirestoreTimestamp(data['completedAt']),
        verifiedAt: this.convertFirestoreTimestamp(data['verifiedAt']),
        certificateUrl: data['certificateUrl'],
        qrCodeUrl: data['qrCodeUrl'],
        verificationUrl: data['verificationUrl'],
        auditLogs: (data['auditLogs'] || []).map((log: any) => ({
          ...log,
          timestamp:
            this.convertFirestoreTimestamp(log.timestamp) || new Date(),
        })),
        isPendingCertification: data['isPendingCertification'] || false,
      } as Certification;
    } catch (error) {
      console.error('Erreur récupération certification:', error);
      return null;
    }
  }

  /**
   * Récupérer la certification d'un produit
   */
  async getProductCertification(
    productId: string,
  ): Promise<Certification | null> {
    try {
      const q = query(
        collection(this.firestore, 'certifications'),
        where('productId', '==', productId),
        where('status', 'in', ['draft', 'active', 'completed', 'verified']),
        orderBy('createdAt', 'desc'),
        limit(1),
      );

      const snapshot = await getDocs(q);

      if (snapshot.empty) return null;

      const docSnap = snapshot.docs[0];
      const data = docSnap.data();

      return {
        id: docSnap.id,
        ...data,
        startDate:
          this.convertFirestoreTimestamp(data['startDate']) || new Date(),
        estimatedEndDate:
          this.convertFirestoreTimestamp(data['estimatedEndDate']) ||
          new Date(),
        createdAt:
          this.convertFirestoreTimestamp(data['createdAt']) || new Date(),
        updatedAt:
          this.convertFirestoreTimestamp(data['updatedAt']) || new Date(),
        completedAt: this.convertFirestoreTimestamp(data['completedAt']),
        verifiedAt: this.convertFirestoreTimestamp(data['verifiedAt']),
      } as Certification;
    } catch (error) {
      console.error('Erreur récupération certification:', error);
      return null;
    }
  }

  /**
   * Récupérer toutes les certifications d'un producteur
   */
  async getProducerCertifications(
    producerId: string,
  ): Promise<Certification[]> {
    try {
      const q = query(
        collection(this.firestore, 'certifications'),
        where('producerId', '==', producerId),
        orderBy('createdAt', 'desc'),
      );

      const snapshot = await getDocs(q);

      return snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          startDate:
            this.convertFirestoreTimestamp(data['startDate']) || new Date(),
          estimatedEndDate:
            this.convertFirestoreTimestamp(data['estimatedEndDate']) ||
            new Date(),
          createdAt:
            this.convertFirestoreTimestamp(data['createdAt']) || new Date(),
          updatedAt:
            this.convertFirestoreTimestamp(data['updatedAt']) || new Date(),
          completedAt: this.convertFirestoreTimestamp(data['completedAt']),
          verifiedAt: this.convertFirestoreTimestamp(data['verifiedAt']),
        } as Certification;
      });
    } catch (error) {
      console.error('Erreur récupération certifications:', error);
      return [];
    }
  }

  /**
   * Récupérer les produits éligibles à la certification
   */
  async getCertifiableProducts(producerId: string): Promise<Product[]> {
    try {
      const products =
        await this.firebaseService.getProducerProducts(producerId);
      const certifiableProducts: Product[] = [];

      for (const product of products) {
        const existingCert = await this.getProductCertification(product.id!);
        if (!existingCert) {
          certifiableProducts.push(product);
        }
      }

      return certifiableProducts;
    } catch (error) {
      console.error('Erreur récupération produits éligibles:', error);
      return [];
    }
  }

  /**
   * Récupérer un produit avec propriétés étendues
   */
  async getProductWithExtendedProperties(
    productId: string,
  ): Promise<Product | null> {
    try {
      const product = await this.firebaseService.getProductById(productId);
      if (!product) return null;
      return product as Product;
    } catch (error) {
      console.error('Erreur récupération produit étendu:', error);
      return null;
    }
  }

  // ============== INITIALISATION ==============

  /**
   * Démarrer une nouvelle certification avec un produit existant
   */
  async startCertification(
    productId: string,
    templateId: string,
    productData?: any,
  ): Promise<{ success: boolean; certificationId?: string; error?: string }> {
    try {
      const user = this.authService.getCurrentUser();
      if (!user) {
        return { success: false, error: 'Utilisateur non connecté' };
      }

      const product = await this.firebaseService.getProductById(productId);
      if (!product) {
        return { success: false, error: 'Produit non trouvé' };
      }

      const template = this.certificationTemplates.find(
        (t) => t.id === templateId,
      );
      if (!template) {
        return {
          success: false,
          error: 'Template de certification non trouvé',
        };
      }

      const existingCert = await this.getProductCertification(productId);
      if (existingCert) {
        return {
          success: false,
          error: 'Ce produit a déjà une certification en cours',
        };
      }

      const checkpoints: CertificationCheckpoint[] = template.checkpoints.map(
        (cp, index) => ({
          id: `cp_${Date.now()}_${index}`,
          title: cp.title,
          description: cp.description,
          step: cp.step,
          order: index + 1,
          daysFromStart: cp.daysFromStart,
          photoRequired: cp.photoRequired,
          locationRequired: cp.locationRequired,
          completed: false,
          metadata: cp.validationRules || {},
        }),
      );

      const startDate = new Date();
      const estimatedEndDate = new Date(startDate);
      estimatedEndDate.setDate(startDate.getDate() + template.durationDays);

      const certification: Certification = {
        productId,
        productName: product.name,
        producerId: user.uid,
        producerName: this.authService.getUserData()?.fullName || 'Producteur',
        durationDays: template.durationDays as 30 | 45 | 60 | 90,
        certificationType: template.certificationType,
        startDate,
        estimatedEndDate,
        status: 'active',
        currentStep: 0,
        progress: 0,
        checkpoints,
        totalCheckpoints: checkpoints.length,
        completedCheckpoints: 0,
        verificationScore: 0,
        blockchainVerified: false,
        blockchainTransactions: [],
        productData: productData || product,
        createdAt: new Date(),
        updatedAt: new Date(),
        auditLogs: [
          {
            action: 'CERTIFICATION_STARTED',
            timestamp: new Date(),
            userId: user.uid,
            details: { templateId, productId },
          },
        ],
      };

      const certRef = doc(collection(this.firestore, 'certifications'));
      await setDoc(certRef, {
        ...this.cleanObjectForFirestore(certification),
        startDate: Timestamp.fromDate(startDate),
        estimatedEndDate: Timestamp.fromDate(estimatedEndDate),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await this.firebaseService.updateProduct(productId, {
        certification: {
          id: certRef.id,
          type: 'in_progress',
          level: 'bronze',
          score: 0,
          verificationDate: new Date(),
          validUntil: estimatedEndDate,
        },
      });

      await this.addAuditLog(certRef.id, 'CERTIFICATION_CREATED', {
        template: template.name,
        product: product.name,
      });

      return {
        success: true,
        certificationId: certRef.id,
      };
    } catch (error: any) {
      console.error('Erreur démarrage certification:', error);
      return {
        success: false,
        error: error.message || 'Erreur lors du démarrage de la certification',
      };
    }
  }

  /**
   * Démarrer une certification avec création de produit
   */
  async startCertificationWithProduct(
    productId: string,
    templateId: string,
    productFormData: ProductFormData,
  ): Promise<{ success: boolean; certificationId?: string; error?: string }> {
    try {
      const user = this.authService.getCurrentUser();
      if (!user) {
        return { success: false, error: 'Utilisateur non connecté' };
      }

      const product = await this.firebaseService.getProductById(productId);
      if (!product) {
        return { success: false, error: 'Produit non trouvé' };
      }

      const productAny = product as any;
      const isInCertification =
        productAny.status === 'certification' ||
        productAny.certificationInProgress === true;

      if (!isInCertification) {
        return {
          success: false,
          error: "Ce produit n'est pas en mode certification",
        };
      }

      const template = this.certificationTemplates.find(
        (t) => t.id === templateId,
      );
      if (!template) {
        return {
          success: false,
          error: 'Template de certification non trouvé',
        };
      }

      const checkpoints: CertificationCheckpoint[] = template.checkpoints.map(
        (cp, index) => ({
          id: `cp_${Date.now()}_${index}`,
          title: cp.title,
          description: cp.description,
          step: cp.step,
          order: index + 1,
          daysFromStart: cp.daysFromStart,
          photoRequired: cp.photoRequired,
          locationRequired: cp.locationRequired,
          completed: false,
          metadata: cp.validationRules || {},
        }),
      );

      const startDate = new Date();
      const estimatedEndDate = new Date(startDate);
      estimatedEndDate.setDate(startDate.getDate() + template.durationDays);

      const cleanedFormData = {
        ...productFormData,
        harvestDate: productFormData.harvestDate || null,
        storageConditions: productFormData.storageConditions || '',
        certifications: productFormData.certifications || [],
        contactPhone: productFormData.contactPhone || '',
      };

      const certification: Certification = {
        productId,
        productName: product.name,
        producerId: user.uid,
        producerName: this.authService.getUserData()?.fullName || 'Producteur',
        durationDays: template.durationDays as 30 | 45 | 60 | 90,
        certificationType: template.certificationType,
        startDate,
        estimatedEndDate,
        status: 'active',
        currentStep: 0,
        progress: 0,
        checkpoints,
        totalCheckpoints: checkpoints.length,
        completedCheckpoints: 0,
        verificationScore: 0,
        blockchainVerified: false,
        blockchainTransactions: [],
        productData: {
          ...product,
          formData: cleanedFormData,
          harvestDate: product.harvestDate || null,
          storageConditions: product.storageConditions || '',
          certifications: product.certifications || [],
          images: product.images || [],
          badges: product.badges || [],
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        auditLogs: [
          {
            action: 'CERTIFICATION_WITH_PRODUCT_STARTED',
            timestamp: new Date(),
            userId: user.uid,
            details: {
              templateId,
              productId,
              productFormData: Object.keys(cleanedFormData),
            },
          },
        ],
      };

      const cleanedCertification = this.cleanObjectForFirestore(certification);
      const certRef = doc(collection(this.firestore, 'certifications'));

      await setDoc(certRef, {
        ...cleanedCertification,
        startDate: Timestamp.fromDate(startDate),
        estimatedEndDate: Timestamp.fromDate(estimatedEndDate),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const productUpdate: any = {
        certification: {
          id: certRef.id,
          type: 'in_progress',
          level: 'bronze',
          score: 0,
          verificationDate: new Date(),
          validUntil: estimatedEndDate,
          template: template.name,
          startDate: startDate,
          estimatedEndDate: estimatedEndDate,
          status: 'active',
        },
        certificationInProgress: true,
        status: 'certification' as const,
      };

      await this.firebaseService.updateProduct(productId, productUpdate);

      await this.addAuditLog(certRef.id, 'CERTIFICATION_WITH_PRODUCT_CREATED', {
        template: template.name,
        product: product.name,
        productStatus: 'certification',
      });

      return {
        success: true,
        certificationId: certRef.id,
      };
    } catch (error: any) {
      console.error('Erreur démarrage certification avec produit:', error);
      return {
        success: false,
        error: error.message || 'Erreur lors du démarrage de la certification',
      };
    }
  }

  /**
   * Initialiser les checkpoints d'une certification
   */
  async initializeCertificationCheckpoints(
    certificationId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const certRef = doc(this.firestore, 'certifications', certificationId);
      const certSnap = await getDoc(certRef);

      if (!certSnap.exists()) {
        return { success: false, error: 'Certification non trouvée' };
      }

      const certification = certSnap.data() as Certification;
      const template = this.certificationTemplates.find(
        (t) => t.certificationType === certification.certificationType,
      );

      if (!template) {
        return { success: false, error: 'Template non trouvé' };
      }

      const checkpoints: CertificationCheckpoint[] = template.checkpoints.map(
        (cp, index) => ({
          id: `cp_${Date.now()}_${index}`,
          title: cp.title,
          description: cp.description,
          step: cp.step,
          order: index + 1,
          daysFromStart: cp.daysFromStart,
          photoRequired: cp.photoRequired,
          locationRequired: cp.locationRequired,
          completed: false,
          metadata: cp.validationRules || {},
        }),
      );

      await updateDoc(certRef, {
        checkpoints,
        totalCheckpoints: checkpoints.length,
        updatedAt: serverTimestamp(),
      });

      return { success: true };
    } catch (error: any) {
      console.error('Erreur initialisation checkpoints:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Auto-activer une certification
   */
  async autoActivateCertification(
    certificationId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const certRef = doc(this.firestore, 'certifications', certificationId);
      await updateDoc(certRef, {
        status: 'active',
        currentStep: 1,
        updatedAt: serverTimestamp(),
      });
      return { success: true };
    } catch (error: any) {
      console.error('Erreur auto-activation:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Activer une certification avec validation
   */
  async activateCertification(
    certificationId: string,
    initialPhoto?: File,
    location?: { lat: number; lng: number },
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const certRef = doc(this.firestore, 'certifications', certificationId);
      const certSnap = await getDoc(certRef);

      if (!certSnap.exists()) {
        return { success: false, error: 'Certification non trouvée' };
      }

      const certification = certSnap.data() as Certification;

      if (certification.status !== 'draft') {
        return { success: false, error: 'Certification déjà activée' };
      }

      const firstCheckpoint = certification.checkpoints.find(
        (cp) => cp.order === 1,
      );
      if (!firstCheckpoint) {
        return { success: false, error: 'Checkpoint initial non trouvé' };
      }

      if (firstCheckpoint.photoRequired && !initialPhoto) {
        return { success: false, error: 'Photo initiale requise' };
      }

      if (firstCheckpoint.locationRequired && !location) {
        return { success: false, error: 'Localisation requise' };
      }

      await updateDoc(certRef, {
        status: 'active',
        currentStep: 1,
        updatedAt: serverTimestamp(),
        'checkpoints.0.completed': true,
        'checkpoints.0.completedAt': new Date(),
        ...(location && { 'checkpoints.0.location': location }),
      });

      if (initialPhoto && location) {
        await this.uploadCheckpointProof(
          certificationId,
          0,
          initialPhoto,
          location,
        );
      }

      await this.updateProgress(certificationId);

      await this.addAuditLog(certificationId, 'CERTIFICATION_ACTIVATED', {
        withPhoto: !!initialPhoto,
        location: location,
      });

      return { success: true };
    } catch (error: any) {
      console.error('Erreur activation certification:', error);
      return { success: false, error: error.message };
    }
  }

  // ============== CHECKPOINTS ==============

  /**
   * Uploader une preuve pour un checkpoint
   */
  async uploadCheckpointProof(
    certificationId: string,
    checkpointIndex: number,
    photoFile: File,
    location: { lat: number; lng: number },
    notes?: string,
  ): Promise<CheckpointSubmissionResult> {
    try {
      const certRef = doc(this.firestore, 'certifications', certificationId);
      const certSnap = await getDoc(certRef);

      if (!certSnap.exists()) {
        return { success: false, error: 'Certification non trouvée' };
      }

      const certification = certSnap.data() as Certification;
      const checkpoint = certification.checkpoints[checkpointIndex];

      if (!checkpoint) {
        return { success: false, error: 'Checkpoint non trouvé' };
      }

      if (checkpoint.completed) {
        return { success: false, error: 'Checkpoint déjà complété' };
      }

      // Validation du délai
      const now = new Date();
      const expectedDate = new Date(certification.startDate);
      expectedDate.setDate(expectedDate.getDate() + checkpoint.daysFromStart);

      const daysDiff = Math.abs(
        (now.getTime() - expectedDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (daysDiff > 3) {
        return {
          success: false,
          error: `Checkpoint hors délai. Attendu autour du ${expectedDate.toLocaleDateString()}`,
        };
      }

      // Validation de la localisation
      if (checkpointIndex > 0) {
        const prevCheckpoint = certification.checkpoints[checkpointIndex - 1];
        if (prevCheckpoint.location && prevCheckpoint.locationRequired) {
          const distance = this.calculateDistance(
            location.lat,
            location.lng,
            prevCheckpoint.location.lat,
            prevCheckpoint.location.lng,
          );

          if (distance > 100) {
            return {
              success: false,
              error: `Localisation incohérente. Distance depuis dernier checkpoint: ${distance.toFixed(1)}m`,
            };
          }
        }
      }

      // Création preuve blockchain
      const proofResult = await this.blockchainService.createCertificationProof(
        certification.productId,
        photoFile,
        checkpoint.step,
        checkpoint.id,
        checkpoint.order,
        location,
      );

      if (!proofResult.success) {
        throw new Error(`Erreur blockchain: ${proofResult.error}`);
      }

      // Mise à jour checkpoint
      const updatedCheckpoint: CertificationCheckpoint = {
        ...checkpoint,
        completed: true,
        completedAt: new Date(),
        photoUrl: proofResult.ipfsProof?.url,
        location: {
          lat: location.lat,
          lng: location.lng,
          accuracy: 10,
        },
        blockchainTransactionId: proofResult.blockchainProof?.txHash,
        blockchainVerified: proofResult.blockchainProof?.verified || false,
        ipfsCID: proofResult.ipfsProof?.cid,
        ipfsUrl: proofResult.ipfsProof?.url,
        proofHash: proofResult.blockchainProof?.proofHash,
        notes,
      };

      const updatedCheckpoints = [...certification.checkpoints];
      updatedCheckpoints[checkpointIndex] = updatedCheckpoint;

      await updateDoc(certRef, {
        checkpoints: updatedCheckpoints,
        currentStep: checkpointIndex + 2,
        updatedAt: serverTimestamp(),
        ...(proofResult.blockchainProof?.txHash && {
          blockchainTransactions: [
            ...certification.blockchainTransactions,
            proofResult.blockchainProof.txHash,
          ],
        }),
      });

      await this.updateProgress(certificationId);

      if (checkpointIndex === certification.checkpoints.length - 1) {
        await this.completeCertification(certificationId);
      }

      await this.addAuditLog(certificationId, 'CHECKPOINT_COMPLETED', {
        checkpoint: checkpoint.title,
        step: checkpoint.step,
        txHash: proofResult.blockchainProof?.txHash,
      });

      return {
        success: true,
        checkpoint: updatedCheckpoint,
        transactionHash: proofResult.blockchainProof?.txHash,
        ipfsHash: proofResult.ipfsProof?.cid,
      };
    } catch (error: any) {
      console.error('Erreur upload preuve:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Mettre à jour le statut blockchain d'un checkpoint
   */
  async updateCheckpointBlockchainStatus(
    certificationId: string,
    checkpointIndex: number,
    updates: {
      blockchainVerified?: boolean;
      lastBlockchainCheck?: Date;
      blockchainConfirmations?: number;
    },
  ): Promise<void> {
    try {
      const certRef = doc(this.firestore, 'certifications', certificationId);
      const certSnap = await getDoc(certRef);

      if (!certSnap.exists()) {
        console.error('Certification non trouvée');
        return;
      }

      const certification = certSnap.data() as Certification;
      const updatedCheckpoints = [...certification.checkpoints];

      if (updatedCheckpoints[checkpointIndex]) {
        updatedCheckpoints[checkpointIndex] = {
          ...updatedCheckpoints[checkpointIndex],
          ...updates,
        };
      }

      await updateDoc(certRef, {
        checkpoints: updatedCheckpoints,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Erreur mise à jour checkpoint:', error);
      throw error;
    }
  }

  /**
   * Mettre à jour le progrès de la certification
   */
  private async updateProgress(certificationId: string): Promise<void> {
    try {
      const certRef = doc(this.firestore, 'certifications', certificationId);
      const certSnap = await getDoc(certRef);

      if (!certSnap.exists()) return;

      const certification = certSnap.data() as Certification;
      const completedCheckpoints = certification.checkpoints.filter(
        (cp) => cp.completed,
      ).length;
      const progress = Math.round(
        (completedCheckpoints / certification.totalCheckpoints) * 100,
      );

      await updateDoc(certRef, {
        completedCheckpoints,
        progress,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Erreur mise à jour progression:', error);
    }
  }

  // ============== COMPLÉTION ==============

  /**
   * Compléter une certification (sans publication)
   */
  async completeCertification(
    certificationId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const certRef = doc(this.firestore, 'certifications', certificationId);
      const certSnap = await getDoc(certRef);

      if (!certSnap.exists()) {
        return { success: false, error: 'Certification non trouvée' };
      }

      const certification = certSnap.data() as Certification;
      const allCompleted = certification.checkpoints.every(
        (cp) => cp.completed,
      );

      if (!allCompleted) {
        return {
          success: false,
          error: 'Tous les checkpoints doivent être complétés',
        };
      }

      const verificationScore =
        await this.calculateVerificationScore(certificationId);
      const certificateResult = await this.generateCertificate(certificationId);

      await updateDoc(certRef, {
        status: 'completed',
        progress: 100,
        verificationScore,
        completedAt: new Date(),
        updatedAt: serverTimestamp(),
        certificateUrl: certificateResult.certificateUrl,
        qrCodeUrl: certificateResult.qrCodeUrl,
        verificationUrl: certificateResult.verificationUrl,
      });

      await this.firebaseService.updateProduct(certification.productId, {
        certification: {
          id: certificationId,
          type: 'certified',
          level:
            verificationScore >= 90
              ? 'gold'
              : verificationScore >= 70
                ? 'silver'
                : 'bronze',
          score: verificationScore,
          verificationDate: new Date(),
          validUntil: certification.estimatedEndDate,
          traceability: {
            startDate: certification.startDate,
            harvestDate: new Date(),
            location: certification.productData?.location || '',
            checkpointsCompleted: certification.completedCheckpoints,
            totalCheckpoints: certification.totalCheckpoints,
            proofs: certification.checkpoints.map((cp) => ({
              type: cp.step,
              date: cp.completedAt || new Date(),
              verified: cp.blockchainVerified || false,
            })),
          },
          qrCodeUrl: certificateResult.qrCodeUrl,
          certificateUrl: certificateResult.certificateUrl,
          verificationUrl: certificateResult.verificationUrl,
        },
      });

      await this.addAuditLog(certificationId, 'CERTIFICATION_COMPLETED', {
        score: verificationScore,
        completedCheckpoints: certification.completedCheckpoints,
      });

      return { success: true };
    } catch (error: any) {
      console.error('Erreur complétion certification:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Compléter une certification ET publier le produit
   */
  async completeCertificationAndPublish(certificationId: string): Promise<{
    success: boolean;
    productId?: string;
    error?: string;
  }> {
    try {
      const certRef = doc(this.firestore, 'certifications', certificationId);
      const certSnap = await getDoc(certRef);

      if (!certSnap.exists()) {
        return { success: false, error: 'Certification non trouvée' };
      }

      const data = certSnap.data();
      const certification: Certification = {
        id: certSnap.id,
        ...data,
        startDate:
          this.convertFirestoreTimestamp(data['startDate']) || new Date(),
        estimatedEndDate:
          this.convertFirestoreTimestamp(data['estimatedEndDate']) ||
          new Date(),
        checkpoints: (data['checkpoints'] || []).map((cp: any) => ({
          ...cp,
          completedAt: this.convertFirestoreTimestamp(cp.completedAt),
        })),
      } as Certification;

      const allCompleted = certification.checkpoints.every(
        (cp) => cp.completed,
      );
      if (!allCompleted) {
        return {
          success: false,
          error: 'Tous les checkpoints doivent être complétés',
        };
      }

      const verificationScore =
        await this.calculateVerificationScore(certificationId);
      const certificateResult = await this.generateCertificate(certificationId);

      await updateDoc(certRef, {
        status: 'completed',
        progress: 100,
        verificationScore,
        completedAt: new Date(),
        updatedAt: serverTimestamp(),
        certificateUrl: certificateResult.certificateUrl,
        qrCodeUrl: certificateResult.qrCodeUrl,
        verificationUrl: certificateResult.verificationUrl,
      });

      // Publication du produit
      const productUpdate = await this.firebaseService.updateProduct(
        certification.productId,
        {
          status: 'available',
          isActive: true,
          certification: {
            id: certificationId,
            type: 'certified',
            level:
              verificationScore >= 90
                ? 'gold'
                : verificationScore >= 70
                  ? 'silver'
                  : 'bronze',
            score: verificationScore,
            verificationDate: new Date(),
            validUntil: certification.estimatedEndDate,
            traceability: {
              startDate: certification.startDate,
              harvestDate: new Date(),
              location: certification.productData?.location || '',
              checkpointsCompleted: certification.completedCheckpoints,
              totalCheckpoints: certification.totalCheckpoints,
              proofs: certification.checkpoints.map((cp) => ({
                type: cp.step,
                date: cp.completedAt || new Date(),
                verified: cp.blockchainVerified || false,
              })),
            },
            qrCodeUrl: certificateResult.qrCodeUrl,
            certificateUrl: certificateResult.certificateUrl,
            verificationUrl: certificateResult.verificationUrl,
          },
          badges: [
            ...(certification.productData?.badges || []),
            {
              id: 'certified',
              label: 'Certifié',
              icon: '✓',
              color: '#10b981',
            },
          ],
          updatedAt: new Date(),
        },
      );

      if (!productUpdate.success) {
        throw new Error(
          productUpdate.error || 'Erreur lors de la publication du produit',
        );
      }

      await this.addCheckpointImagesToProduct(
        certificationId,
        certification.productId,
      );
      await this.notifyBuyersAboutNewCertifiedProduct(certification.productId);

      await this.addAuditLog(
        certificationId,
        'CERTIFICATION_COMPLETED_AND_PRODUCT_PUBLISHED',
        {
          score: verificationScore,
          productId: certification.productId,
          productStatus: 'published',
        },
      );

      return {
        success: true,
        productId: certification.productId,
      };
    } catch (error: any) {
      console.error('Erreur complétion certification et publication:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Ajouter les images des checkpoints au produit
   */
  private async addCheckpointImagesToProduct(
    certificationId: string,
    productId: string,
  ): Promise<void> {
    try {
      const certRef = doc(this.firestore, 'certifications', certificationId);
      const certSnap = await getDoc(certRef);

      if (!certSnap.exists()) return;

      const certification = certSnap.data() as Certification;
      const checkpointImages = certification.checkpoints
        .filter((cp) => cp.photoUrl)
        .map((cp) => cp.photoUrl)
        .filter((url): url is string => !!url);

      if (checkpointImages.length > 0) {
        await this.firebaseService.updateProduct(productId, {
          images: checkpointImages,
        });
      }
    } catch (error) {
      console.error('Erreur ajout images checkpoint au produit:', error);
    }
  }

  // ============== CALCULS ET VALIDATION ==============

  /**
   * Calculer le score de vérification
   */
  private async calculateVerificationScore(
    certificationId: string,
  ): Promise<number> {
    try {
      const certRef = doc(this.firestore, 'certifications', certificationId);
      const certSnap = await getDoc(certRef);

      if (!certSnap.exists()) return 0;

      const certification = certSnap.data() as Certification;
      let score = 0;

      // Checkpoints complétés (60%)
      const checkpointScore =
        (certification.completedCheckpoints / certification.totalCheckpoints) *
        60;
      score += checkpointScore;

      // Vérification blockchain (30%)
      const verifiedCheckpoints = certification.checkpoints.filter(
        (cp) => cp.blockchainVerified,
      ).length;
      const blockchainScore =
        (verifiedCheckpoints / certification.totalCheckpoints) * 30;
      score += blockchainScore;

      // Cohérence temporelle (5%)
      const timeConsistency = this.checkTimeConsistency(certification);
      score += timeConsistency ? 5 : 0;

      // Cohérence spatiale (5%)
      const locationConsistency = this.checkLocationConsistency(certification);
      score += locationConsistency ? 5 : 0;

      return Math.round(score);
    } catch (error) {
      console.error('Erreur calcul score:', error);
      return 0;
    }
  }

  /**
   * Vérifier la cohérence temporelle
   */
  private checkTimeConsistency(certification: Certification): boolean {
    if (!certification.checkpoints || certification.checkpoints.length < 2) {
      return true;
    }

    const completedCheckpoints = certification.checkpoints.filter(
      (cp) => cp.completed && cp.completedAt,
    );

    if (completedCheckpoints.length < 2) return true;

    for (let i = 1; i < completedCheckpoints.length; i++) {
      const current = completedCheckpoints[i];
      const previous = completedCheckpoints[i - 1];

      if (!current.completedAt || !previous.completedAt) continue;

      const currentDate =
        current.completedAt instanceof Date
          ? current.completedAt
          : new Date(current.completedAt);
      const previousDate =
        previous.completedAt instanceof Date
          ? previous.completedAt
          : new Date(previous.completedAt);

      const currentExpectedDays = current.daysFromStart || 0;
      const previousExpectedDays = previous.daysFromStart || 0;
      const expectedDaysDiff = currentExpectedDays - previousExpectedDays;

      const actualDaysDiff = Math.abs(
        (currentDate.getTime() - previousDate.getTime()) /
          (1000 * 60 * 60 * 24),
      );

      if (Math.abs(actualDaysDiff - expectedDaysDiff) > 3) {
        return false;
      }
    }

    return true;
  }

  /**
   * Vérifier la cohérence spatiale
   */
  private checkLocationConsistency(certification: Certification): boolean {
    const checkpointsWithLocation = certification.checkpoints.filter(
      (cp) => cp.locationRequired && cp.location,
    );

    if (checkpointsWithLocation.length < 2) return true;

    for (let i = 1; i < checkpointsWithLocation.length; i++) {
      const current = checkpointsWithLocation[i];
      const previous = checkpointsWithLocation[i - 1];

      if (!current.location || !previous.location) continue;

      const distance = this.calculateDistance(
        current.location.lat,
        current.location.lng,
        previous.location.lat,
        previous.location.lng,
      );

      if (distance > 100) {
        return false;
      }
    }

    return true;
  }

  // ============== CERTIFICATS ==============

  /**
   * Générer un certificat
   */
  public async generateCertificate(certificationId: string): Promise<{
    certificateUrl: string;
    qrCodeUrl: string;
    verificationUrl: string;
  }> {
    try {
      const certRef = doc(this.firestore, 'certifications', certificationId);
      await updateDoc(certRef, {
        hasCertificate: true,
        certificateGeneratedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return {
        certificateUrl: `/verify/${certificationId}`,
        qrCodeUrl: '',
        verificationUrl: `/verify/${certificationId}`,
      };
    } catch (error) {
      console.error('Erreur génération certificat:', error);
      return {
        certificateUrl: `/verify/${certificationId}`,
        qrCodeUrl: '',
        verificationUrl: `/verify/${certificationId}`,
      };
    }
  }

  /**
   * Générer un certificat (version publique)
   */
  async generateCertificatePublic(certificationId: string): Promise<{
    certificateUrl: string;
    qrCodeUrl: string;
    verificationUrl: string;
  }> {
    return this.generateCertificate(certificationId);
  }

  // ============== VÉRIFICATION ==============

  /**
   * Vérifier une certification (pour acheteurs)
   */
  async verifyCertification(certificationId: string): Promise<{
    valid: boolean;
    details: any;
    score: number;
    warnings: string[];
  }> {
    try {
      const certRef = doc(this.firestore, 'certifications', certificationId);
      const certSnap = await getDoc(certRef);

      if (!certSnap.exists()) {
        return {
          valid: false,
          details: null,
          score: 0,
          warnings: ['Certification non trouvée'],
        };
      }

      const certification = certSnap.data() as Certification;
      const warnings: string[] = [];

      if (
        certification.status !== 'completed' &&
        certification.status !== 'verified'
      ) {
        warnings.push('Certification non complétée');
      }

      if (certification.completedCheckpoints < certification.totalCheckpoints) {
        warnings.push('Tous les checkpoints ne sont pas complétés');
      }

      const blockchainVerifiedCount = certification.checkpoints.filter(
        (cp) => cp.blockchainVerified,
      ).length;

      if (blockchainVerifiedCount < certification.totalCheckpoints) {
        warnings.push(
          `${certification.totalCheckpoints - blockchainVerifiedCount} preuves non vérifiées sur blockchain`,
        );
      }

      const timeConsistent = this.checkTimeConsistency(certification);
      if (!timeConsistent) {
        warnings.push('Incohérences temporelles détectées');
      }

      const locationConsistent = this.checkLocationConsistency(certification);
      if (!locationConsistent) {
        warnings.push('Incohérences spatiales détectées');
      }

      const score = await this.calculateVerificationScore(certificationId);
      const valid = score >= 70 && warnings.length === 0;

      return {
        valid,
        details: certification,
        score,
        warnings,
      };
    } catch (error) {
      console.error('Erreur vérification:', error);
      return {
        valid: false,
        details: null,
        score: 0,
        warnings: ['Erreur lors de la vérification'],
      };
    }
  }

  // ============== UTILITAIRES PUBLICS ==============

  /**
   * Récupérer les templates disponibles
   */
  getAvailableTemplates(): CertificationTemplate[] {
    return this.certificationTemplates;
  }

  /**
   * Notifier les acheteurs d'un nouveau produit certifié
   */
  private async notifyBuyersAboutNewCertifiedProduct(
    productId: string,
  ): Promise<void> {
    try {
      console.log(
        `Notification: Nouveau produit certifié disponible: ${productId}`,
      );
      // Implémentation à ajouter selon les besoins
    } catch (error) {
      console.error('Erreur notification acheteurs:', error);
    }
  }

  // services/certification.service.ts
  // Ajouter dans le service existant

  async validateCheckpointImage(
    certificationId: string,
    checkpointIndex: number,
    currentImage: File,
  ): Promise<{
    valid: boolean;
    similarity: number;
    warnings: string[];
    action: 'accept' | 'review' | 'reject';
  }> {
    try {
      // Récupérer la certification
      const certification = await this.getCertificationById(certificationId);
      if (!certification) {
        throw new Error('Certification non trouvée');
      }

      // Si c'est le premier checkpoint, pas de comparaison
      if (checkpointIndex === 0) {
        return {
          valid: true,
          similarity: 100,
          warnings: [],
          action: 'accept',
        };
      }

      // Récupérer l'image du checkpoint précédent
      const previousCheckpoint = certification.checkpoints[checkpointIndex - 1];
      if (!previousCheckpoint?.ipfsUrl) {
        return {
          valid: true,
          similarity: 100,
          warnings: [],
          action: 'accept',
        };
      }

      // Comparer les images
      const comparison = await this.imageComparisonService.compareImages(
        currentImage,
        previousCheckpoint.ipfsUrl,
        {
          previousCheckpointDate: previousCheckpoint.completedAt,
          expectedGrowthDays:
            certification.checkpoints[checkpointIndex].daysFromStart -
            previousCheckpoint.daysFromStart,
          location: previousCheckpoint.location,
        },
      );

      // Journaliser sur blockchain si incohérence
      if (comparison.action === 'reject' || comparison.warnings.length > 2) {
        await this.blockchainService.logInconsistency({
          certificationId,
          checkpointIndex,
          similarity: comparison.similarity,
          warnings: comparison.warnings,
          timestamp: new Date(),
        });
      }

      return {
        valid: comparison.isValid,
        similarity: comparison.similarity,
        warnings: comparison.warnings,
        action: comparison.action,
      };
    } catch (error) {
      console.error('Erreur validation image:', error);
      // En cas d'erreur, on laisse passer mais on log
      return {
        valid: true, // Bénéfice du doute
        similarity: 0,
        warnings: [`⚠️ Erreur technique: ${error}`],
        action: 'review',
      };
    }
  }
}

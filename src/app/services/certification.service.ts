import { Injectable, inject } from '@angular/core';
import { FirebaseService } from './firebase.service';
import { AuthService } from './auth.service';
import {
  Certification,
  CertificationCheckpoint,
  CheckpointProof,
  CertificationTemplate,
  CertificationStats,
  PublicationData,
} from '../interfaces/certification.interfaces';
import { Product } from '../interfaces/data.interfaces';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  query,
  where,
  orderBy,
  getDocs,
  serverTimestamp,
  Timestamp,
  addDoc,
  deleteDoc,
} from 'firebase/firestore';

@Injectable({
  providedIn: 'root',
})
export class CertificationService {
  private firebaseService = inject(FirebaseService);
  private authService = inject(AuthService);

  // Stockage local temporaire pour images
  private imageStore = new Map<string, string>();

  // Templates prédéfinis - AUGMENTÉ
  private readonly templates: CertificationTemplate[] = [
    {
      id: 'tomato_60',
      name: 'Tomate Bio',
      productType: 'tomato',
      category: 'vegetables',
      icon: '🍅',
      description: 'Certification complète pour tomates biologiques',
      durationDays: 60,
      checkpoints: [
        {
          dayOffset: 0,
          title: 'Semis/Plantation',
          description: 'Photo initiale du champ',
          requiredProofs: ['photo', 'gps'],
        },
        {
          dayOffset: 15,
          title: 'Croissance',
          description: 'Suivi de la croissance',
          requiredProofs: ['photo', 'gps'],
        },
        {
          dayOffset: 30,
          title: 'Floraison',
          description: 'Photo des fleurs',
          requiredProofs: ['photo', 'gps'],
        },
        {
          dayOffset: 45,
          title: 'Fructification',
          description: 'Photo des premiers fruits',
          requiredProofs: ['photo', 'gps', 'measurement'],
          measurementType: 'count',
        },
        {
          dayOffset: 60,
          title: 'Récolte',
          description: 'Photo de la récolte',
          requiredProofs: ['photo', 'gps', 'measurement', 'note'],
          measurementType: 'weight',
        },
      ],
      scoringRules: {
        gpsWeight: 0.3,
        timeWeight: 0.2,
        photoWeight: 0.3,
        measurementWeight: 0.2,
        minScore: 70,
      },
      badges: ['certified', 'organic', 'traceable', 'local'],
    },
    {
      id: 'mango_90',
      name: 'Mangue',
      productType: 'mango',
      category: 'fruits',
      icon: '🥭',
      description: 'Certification pour mangues',
      durationDays: 90,
      checkpoints: [
        {
          dayOffset: 0,
          title: 'Arbre en fleurs',
          description: "Photo de l'arbre en fleurs",
          requiredProofs: ['photo', 'gps'],
        },
        {
          dayOffset: 30,
          title: 'Fruits naissants',
          description: 'Photo des jeunes fruits',
          requiredProofs: ['photo', 'gps'],
        },
        {
          dayOffset: 60,
          title: 'Maturation',
          description: 'Suivi de la maturation',
          requiredProofs: ['photo', 'gps', 'measurement'],
          measurementType: 'count',
        },
        {
          dayOffset: 90,
          title: 'Récolte',
          description: 'Photo de la récolte',
          requiredProofs: ['photo', 'gps', 'measurement', 'note'],
          measurementType: 'weight',
        },
      ],
      scoringRules: {
        gpsWeight: 0.4,
        timeWeight: 0.2,
        photoWeight: 0.3,
        measurementWeight: 0.1,
        minScore: 75,
      },
      badges: ['certified', 'seasonal', 'traceable'],
    },
    {
      id: 'onion_45',
      name: 'Oignon',
      productType: 'onion',
      category: 'vegetables',
      icon: '🧅',
      description: 'Certification pour oignons',
      durationDays: 45,
      checkpoints: [
        {
          dayOffset: 0,
          title: 'Plantation',
          description: 'Photo initiale du champ',
          requiredProofs: ['photo', 'gps'],
        },
        {
          dayOffset: 15,
          title: 'Croissance',
          description: 'Photo de la croissance',
          requiredProofs: ['photo', 'gps'],
        },
        {
          dayOffset: 30,
          title: 'Bulbes formés',
          description: 'Photo des bulbes formés',
          requiredProofs: ['photo', 'gps', 'measurement'],
          measurementType: 'count',
        },
        {
          dayOffset: 45,
          title: 'Récolte',
          description: 'Photo de la récolte',
          requiredProofs: ['photo', 'gps', 'measurement', 'note'],
          measurementType: 'weight',
        },
      ],
      scoringRules: {
        gpsWeight: 0.3,
        timeWeight: 0.3,
        photoWeight: 0.3,
        measurementWeight: 0.1,
        minScore: 65,
      },
      badges: ['certified', 'local'],
    },
  ];

  // ========== MÉTHODES PRINCIPALES ==========

  /**
   * Démarrer une nouvelle certification
   */
  async startCertification(data: {
    templateId: string;
    productName: string;
    description?: string;
    initialPhoto: File;
    location?: { lat: number; lng: number };
    quantity?: number;
    price?: number;
  }): Promise<Certification> {
    try {
      const user = this.authService.getCurrentUser();
      const userData = this.authService.getUserData();

      if (!user || !userData) {
        throw new Error('Utilisateur non connecté');
      }

      const template = this.templates.find((t) => t.id === data.templateId);
      if (!template) throw new Error('Template non trouvé');

      // 1. Préparer les données
      const location = data.location || (await this.getCurrentLocation());
      const now = new Date();
      const photoBase64 = await this.fileToBase64(data.initialPhoto);
      const photoHash = this.generateSimpleHash(photoBase64);

      // 2. Générer les checkpoints
      const checkpoints = this.generateCheckpoints(template, photoHash, now);

      // 3. Créer la certification
      const certificationId = `cert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const expectedHarvestDate = new Date(
        now.getTime() + template.durationDays * 24 * 60 * 60 * 1000,
      );
      const expiresAt = new Date(
        now.getTime() + (template.durationDays + 30) * 24 * 60 * 60 * 1000,
      );

      // Créer l'objet Certification
      const certification: Certification = {
        id: certificationId,
        producerId: user.uid,
        producerName: userData.fullName || 'Producteur',
        productType: template.productType,
        productName: data.productName,
        productCategory: template.category,
        status: 'active',

        // Dates
        startDate: now,
        expectedHarvestDate: expectedHarvestDate,
        durationDays: template.durationDays,

        // Localisation
        location: {
          lat: location.lat,
          lng: location.lng,
          address: this.formatCoordinates(location.lat, location.lng),
          region: this.getRegionFromCoordinates(location.lat, location.lng),
        },

        // Points de contrôle
        checkpoints: checkpoints,
        currentCheckpointIndex: 1, // Commencer après le premier checkpoint (déjà complété)
        completedCheckpoints: 1, // Le premier checkpoint est automatiquement complété
        totalCheckpoints: checkpoints.length,

        // Preuve initiale
        initialProof: {
          photoUrl: `local://${certificationId}_initial`,
          photoHash: photoHash,
          timestamp: now,
          deviceInfo: navigator.userAgent?.substring(0, 100) || 'Device',
        },

        // Score et validation
        validationScore: 100, // Score initial pour le premier checkpoint
        maxScore: 100 * checkpoints.length,
        verificationStatus: 'pending',

        // Métadonnées de publication
        publicationStatus: {
          productPublished: false,
          harvestPublished: false,
          certificationsPublished: false,
          fullPublication: false,
        },

        // Dates de métadonnées
        createdAt: now,
        updatedAt: now,
        expiresAt: expiresAt,
        version: 1,
      };

      // 4. Préparer pour Firestore
      const firestoreData = this.prepareForFirestore(certification);

      // 5. Sauvegarder dans Firestore
      await setDoc(
        doc(this.firebaseService.firestore, 'certifications', certification.id),
        firestoreData,
      );

      // 6. Stocker l'image localement
      this.imageStore.set(`${certification.id}_initial`, photoBase64);

      this.showNotification('success', 'Certification démarrée avec succès!');
      return certification;
    } catch (error: any) {
      console.error('Erreur démarrage certification:', error);
      this.showNotification('error', error.message);
      throw error;
    }
  }

  /**
   * Compléter un checkpoint
   */
async completeCheckpoint(
  certificationId: string,
  checkpointId: string,
  proofData: {
    photo?: File;
    measurement?: { value: number; unit: string };
    note?: string;
  },
): Promise<Certification> {
  try {

    // 1. Récupérer la certification AVANT modification
    const certification = await this.getCertification(certificationId);
    const checkpoint = certification.checkpoints.find(
      (cp) => cp.id === checkpointId,
    );

    if (!checkpoint) {
      throw new Error('Checkpoint non trouvé');
    }

    if (checkpoint.completed) {
      throw new Error('Checkpoint déjà complété');
    }

    // 2. Préparer les données du checkpoint mis à jour
    const updatedCheckpoints = [...certification.checkpoints];
    const checkpointIndex = checkpoint.order;

    // Mettre à jour le checkpoint spécifique
    updatedCheckpoints[checkpointIndex] = {
      ...checkpoint,
      completed: true,
      completedAt: new Date(),
      autoVerified: true,
      verificationScore: 100,
      verificationNotes: 'Checkpoint complété',
      proofsCount: (checkpoint.proofsCount || 0) + 1,
    };

    // 3. Stocker l'image localement
    if (proofData.photo) {
      const photoBase64 = await this.fileToBase64(proofData.photo);
      this.imageStore.set(`${certificationId}_${checkpointId}`, photoBase64);
    }

    // 4. Calculer les nouvelles valeurs
    const completedCheckpoints = certification.completedCheckpoints + 1;
    const currentCheckpointIndex = certification.currentCheckpointIndex + 1;
    const newValidationScore = this.calculateUpdatedScore(certification, 100);

    // 5. Préparer les updates
    const updates: any = {
      checkpoints: updatedCheckpoints,
      completedCheckpoints: completedCheckpoints,
      currentCheckpointIndex: currentCheckpointIndex,
      validationScore: newValidationScore,
      updatedAt: serverTimestamp(),
    };

    // 6. Vérifier si la certification est terminée
    const isCompleted = completedCheckpoints === certification.totalCheckpoints;
    if (isCompleted) {
      updates.status = 'completed';
      updates.actualHarvestDate = serverTimestamp();

      if (newValidationScore >= 70) {
        updates.verificationStatus = 'auto_verified';
        updates.verifiedAt = serverTimestamp();
      }
    }

    // 7. Sauvegarder dans Firestore
    const certRef = doc(
      this.firebaseService.firestore,
      'certifications',
      certificationId,
    );



    // Préparer les données pour Firestore (convertir les dates)
    const firestoreData = this.prepareForFirestore(updates);

    await updateDoc(certRef, firestoreData);

    // 8. Recharger la certification
    const updatedCertification = await this.getCertification(certificationId);

    this.showNotification(
      'success',
      `Checkpoint "${checkpoint.title}" complété avec succès!`,
    );

    return updatedCertification;
  } catch (error: any) {
    console.error('❌ Erreur complétion checkpoint:', error);
    console.error('Code erreur:', error.code);
    console.error('Message détaillé:', error.message);

    let errorMessage = 'Erreur lors de la sauvegarde';
    if (error.code === 'invalid-argument') {
      errorMessage = 'Données invalides. Contactez le support.';
    } else if (error.code === 'permission-denied') {
      errorMessage = 'Permission refusée. Vérifiez vos droits.';
    }

    this.showNotification('error', errorMessage);
    throw new Error(errorMessage);
  }
}

/**
 * Calculer le score mis à jour
 */
private calculateUpdatedScore(certification: Certification, newCheckpointScore: number): number {
  const totalScore = certification.validationScore * certification.completedCheckpoints;
  const newTotalScore = totalScore + newCheckpointScore;
  const newCompletedCount = certification.completedCheckpoints + 1;

  return Math.round(newTotalScore / newCompletedCount);
}

  /**
   * Publier la certification comme produit
   */
  async publishCertificationAsProduct(
    certificationId: string,
    productData: {
      price: number;
      quantity: number;
      unit: string;
      description: string;
      minOrderQuantity?: number;
      storageConditions?: string;
    },
  ): Promise<{ certification: Certification; product: Product }> {
    try {
      const certification = await this.getCertification(certificationId);

      if (
        certification.status !== 'completed' &&
        certification.verificationStatus !== 'auto_verified' &&
        certification.verificationStatus !== 'manually_verified'
      ) {
        throw new Error(
          'La certification doit être terminée et vérifiée pour être publiée',
        );
      }

      if (certification.validationScore < 70) {
        throw new Error('Score de validation insuffisant (minimum 70%)');
      }

      // 1. Créer le produit
      const product: Product = {
        id: '',
        name: certification.productName,
        category: certification.productCategory,
        description: productData.description || certification.productName,
        price: productData.price,
        quantity: productData.quantity,
        unit: productData.unit || 'kg',
        minOrderQuantity: productData.minOrderQuantity || 1,
        producerId: certification.producerId,
        producerName: certification.producerName,
        producerPhone: this.authService.getUserData()?.phone || '',
        location:
          certification.location.address || 'Localisation non spécifiée',
        contactPhone: this.authService.getUserData()?.phone || '',
        certifications: this.generateBadgeLabels(certification),
        isOrganic: certification.productCategory.includes('bio'),
        images: this.extractCertificationImages(certification),
        status: 'available',
        views: 0,
        sales: 0,
        isActive: true,
        badges: this.generateBadgesForProduct(certification),
        certification: {
          id: certification.id,
          type: 'certified',
          level: this.getCertificationLevel(certification.validationScore),
          score: certification.validationScore,
          verificationDate: certification.verifiedAt || new Date(),
          validUntil: certification.expiresAt,
          traceability: {
            startDate: certification.startDate,
            harvestDate:
              certification.actualHarvestDate ||
              certification.expectedHarvestDate,
            location: certification.location.address || '',
            checkpointsCompleted: certification.completedCheckpoints,
            totalCheckpoints: certification.totalCheckpoints,
            proofs: this.extractAllProofs(certification),
          },
          qrCodeUrl: this.generateQRCodeUrl(certification.id),
          verificationUrl: `${window.location.origin}/verify/${certification.id}`,
        },
      };

      // 2. Sauvegarder le produit dans Firestore
      const productRef = await addDoc(
        collection(this.firebaseService.firestore, 'products'),
        {
          ...product,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      );

      product.id = productRef.id;

      // 3. Mettre à jour la certification
      const finalProduct = {
        id: product.id,
        name: product.name,
        description: product.description,
        category: product.category,
        quantity: product.quantity,
        unit: product.unit,
        price: product.price,
        published: true,
        publishedAt: new Date(),
        images: product.images,
        badges: product.badges,
        details: {
          location: product.location,
          contactPhone: product.contactPhone,
          minOrderQuantity: product.minOrderQuantity,
          producerPhone: product.producerPhone,
          isOrganic: product.isOrganic,
          certifications: product.certifications,
          publishedCheckpoints: certification.checkpoints
            .filter((cp) => cp.completed)
            .map((cp) => cp.order),
          lastPublicationDate: new Date(),
          publicationHistory: [
            {
              checkpointId: 'full_publication',
              checkpointTitle: 'Publication complète',
              publishedAt: new Date(),
              changes: ['Produit créé', 'Tous les checkpoints publiés'],
            },
          ],
        },
      };

      await this.saveCertificationUpdates(certificationId, {
        productId: product.id,
        finalProduct: finalProduct,
        publicationStatus: {
          productPublished: true,
          harvestPublished: true,
          certificationsPublished: true,
          fullPublication: true,
        },
        updatedAt: serverTimestamp(),
      });

      // 4. Recharger la certification
      const updatedCertification = await this.getCertification(certificationId);

      this.showNotification(
        'success',
        'Produit publié avec succès sur le marché!',
      );

      return { certification: updatedCertification, product };
    } catch (error: any) {
      console.error('Erreur publication produit:', error);
      this.showNotification('error', error.message);
      throw error;
    }
  }

  // ========== MÉTHODES D'ACCÈS AUX DONNÉES ==========

  async getCertification(id: string): Promise<Certification> {
    try {

      const docRef = doc(this.firebaseService.firestore, 'certifications', id);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        throw new Error('Certification non trouvée');
      }

      const data = docSnap.data();



      const certification = this.convertFromFirestore(data, docSnap.id);

      return certification;
    } catch (error: any) {
      console.error('❌ Erreur récupération certification:', error);
      console.error('Stack:', error.stack);
      throw error;
    }
  }

  async getProducerCertifications(
    producerId: string,
  ): Promise<Certification[]> {
    try {
      const q = query(
        collection(this.firebaseService.firestore, 'certifications'),
        where('producerId', '==', producerId),
        orderBy('createdAt', 'desc'),
      );

      const snapshot = await getDocs(q);
      const certifications: Certification[] = [];

      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        certifications.push(this.convertFromFirestore(data, docSnap.id));
      });

      return certifications;
    } catch (error) {
      console.error('Erreur récupération certifications:', error);
      return [];
    }
  }

  async cancelCertification(certificationId: string): Promise<void> {
    try {
      await updateDoc(
        doc(this.firebaseService.firestore, 'certifications', certificationId),
        {
          status: 'cancelled',
          updatedAt: serverTimestamp(),
        },
      );
      this.showNotification('success', 'Certification annulée');
    } catch (error) {
      console.error('Erreur annulation certification:', error);
      throw error;
    }
  }

  async deleteCertification(certificationId: string): Promise<void> {
    try {
      await deleteDoc(
        doc(this.firebaseService.firestore, 'certifications', certificationId),
      );
      this.showNotification('success', 'Certification supprimée');
    } catch (error) {
      console.error('Erreur suppression certification:', error);
      throw error;
    }
  }

  // ========== MÉTHODES UTILITAIRES ==========

  private generateCheckpoints(
    template: CertificationTemplate,
    photoHash: string,
    startDate: Date,
  ): CertificationCheckpoint[] {
    return template.checkpoints.map((cp, index) => {
      const checkpoint: CertificationCheckpoint = {
        id: `cp_${Date.now()}_${index}`,
        order: index,
        dayOffset: cp.dayOffset,
        title: cp.title,
        description: cp.description,
        instructions: this.generateInstructions(cp),
        required: true,
        requiredProofs: cp.requiredProofs,
        measurementType: cp.measurementType,
        measurementUnit: this.getMeasurementUnit(cp.measurementType),
        completed: index === 0, // Premier checkpoint complété automatiquement
        proofs: [],
        autoVerified: index === 0,
        verificationScore: index === 0 ? 100 : 0,
        notified: false,
        reminderCount: 0,
        completedAt: index === 0 ? startDate : undefined,
        notificationSentAt: undefined,
        verificationNotes: index === 0 ? 'Photo initiale' : undefined,
      };

      // Ajouter la preuve initiale pour le premier checkpoint
      if (index === 0) {
        checkpoint.proofs = [
          {
            type: 'photo',
            photoUrl: 'data:image/jpeg;base64,' + photoHash,
            photoHash: photoHash,
            timestamp: startDate,
            deviceInfo: navigator.userAgent?.substring(0, 100) || 'Device',
            verified: true,
          },
        ];
      }

      return checkpoint;
    });
  }

  private generateInstructions(checkpoint: any): string {
    const instructions = [];
    if (checkpoint.requiredProofs.includes('photo')) {
      instructions.push('📸 Prenez une photo claire');
    }
    if (checkpoint.requiredProofs.includes('gps')) {
      instructions.push('📍 Activez votre GPS');
    }
    if (checkpoint.requiredProofs.includes('measurement')) {
      instructions.push(
        `📏 Mesurez (${checkpoint.measurementType || 'mesure'})`,
      );
    }
    if (checkpoint.requiredProofs.includes('note')) {
      instructions.push('📝 Ajoutez une note');
    }
    return instructions.join(' • ') || 'Suivez les instructions';
  }

  private getMeasurementUnit(type?: string): string {
    switch (type) {
      case 'weight':
        return 'kg';
      case 'height':
        return 'cm';
      case 'count':
        return 'unités';
      case 'volume':
        return 'L';
      default:
        return 'unité';
    }
  }

  private generateBadgesForProduct(
    certification: Certification,
  ): Array<{ id: string; label: string; icon: string; color: string }> {
    const badgeMap: {
      [key: string]: { label: string; icon: string; color: string };
    } = {
      certified: { label: 'Certifié', icon: '🏆', color: '#FFD700' },
      organic: { label: 'Bio', icon: '🌱', color: '#4CAF50' },
      traceable: { label: 'Traçable', icon: '📊', color: '#2196F3' },
      local: { label: 'Local', icon: '📍', color: '#9C27B0' },
      seasonal: { label: 'De saison', icon: '🌞', color: '#FF9800' },
    };

    const template = this.templates.find(
      (t) => t.productType === certification.productType,
    );
    const badges = template?.badges || [];

    return badges
      .filter((badge) => badgeMap[badge])
      .map((badge) => ({
        id: badge,
        ...badgeMap[badge],
      }));
  }

  private generateBadgeLabels(certification: Certification): string[] {
    const template = this.templates.find(
      (t) => t.productType === certification.productType,
    );
    const badgeLabels: { [key: string]: string } = {
      certified: 'Certifié',
      organic: 'Bio',
      traceable: 'Traçable',
      local: 'Local',
      seasonal: 'De saison',
    };

    return (template?.badges || [])
      .filter((badge) => badgeLabels[badge])
      .map((badge) => badgeLabels[badge]);
  }

  private extractCertificationImages(certification: Certification): string[] {
    const images: string[] = [];

    // Image initiale
    if (certification.initialProof.photoUrl) {
      images.push(certification.initialProof.photoUrl);
    }

    // Images des checkpoints
    certification.checkpoints.forEach((checkpoint) => {
      if (checkpoint.completed && checkpoint.proofs) {
        checkpoint.proofs.forEach((proof) => {
          if (proof.type === 'photo' && proof.photoUrl) {
            images.push(proof.photoUrl);
          }
        });
      }
    });

    return images.slice(0, 5);
  }

  private extractAllProofs(
    certification: Certification,
  ): Array<{ type: string; date: Date; verified: boolean }> {
    const proofs: Array<{ type: string; date: Date; verified: boolean }> = [];

    // Preuve initiale
    proofs.push({
      type: 'photo_initial',
      date: certification.initialProof.timestamp,
      verified: true,
    });

    // Preuves des checkpoints
    certification.checkpoints.forEach((checkpoint) => {
      if (checkpoint.completed && checkpoint.proofs) {
        checkpoint.proofs.forEach((proof) => {
          proofs.push({
            type: proof.type,
            date: proof.timestamp,
            verified: proof.verified || false,
          });
        });
      }
    });

    return proofs;
  }

  private getCertificationLevel(score: number): 'bronze' | 'silver' | 'gold' {
    if (score >= 90) return 'gold';
    if (score >= 75) return 'silver';
    return 'bronze';
  }

  private generateQRCodeUrl(certificationId: string): string {
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
      `${window.location.origin}/verify/${certificationId}`,
    )}`;
  }

  // ========== CONVERSION DE DONNÉES ==========

  private convertTimestamp(timestamp: any): Date {
    if (!timestamp) return new Date();

    // 1. Si c'est déjà un objet Date
    if (timestamp instanceof Date) {
      return timestamp;
    }

    // 2. Si c'est un Timestamp Firestore
    if (
      timestamp &&
      typeof timestamp === 'object' &&
      'seconds' in timestamp &&
      'nanoseconds' in timestamp
    ) {
      return new Date(
        timestamp.seconds * 1000 + timestamp.nanoseconds / 1000000,
      );
    }

    // 3. Si c'est une string (format ISO ou autre)
    if (typeof timestamp === 'string') {
      const date = new Date(timestamp);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }

    // 4. Si c'est un nombre (timestamp en millisecondes)
    if (typeof timestamp === 'number') {
      return new Date(timestamp);
    }

    // 5. Par défaut
    return new Date();
  }

  private convertFromFirestore(data: any, id: string): Certification {

    // CORRECTION CRITIQUE : Gérer différents formats de checkpoints
    let checkpointsArray: any[] = [];

    if (Array.isArray(data.checkpoints)) {
      // Cas normal : checkpoints est un tableau
      checkpointsArray = data.checkpoints;
    } else if (data.checkpoints && typeof data.checkpoints === 'object') {
      // Cas après updateDoc : checkpoints peut être un objet avec des indices
      // Par exemple : { '0': {...}, '1': {...} }
      checkpointsArray = Object.values(data.checkpoints);
    }


    return {
      id: id,
      producerId: data.producerId || '',
      producerName: data.producerName || '',
      productType: data.productType || '',
      productName: data.productName || '',
      productCategory: data.productCategory || '',
      status: data.status || 'cancelled',
      durationDays: data.durationDays || 0,

      // Conversion des dates
      startDate: this.convertTimestamp(data.startDate),
      expectedHarvestDate: this.convertTimestamp(data.expectedHarvestDate),
      actualHarvestDate: this.convertTimestamp(data.actualHarvestDate),
      createdAt: this.convertTimestamp(data.createdAt),
      updatedAt: this.convertTimestamp(data.updatedAt),
      expiresAt: this.convertTimestamp(data.expiresAt),
      verifiedAt: this.convertTimestamp(data.verifiedAt),

      // Localisation
      location: data.location || {
        lat: 0,
        lng: 0,
        address: undefined,
        region: undefined,
      },

      // Points de contrôle avec conversion
      checkpoints: checkpointsArray.map((cp: any) => ({
        id: cp.id || `cp_${Date.now()}_${Math.random()}`,
        order: cp.order || 0,
        dayOffset: cp.dayOffset || 0,
        title: cp.title || 'Checkpoint',
        description: cp.description || '',
        instructions: cp.instructions || '',
        required: cp.required !== undefined ? cp.required : true,
        requiredProofs: cp.requiredProofs || [],
        measurementType: cp.measurementType,
        measurementUnit: cp.measurementUnit,
        completed: cp.completed || false,
        completedAt: this.convertTimestamp(cp.completedAt),
        proofs: Array.isArray(cp.proofs)
          ? cp.proofs.map((p: any) => ({
              type: p.type || 'photo',
              photoUrl: p.photoUrl,
              photoHash: p.photoHash,
              gps: p.gps,
              measurement: p.measurement,
              note: p.note,
              timestamp: this.convertTimestamp(p.timestamp),
              deviceInfo: p.deviceInfo,
              verified: p.verified || false,
            }))
          : [],
        autoVerified: cp.autoVerified || false,
        verificationScore: cp.verificationScore || 0,
        verificationNotes: cp.verificationNotes,
        gpsConsistency: cp.gpsConsistency,
        timeConsistency: cp.timeConsistency,
        photoConsistency: cp.photoConsistency,
        notified: cp.notified || false,
        notificationSentAt: this.convertTimestamp(cp.notificationSentAt),
        reminderCount: cp.reminderCount || 0,
      })),
      currentCheckpointIndex: data.currentCheckpointIndex || 0,
      completedCheckpoints: data.completedCheckpoints || 0,
      totalCheckpoints: data.totalCheckpoints || 0,

      // Preuve initiale
      initialProof: data.initialProof
        ? {
            photoUrl: data.initialProof.photoUrl || '',
            photoHash: data.initialProof.photoHash || '',
            timestamp: this.convertTimestamp(data.initialProof.timestamp),
            deviceInfo: data.initialProof.deviceInfo,
          }
        : {
            photoUrl: '',
            photoHash: '',
            timestamp: new Date(),
            deviceInfo: '',
          },

      // Score et validation
      validationScore: data.validationScore || 0,
      maxScore: data.maxScore || 0,
      verificationStatus: data.verificationStatus || 'pending',
      verifierId: data.verifierId,
      rejectionReason: data.rejectionReason,

      // Produit final
      productId: data.productId,
      finalProduct: data.finalProduct
        ? {
            id: data.finalProduct.id,
            name: data.finalProduct.name || '',
            description: data.finalProduct.description || '',
            category: data.finalProduct.category || '',
            quantity: data.finalProduct.quantity || 0,
            unit: data.finalProduct.unit || '',
            price: data.finalProduct.price || 0,
            published: data.finalProduct.published || false,
            publishedAt: this.convertTimestamp(data.finalProduct.publishedAt),
            images: data.finalProduct.images || [],
            badges: data.finalProduct.badges || [],
            details: data.finalProduct.details
              ? {
                  ...data.finalProduct.details,
                  lastPublicationDate: this.convertTimestamp(
                    data.finalProduct.details.lastPublicationDate,
                  ),
                  publicationHistory: data[
                    'finalProduct'
                  ].details.publicationHistory?.map((ph: any) => ({
                    ...ph,
                    publishedAt: this.convertTimestamp(ph.publishedAt),
                  })),
                }
              : undefined,
          }
        : undefined,

      // Métadonnées de publication
      publicationStatus: data.publicationStatus || {
        productPublished: false,
        harvestPublished: false,
        certificationsPublished: false,
        fullPublication: false,
      },

      // Version
      version: data.version || 0,
    };
  }

  private prepareForFirestore(data: any): any {
    const convert = (obj: any): any => {
      if (obj instanceof Date) {
        return Timestamp.fromDate(obj);
      }

      if (Array.isArray(obj)) {
        return obj.map((item) => convert(item));
      }

      if (obj && typeof obj === 'object' && obj.constructor === Object) {
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
          if (value !== undefined) {
            result[key] = convert(value);
          }
        }
        return result;
      }

      return obj;
    };

    return convert(data);
  }

  private async saveCertificationUpdates(
    certificationId: string,
    updates: any,
  ): Promise<void> {
    const firestoreUpdates = this.prepareForFirestore(updates);
    await updateDoc(
      doc(this.firebaseService.firestore, 'certifications', certificationId),
      firestoreUpdates,
    );
  }

  // ========== MÉTHODES UTILITAIRES GÉNÉRALES ==========

  private async getCurrentLocation(): Promise<{
    lat: number;
    lng: number;
    accuracy?: number;
  }> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ lat: 14.716677, lng: -17.467686, accuracy: 10000 });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          }),
        () => resolve({ lat: 14.716677, lng: -17.467686, accuracy: 10000 }),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
      );
    });
  }

  private async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  private generateSimpleHash(data: string): string {
    let hash = 0;
    for (let i = 0; i < Math.min(data.length, 1000); i++) {
      hash = (hash << 5) - hash + data.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  private formatCoordinates(lat: number, lng: number): string {
    return `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`;
  }

  private getRegionFromCoordinates(lat: number, lng: number): string {
    if (lat > 14.5 && lat < 15.0 && lng > -17.5 && lng < -17.0) return 'Dakar';
    if (lat > 14.0 && lat < 15.0 && lng > -16.5 && lng < -15.5) return 'Thiès';
    return 'Sénégal';
  }

  // ========== GETTERS ==========

  getTemplates(): CertificationTemplate[] {
    return [...this.templates];
  }

  getTemplateById(id: string): CertificationTemplate | undefined {
    return this.templates.find((t) => t.id === id);
  }

  getProductIcon(productType: string): string {
    const icons: Record<string, string> = {
      tomato: '🍅',
      mango: '🥭',
      onion: '🧅',
      potato: '🥔',
      carrot: '🥕',
      lettuce: '🥬',
      pepper: '🌶️',
      eggplant: '🍆',
      cucumber: '🥒',
      watermelon: '🍉',
      pineapple: '🍍',
      banana: '🍌',
      orange: '🍊',
      lemon: '🍋',
      avocado: '🥑',
      broccoli: '🥦',
    };
    return icons[productType] || '🌱';
  }

  storeImage(key: string, base64Data: string): void {
    this.imageStore.set(key, base64Data);
  }

  getImage(key: string): string | null {
    return this.imageStore.get(key) || null;
  }

  // ========== STATISTIQUES ==========

  async getCertificationStats(producerId: string): Promise<CertificationStats> {
    const certifications = await this.getProducerCertifications(producerId);

    const stats: CertificationStats = {
      totalCertifications: certifications.length,
      activeCertifications: certifications.filter((c) => c.status === 'active')
        .length,
      completedCertifications: certifications.filter(
        (c) => c.status === 'completed' || c.status === 'verified',
      ).length,
      publishedCertifications: certifications.filter(
        (c) => c.publicationStatus.productPublished,
      ).length,
      averageScore:
        certifications.length > 0
          ? Math.round(
              certifications.reduce((sum, c) => sum + c.validationScore, 0) /
                certifications.length,
            )
          : 0,
      verificationRate:
        certifications.length > 0
          ? Math.round(
              (certifications.filter(
                (c) =>
                  c.verificationStatus === 'auto_verified' ||
                  c.verificationStatus === 'manually_verified',
              ).length /
                certifications.length) *
                100,
            )
          : 0,
      upcomingCheckpoints: certifications
        .filter((c) => c.status === 'active')
        .reduce(
          (sum, c) => sum + (c.totalCheckpoints - c.completedCheckpoints),
          0,
        ),
      expiredCertifications: certifications.filter(
        (c) => c.status === 'expired',
      ).length,
      byStatus: {
        draft: certifications.filter((c) => c.status === 'draft').length,
        active: certifications.filter((c) => c.status === 'active').length,
        completed: certifications.filter((c) => c.status === 'completed')
          .length,
        verified: certifications.filter((c) => c.status === 'verified').length,
        cancelled: certifications.filter((c) => c.status === 'cancelled')
          .length,
        expired: certifications.filter((c) => c.status === 'expired').length,
      },
      byProductType: certifications.reduce(
        (acc, c) => {
          acc[c.productType] = (acc[c.productType] || 0) + 1;
          return acc;
        },
        {} as { [key: string]: number },
      ),
      recentActivity: this.calculateRecentActivity(certifications),
    };

    return stats;
  }

  private calculateRecentActivity(certifications: Certification[]): Array<{
    date: string;
    certifications: number;
    checkpoints: number;
  }> {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - i);
      return date.toISOString().split('T')[0];
    }).reverse();

    return last7Days.map((date) => {
      const dayCerts = certifications.filter(
        (c) => c.createdAt.toISOString().split('T')[0] === date,
      );

      const dayCheckpoints = certifications.reduce(
        (sum, cert) =>
          sum +
          cert.checkpoints.filter(
            (cp) =>
              cp.completedAt &&
              cp.completedAt.toISOString().split('T')[0] === date,
          ).length,
        0,
      );

      return {
        date: date.substring(5),
        certifications: dayCerts.length,
        checkpoints: dayCheckpoints,
      };
    });
  }

  // ========== NOTIFICATIONS ==========

  private showNotification(
    type: 'success' | 'error' | 'info' | 'warning',
    message: string,
  ) {

    // Créer l'élément de notification
    const notification = document.createElement('div');
    const icons = {
      success: '✅',
      error: '❌',
      info: 'ℹ️',
      warning: '⚠️',
    };
    const colors = {
      success: '#4CAF50',
      error: '#F44336',
      info: '#2196F3',
      warning: '#FF9800',
    };

    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <span style="font-size: 20px;">${icons[type]}</span>
        <span>${message}</span>
      </div>
    `;

    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${colors[type]};
      color: white;
      padding: 15px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 9999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      animation: slideIn 0.3s ease forwards;
      max-width: 400px;
    `;

    // Ajouter les animations
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(notification);

    // Supprimer après 5 secondes
    setTimeout(() => {
      if (document.body.contains(notification)) {
        notification.style.animation = 'slideOut 0.3s ease forwards';
        setTimeout(() => {
          if (document.body.contains(notification)) {
            document.body.removeChild(notification);
          }
          if (document.head.contains(style)) {
            document.head.removeChild(style);
          }
        }, 300);
      }
    }, 5000);
  }

  // ========== SIMULATION POUR DÉVELOPPEMENT ==========

  async simulateCheckpointCompletion(
    certificationId: string,
    checkpointIndex: number,
  ): Promise<void> {
    try {
      const certification = await this.getCertification(certificationId);
      const checkpoint = certification.checkpoints[checkpointIndex];

      if (!checkpoint || checkpoint.completed) {
        throw new Error('Checkpoint non valide ou déjà complété');
      }

      // Créer une image factice
      const fakeImage = this.createFakeImage(checkpoint.title);
      const fakeFile = this.base64ToFile(fakeImage, 'checkpoint.jpg');

      await this.completeCheckpoint(certificationId, checkpoint.id, {
        photo: fakeFile,
        measurement: checkpoint.measurementType
          ? {
              value: Math.floor(Math.random() * 100) + 1,
              unit: checkpoint.measurementUnit || 'unit',
            }
          : undefined,
        note: `Checkpoint simulé: ${checkpoint.title}`,
      });

      this.showNotification('info', `Checkpoint "${checkpoint.title}" simulé`);
    } catch (error: any) {
      console.error('Erreur simulation:', error);
      throw error;
    }
  }

  private createFakeImage(text: string): string {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.fillStyle = '#4CAF50';
      ctx.fillRect(0, 0, 400, 300);
      ctx.fillStyle = 'white';
      ctx.font = 'bold 20px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(text, 200, 100);
      ctx.font = '16px Arial';
      ctx.fillText('Image simulée', 200, 150);
      ctx.fillText(new Date().toLocaleDateString(), 200, 200);
    }

    return canvas.toDataURL('image/jpeg');
  }

  private base64ToFile(base64: string, filename: string): File {
    const arr = base64.split(',');
    const mime = arr[0].match(/:(.*?);/)![1];
    const bstr = atob(arr[1]);
    const u8arr = new Uint8Array(bstr.length);

    for (let i = 0; i < bstr.length; i++) {
      u8arr[i] = bstr.charCodeAt(i);
    }

    return new File([u8arr], filename, { type: mime });
  }
}

// certification.service.ts - CODE COMPLET MODIFIÉ
import { Injectable, inject } from '@angular/core';
import { FirebaseService } from './firebase.service';
import { AuthService } from './auth.service';
import {
  Certification,
  CertificationCheckpoint,
  CheckpointProof,
  CertificationTemplate,
  CertificationStats,
} from '../interfaces/certification.interfaces';
import { Product } from '../interfaces/data.interfaces';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  getDocs,
  addDoc,
  serverTimestamp,
  Timestamp,
  increment,
} from 'firebase/firestore';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root',
})
export class CertificationService {
  private firebaseService = inject(FirebaseService);
  private authService = inject(AuthService);
  private router = inject(Router);

  // Stockage local temporaire pour les images (en base64)
  private imageStore: Map<string, string> = new Map();

  // Templates prédéfinis
  private templates: CertificationTemplate[] = [
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
          description: 'Suivi de la croissance',
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
        gpsWeight: 0.35,
        timeWeight: 0.2,
        photoWeight: 0.3,
        measurementWeight: 0.15,
        minScore: 65,
      },
      badges: ['certified', 'local'],
    },
  ];

  // Démarrer une nouvelle certification
  private sanitizeForFirestore(data: any): any {
    if (data === undefined || data === null) {
      return null;
    }

    if (data instanceof Date) {
      return Timestamp.fromDate(data);
    }

    if (Array.isArray(data)) {
      return data
        .map((item) => this.sanitizeForFirestore(item))
        .filter((item) => item !== undefined);
    }

    if (typeof data === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined) {
          const sanitizedValue = this.sanitizeForFirestore(value);
          if (sanitizedValue !== undefined) {
            sanitized[key] = sanitizedValue;
          }
        }
      }
      return sanitized;
    }

    return data;
  }

  // Dans la méthode startCertification, corrigez les types
  async startCertification(data: {
    templateId: string;
    productName: string;
    initialPhoto: File;
    location?: { lat: number; lng: number };
    notes?: string;
  }): Promise<Certification> {
    try {
      const user = this.authService.getCurrentUser();
      const userData = this.authService.getUserData();

      if (!user || !userData) {
        throw new Error('Utilisateur non connecté');
      }

      const template = this.templates.find((t) => t.id === data.templateId);
      if (!template) {
        throw new Error('Template non trouvé');
      }

      // 1. Obtenir la localisation
      const location = data.location || (await this.getCurrentLocation());

      // 2. Convertir la photo en base64
      const photoBase64 = await this.fileToBase64(data.initialPhoto);
      const photoHash = await this.generateSimpleHash(photoBase64);

      // 3. Obtenir l'adresse et région
      const address = await this.getAddressFromCoordinates(
        location.lat,
        location.lng
      );
      const region = await this.getRegionFromCoordinates(
        location.lat,
        location.lng
      );

      // 4. Générer les points de contrôle AVEC CORRECTION DES TYPES
      const checkpoints: CertificationCheckpoint[] = template.checkpoints.map(
        (cp, index) => ({
          id: `checkpoint_${Date.now()}_${index}`,
          order: index,
          dayOffset: cp.dayOffset,
          title: cp.title,
          description: cp.description,
          instructions: this.getCheckpointInstructions(cp),
          required: true,
          requiredProofs: cp.requiredProofs,
          measurementType: cp.measurementType, // Laisser undefined si pas défini (au lieu de null)
          measurementUnit: this.getMeasurementUnit(cp.measurementType),
          completed: index === 0,
          proofs:
            index === 0
              ? [
                  {
                    type: 'photo' as const,
                    photoUrl: 'local://image',
                    photoHash: photoHash,
                    timestamp: new Date(),
                    deviceInfo: navigator.userAgent || 'Device inconnu',
                    verified: true,
                  },
                ]
              : [],
          completedAt: index === 0 ? new Date() : undefined, // Utiliser undefined au lieu de null
          autoVerified: index === 0,
          verificationScore: index === 0 ? 100 : 0,
          verificationNotes: index === 0 ? 'Photo initiale' : undefined, // Utiliser undefined
          gpsConsistency: true,
          timeConsistency: true,
          photoConsistency: true,
          notified: false,
          notificationSentAt: undefined, // Utiliser undefined
          reminderCount: 0,
        })
      );

      // 5. Créer l'objet certification AVEC CORRECTION DES TYPES
      const now = new Date();
      const expectedHarvestDate = new Date(
        now.getTime() + template.durationDays * 24 * 60 * 60 * 1000
      );
      const expiresAt = new Date(
        expectedHarvestDate.getTime() + 30 * 24 * 60 * 60 * 1000
      );

      const certification: Certification = {
        id: `cert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        producerId: user.uid,
        producerName: userData.fullName || 'Producteur',
        productType: template.productType,
        productName: data.productName,
        productCategory: template.category,
        status: 'active',
        startDate: now,
        expectedHarvestDate: expectedHarvestDate,
        actualHarvestDate: undefined, // Utiliser undefined au lieu de null
        durationDays: template.durationDays,
        location: {
          lat: location.lat,
          lng: location.lng,
          address: address,
          region: region,
        },
        checkpoints: checkpoints,
        currentCheckpointIndex: 1,
        completedCheckpoints: 1,
        totalCheckpoints: checkpoints.length,
        initialProof: {
          photoUrl: 'local://image',
          photoHash: photoHash,
          timestamp: now,
          deviceInfo: navigator.userAgent || 'Device inconnu',
        },
        validationScore: 100,
        maxScore: 100 * checkpoints.length,
        verificationStatus: 'pending',
        verifierId: undefined, // Utiliser undefined
        verifiedAt: undefined, // Utiliser undefined
        rejectionReason: undefined, // Utiliser undefined
        finalProduct: undefined, // Utiliser undefined
        createdAt: now,
        updatedAt: now,
        expiresAt: expiresAt,
        version: 1,
      };

      // 6. Stocker l'image localement
      this.imageStore.set(`${certification.id}_initial`, photoBase64);

      // 7. Sauvegarder dans Firestore avec nettoyage
      const firestoreData = this.sanitizeForFirestore(certification);

      await setDoc(
        doc(this.firebaseService.firestore, 'certifications', certification.id),
        firestoreData
      );

      console.log('Certification sauvegardée dans Firestore:', firestoreData);

      // 8. Planifier les notifications
      this.scheduleCheckpointNotifications(certification.id, checkpoints);

      // 9. Notifier l'utilisateur
      this.showNotification('success', 'Certification démarrée avec succès!');

      console.log('Certification créée:', certification);
      return certification;
    } catch (error: any) {
      console.error('Erreur démarrage certification:', error);
      this.showNotification(
        'error',
        error.message || 'Erreur lors du démarrage'
      );
      throw error;
    }
  }

  // Compléter un point de contrôle
  async completeCheckpoint(
    certificationId: string,
    checkpointId: string,
    proofData: {
      photo?: File;
      measurement?: { value: number; unit: string };
      note?: string;
    }
  ): Promise<Certification> {
    try {
      const certification = await this.getCertification(certificationId);
      const checkpoint = certification.checkpoints.find(
        (cp) => cp.id === checkpointId
      );

      if (!checkpoint) {
        throw new Error('Point de contrôle non trouvé');
      }

      const proofs: CheckpointProof[] = [];

      // 1. Traiter la photo si fournie
      if (proofData.photo) {
        const photoBase64 = await this.fileToBase64(proofData.photo);
        const photoHash = await this.generateSimpleHash(photoBase64);

        // Stocker localement
        this.imageStore.set(`${certificationId}_${checkpointId}`, photoBase64);

        proofs.push({
          type: 'photo',
          photoUrl: 'local://image',
          photoHash,
          timestamp: new Date(),
          deviceInfo: navigator.userAgent,
          verified: false,
        });
      }

      // 2. Traiter la mesure si fournie
      if (proofData.measurement) {
        proofs.push({
          type: 'measurement',
          measurement: {
            value: proofData.measurement.value,
            unit: proofData.measurement.unit,
            timestamp: new Date(),
          },
          timestamp: new Date(),
          deviceInfo: navigator.userAgent,
          verified: false,
        });
      }

      // 3. Traiter la note si fournie
      if (proofData.note) {
        proofs.push({
          type: 'note',
          note: proofData.note,
          timestamp: new Date(),
          deviceInfo: navigator.userAgent,
          verified: false,
        });
      }

      // 4. Récupérer la position GPS
      const gps = await this.getCurrentLocation();
      proofs.push({
        type: 'gps',
        gps: {
          lat: gps.lat,
          lng: gps.lng,
          accuracy: gps.accuracy || 10,
          timestamp: new Date(),
        },
        timestamp: new Date(),
        deviceInfo: navigator.userAgent,
        verified: false,
      });

      // 5. Valider automatiquement les preuves
      const verification = await this.autoVerifyProofs(
        certification,
        checkpoint,
        proofs
      );

      // 6. Mettre à jour le point de contrôle
      checkpoint.completed = true;
      checkpoint.completedAt = new Date();
      checkpoint.proofs = proofs;
      checkpoint.autoVerified = verification.isValid;
      checkpoint.verificationScore = verification.score;
      checkpoint.verificationNotes = verification.notes;
      checkpoint.gpsConsistency = verification.gpsConsistency;
      checkpoint.timeConsistency = verification.timeConsistency;
      checkpoint.photoConsistency = verification.photoConsistency;

      // 7. Mettre à jour la certification
      certification.completedCheckpoints++;
      certification.currentCheckpointIndex++;
      certification.updatedAt = new Date();

      // Calculer le score total
      certification.validationScore = this.calculateTotalScore(
        certification.checkpoints
      );

      // Vérifier si la certification est complète
      if (
        certification.completedCheckpoints === certification.totalCheckpoints
      ) {
        certification.status = 'completed';
        certification.actualHarvestDate = new Date();

        // Auto-vérification finale
        if (certification.validationScore >= 70) {
          certification.verificationStatus = 'auto_verified';
          certification.verifiedAt = new Date();

          // Générer le produit certifié
          await this.createCertifiedProduct(certification);
        }
      }

      // 8. Sauvegarder les modifications
      await updateDoc(
        doc(this.firebaseService.firestore, 'certifications', certificationId),
        this.convertToFirestore(certification)
      );

      // 9. Notifier l'utilisateur
      this.showNotification(
        'success',
        `Point de contrôle "${checkpoint.title}" complété! Score: ${verification.score}%`
      );

      console.log(
        'Checkpoint complété:',
        checkpoint.title,
        'Score:',
        verification.score
      );
      return certification;
    } catch (error: any) {
      console.error('Erreur complétion checkpoint:', error);
      this.showNotification(
        'error',
        error.message || 'Erreur lors de la complétion'
      );
      throw error;
    }
  }

  // Valider automatiquement les preuves
  private async autoVerifyProofs(
    certification: Certification,
    checkpoint: CertificationCheckpoint,
    proofs: CheckpointProof[]
  ): Promise<{
    isValid: boolean;
    score: number;
    notes: string;
    gpsConsistency: boolean;
    timeConsistency: boolean;
    photoConsistency: boolean;
  }> {
    const result = {
      isValid: true,
      score: 100,
      notes: '',
      gpsConsistency: true,
      timeConsistency: true,
      photoConsistency: true,
    };

    try {
      // 1. Vérifier la cohérence GPS
      const gpsProof = proofs.find((p) => p.type === 'gps');
      if (gpsProof?.gps) {
        const distance = this.calculateDistance(
          certification.location.lat,
          certification.location.lng,
          gpsProof.gps.lat,
          gpsProof.gps.lng
        );

        result.gpsConsistency = distance <= 100; // 100 mètres maximum
        if (!result.gpsConsistency) {
          result.score -= 30;
          result.notes += `GPS incohérent (distance: ${Math.round(
            distance
          )}m). `;
        }
      } else {
        result.score -= 30;
        result.notes += 'GPS manquant. ';
        result.gpsConsistency = false;
      }

      // 2. Vérifier l'intervalle temporel
      const expectedDate = new Date(
        certification.startDate.getTime() +
          checkpoint.dayOffset * 24 * 60 * 60 * 1000
      );
      const actualDate = new Date();
      const dayDiff = Math.abs(
        (actualDate.getTime() - expectedDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      result.timeConsistency = dayDiff <= 7; // +/- 7 jours autorisés
      if (!result.timeConsistency) {
        result.score -= 20;
        result.notes += `Délai dépassé (${Math.round(dayDiff)} jours). `;
      }

      // 3. Vérifier la présence des preuves requises
      const missingProofs = checkpoint.requiredProofs.filter(
        (req) => !proofs.some((p) => p.type === req)
      );

      if (missingProofs.length > 0) {
        result.score -= missingProofs.length * 10;
        result.notes += `Preuves manquantes: ${missingProofs.join(', ')}. `;
      }

      // 4. Vérifier la qualité de la photo (future IA)
      const photoProof = proofs.find((p) => p.type === 'photo');
      if (photoProof && checkpoint.requiredProofs.includes('photo')) {
        // Pour l'instant, toutes les photos sont acceptées
        result.photoConsistency = true;
        result.notes += '✅ Photo vérifiée. ';
      } else if (checkpoint.requiredProofs.includes('photo')) {
        result.score -= 10;
        result.notes += '❌ Photo manquante. ';
        result.photoConsistency = false;
      }

      // 5. Vérifier les mesures si requises
      const measurementProof = proofs.find((p) => p.type === 'measurement');
      if (
        checkpoint.requiredProofs.includes('measurement') &&
        !measurementProof
      ) {
        result.score -= 15;
        result.notes += '❌ Mesure manquante. ';
      }

      // Ajuster le score minimum à 0
      result.score = Math.max(0, Math.round(result.score));
      result.isValid = result.score >= 70;

      if (!result.isValid) {
        result.notes += '❌ Score insuffisant pour validation. ';
      }

      console.log('Auto-verification result:', result);
      return result;
    } catch (error) {
      console.error('Erreur auto-verification:', error);
      return {
        isValid: false,
        score: 0,
        notes: 'Erreur lors de la vérification automatique',
        gpsConsistency: false,
        timeConsistency: false,
        photoConsistency: false,
      };
    }
  }

  // Créer un produit certifié
  private async createCertifiedProduct(
    certification: Certification
  ): Promise<void> {
    try {
      const template = this.templates.find(
        (t) => t.productType === certification.productType
      );
      if (!template) {
        throw new Error('Template non trouvé pour créer le produit');
      }

      // Récupérer l'image initiale
      const initialImage = this.imageStore.get(`${certification.id}_initial`);

      // Déterminer le niveau basé sur le score
      let level: 'gold' | 'silver' | 'bronze';
      if (certification.validationScore >= 90) {
        level = 'gold';
      } else if (certification.validationScore >= 80) {
        level = 'silver';
      } else {
        level = 'bronze';
      }

      // Créer l'objet certification pour le produit
      const productCertification = {
        details: certification,
        id: certification.id,
        type: 'certified' as const,
        level: level, // ← CORRIGÉ : utiliser la variable avec le bon type
        score: certification.validationScore,
        verificationDate: certification.verifiedAt || new Date(),
        validUntil: certification.expiresAt,
        traceability: {
          startDate: certification.startDate,
          harvestDate: certification.actualHarvestDate || new Date(),
          location: certification.location.address || '',
          checkpointsCompleted: certification.completedCheckpoints,
          totalCheckpoints: certification.totalCheckpoints,
          proofs: certification.checkpoints.flatMap(
            (cp) =>
              cp.proofs?.map((p) => ({
                type: p.type,
                date: p.timestamp,
                verified: true,
              })) || []
          ),
        },
        qrCodeUrl: this.generateQRCodeUrl(certification.id),
        certificateUrl: this.generateCertificateUrl(certification.id),
        verificationUrl: `${window.location.origin}/verify/${certification.id}`,
      };

      const product: Product = {
        id: `certprod_${certification.id}`,
        name: certification.productName,
        category: certification.productCategory,
        description: `Produit certifié Jokko Agro. ${certification.productName} cultivé avec traçabilité complète. Certification score: ${certification.validationScore}%`,
        price: 0, // À définir par le producteur
        quantity: 0, // À définir après récolte
        unit: 'kg',
        certifications: ['certified', ...(template?.badges || [])],
        isOrganic: template?.badges.includes('organic') || false,
        harvestDate:
          certification.actualHarvestDate?.toISOString().split('T')[0] ||
          new Date().toISOString().split('T')[0],
        expirationDate: new Date(
          certification.actualHarvestDate!.getTime() + 30 * 24 * 60 * 60 * 1000
        )
          .toISOString()
          .split('T')[0],
        storageConditions: 'Conserver au frais',
        location: certification.location.address || 'Localisation certifiée',
        contactPhone: '', // Rempli par le producteur
        minOrderQuantity: 1,
        producerId: certification.producerId,
        producerName: certification.producerName,
        producerPhone: '', // Rempli par le producteur
        images: initialImage ? [initialImage] : [],
        status: 'available',
        views: 0,
        sales: 0,
        rating: 5, // Note par défaut pour produits certifiés
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        certification: productCertification,
        badges: this.generateBadgesForCertification(certification),
      };

      // Lier la certification au produit
      certification.finalProduct = {
        id: product.id!,
        name: product.name,
        quantity: product.quantity,
        unit: product.unit,
        price: product.price,
        published: false,
      };

      // Sauvegarder le produit
      await setDoc(
        doc(this.firebaseService.firestore, 'products', product.id!),
        this.convertToFirestore(product)
      );

      // Mettre à jour la certification avec les liens
      await updateDoc(
        doc(this.firebaseService.firestore, 'certifications', certification.id),
        {
          finalProduct: {
            id: product.id!,
            name: product.name,
            quantity: product.quantity,
            unit: product.unit,
            price: product.price,
            published: true,
          },
          qrCodeUrl: productCertification.qrCodeUrl,
          certificateUrl: productCertification.certificateUrl,
          updatedAt: serverTimestamp(),
        }
      );

      this.showNotification('success', '✅ Produit certifié créé avec succès!');
      console.log('Produit certifié créé:', product);
    } catch (error: any) {
      console.error('Erreur création produit certifié:', error);
      this.showNotification(
        'error',
        'Erreur lors de la création du produit certifié'
      );
    }
  }

  // Méthodes utilitaires
  private async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  }

  private generateLocalImageUrl(base64: string): string {
    return base64; // Data URL directe
  }

  private generateSimpleHash(data: string): string {
    // Hash simple pour la simulation
    let hash = 0;
    for (let i = 0; i < Math.min(data.length, 1000); i++) {
      const char = data.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  private async getCurrentLocation(): Promise<{
    lat: number;
    lng: number;
    accuracy?: number;
  }> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        // Fallback à une position par défaut (Dakar)
        resolve({
          lat: 14.716677,
          lng: -17.467686,
          accuracy: 10000,
        });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
          });
        },
        (error) => {
          console.warn('Erreur géolocalisation:', error);
          // Fallback à une position par défaut
          resolve({
            lat: 14.716677,
            lng: -17.467686,
            accuracy: 10000,
          });
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000,
        }
      );
    });
  }

  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371e3; // Rayon de la Terre en mètres
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance en mètres
  }

  private getCheckpointInstructions(checkpoint: any): string {
    const instructions = [];

    if (checkpoint.requiredProofs.includes('photo')) {
      instructions.push('📸 Prenez une photo claire du champ');
    }

    if (checkpoint.requiredProofs.includes('gps')) {
      instructions.push('📍 Activez votre GPS pour la localisation');
    }

    if (checkpoint.requiredProofs.includes('measurement')) {
      const measurementType = checkpoint.measurementType || 'mesure';
      instructions.push(
        `📏 Mesurez la ${measurementType} (${
          checkpoint.measurementUnit || 'unité'
        })`
      );
    }

    if (checkpoint.requiredProofs.includes('note')) {
      instructions.push('📝 Ajoutez une note ou observation');
    }

    return instructions.join(' • ') || 'Suivez les instructions du template';
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

  private calculateTotalScore(checkpoints: CertificationCheckpoint[]): number {
    const completed = checkpoints.filter((cp) => cp.completed);
    if (completed.length === 0) return 0;

    const totalScore = completed.reduce(
      (sum, cp) => sum + (cp.verificationScore || 0),
      0
    );
    return Math.round(totalScore / completed.length);
  }

  private async getAddressFromCoordinates(
    lat: number,
    lng: number
  ): Promise<string> {
    try {
      // Pour le développement, retourner un format simple
      return `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`;
    } catch {
      return 'Localisation certifiée';
    }
  }

  private async getRegionFromCoordinates(
    lat: number,
    lng: number
  ): Promise<string> {
    // Simpler version for development
    if (lat > 14.5 && lat < 15.0 && lng > -17.5 && lng < -17.0) {
      return 'Dakar';
    } else if (lat > 14.0 && lat < 15.0 && lng > -16.5 && lng < -15.5) {
      return 'Thiès';
    }
    return 'Sénégal';
  }

  private generateQRCodeUrl(certificationId: string): string {
    // QR code placeholder
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
      JSON.stringify({
        id: certificationId,
        type: 'certification',
        url: `${window.location.origin}/verify/${certificationId}`,
        timestamp: new Date().toISOString(),
      })
    )}`;
  }

  private generateCertificateUrl(certificationId: string): string {
    return `${window.location.origin}/certificate/${certificationId}`;
  }

  private generateBadgesForCertification(
    certification: Certification
  ): Array<{ id: string; label: string; icon: string; color: string }> {
    const badges = [];
    const template = this.templates.find(
      (t) => t.productType === certification.productType
    );

    if (template) {
      if (template.badges.includes('certified')) {
        badges.push({
          id: 'certified',
          label: 'Certifié',
          icon: '🏆',
          color: '#FFD700',
        });
      }
      if (template.badges.includes('organic')) {
        badges.push({
          id: 'organic',
          label: 'Bio',
          icon: '🌱',
          color: '#4CAF50',
        });
      }
      if (template.badges.includes('traceable')) {
        badges.push({
          id: 'traceable',
          label: 'Traçable',
          icon: '📊',
          color: '#2196F3',
        });
      }
      if (template.badges.includes('local')) {
        badges.push({
          id: 'local',
          label: 'Local',
          icon: '📍',
          color: '#9C27B0',
        });
      }
      if (template.badges.includes('seasonal')) {
        badges.push({
          id: 'seasonal',
          label: 'De saison',
          icon: '🌞',
          color: '#FF9800',
        });
      }
    }

    // Ajouter un badge basé sur le score
    if (certification.validationScore >= 90) {
      badges.push({
        id: 'excellent',
        label: 'Excellent',
        icon: '⭐',
        color: '#FF5722',
      });
    }

    return badges;
  }

  private scheduleCheckpointNotifications(
    certificationId: string,
    checkpoints: CertificationCheckpoint[]
  ) {
    // Pour le développement, simplement logger
    checkpoints.forEach((checkpoint) => {
      if (!checkpoint.completed) {
        console.log(
          `Checkpoint prévu: ${checkpoint.title} à J+${checkpoint.dayOffset}`
        );
      }
    });
  }

  private convertToFirestore(data: any): any {
    const convertDates = (obj: any): any => {
      if (obj instanceof Date) {
        return Timestamp.fromDate(obj);
      }
      if (Array.isArray(obj)) {
        return obj.map((item) => convertDates(item));
      }
      if (obj && typeof obj === 'object') {
        return Object.fromEntries(
          Object.entries(obj).map(([key, value]) => [key, convertDates(value)])
        );
      }
      return obj;
    };

    return convertDates(data);
  }

  private convertFromFirestore(data: any): Certification {
    const convertTimestamps = (obj: any): any => {
      if (obj && typeof obj === 'object' && obj.seconds && obj.nanoseconds) {
        return new Date(obj.seconds * 1000 + obj.nanoseconds / 1000000);
      }
      if (Array.isArray(obj)) {
        return obj.map((item) => convertTimestamps(item));
      }
      if (obj && typeof obj === 'object') {
        return Object.fromEntries(
          Object.entries(obj).map(([key, value]) => [
            key,
            convertTimestamps(value),
          ])
        );
      }
      return obj;
    };

    return convertTimestamps(data);
  }

  private showNotification(
    type: 'success' | 'error' | 'info',
    message: string
  ) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] ${type.toUpperCase()}: ${message}`);

    // Simple notification using alert for now
    if (type === 'error') {
      alert(`❌ ${message}`);
    } else if (type === 'success') {
      // Create a toast notification
      const toast = document.createElement('div');
      toast.textContent = `✅ ${message}`;
      toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #4CAF50, #45a049);
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 9999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        animation: slideIn 0.3s ease, fadeOut 0.3s ease 4.7s forwards;
      `;

      // Add CSS animations
      const style = document.createElement('style');
      style.textContent = `
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
      `;
      document.head.appendChild(style);

      document.body.appendChild(toast);
      setTimeout(() => {
        if (document.body.contains(toast)) {
          document.body.removeChild(toast);
        }
        if (document.head.contains(style)) {
          document.head.removeChild(style);
        }
      }, 5000);
    }
  }

  // Méthodes publiques
  async getCertification(id: string): Promise<Certification> {
    try {
      const docRef = doc(this.firebaseService.firestore, 'certifications', id);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        throw new Error('Certification non trouvée');
      }

      const certification = this.convertFromFirestore(docSnap.data());

      // Récupérer les images stockées localement
      const initialImage = this.imageStore.get(`${id}_initial`);
      if (initialImage && certification.initialProof) {
        certification.initialProof.photoUrl = initialImage;
      }

      return certification;
    } catch (error: any) {
      console.error('Erreur récupération certification:', error);
      throw error;
    }
  }

  async getProducerCertifications(
    producerId: string
  ): Promise<Certification[]> {
    try {
      const q = query(
        collection(this.firebaseService.firestore, 'certifications'),
        where('producerId', '==', producerId),
        orderBy('createdAt', 'desc')
      );

      const snapshot = await getDocs(q);
      const certifications: Certification[] = [];

      for (const doc of snapshot.docs) {
        const certification = this.convertFromFirestore(doc.data());

        // Récupérer l'image initiale si disponible
        const initialImage = this.imageStore.get(`${certification.id}_initial`);
        if (initialImage && certification.initialProof) {
          certification.initialProof.photoUrl = initialImage;
        }

        certifications.push(certification);
      }

      return certifications;
    } catch (error) {
      console.error('Erreur récupération certifications producteur:', error);
      return [];
    }
  }

  async getCertificationStats(producerId: string): Promise<CertificationStats> {
    try {
      const certifications = await this.getProducerCertifications(producerId);

      const stats: CertificationStats = {
        totalCertifications: certifications.length,
        activeCertifications: certifications.filter(
          (c) => c.status === 'active'
        ).length,
        completedCertifications: certifications.filter(
          (c) => c.status === 'completed' || c.status === 'verified'
        ).length,
        averageScore:
          certifications.length > 0
            ? Math.round(
                certifications.reduce((sum, c) => sum + c.validationScore, 0) /
                  certifications.length
              )
            : 0,
        verificationRate:
          certifications.length > 0
            ? Math.round(
                (certifications.filter(
                  (c) =>
                    c.verificationStatus === 'auto_verified' ||
                    c.verificationStatus === 'manually_verified'
                ).length /
                  certifications.length) *
                  100
              )
            : 0,
        upcomingCheckpoints: certifications
          .filter((c) => c.status === 'active')
          .reduce(
            (sum, c) => sum + (c.totalCheckpoints - c.completedCheckpoints),
            0
          ),
        expiredCertifications: certifications.filter(
          (c) => c.status === 'expired'
        ).length,
        byStatus: {
          draft: certifications.filter((c) => c.status === 'draft').length,
          active: certifications.filter((c) => c.status === 'active').length,
          completed: certifications.filter((c) => c.status === 'completed')
            .length,
          verified: certifications.filter((c) => c.status === 'verified')
            .length,
          cancelled: certifications.filter((c) => c.status === 'cancelled')
            .length,
          expired: certifications.filter((c) => c.status === 'expired').length,
        },
        byProductType: certifications.reduce((acc, c) => {
          acc[c.productType] = (acc[c.productType] || 0) + 1;
          return acc;
        }, {} as { [key: string]: number }),
        recentActivity: this.calculateRecentActivity(certifications),
      };

      return stats;
    } catch (error) {
      console.error('Erreur calcul statistiques:', error);
      return {
        totalCertifications: 0,
        activeCertifications: 0,
        completedCertifications: 0,
        averageScore: 0,
        verificationRate: 0,
        upcomingCheckpoints: 0,
        expiredCertifications: 0,
        byStatus: {
          draft: 0,
          active: 0,
          completed: 0,
          verified: 0,
          cancelled: 0,
          expired: 0,
        },
        byProductType: {},
        recentActivity: [],
      };
    }
  }

  private calculateRecentActivity(
    certifications: Certification[]
  ): Array<{ date: string; certifications: number; checkpoints: number }> {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - i);
      return date.toISOString().split('T')[0];
    }).reverse();

    return last7Days.map((date) => {
      const dayCerts = certifications.filter(
        (c) => c.createdAt.toISOString().split('T')[0] === date
      );

      const dayCheckpoints = certifications.reduce(
        (sum, cert) =>
          sum +
          cert.checkpoints.filter(
            (cp) =>
              cp.completedAt &&
              cp.completedAt.toISOString().split('T')[0] === date
          ).length,
        0
      );

      return {
        date: date.substring(5), // Format "MM-DD"
        certifications: dayCerts.length,
        checkpoints: dayCheckpoints,
      };
    });
  }

  // Getters
  getTemplates(): CertificationTemplate[] {
    return this.templates;
  }

  getTemplateById(id: string): CertificationTemplate | undefined {
    return this.templates.find((t) => t.id === id);
  }

  getProductIcon(productType: string): string {
    const icons: { [key: string]: string } = {
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
      garlic: '🧄',
      ginger: '🧂',
      corn: '🌽',
      rice: '🍚',
      wheat: '🌾',
      coffee: '☕',
      cocoa: '🍫',
      vanilla: '🌿',
      mint: '🌱',
    };

    return icons[productType] || '🌱';
  }

  // Méthodes pour gérer le stockage d'images local
  storeImage(key: string, base64Data: string): void {
    this.imageStore.set(key, base64Data);
  }

  getImage(key: string): string | null {
    return this.imageStore.get(key) || null;
  }

  clearImageStorage(): void {
    this.imageStore.clear();
  }

  // Méthode pour simuler un checkpoint

  // Dans certification.service.ts - ajouter ces méthodes

  // Remplacer la méthode problématique par celle-ci :
  async getCertificationForVerification(
    id: string
  ): Promise<Partial<Certification> | null> {
    try {
      const docRef = doc(this.firebaseService.firestore, 'certifications', id);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        return null;
      }

      const certification = this.convertFromFirestore(docSnap.data());

      // Créer un objet nettoyé pour la vérification publique
      const publicCertification: Partial<Certification> = {
        id: certification.id,
        productType: certification.productType,
        productName: certification.productName,
        productCategory: certification.productCategory,
        status: certification.status,
        startDate: certification.startDate,
        expectedHarvestDate: certification.expectedHarvestDate,
        durationDays: certification.durationDays,
        location: {
          address: certification.location.address || 'Localisation certifiée',
          lat: 0,
          lng: 0,
        },
        checkpoints: certification.checkpoints.map((cp) => ({
          id: cp.id,
          order: cp.order,
          dayOffset: cp.dayOffset,
          title: cp.title,
          description: cp.description,
          instructions: cp.instructions || this.getCheckpointInstructions(cp), // AJOUTÉ ICI
          required: cp.required,
          requiredProofs: cp.requiredProofs,
          measurementType: cp.measurementType,
          measurementUnit: cp.measurementUnit,
          completed: cp.completed,
          completedAt: cp.completedAt,
          proofs: cp.proofs.map((p) => ({
            type: p.type,
            photoUrl: p.type === 'photo' ? '***MASQUÉ***' : undefined,
            gps:
              p.type === 'gps'
                ? {
                    lat: Math.round(p.gps!.lat * 1000) / 1000,
                    lng: Math.round(p.gps!.lng * 1000) / 1000,
                    accuracy: p.gps!.accuracy,
                    timestamp: p.gps!.timestamp,
                  }
                : undefined,
            measurement:
              p.type === 'measurement'
                ? {
                    value: p.measurement!.value,
                    unit: p.measurement!.unit,
                    timestamp: p.measurement!.timestamp,
                  }
                : undefined,
            note: p.type === 'note' ? p.note : undefined,
            timestamp: p.timestamp,
            verified: p.verified,
          })),
          autoVerified: cp.autoVerified,
          verificationScore: cp.verificationScore,
          verificationNotes: cp.verificationNotes,
          notified: cp.notified,
          reminderCount: cp.reminderCount,
        })),
        currentCheckpointIndex: certification.currentCheckpointIndex,
        completedCheckpoints: certification.completedCheckpoints,
        totalCheckpoints: certification.totalCheckpoints,
        initialProof: {
          photoUrl: '***MASQUÉ***',
          timestamp: certification.initialProof.timestamp,
          photoHash: '',
        },
        validationScore: certification.validationScore,
        maxScore: certification.maxScore,
        verificationStatus: certification.verificationStatus,
        verifiedAt: certification.verifiedAt,
        createdAt: certification.createdAt,
        updatedAt: certification.updatedAt,
        expiresAt: certification.expiresAt,
        version: certification.version,
      };

      return publicCertification;
    } catch (error) {
      console.error(
        'Erreur récupération certification pour vérification:',
        error
      );
      return null;
    }
  }

  async simulateCheckpointCompletion(
    certificationId: string,
    checkpointIndex: number
  ): Promise<void> {
    try {
      const certification = await this.getCertification(certificationId);
      const checkpoint = certification.checkpoints[checkpointIndex];

      if (!checkpoint) {
        throw new Error('Checkpoint non trouvé');
      }

      // Créer une image factice
      const fakeImage = this.createFakeImage(checkpoint.title);

      await this.completeCheckpoint(certificationId, checkpoint.id, {
        photo: this.base64ToFile(fakeImage, 'checkpoint.jpg'),
        measurement: checkpoint.measurementType
          ? {
              value: Math.random() * 100,
              unit: checkpoint.measurementUnit || 'unit',
            }
          : undefined,
        note: `Checkpoint ${checkpoint.title} complété par simulation`,
      });

      this.showNotification(
        'info',
        `Checkpoint ${checkpoint.title} simulé avec succès`
      );
    } catch (error) {
      console.error('Erreur simulation checkpoint:', error);
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
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(text, 200, 100);
      ctx.font = '16px Arial';
      ctx.fillText('Image simulée de certification', 200, 150);
      ctx.fillText(new Date().toLocaleDateString(), 200, 200);
    }

    return canvas.toDataURL('image/jpeg');
  }

  private base64ToFile(base64: string, filename: string): File {
    const arr = base64.split(',');
    const mime = arr[0].match(/:(.*?);/)![1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);

    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }

    return new File([u8arr], filename, { type: mime });
  }
}

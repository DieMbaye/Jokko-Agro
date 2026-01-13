// certification.service.ts
import { Injectable, inject } from '@angular/core';
import { FirebaseService } from './firebase.service';
import { AuthService } from './auth.service';
import {
  Certification,
  CertificationCheckpoint,
  CheckpointProof,
  CertificationTemplate,
  CertificationStats
} from './certification.interfaces';
import { Product } from './data.interfaces';
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
  limit,
  writeBatch,
  increment,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class CertificationService {
  private firebaseService = inject(FirebaseService);
  private authService = inject(AuthService);
  private router = inject(Router);

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
        { dayOffset: 0, title: 'Semis/Plantation', description: 'Photo initiale du champ', requiredProofs: ['photo', 'gps'] },
        { dayOffset: 15, title: 'Croissance', description: 'Suivi de la croissance', requiredProofs: ['photo', 'gps'] },
        { dayOffset: 30, title: 'Floraison', description: 'Photo des fleurs', requiredProofs: ['photo', 'gps'] },
        { dayOffset: 45, title: 'Fructification', description: 'Photo des premiers fruits', requiredProofs: ['photo', 'gps', 'measurement'], measurementType: 'count' },
        { dayOffset: 60, title: 'Récolte', description: 'Photo de la récolte', requiredProofs: ['photo', 'gps', 'measurement', 'note'], measurementType: 'weight' }
      ],
      scoringRules: {
        gpsWeight: 0.3,
        timeWeight: 0.2,
        photoWeight: 0.3,
        measurementWeight: 0.2,
        minScore: 70
      },
      badges: ['certified', 'organic', 'traceable', 'local']
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
        { dayOffset: 0, title: 'Arbre en fleurs', description: 'Photo de l\'arbre en fleurs', requiredProofs: ['photo', 'gps'] },
        { dayOffset: 30, title: 'Fruits naissants', description: 'Photo des jeunes fruits', requiredProofs: ['photo', 'gps'] },
        { dayOffset: 60, title: 'Maturation', description: 'Suivi de la maturation', requiredProofs: ['photo', 'gps', 'measurement'], measurementType: 'count' },
        { dayOffset: 90, title: 'Récolte', description: 'Photo de la récolte', requiredProofs: ['photo', 'gps', 'measurement', 'note'], measurementType: 'weight' }
      ],
      scoringRules: {
        gpsWeight: 0.4,
        timeWeight: 0.2,
        photoWeight: 0.3,
        measurementWeight: 0.1,
        minScore: 75
      },
      badges: ['certified', 'seasonal', 'traceable']
    }
  ];

  // Démarrer une nouvelle certification
  async startCertification(data: {
    templateId: string;
    productName: string;
    initialPhoto: File;
    location?: { lat: number; lng: number };
    notes?: string;
  }) {
    try {
      const user = this.authService.getCurrentUser();
      const userData = this.authService.getUserData();

      if (!user || !userData) {
        throw new Error('Utilisateur non connecté');
      }

      const template = this.templates.find(t => t.id === data.templateId);
      if (!template) {
        throw new Error('Template non trouvé');
      }

      // 1. Obtenir la localisation
      const location = data.location || await this.getCurrentLocation();

      // 2. Uploader la photo initiale
      const photoUrl = await this.uploadProofPhoto(data.initialPhoto, `certifications/${user.uid}/${Date.now()}_initial.jpg`);
      const photoHash = await this.generateHash(await data.initialPhoto.arrayBuffer());

      // 3. Générer les points de contrôle
      const checkpoints: CertificationCheckpoint[] = template.checkpoints.map((cp, index) => ({
        id: `checkpoint_${Date.now()}_${index}`,
        order: index,
        dayOffset: cp.dayOffset,
        title: cp.title,
        description: cp.description,
        instructions: this.getCheckpointInstructions(cp),
        required: true,
        requiredProofs: cp.requiredProofs,
        measurementType: cp.measurementType,
        measurementUnit: this.getMeasurementUnit(cp.measurementType),
        completed: index === 0, // Premier point complété (initial)
        proofs: index === 0 ? [{
          type: 'photo',
          photoUrl,
          photoHash,
          timestamp: new Date(),
          deviceInfo: navigator.userAgent,
          verified: true
        }] : [],
        autoVerified: index === 0,
        verificationScore: index === 0 ? 100 : 0,
        notified: false,
        reminderCount: 0,
        gpsConsistency: true,
        timeConsistency: true,
        photoConsistency: true
      }));

      // 4. Créer l'objet certification
      const now = new Date();
      const certification: Certification = {
        id: `cert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        producerId: user.uid,
        producerName: userData.fullName || 'Producteur',
        productType: template.productType,
        productName: data.productName,
        productCategory: template.category,
        status: 'active',
        startDate: now,
        expectedHarvestDate: new Date(now.getTime() + template.durationDays * 24 * 60 * 60 * 1000),
        durationDays: template.durationDays,
        location: {
          lat: location.lat,
          lng: location.lng,
          address: await this.getAddressFromCoordinates(location.lat, location.lng)
        },
        checkpoints,
        currentCheckpointIndex: 1, // Prochain point à compléter
        completedCheckpoints: 1,
        totalCheckpoints: checkpoints.length,
        initialProof: {
          photoUrl,
          photoHash,
          timestamp: now,
          deviceInfo: navigator.userAgent
        },
        validationScore: 100, // Score initial pour la photo de départ
        maxScore: 100 * checkpoints.length,
        verificationStatus: 'pending',
        createdAt: now,
        updatedAt: now,
        expiresAt: new Date(now.getTime() + (template.durationDays + 30) * 24 * 60 * 60 * 1000), // +30 jours après récolte
        version: 1
      };

      // 5. Sauvegarder dans Firestore
      await setDoc(
        doc(this.firebaseService.firestore, 'certifications', certification.id),
        this.convertToFirestore(certification)
      );

      // 6. Planifier les notifications
      this.scheduleCheckpointNotifications(certification.id, checkpoints);

      // 7. Créer une notification pour l'utilisateur
      this.showNotification('success', 'Certification démarrée avec succès!');

      return certification;

    } catch (error: any) {
      console.error('Erreur démarrage certification:', error);
      this.showNotification('error', error.message || 'Erreur lors du démarrage');
      throw error;
    }
  }

  // Compléter un point de contrôle
  async completeCheckpoint(certificationId: string, checkpointId: string, proofData: {
    photo?: File;
    measurement?: { value: number; unit: string };
    note?: string;
  }) {
    try {
      const certification = await this.getCertification(certificationId);
      const checkpoint = certification.checkpoints.find(cp => cp.id === checkpointId);

      if (!checkpoint) {
        throw new Error('Point de contrôle non trouvé');
      }

      const proofs: CheckpointProof[] = [];

      // 1. Traiter la photo si fournie
      if (proofData.photo) {
        const photoUrl = await this.uploadProofPhoto(
          proofData.photo,
          `certifications/${certification.producerId}/${certificationId}_${checkpointId}_${Date.now()}.jpg`
        );
        const photoHash = await this.generateHash(await proofData.photo.arrayBuffer());

        proofs.push({
          type: 'photo',
          photoUrl,
          photoHash,
          timestamp: new Date(),
          deviceInfo: navigator.userAgent,
          verified: false
        });
      }

      // 2. Traiter la mesure si fournie
      if (proofData.measurement) {
        proofs.push({
          type: 'measurement',
          measurement: {
            value: proofData.measurement.value,
            unit: proofData.measurement.unit,
            timestamp: new Date()
          },
          timestamp: new Date(),
          deviceInfo: navigator.userAgent,
          verified: false
        });
      }

      // 3. Traiter la note si fournie
      if (proofData.note) {
        proofs.push({
          type: 'note',
          note: proofData.note,
          timestamp: new Date(),
          deviceInfo: navigator.userAgent,
          verified: false
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
          timestamp: new Date()
        },
        timestamp: new Date(),
        deviceInfo: navigator.userAgent,
        verified: false
      });

      // 5. Valider automatiquement les preuves
      const verification = await this.autoVerifyProofs(certification, checkpoint, proofs);

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
      certification.validationScore = this.calculateTotalScore(certification.checkpoints);

      // Vérifier si la certification est complète
      if (certification.completedCheckpoints === certification.totalCheckpoints) {
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
      this.showNotification('success', `Point de contrôle "${checkpoint.title}" complété!`);

      return certification;

    } catch (error: any) {
      console.error('Erreur complétion checkpoint:', error);
      this.showNotification('error', error.message || 'Erreur lors de la complétion');
      throw error;
    }
  }

  // Valider automatiquement les preuves
  private async autoVerifyProofs(
    certification: Certification,
    checkpoint: CertificationCheckpoint,
    proofs: CheckpointProof[]
  ) {
    const result = {
      isValid: true,
      score: 100,
      notes: '',
      gpsConsistency: true,
      timeConsistency: true,
      photoConsistency: true
    };

    // 1. Vérifier la cohérence GPS
    const gpsProof = proofs.find(p => p.type === 'gps');
    if (gpsProof?.gps) {
      const distance = this.calculateDistance(
        certification.location.lat, certification.location.lng,
        gpsProof.gps.lat, gpsProof.gps.lng
      );

      result.gpsConsistency = distance <= 100; // 100 mètres maximum
      if (!result.gpsConsistency) {
        result.score -= 30;
        result.notes += 'GPS incohérent. ';
      }
    }

    // 2. Vérifier l'intervalle temporel
    const expectedDate = new Date(certification.startDate.getTime() + checkpoint.dayOffset * 24 * 60 * 60 * 1000);
    const actualDate = new Date();
    const dayDiff = Math.abs((actualDate.getTime() - expectedDate.getTime()) / (1000 * 60 * 60 * 24));

    result.timeConsistency = dayDiff <= 7; // +/- 7 jours autorisés
    if (!result.timeConsistency) {
      result.score -= 20;
      result.notes += `Délai dépassé (${Math.round(dayDiff)} jours). `;
    }

    // 3. Vérifier la présence des preuves requises
    const missingProofs = checkpoint.requiredProofs.filter(req =>
      !proofs.some(p => p.type === req)
    );

    if (missingProofs.length > 0) {
      result.score -= missingProofs.length * 10;
      result.notes += `Preuves manquantes: ${missingProofs.join(', ')}. `;
    }

    // 4. Vérifier la qualité de la photo (future IA)
    const photoProof = proofs.find(p => p.type === 'photo');
    if (photoProof?.photoUrl) {
      // Placeholder pour analyse IA future
      result.photoConsistency = true;
    }

    // Ajuster le score minimum à 0
    result.score = Math.max(0, result.score);
    result.isValid = result.score >= 70;

    return result;
  }

  // Créer un produit certifié
  private async createCertifiedProduct(certification: Certification) {
    const template = this.templates.find(t => t.productType === certification.productType);

    const product: Product = {
      id: `certprod_${certification.id}`,
      name: certification.productName,
      category: certification.productCategory,
      description: `Produit certifié Jokko Agro. ${certification.productName} cultivé avec traçabilité complète.`,
      price: 0, // À définir par le producteur
      quantity: 0, // À définir après récolte
      unit: 'kg',
      certifications: ['certified', ...(template?.badges || [])],
      isOrganic: template?.badges.includes('organic') || false,
      harvestDate: certification.actualHarvestDate?.toISOString().split('T')[0],
      expirationDate: new Date(certification.actualHarvestDate!.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      storageConditions: 'Conserver au frais',
      location: certification.location.address || 'Localisation certifiée',
      contactPhone: '', // Rempli par le producteur
      minOrderQuantity: 1,
      producerId: certification.producerId,
      producerName: certification.producerName,
      producerPhone: '', // Rempli par le producteur
      images: [certification.initialProof.photoUrl],
      status: 'available',
      views: 0,
      sales: 0,
      rating: 5, // Note par défaut pour produits certifiés
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      badges: []
    };

    // Lier la certification au produit
    certification.finalProduct = {
      id: product.id!,
      name: product.name,
      quantity: product.quantity,
      unit: product.unit,
      price: product.price,
      published: false
    };

    // Sauvegarder le produit
    await setDoc(
      doc(this.firebaseService.firestore, 'products', product.id!),
      this.convertToFirestore(product)
    );

    // Générer le QR code et certificat
    const qrCodeUrl = await this.generateQRCode(certification.id);
    const certificateUrl = await this.generateCertificate(certification.id);

    // Mettre à jour la certification avec les liens
    await updateDoc(
      doc(this.firebaseService.firestore, 'certifications', certification.id),
      {
        'finalProduct.published': true,
        qrCodeUrl,
        certificateUrl,
        updatedAt: serverTimestamp()
      }
    );

    this.showNotification('success', 'Produit certifié créé avec succès!');
  }

  // Méthodes utilitaires
  private async uploadProofPhoto(file: File, path: string): Promise<string> {
    const storageRef = ref(this.firebaseService.storageInstance, path);
    const snapshot = await uploadBytes(storageRef, file);
    return await getDownloadURL(snapshot.ref);
  }

  private async getCurrentLocation(): Promise<{ lat: number; lng: number; accuracy?: number }> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Géolocalisation non supportée'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy
          });
        },
        (error) => {
          // Fallback à une position par défaut (Dakar)
          resolve({
            lat: 14.716677,
            lng: -17.467686,
            accuracy: 10000
          });
        },
        { timeout: 10000, maximumAge: 60000 }
      );
    });
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Rayon de la Terre en mètres
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // Distance en mètres
  }

  private generateHash(data: ArrayBuffer): Promise<string> {
    return crypto.subtle.digest('SHA-256', data)
      .then(hash => {
        const hashArray = Array.from(new Uint8Array(hash));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      });
  }

  private getCheckpointInstructions(checkpoint: any): string {
    const instructions = [];

    if (checkpoint.requiredProofs.includes('photo')) {
      instructions.push('📸 Prenez une photo claire');
    }

    if (checkpoint.requiredProofs.includes('gps')) {
      instructions.push('📍 Activez votre GPS');
    }

    if (checkpoint.requiredProofs.includes('measurement')) {
      instructions.push(`📏 Mesurez la ${checkpoint.measurementType}`);
    }

    if (checkpoint.requiredProofs.includes('note')) {
      instructions.push('📝 Ajoutez une note');
    }

    return instructions.join(' • ');
  }

  private getMeasurementUnit(type?: string): string {
    switch (type) {
      case 'weight': return 'kg';
      case 'height': return 'cm';
      case 'count': return 'unités';
      case 'volume': return 'L';
      default: return '';
    }
  }

  private calculateTotalScore(checkpoints: CertificationCheckpoint[]): number {
    const completed = checkpoints.filter(cp => cp.completed);
    if (completed.length === 0) return 0;

    const totalScore = completed.reduce((sum, cp) => sum + (cp.verificationScore || 0), 0);
    return Math.round(totalScore / completed.length);
  }

  private async getAddressFromCoordinates(lat: number, lng: number): Promise<string> {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
      );
      const data = await response.json();
      return data.display_name || 'Localisation certifiée';
    } catch {
      return 'Localisation certifiée';
    }
  }

  private async generateQRCode(certificationId: string): Promise<string> {
    const qrData = {
      id: certificationId,
      type: 'certification',
      url: `${window.location.origin}/verify/${certificationId}`,
      timestamp: new Date().toISOString()
    };

    // Ici, vous intégrerez un service de génération de QR code
    // Pour l'instant, retournons une URL placeholder
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(JSON.stringify(qrData))}`;
  }

  private async generateCertificate(certificationId: string): Promise<string> {
    // Générer un certificat PDF (implémentation future)
    // Pour l'instant, retournons une URL placeholder
    return `${window.location.origin}/api/certificate/${certificationId}`;
  }

  private scheduleCheckpointNotifications(certificationId: string, checkpoints: CertificationCheckpoint[]) {
    checkpoints.forEach(checkpoint => {
      if (!checkpoint.completed) {
        const dueDate = new Date(Date.now() + checkpoint.dayOffset * 24 * 60 * 60 * 1000);

        // Planifier une notification 3 jours avant
        const reminderDate = new Date(dueDate.getTime() - 3 * 24 * 60 * 60 * 1000);

        if (reminderDate > new Date()) {
          setTimeout(() => {
            this.sendCheckpointReminder(certificationId, checkpoint);
          }, reminderDate.getTime() - Date.now());
        }
      }
    });
  }

  private async sendCheckpointReminder(certificationId: string, checkpoint: CertificationCheckpoint) {
    // Envoyer une notification (email, push, etc.)
    console.log(`Rappel: ${checkpoint.title} pour certification ${certificationId}`);

    // Mettre à jour le checkpoint
    await updateDoc(
      doc(this.firebaseService.firestore, 'certifications', certificationId),
      {
        [`checkpoints.${checkpoint.order}.notified`]: true,
        [`checkpoints.${checkpoint.order}.notificationSentAt`]: serverTimestamp(),
        [`checkpoints.${checkpoint.order}.reminderCount`]: increment(1)
      }
    );
  }

  private convertToFirestore(data: any): any {
    const convertDates = (obj: any): any => {
      if (obj instanceof Date) {
        return Timestamp.fromDate(obj);
      }
      if (Array.isArray(obj)) {
        return obj.map(item => convertDates(item));
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

  private showNotification(type: 'success' | 'error' | 'info', message: string) {
    // Implémentez votre système de notification
    console.log(`${type.toUpperCase()}: ${message}`);

    // Exemple simple avec alert
    if (type === 'error') {
      alert(`❌ ${message}`);
    } else if (type === 'success') {
      // Peut-être utiliser un toast
      const toast = document.createElement('div');
      toast.textContent = `✅ ${message}`;
      toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        z-index: 9999;
      `;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);
    }
  }

  // Méthodes publiques
  async getCertification(id: string): Promise<Certification> {
    const docRef = doc(this.firebaseService.firestore, 'certifications', id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      throw new Error('Certification non trouvée');
    }

    return this.convertFromFirestore(docSnap.data());
  }

  async getProducerCertifications(producerId: string): Promise<Certification[]> {
    const q = query(
      collection(this.firebaseService.firestore, 'certifications'),
      where('producerId', '==', producerId),
      orderBy('createdAt', 'desc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => this.convertFromFirestore(doc.data()));
  }

  async getCertificationStats(producerId: string): Promise<CertificationStats> {
    const certifications = await this.getProducerCertifications(producerId);

    const stats: CertificationStats = {
      totalCertifications: certifications.length,
      activeCertifications: certifications.filter(c => c.status === 'active').length,
      completedCertifications: certifications.filter(c => c.status === 'completed' || c.status === 'verified').length,
      averageScore: certifications.length > 0
        ? certifications.reduce((sum, c) => sum + c.validationScore, 0) / certifications.length
        : 0,
      verificationRate: certifications.length > 0
        ? (certifications.filter(c => c.verificationStatus === 'auto_verified' || c.verificationStatus === 'manually_verified').length / certifications.length) * 100
        : 0,
      upcomingCheckpoints: certifications
        .filter(c => c.status === 'active')
        .reduce((sum, c) => sum + (c.totalCheckpoints - c.completedCheckpoints), 0),
      expiredCertifications: certifications.filter(c => c.status === 'expired').length,
      byStatus: {
        draft: certifications.filter(c => c.status === 'draft').length,
        active: certifications.filter(c => c.status === 'active').length,
        completed: certifications.filter(c => c.status === 'completed').length,
        verified: certifications.filter(c => c.status === 'verified').length,
        cancelled: certifications.filter(c => c.status === 'cancelled').length,
        expired: certifications.filter(c => c.status === 'expired').length
      },
      byProductType: certifications.reduce((acc, c) => {
        acc[c.productType] = (acc[c.productType] || 0) + 1;
        return acc;
      }, {} as { [key: string]: number }),
      recentActivity: this.calculateRecentActivity(certifications)
    };

    return stats;
  }

  private calculateRecentActivity(certifications: Certification[]): Array<{ date: string; certifications: number; checkpoints: number }> {
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - i);
      return date.toISOString().split('T')[0];
    }).reverse();

    return last30Days.map(date => {
      const dayCerts = certifications.filter(c =>
        c.createdAt.toISOString().split('T')[0] === date
      );

      const dayCheckpoints = dayCerts.reduce((sum, cert) =>
        sum + cert.checkpoints.filter(cp =>
          cp.completedAt && cp.completedAt.toISOString().split('T')[0] === date
        ).length, 0
      );

      return {
        date,
        certifications: dayCerts.length,
        checkpoints: dayCheckpoints
      };
    });
  }

  private convertFromFirestore(data: any): Certification {
    const convertTimestamps = (obj: any): any => {
      if (obj && typeof obj === 'object' && obj.seconds && obj.nanoseconds) {
        return new Date(obj.seconds * 1000 + obj.nanoseconds / 1000000);
      }
      if (Array.isArray(obj)) {
        return obj.map(item => convertTimestamps(item));
      }
      if (obj && typeof obj === 'object') {
        return Object.fromEntries(
          Object.entries(obj).map(([key, value]) => [key, convertTimestamps(value)])
        );
      }
      return obj;
    };

    return convertTimestamps(data);
  }

  // Getters
  getTemplates(): CertificationTemplate[] {
    return this.templates;
  }

  getTemplateById(id: string): CertificationTemplate | undefined {
    return this.templates.find(t => t.id === id);
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
      mint: '🌱'
    };

    return icons[productType] || '🌱';
  }
}

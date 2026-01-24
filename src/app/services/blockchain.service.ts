// blockchain.service.ts
import { Injectable, inject } from '@angular/core';
import * as CryptoJS from 'crypto-js';
import { CertificationService } from './certification.service';
import { FirebaseService } from './firebase.service';

export interface CanonicalProof {
  productId: string;
  photoHash: string;
  lat: number;
  lng: number;
  timestamp: number; // en secondes UTC
  step: 'INIT' | 'FOLLOW_UP' | 'HARVEST' | 'CHECKPOINT';
  checkpointId?: string;
  checkpointOrder?: number;
}

export interface BlockchainRecord {
  productId: string;
  proofHash: string;
  step: string;
  timestamp: number;
  transactionId: string;
  blockNumber?: number;
  blockHash?: string;
  verified: boolean;
}

export interface BlockchainVerification {
  isValid: boolean;
  reason?: string;
  blockRecord?: BlockchainRecord;
  recalculatedHash?: string;
  match: boolean;
  timestampDifference?: number;
}

@Injectable({
  providedIn: 'root'
})
export class BlockchainService {
  private certificationService = inject(CertificationService);
  private firebaseService = inject(FirebaseService);

  // Simulate blockchain storage (in production, this would be an actual blockchain)
  private blockchain: BlockchainRecord[] = [];
  private pendingTransactions: BlockchainRecord[] = [];

  // Méthode pour calculer le hash SHA-256
  private calculateSHA256(data: string): string {
    return CryptoJS.SHA256(data).toString(CryptoJS.enc.Hex);
  }

  // Méthode pour calculer le hash d'une photo
  async calculatePhotoHash(photoFile: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (event) => {
        try {
          // Convertir l'image en ArrayBuffer
          const arrayBuffer = event.target?.result as ArrayBuffer;
          if (!arrayBuffer) {
            reject(new Error('Impossible de lire le fichier photo'));
            return;
          }

          // Convertir en mot binaire CryptoJS
          const wordArray = CryptoJS.lib.WordArray.create(arrayBuffer as any);

          // Calculer le hash SHA-256
          const hash = CryptoJS.SHA256(wordArray).toString(CryptoJS.enc.Hex);
          resolve(hash);
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = (error) => reject(error);
      reader.readAsArrayBuffer(photoFile);
    });
  }

  // Méthode pour normaliser les coordonnées GPS
  private normalizeCoordinates(lat: number, lng: number, decimals: number = 6): { lat: number; lng: number } {
    return {
      lat: parseFloat(lat.toFixed(decimals)),
      lng: parseFloat(lng.toFixed(decimals))
    };
  }

  // Méthode pour créer l'objet canonique
  createCanonicalObject(data: {
    productId: string;
    photoFile?: File;
    photoHash?: string;
    lat: number;
    lng: number;
    step: 'INIT' | 'FOLLOW_UP' | 'HARVEST' | 'CHECKPOINT';
    checkpointId?: string;
    checkpointOrder?: number;
  }): Promise<CanonicalProof> {
    return new Promise(async (resolve, reject) => {
      try {
        let photoHash = data.photoHash;

        // Si un fichier photo est fourni, calculer son hash
        if (data.photoFile && !photoHash) {
          photoHash = await this.calculatePhotoHash(data.photoFile);
        }

        if (!photoHash) {
          reject(new Error('Photo hash manquant'));
          return;
        }

        // Normaliser les coordonnées GPS
        const normalizedCoords = this.normalizeCoordinates(data.lat, data.lng);

        // Créer l'objet canonique
        const canonicalObject: CanonicalProof = {
          productId: data.productId,
          photoHash: photoHash,
          lat: normalizedCoords.lat,
          lng: normalizedCoords.lng,
          timestamp: Math.floor(Date.now() / 1000), // secondes UTC
          step: data.step
        };

        // Ajouter les informations de checkpoint si présentes
        if (data.checkpointId) {
          canonicalObject.checkpointId = data.checkpointId;
        }

        if (data.checkpointOrder !== undefined) {
          canonicalObject.checkpointOrder = data.checkpointOrder;
        }

        // Valider l'objet canonique
        this.validateCanonicalObject(canonicalObject);

        resolve(canonicalObject);
      } catch (error) {
        reject(error);
      }
    });
  }

  // Méthode pour valider l'objet canonique
  private validateCanonicalObject(object: CanonicalProof): void {
    const requiredFields = ['productId', 'photoHash', 'lat', 'lng', 'timestamp', 'step'];

    for (const field of requiredFields) {
      if (!(field in object)) {
        throw new Error(`Champ requis manquant: ${field}`);
      }
    }

    // Validation des types
    if (typeof object.productId !== 'string' || object.productId.trim() === '') {
      throw new Error('productId doit être une chaîne non vide');
    }

    if (!/^[a-f0-9]{64}$/i.test(object.photoHash)) {
      throw new Error('photoHash doit être un hash SHA-256 valide (64 caractères hexadécimaux)');
    }

    if (!Number.isFinite(object.lat) || object.lat < -90 || object.lat > 90) {
      throw new Error('lat doit être un nombre entre -90 et 90');
    }

    if (!Number.isFinite(object.lng) || object.lng < -180 || object.lng > 180) {
      throw new Error('lng doit être un nombre entre -180 et 180');
    }

    if (!Number.isInteger(object.timestamp) || object.timestamp <= 0) {
      throw new Error('timestamp doit être un nombre entier positif de secondes');
    }

    const validSteps = ['INIT', 'FOLLOW_UP', 'HARVEST', 'CHECKPOINT'];
    if (!validSteps.includes(object.step)) {
      throw new Error(`step doit être l'un des suivants: ${validSteps.join(', ')}`);
    }
  }

  // Méthode pour calculer le hash de preuve
  calculateProofHash(canonicalObject: CanonicalProof): string {
    // Sérialiser l'objet canonique de manière déterministe
    const canonicalString = JSON.stringify(canonicalObject, Object.keys(canonicalObject).sort());
    return this.calculateSHA256(canonicalString);
  }

  // Méthode pour enregistrer une preuve sur la blockchain (simulée)
  async registerProofOnBlockchain(canonicalObject: CanonicalProof): Promise<BlockchainRecord> {
    try {
      // Calculer le hash de preuve
      const proofHash = this.calculateProofHash(canonicalObject);

      // Créer l'enregistrement blockchain
      const record: BlockchainRecord = {
        productId: canonicalObject.productId,
        proofHash: proofHash,
        step: canonicalObject.step,
        timestamp: Math.floor(Date.now() / 1000),
        transactionId: this.generateTransactionId(),
        verified: true
      };

      // Simuler un mineur de bloc
      await this.simulateBlockMining(record);

      console.log(`✅ Preuve enregistrée sur blockchain:`, {
        transactionId: record.transactionId,
        proofHash: proofHash,
        productId: canonicalObject.productId
      });

      return record;
    } catch (error) {
      console.error('❌ Erreur enregistrement blockchain:', error);
      throw error;
    }
  }

  // Méthode pour simuler le minage d'un bloc
  private async simulateBlockMining(record: BlockchainRecord): Promise<void> {
    return new Promise((resolve) => {
      // Simuler un délai de minage (2-5 secondes)
      const miningTime = 2000 + Math.random() * 3000;

      setTimeout(() => {
        // Ajouter au bloc
        record.blockNumber = this.blockchain.length + 1;
        record.blockHash = this.calculateSHA256(
          JSON.stringify({
            ...record,
            previousHash: this.blockchain.length > 0
              ? this.blockchain[this.blockchain.length - 1].proofHash
              : '0'.repeat(64)
          })
        );

        // Ajouter à la blockchain simulée
        this.blockchain.push(record);
        console.log(`🔗 Bloc #${record.blockNumber} miné:`, record.blockHash);
        resolve();
      }, miningTime);
    });
  }

  // Méthode pour générer un ID de transaction unique
  private generateTransactionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 15);
    return `tx_${timestamp}_${random}`.toUpperCase();
  }

  // Méthode pour vérifier une preuve
  async verifyProof(data: {
    photoFile?: File;
    photoHash?: string;
    lat: number;
    lng: number;
    timestamp: number;
    step: string;
    blockchainRecord: BlockchainRecord;
    originalCanonicalObject?: CanonicalProof;
  }): Promise<BlockchainVerification> {
    try {
      const result: BlockchainVerification = {
        isValid: false,
        match: false,
        blockRecord: data.blockchainRecord
      };

      // Récupérer l'objet canonique original ou le recréer
      let canonicalObject: CanonicalProof;

      if (data.originalCanonicalObject) {
        canonicalObject = data.originalCanonicalObject;
      } else {
        // Reconstruire l'objet canonique à partir des données
        let photoHash = data.photoHash;

        if (data.photoFile && !photoHash) {
          photoHash = await this.calculatePhotoHash(data.photoFile);
        }

        if (!photoHash) {
          throw new Error('Photo hash manquant pour la vérification');
        }

        const normalizedCoords = this.normalizeCoordinates(data.lat, data.lng);

        canonicalObject = {
          productId: data.blockchainRecord.productId,
          photoHash: photoHash,
          lat: normalizedCoords.lat,
          lng: normalizedCoords.lng,
          timestamp: data.timestamp,
          step: data.step as any
        };
      }

      // Recalculer le hash de preuve
      result.recalculatedHash = this.calculateProofHash(canonicalObject);

      // Comparer avec le hash blockchain
      result.match = result.recalculatedHash === data.blockchainRecord.proofHash;

      // Vérifier la cohérence temporelle
      result.timestampDifference = Math.abs(
        canonicalObject.timestamp - data.blockchainRecord.timestamp
      );

      // Une preuve est valide si :
      // 1. Les hash correspondent
      // 2. La différence temporelle est raisonnable (max 300 secondes)
      result.isValid = result.match && (result.timestampDifference || 0) <= 300;

      if (!result.isValid) {
        result.reason = !result.match
          ? 'Les hash ne correspondent pas'
          : `Délai trop grand: ${result.timestampDifference}s`;
      }

      return result;
    } catch (error) {
      console.error('❌ Erreur vérification preuve:', error);
      throw error;
    }
  }

  // Méthode pour vérifier l'historique complet d'une certification
  async verifyCertificationHistory(certificationId: string): Promise<{
    valid: boolean;
    totalProofs: number;
    validProofs: number;
    invalidProofs: number;
    verificationRate: number;
    details: Array<{
      step: string;
      valid: boolean;
      transactionId: string;
      timestamp: Date;
      reason?: string;
    }>;
  }> {
    try {
      // Récupérer les enregistrements blockchain pour ce produit
      const productRecords = this.blockchain.filter(
        record => record.productId === certificationId
      );

      const verificationResults = await Promise.all(
        productRecords.map(async (record) => {
          // Dans une vraie implémentation, on récupérerait les données originales
          // Pour la simulation, on suppose que les preuves sont valides
          const verification = await this.verifyProof({
            lat: 0, // Données fictives pour la simulation
            lng: 0,
            timestamp: record.timestamp,
            step: record.step,
            blockchainRecord: record
          });

          return {
            step: record.step,
            valid: verification.isValid,
            transactionId: record.transactionId,
            timestamp: new Date(record.timestamp * 1000),
            reason: verification.reason
          };
        })
      );

      const validProofs = verificationResults.filter(r => r.valid).length;
      const totalProofs = verificationResults.length;

      return {
        valid: validProofs === totalProofs,
        totalProofs,
        validProofs,
        invalidProofs: totalProofs - validProofs,
        verificationRate: totalProofs > 0 ? Math.round((validProofs / totalProofs) * 100) : 0,
        details: verificationResults
      };
    } catch (error) {
      console.error('❌ Erreur vérification historique:', error);
      throw error;
    }
  }

  // Méthode pour obtenir les preuves blockchain d'un produit
  getProductBlockchainRecords(productId: string): BlockchainRecord[] {
    return this.blockchain.filter(record => record.productId === productId);
  }

  // Méthode pour générer un QR Code avec les informations de vérification
  generateVerificationQRCode(productId: string): string {
    const verificationData = {
      productId: productId,
      verificationUrl: `${window.location.origin}/verify/${productId}`,
      blockchainRecords: this.getProductBlockchainRecords(productId).length,
      timestamp: Date.now()
    };

    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
      JSON.stringify(verificationData)
    )}`;
  }

  // Méthode pour créer un rapport de vérification
  generateVerificationReport(productId: string): string {
    const records = this.getProductBlockchainRecords(productId);
    const report = {
      productId: productId,
      totalRecords: records.length,
      records: records.map(record => ({
        step: record.step,
        transactionId: record.transactionId,
        timestamp: new Date(record.timestamp * 1000).toISOString(),
        proofHash: record.proofHash.substring(0, 16) + '...'
      })),
      generatedAt: new Date().toISOString(),
      reportId: `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    return JSON.stringify(report, null, 2);
  }

  // Méthode utilitaire pour formater les hash
  formatHash(hash: string, length: number = 16): string {
    if (hash.length <= length) return hash;
    return `${hash.substring(0, length)}...${hash.substring(hash.length - 4)}`;
  }

  // Méthode pour obtenir les statistiques de la blockchain
  getBlockchainStats(): {
    totalBlocks: number;
    totalTransactions: number;
    uniqueProducts: number;
    lastBlockTime?: Date;
  } {
    const uniqueProducts = new Set(this.blockchain.map(record => record.productId));
    const lastBlock = this.blockchain[this.blockchain.length - 1];

    return {
      totalBlocks: this.blockchain.length,
      totalTransactions: this.blockchain.length, // Chaque bloc = 1 transaction dans cette simulation
      uniqueProducts: uniqueProducts.size,
      lastBlockTime: lastBlock ? new Date(lastBlock.timestamp * 1000) : undefined
    };
  }
}

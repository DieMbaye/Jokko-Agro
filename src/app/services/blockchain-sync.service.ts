// blockchain-sync.service.ts
import { Injectable, inject } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import { BlockchainService } from '../blockchain/services/blockchain.service';
import { CertificationService } from './certification.service';

@Injectable({
  providedIn: 'root'
})
export class BlockchainSyncService {
  private firestore = inject(Firestore);
  private blockchainService = inject(BlockchainService);
  private certificationService = inject(CertificationService);

  private syncInterval: any;
  private isSyncing = false;

  /**
   * Démarrer la synchronisation automatique
   */
  startAutoSync(intervalMinutes: number = 5): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = setInterval(() => {
      this.syncPendingTransactions();
    }, intervalMinutes * 60 * 1000);

    // Sync immédiat au démarrage
    setTimeout(() => this.syncPendingTransactions(), 5000);
  }

  /**
   * Arrêter la synchronisation
   */
  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * Synchroniser les transactions en attente
   */
  async syncPendingTransactions(): Promise<void> {
    if (this.isSyncing) return;

    this.isSyncing = true;
    console.log('🔄 Début synchronisation blockchain...');

    try {
      // Récupérer toutes les certifications avec transactions en attente
      // À implémenter : requête Firestore pour les checkpoints avec txHash mais non vérifiés

      const pendingItems: string | any[] = []; // Récupérer depuis Firestore

      for (const item of pendingItems) {
        await this.syncTransaction(item);
      }

      console.log(`✅ Synchronisation terminée: ${pendingItems.length} transactions vérifiées`);
    } catch (error) {
      console.error('❌ Erreur synchronisation:', error);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Synchroniser une transaction spécifique
   */
  private async syncTransaction(item: any): Promise<void> {
    try {
      const details = await this.blockchainService.getTransactionDetails(item.txHash);

      // Mettre à jour Firestore selon le statut
      if (details.confirmed) {
        await this.updateCheckpointStatus(
          item.certificationId,
          item.checkpointId,
          {
            blockchainVerified: details.status === 'success',
            blockchainConfirmations: details.confirmations,
            lastVerificationCheck: new Date()
          }
        );

        if (details.status === 'success') {
          console.log(`✅ Transaction confirmée: ${item.txHash.substring(0, 10)}...`);
        } else {
          console.warn(`⚠️ Transaction échouée: ${item.txHash.substring(0, 10)}...`);
        }
      }
    } catch (error) {
      console.error(`❌ Erreur synchro transaction ${item.txHash}:`, error);
    }
  }

  /**
   * Mettre à jour le statut d'un checkpoint
   */
  private async updateCheckpointStatus(
    certificationId: string,
    checkpointId: string,
    updates: any
  ): Promise<void> {
    try {
      // À implémenter : mise à jour Firestore
      console.log('📝 Mise à jour checkpoint:', { certificationId, checkpointId, updates });
    } catch (error) {
      console.error('❌ Erreur mise à jour checkpoint:', error);
    }
  }

  /**
   * Vérifier l'intégrité complète d'une certification
   */
  async verifyCertificationIntegrity(certificationId: string): Promise<{
    valid: boolean;
    details: Array<{
      checkpointId: string;
      onChain: boolean;
      verified: boolean;
      confirmations: number;
    }>;
    summary: {
      totalCheckpoints: number;
      onChainCount: number;
      verifiedCount: number;
      verificationRate: number;
    };
  }> {
    const results = await this.blockchainService.verifyCertificationProofs(certificationId);

    const details = results.map(result => ({
      checkpointId: result.checkpointId,
      onChain: !!result.txHash,
      verified: result.verifiedOnChain,
      confirmations: result.details?.confirmations || 0
    }));

    const totalCheckpoints = details.length;
    const onChainCount = details.filter(d => d.onChain).length;
    const verifiedCount = details.filter(d => d.verified).length;
    const verificationRate = totalCheckpoints > 0 ? (verifiedCount / totalCheckpoints) * 100 : 0;

    return {
      valid: verificationRate > 70, // Seuil de 70%
      details,
      summary: {
        totalCheckpoints,
        onChainCount,
        verifiedCount,
        verificationRate
      }
    };
  }
}

// blockchain-sync.service.ts
import { Injectable, inject } from '@angular/core';
import { collection, doc, Firestore, getDoc, getDocs, limit, orderBy, query, serverTimestamp, updateDoc, where } from '@angular/fire/firestore';
import { BlockchainService } from '../blockchain/services/blockchain.service';
import { CertificationService } from './certification.service';

@Injectable({
  providedIn: 'root',
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

    this.syncInterval = setInterval(
      () => {
        this.syncPendingTransactions();
      },
      intervalMinutes * 60 * 1000,
    );

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

    try {
      // 1. Récupérer TOUTES les certifications avec des transactions blockchain
      const q = query(
        collection(this.firestore, 'certifications'),
        where('status', 'in', ['active', 'completed', 'verified']),
        orderBy('updatedAt', 'desc'),
        limit(20), // Limiter pour éviter les surcharges
      );

      const snapshot = await getDocs(q);
      const allTransactions: any[] = [];

      // 2. Extraire toutes les transactions blockchain
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        if (data['checkpoints'] && Array.isArray(data['checkpoints'])) {
          data['checkpoints'].forEach((checkpoint: any, index: number) => {
            if (checkpoint.completed && checkpoint.blockchainTransactionId) {
              allTransactions.push({
                certificationId: docSnap.id,
                checkpointId: checkpoint.id,
                checkpointIndex: index,
                txHash: checkpoint.blockchainTransactionId,
                currentStatus: checkpoint.blockchainVerified
                  ? 'verified'
                  : 'pending',
              });
            }
          });
        }
      });


      // 3. Vérifier chaque transaction
      let verifiedCount = 0;
      let updatedCount = 0;

      for (const item of allTransactions) {
        const result = await this.syncTransaction(item);
        if (result.updated) updatedCount++;
        if (result.verified) verifiedCount++;

        // Petite pause pour éviter les rate limits
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      console.log(
        `✅ Synchronisation terminée: ${verifiedCount} vérifiées, ${updatedCount} mises à jour`,
      );
    } catch (error) {
      console.error('❌ Erreur synchronisation:', error);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Synchroniser une transaction spécifique
   */
  private async syncTransaction(item: any): Promise<{
    updated: boolean;
    verified: boolean;
  }> {
    try {
      const details = await this.blockchainService.getTransactionDetails(
        item.txHash,
      );

      // Si la transaction est maintenant confirmée mais pas encore marquée comme vérifiée
      if (details.confirmed && details.status === 'success') {
        if (item.currentStatus !== 'verified') {
          // Mettre à jour Firestore
          await this.updateCheckpointBlockchainStatus(
            item.certificationId,
            item.checkpointIndex,
            {
              blockchainVerified: true,
              blockchainConfirmations: details.confirmations,
              lastBlockchainCheck: new Date(),
              transactionStatus: 'confirmed',
            },
          );
          return { updated: true, verified: true };
        }
        return { updated: false, verified: true };
      }

      // Si la transaction a échoué
      if (details.confirmed && details.status === 'failed') {
        await this.updateCheckpointBlockchainStatus(
          item.certificationId,
          item.checkpointIndex,
          {
            blockchainVerified: false,
            transactionStatus: 'failed',
            lastBlockchainCheck: new Date(),
            error: 'Transaction failed on blockchain',
          },
        );
        return { updated: true, verified: false };
      }

      return { updated: false, verified: false };
    } catch (error) {
      console.error(`❌ Erreur synchro transaction ${item.txHash}:`, error);
      return { updated: false, verified: false };
    }
  }

  /**
   * Mettre à jour le statut blockchain d'un checkpoint
   */
  private async updateCheckpointBlockchainStatus(
    certificationId: string,
    checkpointIndex: number,
    updates: any,
  ): Promise<void> {
    try {
      const certRef = doc(this.firestore, 'certifications', certificationId);
      const certSnap = await getDoc(certRef);

      if (!certSnap.exists()) {
        console.error(`❌ Certification ${certificationId} non trouvée`);
        return;
      }

      const certification = certSnap.data();
      if (
        !certification['checkpoints'] ||
        !Array.isArray(certification['checkpoints'])
      ) {
        console.error(`❌ Checkpoints non trouvés pour ${certificationId}`);
        return;
      }

      // Cloner et mettre à jour les checkpoints
      const updatedCheckpoints = [...certification['checkpoints']];
      if (updatedCheckpoints[checkpointIndex]) {
        updatedCheckpoints[checkpointIndex] = {
          ...updatedCheckpoints[checkpointIndex],
          ...updates,
        };
      }

      // Mettre à jour Firestore
      await updateDoc(certRef, {
        checkpoints: updatedCheckpoints,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error(`❌ Erreur mise à jour checkpoint:`, error);
    }
  }

  /**
   * Vérifier l'intégrité complète d'une certification
   */
  async verifyCertificationIntegrity(certificationId: string): Promise<{
    valid: boolean;
    details: Array<{
      checkpointId: string;
      title: string;
      onChain: boolean;
      verified: boolean;
      confirmations: number;
      txHash?: string;
      lastCheck: Date;
    }>;
    summary: {
      totalCheckpoints: number;
      onChainCount: number;
      verifiedCount: number;
      verificationRate: number;
    };
  }> {
    try {
      const certRef = doc(this.firestore, 'certifications', certificationId);
      const certSnap = await getDoc(certRef);

      if (!certSnap.exists()) {
        throw new Error('Certification non trouvée');
      }

      const certification = certSnap.data();
      const checkpoints = certification['checkpoints'] || [];

      const details = [];
      let onChainCount = 0;
      let verifiedCount = 0;

      for (const checkpoint of checkpoints) {
        if (checkpoint.completed) {
          const hasBlockchain = !!checkpoint.blockchainTransactionId;
          const isVerified = checkpoint.blockchainVerified === true;

          let confirmations = 0;
          if (hasBlockchain && checkpoint.blockchainTransactionId) {
            // Vérifier la transaction sur la blockchain
            const txDetails =
              await this.blockchainService.getTransactionDetails(
                checkpoint.blockchainTransactionId,
              );
            confirmations = txDetails.confirmations || 0;
          }

          details.push({
            checkpointId: checkpoint.id,
            title: checkpoint.title,
            onChain: hasBlockchain,
            verified: isVerified,
            confirmations,
            txHash: checkpoint.blockchainTransactionId,
            lastCheck: new Date(),
          });

          if (hasBlockchain) onChainCount++;
          if (isVerified) verifiedCount++;
        }
      }

      const totalCheckpoints = details.length;
      const verificationRate =
        totalCheckpoints > 0
          ? Math.round((verifiedCount / totalCheckpoints) * 100)
          : 0;

      const valid = verificationRate >= 70; // Seuil de 70%

      return {
        valid,
        details,
        summary: {
          totalCheckpoints,
          onChainCount,
          verifiedCount,
          verificationRate,
        },
      };
    } catch (error) {
      console.error('❌ Erreur vérification intégrité:', error);
      throw error;
    }
  }



  /**
   * Mettre à jour le statut d'un checkpoint
   */
  private async updateCheckpointStatus(
    certificationId: string,
    checkpointId: string,
    updates: any,
  ): Promise<void> {
    try {

    } catch (error) {
      console.error('❌ Erreur mise à jour checkpoint:', error);
    }
  }

}

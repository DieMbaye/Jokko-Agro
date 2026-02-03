// verification.service.ts - CORRECTION
import { Injectable } from '@angular/core';
import { Certification, CertificationCheckpoint } from '../interfaces/certification.interfaces';

@Injectable({
  providedIn: 'root'
})
export class VerificationService {

  // Utilisez des URLs par défaut
  private readonly blockchainExplorerUrls = {
    testnet: 'https://testnet.blockchain-explorer.com',
    mainnet: 'https://blockchain-explorer.com',
    local: 'http://localhost:8080' // Pour le développement local
  };

  // Générer un QR Code avec toutes les infos
  generateVerificationQRCode(certification: Certification): string {
    const data = {
      type: 'agrinova_certification',
      id: certification.id,
      product: certification.productName,
      producer: certification.producerName,
      score: certification.validationScore,
      status: certification.verificationStatus,
      verificationUrl: `${window.location.origin}/verify/${certification.id}`,
      blockchain: this.hasBlockchainData(certification),
      timestamp: new Date().toISOString()
    };

    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(JSON.stringify(data))}`;
  }

  // Vérifier si une certification a des données blockchain
  hasBlockchainData(certification: Certification): boolean {
    return certification.checkpoints.some(cp =>
      cp.completed && cp.blockchainTransactionId
    );
  }

  // Obtenir le pourcentage de couverture blockchain
  getBlockchainCoverage(certification: Certification): number {
    const total = certification.checkpoints.filter(cp => cp.completed).length;
    const withBlockchain = certification.checkpoints.filter(cp =>
      cp.completed && cp.blockchainTransactionId
    ).length;

    return total > 0 ? Math.round((withBlockchain / total) * 100) : 0;
  }

  // Générer un rapport de vérification
  generateVerificationReport(certification: Certification): any {
    return {
      metadata: {
        generatedAt: new Date().toISOString(),
        version: '1.0',
        generator: 'Agrinova Certification System'
      },
      certification: {
        id: certification.id,
        productName: certification.productName,
        productType: certification.productType,
        producerName: certification.producerName,
        validationScore: certification.validationScore,
        verificationStatus: certification.verificationStatus,
        startDate: certification.startDate,
        harvestDate: certification.actualHarvestDate || certification.expectedHarvestDate,
        location: certification.location
      },
      checkpoints: certification.checkpoints.map(cp => ({
        title: cp.title,
        dayOffset: cp.dayOffset,
        completed: cp.completed,
        completedAt: cp.completedAt,
        verificationScore: cp.verificationScore,
        blockchain: {
          transactionId: cp.blockchainTransactionId,
          verified: !!cp.blockchainTransactionId
        }
      })),
      blockchainSummary: {
        totalCheckpoints: certification.totalCheckpoints,
        completedCheckpoints: certification.completedCheckpoints,
        blockchainCertifiedCheckpoints: certification.checkpoints.filter(cp =>
          cp.completed && cp.blockchainTransactionId
        ).length,
        coveragePercentage: this.getBlockchainCoverage(certification)
      }
    };
  }

  // Vérifier une transaction blockchain (version corrigée)
  async verifyBlockchainTransaction(transactionId: string, network: 'testnet' | 'mainnet' = 'testnet'): Promise<any> {
    try {
      if (!transactionId || transactionId.trim() === '') {
        throw new Error('ID de transaction invalide');
      }

      // Utiliser l'URL appropriée selon le réseau
      const explorerUrl = this.blockchainExplorerUrls[network];

      // Vérifier si nous sommes en ligne
      if (!navigator.onLine) {
        throw new Error('Pas de connexion internet');
      }

      console.log(`🔍 Vérification blockchain transaction: ${transactionId}`);
      console.log(`🌐 URL: ${explorerUrl}/verify/${transactionId}`);

      const response = await fetch(`${explorerUrl}/verify/${transactionId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        // Timeout de 10 secondes
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('✅ Réponse blockchain:', data);

      return {
        success: true,
        data: data,
        verified: data.verified || false,
        timestamp: new Date().toISOString(),
        explorerUrl: `${explorerUrl}/tx/${transactionId}`
      };

    } catch (error: any) {
      console.error('❌ Erreur vérification blockchain:', error);

      // Fallback: simulation pour le développement
      if (error.name === 'TimeoutError' || error.message.includes('Failed to fetch')) {
        console.warn('⚠️ Blockchain non disponible, simulation en cours...');
        return this.simulateBlockchainVerification(transactionId);
      }

      return {
        success: false,
        error: error.message || 'Erreur lors de la vérification',
        verified: false,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Simulation de vérification pour le développement
  private simulateBlockchainVerification(transactionId: string): any {
    // Générer une réponse simulée pour le développement
    const isVerified = Math.random() > 0.3; // 70% de chance d'être vérifié

    return {
      success: true,
      data: {
        transactionId: transactionId,
        verified: isVerified,
        blockNumber: Math.floor(Math.random() * 1000000) + 1000,
        timestamp: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
        confirmations: Math.floor(Math.random() * 100) + 1,
        network: 'testnet',
        simulated: true
      },
      verified: isVerified,
      timestamp: new Date().toISOString(),
      explorerUrl: `https://testnet.blockchain-explorer.com/tx/${transactionId}`,
      note: '⚠️ Données simulées - Blockchain non disponible'
    };
  }

  // Générer un certificat PDF (simplifié)
  generateCertificate(certification: Certification): string {
    return `
      ==============================================
      CERTIFICAT DE TRACABILITÉ AGRINOVA
      ==============================================

      🌱 PRODUIT: ${certification.productName}
      📋 TYPE: ${certification.productType}
      👨‍🌾 PRODUCTEUR: ${certification.producerName}

      🏆 SCORE DE CERTIFICATION: ${certification.validationScore}%
      🔗 STATUT BLOCKCHAIN: ${this.getBlockchainCoverage(certification)}% certifié

      📅 PÉRIODE: ${certification.startDate.toLocaleDateString()} -
                  ${(certification.actualHarvestDate || certification.expectedHarvestDate).toLocaleDateString()}

      📍 LOCALISATION: ${certification.location.address}

      ==============================================
      POINTS DE CONTRÔLE CERTIFIÉS:
      ${certification.checkpoints
        .filter(cp => cp.completed)
        .map(cp => `✓ ${cp.title} (J+${cp.dayOffset}) - Score: ${cp.verificationScore}% ${cp.blockchainTransactionId ? '⛓️' : ''}`)
        .join('\n')}

      ==============================================
      VÉRIFICATION EN LIGNE:
      ${`${window.location.origin}/verify/${certification.id}`}

      ==============================================
      Ce certificat atteste que le produit ci-dessus
      a été cultivé selon les normes de traçabilité
      Agrinova et que les preuves de culture ont été
      ${this.hasBlockchainData(certification) ? 'enregistrées sur blockchain pour une traçabilité immuable.' : 'documentées selon le protocole de certification.'}

      ⚠️ Ce certificat ne garantit pas la qualité du produit
      mais atteste de sa traçabilité et du respect du
      protocole de certification.

      ==============================================
      ID: ${certification.id}
      GÉNÉRÉ LE: ${new Date().toLocaleDateString()}
      ==============================================
    `;
  }

  // Nouvelle méthode: obtenir l'URL d'explorateur pour une transaction
  getExplorerUrl(transactionId: string, network: 'testnet' | 'mainnet' = 'testnet'): string {
    const baseUrl = this.blockchainExplorerUrls[network];
    return `${baseUrl}/tx/${transactionId}`;
  }

  // Nouvelle méthode: vérifier plusieurs transactions
  async verifyMultipleTransactions(transactionIds: string[]): Promise<any[]> {
    const results = [];

    for (const txId of transactionIds) {
      try {
        const result = await this.verifyBlockchainTransaction(txId);
        results.push({
          transactionId: txId,
          ...result
        });
      } catch (error) {
        results.push({
          transactionId: txId,
          success: false,
          error: error instanceof Error ? error.message : 'Erreur inconnue',
          verified: false
        });
      }
    }

    return results;
  }

  // Nouvelle méthode: générer un rapport détaillé
  generateDetailedBlockchainReport(certification: Certification): any {
    const transactions = certification.checkpoints
      .filter(cp => cp.completed && cp.blockchainTransactionId)
      .map(cp => ({
        checkpointTitle: cp.title,
        checkpointDay: cp.dayOffset,
        transactionId: cp.blockchainTransactionId,
        completedAt: cp.completedAt,
        score: cp.verificationScore,
        explorerUrl: this.getExplorerUrl(cp.blockchainTransactionId!)
      }));

    return {
      reportId: `report_${Date.now()}_${certification.id.substring(0, 8)}`,
      generatedAt: new Date().toISOString(),
      certification: {
        id: certification.id,
        productName: certification.productName,
        producerName: certification.producerName
      },
      blockchain: {
        totalTransactions: transactions.length,
        coveragePercentage: this.getBlockchainCoverage(certification),
        transactions: transactions,
        summary: {
          earliestTransaction: transactions.reduce((earliest, current) =>
            new Date(current.completedAt!) < new Date(earliest.completedAt!) ? current : earliest
          ),
          latestTransaction: transactions.reduce((latest, current) =>
            new Date(current.completedAt!) > new Date(latest.completedAt!) ? current : latest
          ),
          averageScore: transactions.length > 0
            ? Math.round(transactions.reduce((sum, tx) => sum + tx.score, 0) / transactions.length)
            : 0
        }
      },
      verification: {
        publicUrl: `${window.location.origin}/verify/${certification.id}`,
        qrCodeUrl: this.generateVerificationQRCode(certification)
      }
    };
  }
}

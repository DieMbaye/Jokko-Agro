// blockchain.service.ts - VERSION CORRIGÉE
import { Injectable, inject } from '@angular/core';
import * as CryptoJS from 'crypto-js';
import { IpfsService } from './ipfs.service';
import { EthereumService } from './ethereum.service';
import { CERTIFICATION_REGISTRY_ABI } from '../contracts/certification-registry.abi';

export interface IPFSProof {
  cid: string;
  url: string;
  timestamp: number;
  fileHash: string;
  metadataHash: string;
}

export interface BlockchainProof {
  productId: string;
  proofHash: string;
  ipfsCID: string;
  timestamp: number; // secondes UTC
  step: 'INIT' | 'FOLLOW_UP' | 'HARVEST' | 'CHECKPOINT';
  checkpointId?: string;
  checkpointOrder?: number;
  txHash?: string;
  blockNumber?: number;
  verified: boolean;
}

// Configuration du smart contract
const CONTRACT_ADDRESS = '0x4020e67078c8ca3f6d27d698c036a57b4a278fde';
const CONTRACT_ABI = CERTIFICATION_REGISTRY_ABI;

@Injectable({
  providedIn: 'root',
})
export class BlockchainService {
  private ipfsService = inject(IpfsService);
  private ethereumService = inject(EthereumService);

  /**
   * Enregistrer une preuve sur la blockchain Ethereum (VRAIE VERSION)
   */
  async registerProofOnEthereum(
    productId: string,
    proofHash: string,
    ipfsCID: string,
    step: string,
    checkpointId?: string,
  ): Promise<{
    success: boolean;
    txHash?: string;
    blockNumber?: number;
    error?: string;
  }> {
    try {
      console.log('⛓️ Début enregistrement RÉEL sur Ethereum...');

      // 1. Vérifier la connexion wallet
      if (!this.ethereumService.walletConnected.value) {
        const connectResult = await this.ethereumService.connectWallet();
        if (!connectResult.success) {
          throw new Error('Connexion wallet requise: ' + connectResult.error);
        }
      }

      // 2. Vérifier le réseau Sepolia
      const isCorrectNetwork =
        await this.ethereumService.checkNetwork(11155111);
      if (!isCorrectNetwork) {
        const switched = await this.ethereumService.switchNetwork(11155111);
        if (!switched) {
          throw new Error('Veuillez passer sur Sepolia Testnet');
        }
      }

      // 3. Préparer l'appel au smart contract
      const contractData = this.ethereumService.encodeContractCall(
        CONTRACT_ABI,
        'registerProof',
        [productId, proofHash, ipfsCID, step, checkpointId || ''],
      );

      // 4. Envoyer la transaction RÉELLE
      const txResult = await this.ethereumService.sendContractTransaction(
        CONTRACT_ADDRESS,
        contractData,
      );

      if (!txResult.success) {
        throw new Error('Transaction échouée: ' + txResult.error);
      }

      console.log('✅ Transaction envoyée:', txResult.txHash);

      // 5. Attendre la confirmation
      const receipt = await this.waitForTransactionConfirmation(
        txResult.txHash!,
      );

      return {
        success: true,
        txHash: txResult.txHash,
        blockNumber: receipt.blockNumber,
      };
    } catch (error: any) {
      console.error('❌ Erreur enregistrement Ethereum:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Attendre la confirmation d'une transaction
   */
  private async waitForTransactionConfirmation(txHash: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(async () => {
        try {
          const receipt =
            await this.ethereumService.getTransactionReceipt(txHash);

          if (receipt) {
            clearInterval(checkInterval);

            if (receipt.status === '0x1') {
              resolve({
                blockNumber: parseInt(receipt.blockNumber, 16),
                confirmations: 1,
                timestamp: Date.now(),
              });
            } else {
              reject(new Error('Transaction échouée'));
            }
          }
        } catch (error) {
          clearInterval(checkInterval);
          reject(error);
        }
      }, 3000); // Vérifier toutes les 3 secondes

      // Timeout après 60 secondes
      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error('Timeout de confirmation de transaction'));
      }, 60000);
    });
  }

  /**
   * Vérifier une preuve sur Ethereum (VRAIE VERSION)
   */
  async verifyProofOnEthereum(
    proofHash: string,
    txHash: string,
  ): Promise<{
    success: boolean;
    verified: boolean;
    details?: any;
    error?: string;
  }> {
    try {
      // 1. Vérifier la transaction d'abord
      const receipt = await this.ethereumService.getTransactionReceipt(txHash);

      if (!receipt) {
        return {
          success: false,
          verified: false,
          error: 'Transaction non trouvée',
        };
      }

      // 2. Vérifier que la transaction est confirmée
      const isConfirmed = receipt.status === '0x1';

      if (!isConfirmed) {
        return {
          success: false,
          verified: false,
          error: 'Transaction échouée',
        };
      }

      // 3. Récupérer les données du smart contract (si disponible)
      // Note: Vous aurez besoin d'une fonction view dans votre contrat
      // pour vérifier l'existence de la preuve

      return {
        success: true,
        verified: isConfirmed,
        details: {
          blockNumber: parseInt(receipt.blockNumber, 16),
          confirmations: 1,
          timestamp: Date.now(),
        },
      };
    } catch (error: any) {
      console.error('❌ Erreur vérification Ethereum:', error);
      return {
        success: false,
        verified: false,
        error: error.message,
      };
    }
  }

  /**
   * Remplacer la simulation par la vraie méthode
   */
  private async simulateEthereumTransaction(
    productId: string,
    proofHash: string,
    ipfsCID: string,
    step: string,
    signature: string,
  ): Promise<{
    txHash: string;
    blockNumber: number;
    timestamp: number;
  }> {
    // ❌ À SUPPRIMER ou garder comme fallback
    console.warn('⚠️ Simulation utilisée - passez aux transactions réelles');

    // Garder le code de simulation temporairement
    return new Promise((resolve) => {
      setTimeout(() => {
        const txHash = `0x${CryptoJS.SHA256(
          `${productId}-${proofHash}-${Date.now()}`,
        )
          .toString()
          .substring(0, 64)}`;

        const blockNumber = Math.floor(Math.random() * 1000000) + 4000000;

        resolve({
          txHash,
          blockNumber,
          timestamp: Math.floor(Date.now() / 1000),
        });
      }, 2000);
    });
  }

  /**
   * Calculer le hash SHA-256 d'une chaîne
   */
  public calculateSHA256(data: string): string {
    return CryptoJS.SHA256(data).toString(CryptoJS.enc.Hex);
  }

  // ========== MÉTHODES IPFS ==========

  /**
   * Calculer le hash SHA-256 d'une photo (public)
   */
  public async calculatePhotoHash(photoFile: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (event) => {
        try {
          const arrayBuffer = event.target?.result as ArrayBuffer;
          if (!arrayBuffer) {
            reject(new Error('Impossible de lire le fichier photo'));
            return;
          }

          const wordArray = CryptoJS.lib.WordArray.create(arrayBuffer as any);
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

  /**
   * Upload une photo de certification sur IPFS
   */
  async uploadCertificationPhoto(
    photoFile: File,
    metadata: {
      productId: string;
      step: string;
      checkpointId?: string;
      lat?: number;
      lng?: number;
      deviceInfo?: string;
    },
  ): Promise<{
    success: boolean;
    ipfsProof?: IPFSProof;
    error?: string;
  }> {
    try {
      console.log('📤 Début upload photo sur IPFS...', metadata);

      // 1. Upload du fichier sur IPFS
      const uploadResult = await this.ipfsService.uploadFile(photoFile);
      if (!uploadResult.success) {
        throw new Error(uploadResult.error);
      }

      // 2. Calculer les hashs
      const photoHash = await this.calculatePhotoHash(photoFile);

      const metadataToHash = {
        ...metadata,
        photoHash: photoHash,
        originalFilename: photoFile.name,
        fileSize: photoFile.size,
        mimeType: photoFile.type,
        uploadTimestamp: Date.now(),
      };

      const metadataHash = this.calculateSHA256(JSON.stringify(metadataToHash));

      // 3. Créer la preuve IPFS
      const ipfsProof: IPFSProof = {
        cid: uploadResult.cid!,
        url: uploadResult.url!,
        timestamp: Math.floor(Date.now() / 1000),
        fileHash: photoHash,
        metadataHash: metadataHash,
      };

      console.log('✅ Photo uploadée sur IPFS:', ipfsProof);

      return {
        success: true,
        ipfsProof,
      };
    } catch (error: any) {
      console.error('❌ Erreur upload IPFS:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Upload les métadonnées de certification sur IPFS
   */
  async uploadCertificationMetadata(
    certificationId: string,
    checkpointsData: any[],
  ): Promise<{
    success: boolean;
    cid?: string;
    url?: string;
    error?: string;
  }> {
    try {
      const metadata = {
        certificationId,
        checkpoints: checkpointsData,
        timestamp: Date.now(),
        version: '1.0',
      };

      const result = await this.ipfsService.uploadJSON(metadata);
      return result;
    } catch (error: any) {
      console.error('❌ Erreur upload metadata:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Créer un message signable pour la preuve
   */
  private createSignableMessage(
    productId: string,
    proofHash: string,
    ipfsCID: string,
    step: string,
    checkpointId?: string,
  ): string {
    const timestamp = Math.floor(Date.now() / 1000);

    const message = {
      productId,
      proofHash,
      ipfsCID,
      step,
      checkpointId,
      timestamp,
      action: 'REGISTER_CERTIFICATION_PROOF',
      version: '1.0',
    };

    return JSON.stringify(message);
  }

  /**
   * Flux complet : Photo -> IPFS -> Blockchain
   */
  async createCertificationProof(
    productId: string,
    photoFile: File,
    step: 'INIT' | 'FOLLOW_UP' | 'HARVEST' | 'CHECKPOINT',
    checkpointId?: string,
    checkpointOrder?: number,
    location?: { lat: number; lng: number },
  ): Promise<{
    success: boolean;
    ipfsProof?: IPFSProof;
    blockchainProof?: BlockchainProof;
    error?: string;
  }> {
    try {
      console.log('🚀 Début création preuve complète...');

      // 1. Upload sur IPFS
      const ipfsResult = await this.uploadCertificationPhoto(photoFile, {
        productId,
        step,
        checkpointId,
        lat: location?.lat,
        lng: location?.lng,
        deviceInfo: navigator.userAgent?.substring(0, 100),
      });

      if (!ipfsResult.success) {
        throw new Error(`Erreur IPFS: ${ipfsResult.error}`);
      }

      // 2. Calculer le hash de preuve final
      const finalProofHash = this.calculateSHA256(
        JSON.stringify({
          productId,
          step,
          ipfsCID: ipfsResult.ipfsProof!.cid,
          fileHash: ipfsResult.ipfsProof!.fileHash,
          metadataHash: ipfsResult.ipfsProof!.metadataHash,
          timestamp: ipfsResult.ipfsProof!.timestamp,
        }),
      );

      // 3. Enregistrer sur blockchain
      const blockchainResult = await this.registerProofOnEthereum(
        productId,
        finalProofHash,
        ipfsResult.ipfsProof!.cid,
        step,
        checkpointId,
      );

      if (!blockchainResult.success) {
        console.warn(
          '⚠️ Blockchain non disponible, sauvegarde locale uniquement',
        );

        // Sauvegarde locale comme fallback
        const localBlockchainProof: BlockchainProof = {
          productId,
          proofHash: finalProofHash,
          ipfsCID: ipfsResult.ipfsProof!.cid,
          timestamp: Math.floor(Date.now() / 1000),
          step,
          checkpointId,
          checkpointOrder,
          verified: false,
        };

        return {
          success: true,
          ipfsProof: ipfsResult.ipfsProof,
          blockchainProof: localBlockchainProof,
        };
      }

      // 4. Créer la preuve blockchain complète
      const blockchainProof: BlockchainProof = {
        productId,
        proofHash: finalProofHash,
        ipfsCID: ipfsResult.ipfsProof!.cid,
        timestamp: Math.floor(Date.now() / 1000),
        step,
        checkpointId,
        checkpointOrder,
        txHash: blockchainResult.txHash,
        blockNumber: blockchainResult.blockNumber,
        verified: true,
      };

      console.log('✅ Preuve complète créée:', {
        ipfs: ipfsResult.ipfsProof,
        blockchain: blockchainProof,
      });

      return {
        success: true,
        ipfsProof: ipfsResult.ipfsProof,
        blockchainProof,
      };
    } catch (error: any) {
      console.error('❌ Erreur création preuve:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Récupérer toutes les preuves d'un produit
   */
  async getProductProofs(productId: string): Promise<BlockchainProof[]> {
    // À implémenter : récupérer depuis la blockchain ou la base de données
    // Pour l'instant, retourner les preuves simulées
    return [];
  }

  /**
   * Générer un rapport de traçabilité
   */
  async generateTraceabilityReport(productId: string): Promise<{
    success: boolean;
    report?: string;
    error?: string;
  }> {
    try {
      const proofs = await this.getProductProofs(productId);

      const report = {
        productId,
        totalProofs: proofs.length,
        proofs: proofs.map((proof) => ({
          step: proof.step,
          timestamp: new Date(proof.timestamp * 1000).toISOString(),
          ipfsCID: proof.ipfsCID,
          proofHash: proof.proofHash,
          txHash: proof.txHash,
          blockNumber: proof.blockNumber,
          verified: proof.verified,
        })),
        summary: {
          ipfsCoverage: proofs.filter((p) => p.ipfsCID).length,
          blockchainCoverage: proofs.filter((p) => p.txHash).length,
          verificationRate:
            (proofs.filter((p) => p.verified).length / proofs.length) * 100,
        },
        generatedAt: new Date().toISOString(),
      };

      return {
        success: true,
        report: JSON.stringify(report, null, 2),
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Méthodes de compatibilité (à supprimer plus tard)
  registerProofOnBlockchain(arg0: any): any {
    console.warn('⚠️ Méthode obsolète - utilisez registerProofOnEthereum');
    throw new Error(
      'Method not implemented. Use registerProofOnEthereum instead',
    );
  }

  createCanonicalObject(arg0: {
    productId: string;
    photoFile: File;
    lat: number;
    lng: number;
    step: string;
    checkpointId: any;
    checkpointOrder: any;
  }): any {
    console.warn('⚠️ Méthode obsolète - utilisez createCertificationProof');
    throw new Error(
      'Method not implemented. Use createCertificationProof instead',
    );
  }

  // blockchain.service.ts - AJOUTEZ
  async checkTransactionStatus(txHash: string): Promise<{
    confirmed: boolean;
    blockNumber?: number;
    status?: string;
    error?: string;
  }> {
    try {
      const receipt = await this.ethereumService.getTransactionReceipt(txHash);

      if (!receipt) {
        return { confirmed: false, status: 'pending' };
      }

      return {
        confirmed: true,
        blockNumber: parseInt(receipt.blockNumber, 16),
        status: receipt.status === '0x1' ? 'success' : 'failed',
      };
    } catch (error: any) {
      return { confirmed: false, error: error.message };
    }
  }

  // Dans blockchain.service.ts - AJOUTER

  /**
   * Vérifier l'état détaillé d'une transaction
   */
  async getTransactionDetails(txHash: string): Promise<{
    confirmed: boolean;
    status: 'pending' | 'success' | 'failed' | 'dropped';
    blockNumber?: number;
    confirmations: number;
    timestamp?: number;
    error?: string;
  }> {
    try {
      // 1. Récupérer la transaction
      const tx = await this.ethereumService.callAlchemy(
        'eth_getTransactionByHash',
        [txHash],
      );

      if (!tx) {
        return {
          confirmed: false,
          status: 'dropped',
          confirmations: 0,
          error: 'Transaction non trouvée',
        };
      }

      // 2. Récupérer le reçu
      const receipt = await this.ethereumService.getTransactionReceipt(txHash);

      if (!receipt) {
        return {
          confirmed: false,
          status: 'pending',
          confirmations: 0,
        };
      }

      // 3. Vérifier le statut
      const isSuccess = receipt.status === '0x1';
      const blockNumber = parseInt(receipt.blockNumber, 16);

      // 4. Récupérer le block actuel pour les confirmations
      const currentBlock = await this.ethereumService.getCurrentBlock();
      const confirmations = currentBlock - blockNumber;

      // 5. Récupérer le timestamp du block
      const block = await this.ethereumService.callAlchemy(
        'eth_getBlockByNumber',
        [`0x${blockNumber.toString(16)}`, false],
      );
      const timestamp = block
        ? parseInt(block.timestamp, 16) * 1000
        : undefined;

      return {
        confirmed: true,
        status: isSuccess ? 'success' : 'failed',
        blockNumber,
        confirmations,
        timestamp,
      };
    } catch (error: any) {
      console.error('❌ Erreur vérification transaction:', error);
      return {
        confirmed: false,
        status: 'pending',
        confirmations: 0,
        error: error.message,
      };
    }
  }

  /**
   * Vérifier une preuve sur le smart contract
   */
  async verifyProofOnContract(
    productId: string,
    proofHash: string,
  ): Promise<{
    exists: boolean;
    registeredAt?: number;
    verified: boolean;
    error?: string;
  }> {
    try {
      // Encoder l'appel pour getProof (à adapter selon votre contrat)
      const contractData = this.ethereumService.encodeContractCall(
        CERTIFICATION_REGISTRY_ABI,
        'getProof',
        [productId, proofHash],
      );

      const result = await this.ethereumService.callAlchemy('eth_call', [
        {
          to: CONTRACT_ADDRESS,
          data: contractData,
        },
        'latest',
      ]);

      // Décoder le résultat (exemple - à adapter)
      if (result === '0x') {
        return { exists: false, verified: false };
      }

      // Décodage simplifié - à adapter selon votre contrat
      const decoded = this.decodeProofResult(result);

      return {
        exists: true,
        registeredAt: decoded.timestamp,
        verified: decoded.verified || true,
      };
    } catch (error: any) {
      return {
        exists: false,
        verified: false,
        error: error.message,
      };
    }
  }

  private decodeProofResult(hexData: string): any {
    // Simple décodage - à améliorer avec ethers.js
    try {
      // Supprimer le préfixe 0x
      const data = hexData.startsWith('0x') ? hexData.substring(2) : hexData;

      // Décoder les valeurs (exemple basique)
      return {
        timestamp: parseInt(data.substring(0, 64), 16),
        verified: parseInt(data.substring(64, 128), 16) === 1,
      };
    } catch {
      return { timestamp: 0, verified: false };
    }
  }

  /**
   * Vérifier toutes les preuves d'une certification
   */
  async verifyCertificationProofs(certificationId: string): Promise<
    Array<{
      checkpointId: string;
      proofHash: string;
      txHash?: string;
      verifiedOnChain: boolean;
      transactionStatus: string;
      details?: any;
    }>
  > {
    const results:
      | {
          checkpointId: string;
          proofHash: string;
          txHash?: string;
          verifiedOnChain: boolean;
          transactionStatus: string;
          details?: any;
        }[]
      | PromiseLike<
          {
            checkpointId: string;
            proofHash: string;
            txHash?: string;
            verifiedOnChain: boolean;
            transactionStatus: string;
            details?: any;
          }[]
        > = [];

    // Note: Pour l'instant, retourne des résultats simulés
    // Vous devrez récupérer les données depuis Firestore

    return results;
  }
}

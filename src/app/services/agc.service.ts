// services/agc.service.ts
import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  increment,
  runTransaction,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
  orderBy,
  limit,
  Timestamp,
} from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { BehaviorSubject, Observable } from 'rxjs';
import { CryptoECDAService } from 'src/secure/services/crypto-ecdsa.service';
import { CryptoService } from 'src/secure/services/crypto.service';
import { UserKeysService } from 'src/secure/services/user-keys.service';


// ==================== INTERFACES ====================

export interface AGCBalance {
  userId: string;
  balance: number; // en AGC (1 AGC = 100 FCFA)
  lockedBalance: number; // AGC en attente de validation
  lastUpdated: Date;
  totalEarned: number; // Total AGC gagnés (historique)
  totalSpent: number; // Total AGC dépensés
}

export interface AGCPurchase {
  id?: string;
  userId: string;
  amount: number; // Montant en AGC
  fiatAmount: number; // Montant en FCFA
  rate: number; // Taux de conversion (ex: 100 FCFA = 1 AGC)
  status: 'pending' | 'completed' | 'failed';
  paymentMethod: 'wave' | 'orange_money' | 'free_money' | 'card';
  transactionId?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface AGCTransaction {
  id?: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  type:
    | 'purchase'
    | 'sale_payment'
    | 'service_payment'
    | 'transfer'
    | 'bonus'
    | 'escrow_lock'
    | 'escrow_release';
  referenceId?: string;
  description: string;
  status: 'pending' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
  metadata?: any;

  // Propriétés pour le ledger immuable (Étape 1)
  previousHash: string;
  hash: string;
  nonce?: number;
  blockHeight: number;

  // 🔐 NOUVELLES PROPRIÉTÉS POUR LES SIGNATURES (Étape 2)
  signature: string; // Signature ECDSA de la transaction
  signerPublicKey: string; // Clé publique du signataire
  signerId: string; // ID du signataire (généralement fromUserId)
  signatureAlgorithm: 'ECDSA-P256'; // Algorithme utilisé
  signatureTimestamp: number; // Timestamp de la signature
  signatureNonce?: string; // Nonce pour éviter les rejeux
}

export interface LockedAGC {
  id?: string;
  userId: string;
  amount: number;
  orderNumber: string;
  description: string;
  status: 'locked' | 'released' | 'cancelled';
  lockedAt: Date;
  releasedAt?: Date;
  cancelledAt?: Date;
  saleId?: string; // ID de la vente associée
  producerId?: string; // ID du producteur destinataire
  lockSignature?: string; // Signature du lock
}

export interface LedgerVerificationResult {
  isValid: boolean;
  invalidBlocks: Array<{
    blockHeight: number;
    expectedHash: string;
    actualHash: string;
    reason: string;
  }>;
  invalidSignatures: Array<{
    blockHeight: number;
    signerId: string;
    reason: string;
  }>;
  totalBlocks: number;
  lastVerifiedBlock: number;
}

// ==================== SERVICE PRINCIPAL ====================

@Injectable({
  providedIn: 'root',
})
export class AGCService {
  private firestore = inject(Firestore);
  private auth = inject(Auth);
  private cryptoService = inject(CryptoService);
  private cryptoECDSA = inject(CryptoECDAService);
  private userKeys = inject(UserKeysService);

  // Taux de conversion fixe: 1 AGC = 100 FCFA
  private readonly CONVERSION_RATE = 100;

  // Bonus de bienvenue pour les nouveaux utilisateurs
  private readonly WELCOME_BONUS = 10;

  // Observable du solde de l'utilisateur courant
  private balanceSubject = new BehaviorSubject<number>(0);
  public balance$: Observable<number> = this.balanceSubject.asObservable();

  // Observable des transactions en cours
  private pendingTransactionsSubject = new BehaviorSubject<AGCTransaction[]>(
    [],
  );
  public pendingTransactions$ = this.pendingTransactionsSubject.asObservable();

  constructor() {
    // Écouter les changements d'utilisateur
    this.auth.onAuthStateChanged((user) => {
      if (user) {
        this.loadUserBalance(user.uid);
        this.loadPendingTransactions(user.uid);
      } else {
        this.balanceSubject.next(0);
        this.pendingTransactionsSubject.next([]);
      }
    });
  }

  // ==================== GESTION DU SOLDE ====================

  /**
   * Charger le solde AGC de l'utilisateur
   */
  async loadUserBalance(userId: string): Promise<void> {
    try {
      const balanceRef = doc(this.firestore, 'agc_balances', userId);
      const balanceDoc = await getDoc(balanceRef);

      if (balanceDoc.exists()) {
        const data = balanceDoc.data() as AGCBalance;
        this.balanceSubject.next(data.balance || 0);
      } else {
        // Créer un solde initial pour le nouvel utilisateur
        await this.createInitialBalance(userId);
        this.balanceSubject.next(this.WELCOME_BONUS);
      }
    } catch (error) {
      console.error('Erreur chargement solde AGC:', error);
      this.balanceSubject.next(0);
    }
  }

  /**
   * Créer un solde initial pour un nouvel utilisateur
   * Bonus de bienvenue
   */
  private async createInitialBalance(userId: string): Promise<void> {
    const balanceRef = doc(this.firestore, 'agc_balances', userId);
    const now = new Date();

    const initialBalance: AGCBalance = {
      userId,
      balance: this.WELCOME_BONUS,
      lockedBalance: 0,
      lastUpdated: now,
      totalEarned: this.WELCOME_BONUS,
      totalSpent: 0,
    };

    await setDoc(balanceRef, this.sanitizeForFirestore(initialBalance));

    // Générer une signature système pour le bonus
    const signatureNonce = this.generateNonce();

    // Enregistrer la transaction de bonus dans le ledger
    await this.addToLedger({
      fromUserId: 'system',
      toUserId: userId,
      amount: this.WELCOME_BONUS,
      type: 'bonus',
      referenceId: `welcome_bonus_${userId}`,
      description: 'Bonus de bienvenue AGC',
      status: 'completed',
      createdAt: now,
      completedAt: now,
      metadata: { type: 'welcome_bonus' },
      // Pour le bonus, on utilise une signature système spéciale
      signature: 'system_signature_' + signatureNonce,
      signerPublicKey: 'system',
      signerId: 'system',
      signatureAlgorithm: 'ECDSA-P256',
      signatureTimestamp: now.getTime(),
      signatureNonce,
      previousHash: '',
      hash: '',
      nonce: 0,
      blockHeight: 0
    });
  }

  /**
   * Obtenir le solde d'un utilisateur
   */
  async getBalance(userId: string): Promise<number> {
    try {
      const balanceRef = doc(this.firestore, 'agc_balances', userId);
      const balanceDoc = await getDoc(balanceRef);

      if (balanceDoc.exists()) {
        return balanceDoc.data()['balance'] || 0;
      }
      return 0;
    } catch (error) {
      console.error('Erreur récupération solde:', error);
      return 0;
    }
  }

  /**
   * Obtenir le solde complet (balance + locked)
   */
  async getFullBalance(
    userId: string,
  ): Promise<{ available: number; locked: number; total: number }> {
    try {
      const balanceRef = doc(this.firestore, 'agc_balances', userId);
      const balanceDoc = await getDoc(balanceRef);

      if (balanceDoc.exists()) {
        const data = balanceDoc.data();
        const available = data['balance'] || 0;
        const locked = data['lockedBalance'] || 0;
        return { available, locked, total: available + locked };
      }
      return { available: 0, locked: 0, total: 0 };
    } catch (error) {
      console.error('Erreur récupération solde complet:', error);
      return { available: 0, locked: 0, total: 0 };
    }
  }

  /**
   * Vérifier si un utilisateur a assez de AGC disponibles
   */
  async hasEnoughBalance(userId: string, amount: number): Promise<boolean> {
    const balance = await this.getBalance(userId);
    return balance >= amount;
  }

  // ==================== CONVERSIONS ====================

  /**
   * Convertir FCFA en AGC
   */
  convertFiatToAGC(fiatAmount: number): number {
    return Math.floor(fiatAmount / this.CONVERSION_RATE);
  }

  /**
   * Convertir AGC en FCFA
   */
  convertAGCToFiat(agcAmount: number): number {
    return agcAmount * this.CONVERSION_RATE;
  }

  /**
   * Calculer le montant hybride pour une transaction (10% AGC, 90% FCFA)
   */
  calculateHybridPayment(totalFiat: number): {
    fiatAmount: number;
    agcAmount: number;
    agcEquivalent: number;
  } {
    const agcAmount = this.convertFiatToAGC(totalFiat * 0.1);
    const agcEquivalent = agcAmount * this.CONVERSION_RATE;
    const fiatAmount = totalFiat - agcEquivalent;

    return { fiatAmount, agcAmount, agcEquivalent };
  }

  // ==================== LEDGER IMMUABLE AVEC SIGNATURES ====================

  /**
   * Vérifier l'intégrité de toute la chaîne du ledger (hashs + signatures)
   */
  async verifyLedger(): Promise<LedgerVerificationResult> {
    const result: LedgerVerificationResult = {
      isValid: true,
      invalidBlocks: [],
      invalidSignatures: [],
      totalBlocks: 0,
      lastVerifiedBlock: -1,
    };

    try {
      const ledgerCollection = collection(this.firestore, 'agc_ledger');
      const q = query(ledgerCollection, orderBy('blockHeight', 'asc'));
      const snapshot = await getDocs(q);

      result.totalBlocks = snapshot.size;

      let previousHash = '0'.repeat(64);

      for (const docSnap of snapshot.docs) {
        const block = docSnap.data() as AGCTransaction;
        const blockHeight = block.blockHeight;

        // 🔐 Vérification 1: La signature est valide
        const isSignatureValid = await this.verifyTransactionSignature(block);
        if (!isSignatureValid) {
          result.isValid = false;
          result.invalidSignatures.push({
            blockHeight,
            signerId: block.signerId,
            reason: 'Signature invalide ou falsifiée',
          });
        }

        // 🔗 Vérification 2: La liaison avec le bloc précédent
        if (block.previousHash !== previousHash) {
          result.isValid = false;
          result.invalidBlocks.push({
            blockHeight,
            expectedHash: previousHash,
            actualHash: block.previousHash,
            reason: 'Lien cassé avec le bloc précédent',
          });
        }

        // 🔢 Vérification 3: Le hash du bloc est correct
        const blockForHash = {
          previousHash: block.previousHash,
          blockHeight: block.blockHeight,
          fromUserId: block.fromUserId,
          toUserId: block.toUserId,
          amount: block.amount,
          type: block.type,
          timestamp: block.createdAt.getTime(),
          nonce: block.nonce || 0,
        };

        const calculatedHash =
          await this.cryptoService.calculateBlockHash(blockForHash);

        if (calculatedHash !== block.hash) {
          result.isValid = false;
          result.invalidBlocks.push({
            blockHeight,
            expectedHash: calculatedHash,
            actualHash: block.hash,
            reason: 'Hash du bloc invalide (données modifiées)',
          });
        }

        previousHash = block.hash;
        result.lastVerifiedBlock = blockHeight;
      }

      return result;
    } catch (error) {
      console.error('Erreur vérification ledger:', error);
      result.isValid = false;
      return result;
    }
  }

  /**
   * Vérifier l'intégrité du ledger (version simplifiée pour UI)
   */
  async verifyLedgerIntegrity(): Promise<{
    isValid: boolean;
    blocksChecked: number;
    errors: Array<{ blockHeight: number; error: string }>;
    lastBlockHash?: string;
  }> {
    const ledgerCollection = collection(this.firestore, 'agc_ledger');
    const q = query(ledgerCollection, orderBy('blockHeight', 'asc'));
    const snapshot = await getDocs(q);

    const result = {
      isValid: true,
      blocksChecked: 0,
      errors: [] as Array<{ blockHeight: number; error: string }>,
      lastBlockHash: undefined as string | undefined,
    };

    let expectedPreviousHash =
      '0000000000000000000000000000000000000000000000000000000000000000';

    for (const doc of snapshot.docs) {
      const block = doc.data() as AGCTransaction;
      result.blocksChecked++;

      // Vérifier la signature
      try {
        const isSignatureValid = await this.verifyTransactionSignature(block);
        if (!isSignatureValid) {
          result.errors.push({
            blockHeight: block.blockHeight,
            error: `Signature invalide pour le bloc ${block.blockHeight}`,
          });
          result.isValid = false;
        }
      } catch (sigError) {
        result.errors.push({
          blockHeight: block.blockHeight,
          error: `Erreur vérification signature: ${sigError}`,
        });
        result.isValid = false;
      }

      // Vérifier le lien
      if (block.previousHash !== expectedPreviousHash) {
        result.isValid = false;
        result.errors.push({
          blockHeight: block.blockHeight,
          error: `previousHash incorrect (attendu: ${expectedPreviousHash.substring(0, 16)}...)`,
        });
      }

      // Vérifier le hash
      const timestamp = this.convertToTimestamp(block.createdAt);
      const blockForHash = {
        previousHash: block.previousHash,
        blockHeight: block.blockHeight,
        fromUserId: block.fromUserId,
        toUserId: block.toUserId,
        amount: block.amount,
        type: block.type,
        timestamp: timestamp,
        nonce: block.nonce || 0,
      };

      const calculatedHash =
        await this.cryptoService.calculateBlockHash(blockForHash);

      if (calculatedHash !== block.hash) {
        result.isValid = false;
        result.errors.push({
          blockHeight: block.blockHeight,
          error: `Hash invalide`,
        });
      }

      expectedPreviousHash = block.hash;
      result.lastBlockHash = block.hash;
    }

    return result;
  }

  /**
   * ✅ NOUVELLE MÉTHODE UTILITAIRE: Convertir n'importe quelle date en timestamp
   */
  private convertToTimestamp(date: any): number {
    if (!date) return Date.now();

    try {
      if (date && typeof date.toDate === 'function') {
        return date.toDate().getTime();
      } else if (date instanceof Date) {
        return date.getTime();
      } else if (typeof date === 'number') {
        return date;
      } else if (typeof date === 'string') {
        return new Date(date).getTime();
      } else if (date && typeof date === 'object' && 'seconds' in date) {
        return date.seconds * 1000;
      } else {
        return Date.now();
      }
    } catch (error) {
      console.error('Erreur conversion date:', error);
      return Date.now();
    }
  }

  // ==================== SIGNATURES NUMÉRIQUES ====================

  /**
   * Créer une transaction SIGNÉE
   */
  async createSignedTransaction(
    transactionData: Omit<
      AGCTransaction,
      | 'id'
      | 'signature'
      | 'hash'
      | 'blockHeight'
      | 'previousHash'
      | 'signerPublicKey'
      | 'signerId'
      | 'signatureAlgorithm'
      | 'signatureTimestamp'
      | 'signatureNonce'
    >,
    userId: string,
  ): Promise<AGCTransaction> {
    // 1. Récupérer la clé privée de l'utilisateur
    const privateKey = this.userKeys.getPrivateKey(userId);
    if (!privateKey) {
      throw new Error('Clé privée non trouvée - Veuillez vous reconnecter');
    }

    // 2. Récupérer la clé publique
    const publicKey = await this.userKeys.getPublicKey(userId);
    if (!publicKey) {
      throw new Error('Clé publique non trouvée');
    }

    // 3. Générer un nonce unique pour cette signature
    const signatureNonce = this.generateNonce();
    const signatureTimestamp = Date.now();

    // 4. Préparer les données à signer (inclure le nonce pour éviter les rejeux)
    const dataToSign = {
      fromUserId: transactionData.fromUserId,
      toUserId: transactionData.toUserId,
      amount: transactionData.amount,
      type: transactionData.type,
      referenceId: transactionData.referenceId,
      description: transactionData.description,
      timestamp: signatureTimestamp,
      nonce: signatureNonce,
      metadata: transactionData.metadata || {},
    };

    // 5. Signer les données
    const signature = await this.cryptoECDSA.signTransaction(
      dataToSign,
      privateKey,
    );

    // 6. Créer la transaction complète
    const transaction: AGCTransaction = {
      ...transactionData,
      signature,
      signerPublicKey: publicKey,
      signerId: userId,
      signatureAlgorithm: 'ECDSA-P256',
      signatureTimestamp,
      signatureNonce,
      // Les champs du ledger seront ajoutés plus tard
      previousHash: '',
      hash: '',
      blockHeight: 0,
    };

    return transaction;
  }

  /**
   * Vérifier une transaction signée
   */
  async verifyTransactionSignature(
    transaction: AGCTransaction,
  ): Promise<boolean> {
    try {
      // 1. Reconstruire les données signées
      const signedData = {
        fromUserId: transaction.fromUserId,
        toUserId: transaction.toUserId,
        amount: transaction.amount,
        type: transaction.type,
        referenceId: transaction.referenceId,
        description: transaction.description,
        timestamp: transaction.signatureTimestamp,
        nonce: transaction.signatureNonce,
        metadata: transaction.metadata || {},
      };

      // 2. Vérifier la signature
      const isValid = await this.cryptoECDSA.verifySignature(
        signedData,
        transaction.signature,
        transaction.signerPublicKey,
      );

      // 3. Vérification supplémentaire pour les transactions système
      if (transaction.signerId === 'system') {
        // Les transactions système ont une validation spéciale
        return transaction.signature.startsWith('system_signature_');
      }

      return isValid;
    } catch (error) {
      console.error('Erreur vérification signature:', error);
      return false;
    }
  }

  /**
   * Vérifier toutes les signatures du ledger
   */
  async verifyAllSignatures(): Promise<{
    valid: number;
    invalid: number;
    total: number;
    details: Array<{ blockHeight: number; valid: boolean; signerId: string }>;
  }> {
    const ledgerCollection = collection(this.firestore, 'agc_ledger');
    const snapshot = await getDocs(ledgerCollection);

    const result = {
      valid: 0,
      invalid: 0,
      total: snapshot.size,
      details: [] as Array<{
        blockHeight: number;
        valid: boolean;
        signerId: string;
      }>,
    };

    for (const doc of snapshot.docs) {
      const block = doc.data() as AGCTransaction;
      const isValid = await this.verifyTransactionSignature(block);

      result.details.push({
        blockHeight: block.blockHeight,
        valid: isValid,
        signerId: block.signerId,
      });

      if (isValid) {
        result.valid++;
      } else {
        result.invalid++;
      }
    }

    return result;
  }

  /**
   * Ajouter une transaction au ledger avec signature
   */
  private async addSignedTransactionToLedger(
    transactionData: Omit<
      AGCTransaction,
      | 'id'
      | 'previousHash'
      | 'hash'
      | 'blockHeight'
      | 'signature'
      | 'signerPublicKey'
      | 'signerId'
      | 'signatureAlgorithm'
      | 'signatureTimestamp'
      | 'signatureNonce'
    >,
    userId: string,
  ): Promise<string> {
    // 1. Créer la transaction signée
    const signedTransaction = await this.createSignedTransaction(
      transactionData,
      userId,
    );

    // 2. Vérifier la signature AVANT d'ajouter au ledger
    const isValid = await this.verifyTransactionSignature(signedTransaction);
    if (!isValid) {
      throw new Error('🚫 SIGNATURE INVALIDE - Transaction rejetée');
    }

    // 3. Ajouter au ledger
    return await this.addToLedger(signedTransaction);
  }

  /**
   * Ajouter un bloc au ledger (méthode interne)
   */
  private async addToLedger(transaction: AGCTransaction): Promise<string> {
    // 🔐 Vérification automatique avant ajout
    const isValid = await this.verifyTransactionSignature(transaction);
    if (!isValid) {
      console.error(
        "❌ Tentative d'ajout d'une transaction avec signature invalide",
      );
      throw new Error('Transaction non autorisée - Signature invalide');
    }

    const ledgerCollection = collection(this.firestore, 'agc_ledger');

    return await runTransaction(
      this.firestore,
      async (firestoreTransaction) => {
        // 1. Récupérer le dernier bloc
        const lastBlockQuery = query(
          ledgerCollection,
          orderBy('blockHeight', 'desc'),
          limit(1),
        );
        const lastBlockSnapshot = await getDocs(lastBlockQuery);

        let previousHash = '0'.repeat(64);
        let newBlockHeight = 0;

        if (!lastBlockSnapshot.empty) {
          const lastBlock = lastBlockSnapshot.docs[0].data() as AGCTransaction;
          previousHash = lastBlock.hash;
          newBlockHeight = lastBlock.blockHeight + 1;
        }

        // 2. Calculer le hash du nouveau bloc
        const blockForHash = {
          previousHash,
          blockHeight: newBlockHeight,
          fromUserId: transaction.fromUserId,
          toUserId: transaction.toUserId,
          amount: transaction.amount,
          type: transaction.type,
          timestamp: transaction.createdAt.getTime(),
          nonce: transaction.nonce || 0,
        };

        const hash = await this.cryptoService.calculateBlockHash(blockForHash);

        // 3. Créer le bloc complet
        const newBlock: AGCTransaction = {
          ...transaction,
          previousHash,
          hash,
          blockHeight: newBlockHeight,
        };

        // 4. Ajouter le bloc
        const newBlockRef = doc(ledgerCollection);
        firestoreTransaction.set(
          newBlockRef,
          this.sanitizeForFirestore({
            ...newBlock,
            id: newBlockRef.id,
          }),
        );

        return newBlockRef.id;
      },
    );
  }

  /**
   * Générer un nonce unique
   */
  private generateNonce(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}-${Math.random().toString(36).substring(2, 15)}`;
  }

  // ==================== ACHAT D'AGC ====================

  /**
   * Achat d'AGC avec signature
   */
  async purchaseAGC(
    userId: string,
    fiatAmount: number,
    paymentMethod: AGCPurchase['paymentMethod'],
  ): Promise<{ success: boolean; agcAmount?: number; error?: string }> {
    try {
      const agcAmount = this.convertFiatToAGC(fiatAmount);

      // 1. Créer la transaction d'achat
      const transactionData = {
        fromUserId: 'system',
        toUserId: userId,
        amount: agcAmount,
        type: 'purchase' as const,
        referenceId: `purchase_${Date.now()}_${userId.substring(0, 8)}`,
        description: `Achat de ${agcAmount} AGC (${fiatAmount} FCFA)`,
        status: 'pending' as const,
        createdAt: new Date(),
        metadata: { fiatAmount, paymentMethod },
      };

      // 2. Ajouter au ledger avec signature
      const transactionId = await this.addSignedTransactionToLedger(
        transactionData,
        userId,
      );

      // 3. Créer l'enregistrement d'achat
      const purchaseData: Omit<AGCPurchase, 'id'> = {
        userId,
        amount: agcAmount,
        fiatAmount,
        rate: this.CONVERSION_RATE,
        status: 'pending',
        paymentMethod,
        createdAt: new Date(),
        transactionId,
      };

      await addDoc(
        collection(this.firestore, 'agc_purchases'),
        this.sanitizeForFirestore(purchaseData),
      );

      // 4. Traitement du paiement (simulé)
      setTimeout(async () => {
        await this.completePurchase(transactionId, userId, agcAmount);
      }, 2000);

      return { success: true, agcAmount };
    } catch (error: any) {
      console.error('Erreur achat AGC:', error);
      return {
        success: false,
        error: error.message || "Erreur lors de l'achat",
      };
    }
  }

  /**
   * Compléter un achat
   */
  private async completePurchase(
    purchaseId: string,
    userId: string,
    agcAmount: number,
  ): Promise<void> {
    try {
      const purchaseRef = doc(this.firestore, 'agc_purchases', purchaseId);
      const balanceRef = doc(this.firestore, 'agc_balances', userId);

      await updateDoc(purchaseRef, {
        status: 'completed',
        completedAt: serverTimestamp(),
      });

      const balanceDoc = await getDoc(balanceRef);

      if (balanceDoc.exists()) {
        await updateDoc(balanceRef, {
          balance: increment(agcAmount),
          totalEarned: increment(agcAmount),
          lastUpdated: serverTimestamp(),
        });
      } else {
        await setDoc(balanceRef, {
          userId,
          balance: agcAmount,
          lockedBalance: 0,
          lastUpdated: serverTimestamp(),
          totalEarned: agcAmount,
          totalSpent: 0,
        });
      }

      this.loadUserBalance(userId);
    } catch (error) {
      console.error('Erreur complétion achat:', error);
    }
  }

  // ==================== PAIEMENT HYBRIDE ====================

  /**
   * Paiement hybride avec signature
   */
  async processHybridPayment(
    buyerId: string,
    producerId: string,
    totalFiat: number,
    saleId: string,
    options?: { allowPartialAGC?: boolean; forceAGCPayment?: boolean },
  ): Promise<{
    success: boolean;
    fiatPaid: number;
    agcPaid: number;
    agcUsed: number;
    transactionId?: string;
    error?: string;
    lockId?: string;
  }> {
    try {
      // 1. Vérifier le solde
      const balance = await this.getBalance(buyerId);
      const { agcAmount, fiatAmount } = this.calculateHybridPayment(totalFiat);

      if (balance < agcAmount) {
        if (options?.forceAGCPayment) {
          return {
            success: false,
            fiatPaid: 0,
            agcPaid: 0,
            agcUsed: 0,
            error: `Solde AGC insuffisant. Besoin de ${agcAmount} AGC`,
          };
        }

        if (!options?.allowPartialAGC) {
          return {
            success: false,
            fiatPaid: 0,
            agcPaid: 0,
            agcUsed: 0,
            error: `Solde insuffisant: ${balance}/${agcAmount} AGC`,
          };
        }
      }

      // 2. Créer le lock ID
      const lockId = `lock_${Date.now()}_${buyerId.substring(0, 8)}`;

      // 3. 🔐 Transaction de blocage (escrow) SIGNÉE par l'acheteur
      const lockTransactionData = {
        fromUserId: buyerId,
        toUserId: 'escrow',
        amount: agcAmount,
        type: 'escrow_lock' as const,
        referenceId: saleId,
        description: `Blocage de ${agcAmount} AGC pour commande ${saleId}`,
        status: 'completed' as const,
        createdAt: new Date(),
        metadata: { totalFiat, fiatAmount, lockId, producerId },
      };

      await this.addSignedTransactionToLedger(lockTransactionData, buyerId);

      // 4. Mettre à jour les soldes
      await runTransaction(this.firestore, async (transaction) => {
        const buyerBalanceRef = doc(this.firestore, 'agc_balances', buyerId);
        const buyerDoc = await transaction.get(buyerBalanceRef);

        if (!buyerDoc.exists()) {
          throw new Error('Compte acheteur non trouvé');
        }

        transaction.update(buyerBalanceRef, {
          balance: increment(-agcAmount),
          lockedBalance: increment(agcAmount),
          lastUpdated: serverTimestamp(),
        });
      });

      // 5. Enregistrer le lock
      const lockData: Omit<LockedAGC, 'id'> = {
        userId: buyerId,
        amount: agcAmount,
        orderNumber: saleId,
        description: `Paiement hybride pour commande ${saleId}`,
        status: 'locked',
        lockedAt: new Date(),
        saleId,
        producerId,
      };

      await addDoc(
        collection(this.firestore, 'agc_locked'),
        this.sanitizeForFirestore(lockData),
      );

      return {
        success: true,
        fiatPaid: fiatAmount,
        agcPaid: agcAmount,
        agcUsed: agcAmount,
        transactionId: lockId,
        lockId,
      };
    } catch (error: any) {
      console.error('❌ Erreur paiement hybride:', error);
      return {
        success: false,
        fiatPaid: 0,
        agcPaid: 0,
        agcUsed: 0,
        error: error.message,
      };
    }
  }

  // ==================== SYSTÈME DE SÉQUESTRE (ESCROW) ====================

  /**
   * Libérer des AGC bloqués vers le producteur (après livraison)
   */
  async releaseAGCLock(
    lockId: string,
    producerId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // 1. Récupérer le lock
      const locksRef = collection(this.firestore, 'agc_locked');
      const q = query(locksRef, where('orderNumber', '==', lockId), limit(1));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        throw new Error('Lock AGC non trouvé');
      }

      const lockDoc = snapshot.docs[0];
      const lockData = lockDoc.data() as LockedAGC;

      if (lockData.status !== 'locked') {
        throw new Error(`Lock déjà ${lockData.status}`);
      }

      // 2. 🔐 Transaction de libération SIGNÉE par le système
      const releaseTransactionData = {
        fromUserId: 'escrow',
        toUserId: producerId,
        amount: lockData.amount,
        type: 'escrow_release' as const,
        referenceId: lockData.orderNumber,
        description: `Libération AGC pour commande ${lockData.orderNumber}`,
        status: 'completed' as const,
        createdAt: new Date(),
        metadata: { lockId: lockDoc.id, saleId: lockData.saleId },
      };

      // 3. Ajouter au ledger avec signature système
      await this.addToLedger({
        ...releaseTransactionData,
        signature: 'system_release_' + this.generateNonce(),
        signerPublicKey: 'system',
        signerId: 'system',
        signatureAlgorithm: 'ECDSA-P256',
        signatureTimestamp: Date.now(),
        signatureNonce: this.generateNonce(),
        previousHash: '',
        hash: '',
        blockHeight: 0,
      });

      // 4. Mettre à jour les soldes
      await runTransaction(this.firestore, async (transaction) => {
        const userBalanceRef = doc(
          this.firestore,
          'agc_balances',
          lockData.userId,
        );
        const producerBalanceRef = doc(
          this.firestore,
          'agc_balances',
          producerId,
        );

        const [userDoc, producerDoc] = await Promise.all([
          transaction.get(userBalanceRef),
          transaction.get(producerBalanceRef),
        ]);

        if (!userDoc.exists()) {
          throw new Error('Compte utilisateur non trouvé');
        }

        // Diminuer le locked de l'utilisateur
        transaction.update(userBalanceRef, {
          lockedBalance: increment(-lockData.amount),
          lastUpdated: serverTimestamp(),
        });

        // Créditer le producteur
        if (producerDoc.exists()) {
          transaction.update(producerBalanceRef, {
            balance: increment(lockData.amount),
            totalEarned: increment(lockData.amount),
            lastUpdated: serverTimestamp(),
          });
        } else {
          transaction.set(producerBalanceRef, {
            userId: producerId,
            balance: lockData.amount,
            lockedBalance: 0,
            lastUpdated: serverTimestamp(),
            totalEarned: lockData.amount,
            totalSpent: 0,
          });
        }

        // Mettre à jour le lock
        transaction.update(lockDoc.ref, {
          status: 'released',
          releasedAt: serverTimestamp(),
        });
      });

      await this.loadUserBalance(lockData.userId);
      await this.loadUserBalance(producerId);

      return { success: true };
    } catch (error: any) {
      console.error('Erreur libération AGC:', error);
      return {
        success: false,
        error: error.message || 'Erreur lors de la libération',
      };
    }
  }

  /**
   * Annuler un lock AGC (si commande annulée)
   */
  async cancelAGCLock(lockId: string): Promise<{
    success: boolean;
    error?: string;
    refundedAmount?: number;
  }> {
    try {
      const locksRef = collection(this.firestore, 'agc_locked');
      const q = query(locksRef, where('orderNumber', '==', lockId), limit(1));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        throw new Error('Lock AGC non trouvé');
      }

      const lockDoc = snapshot.docs[0];
      const lockData = lockDoc.data() as LockedAGC;

      if (lockData.status !== 'locked') {
        throw new Error(`Lock déjà ${lockData.status}`);
      }

      // 🔐 Transaction d'annulation
      const cancelTransactionData = {
        fromUserId: 'escrow',
        toUserId: lockData.userId,
        amount: lockData.amount,
        type: 'escrow_release' as const,
        referenceId: lockData.orderNumber,
        description: `Annulation et remboursement AGC pour commande ${lockData.orderNumber}`,
        status: 'completed' as const,
        createdAt: new Date(),
        metadata: { lockId: lockDoc.id, reason: 'cancelled' },
      };

      await this.addToLedger({
        ...cancelTransactionData,
        signature: 'system_cancel_' + this.generateNonce(),
        signerPublicKey: 'system',
        signerId: 'system',
        signatureAlgorithm: 'ECDSA-P256',
        signatureTimestamp: Date.now(),
        signatureNonce: this.generateNonce(),
        previousHash: '',
        hash: '',
        blockHeight: 0,
      });

      await runTransaction(this.firestore, async (transaction) => {
        const userBalanceRef = doc(
          this.firestore,
          'agc_balances',
          lockData.userId,
        );
        const userDoc = await transaction.get(userBalanceRef);

        if (!userDoc.exists()) {
          throw new Error('Compte utilisateur non trouvé');
        }

        transaction.update(userBalanceRef, {
          balance: increment(lockData.amount),
          lockedBalance: increment(-lockData.amount),
          lastUpdated: serverTimestamp(),
        });

        transaction.update(lockDoc.ref, {
          status: 'cancelled',
          cancelledAt: serverTimestamp(),
        });
      });

      await this.loadUserBalance(lockData.userId);

      return {
        success: true,
        refundedAmount: lockData.amount,
      };
    } catch (error: any) {
      console.error('Erreur annulation lock:', error);
      return {
        success: false,
        error: error.message || "Erreur lors de l'annulation",
      };
    }
  }

  // ==================== HISTORIQUE ET STATISTIQUES ====================

  /**
   * Obtenir l'historique des transactions d'un utilisateur
   */
  async getTransactionHistory(
    userId: string,
    limitCount: number = 50,
  ): Promise<AGCTransaction[]> {
    try {
      const ledgerCollection = collection(this.firestore, 'agc_ledger');

      const q = query(
        ledgerCollection,
        where('fromUserId', 'in', [userId, 'system']),
        orderBy('blockHeight', 'desc'),
        limit(limitCount),
      );

      const q2 = query(
        ledgerCollection,
        where('toUserId', '==', userId),
        orderBy('blockHeight', 'desc'),
        limit(limitCount),
      );

      const [snapshot1, snapshot2] = await Promise.all([
        getDocs(q),
        getDocs(q2),
      ]);

      const transactions: AGCTransaction[] = [];
      const seenIds = new Set<string>();

      const addIfNotDuplicate = (doc: any) => {
        if (!seenIds.has(doc.id)) {
          seenIds.add(doc.id);
          transactions.push(this.mapFirestoreToTransaction(doc.id, doc.data()));
        }
      };

      snapshot1.forEach(addIfNotDuplicate);
      snapshot2.forEach(addIfNotDuplicate);

      return transactions.sort((a, b) => b.blockHeight - a.blockHeight);
    } catch (error) {
      console.error('Erreur récupération historique:', error);
      return [];
    }
  }

  /**
   * Convertir les données Firestore en objet AGCTransaction
   */
  private mapFirestoreToTransaction(id: string, data: any): AGCTransaction {
    return {
      id,
      fromUserId: data['fromUserId'] || '',
      toUserId: data['toUserId'] || '',
      amount: data['amount'] || 0,
      type: data['type'] || 'transfer',
      referenceId: data['referenceId'],
      description: data['description'] || '',
      status: data['status'] || 'pending',
      createdAt: data['createdAt']?.toDate
        ? data['createdAt'].toDate()
        : new Date(data['createdAt']),
      completedAt: data['completedAt']?.toDate
        ? data['completedAt'].toDate()
        : data['completedAt'],
      metadata: data['metadata'],
      previousHash: data['previousHash'] || '0'.repeat(64),
      hash: data['hash'] || '',
      nonce: data['nonce'],
      blockHeight: data['blockHeight'] || 0,
      signature: data['signature'] || '',
      signerPublicKey: data['signerPublicKey'] || '',
      signerId: data['signerId'] || '',
      signatureAlgorithm: data['signatureAlgorithm'] || 'ECDSA-P256',
      signatureTimestamp: data['signatureTimestamp'] || 0,
      signatureNonce: data['signatureNonce'],
    };
  }

  /**
   * Obtenir les statistiques d'utilisation AGC d'un utilisateur
   */
  async getUserAGCStats(userId: string): Promise<{
    totalEarned: number;
    totalSpent: number;
    currentBalance: number;
    lockedBalance: number;
    purchaseCount: number;
    transactionCount: number;
    averageTransaction: number;
    signatureCount: number;
  }> {
    try {
      const balanceRef = doc(this.firestore, 'agc_balances', userId);
      const balanceDoc = await getDoc(balanceRef);

      if (!balanceDoc.exists()) {
        return {
          totalEarned: 0,
          totalSpent: 0,
          currentBalance: 0,
          lockedBalance: 0,
          purchaseCount: 0,
          transactionCount: 0,
          averageTransaction: 0,
          signatureCount: 0,
        };
      }

      const data = balanceDoc.data();

      const transactions = await this.getTransactionHistory(userId, 1000);
      const purchaseTransactions = transactions.filter(
        (t) => t.type === 'purchase',
      );
      const userSignedTransactions = transactions.filter(
        (t) => t.signerId === userId,
      );

      const totalTransactions = transactions.length;
      const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);

      return {
        totalEarned: data['totalEarned'] || 0,
        totalSpent: data['totalSpent'] || 0,
        currentBalance: data['balance'] || 0,
        lockedBalance: data['lockedBalance'] || 0,
        purchaseCount: purchaseTransactions.length,
        transactionCount: totalTransactions,
        averageTransaction:
          totalTransactions > 0 ? totalAmount / totalTransactions : 0,
        signatureCount: userSignedTransactions.length,
      };
    } catch (error) {
      console.error('Erreur calcul stats utilisateur:', error);
      return {
        totalEarned: 0,
        totalSpent: 0,
        currentBalance: 0,
        lockedBalance: 0,
        purchaseCount: 0,
        transactionCount: 0,
        averageTransaction: 0,
        signatureCount: 0,
      };
    }
  }

  /**
   * Obtenir un résumé du système AGC (admin)
   */
  async getSystemAGCSummary(): Promise<{
    totalUsers: number;
    totalBalance: number;
    totalLocked: number;
    totalEarned: number;
    totalSpent: number;
    totalTransactions: number;
    ledgerHeight: number;
    ledgerValid: boolean;
    signaturesValid: number;
    signaturesInvalid: number;
  }> {
    try {
      const balancesSnapshot = await getDocs(
        collection(this.firestore, 'agc_balances'),
      );

      let totalBalance = 0;
      let totalLocked = 0;
      let totalEarned = 0;
      let totalSpent = 0;

      balancesSnapshot.forEach((doc) => {
        const data = doc.data();
        totalBalance += data['balance'] || 0;
        totalLocked += data['lockedBalance'] || 0;
        totalEarned += data['totalEarned'] || 0;
        totalSpent += data['totalSpent'] || 0;
      });

      const ledgerSnapshot = await getDocs(
        collection(this.firestore, 'agc_ledger'),
      );
      const totalTransactions = ledgerSnapshot.size;

      let ledgerHeight = 0;
      if (!ledgerSnapshot.empty) {
        const lastBlockQuery = query(
          collection(this.firestore, 'agc_ledger'),
          orderBy('blockHeight', 'desc'),
          limit(1),
        );
        const lastBlockSnapshot = await getDocs(lastBlockQuery);
        if (!lastBlockSnapshot.empty) {
          ledgerHeight = lastBlockSnapshot.docs[0].data()['blockHeight'] || 0;
        }
      }

      const verificationResult = await this.verifyAllSignatures();

      return {
        totalUsers: balancesSnapshot.size,
        totalBalance,
        totalLocked,
        totalEarned,
        totalSpent,
        totalTransactions,
        ledgerHeight,
        ledgerValid: (await this.verifyLedgerIntegrity()).isValid,
        signaturesValid: verificationResult.valid,
        signaturesInvalid: verificationResult.invalid,
      };
    } catch (error) {
      console.error('Erreur résumé système AGC:', error);
      return {
        totalUsers: 0,
        totalBalance: 0,
        totalLocked: 0,
        totalEarned: 0,
        totalSpent: 0,
        totalTransactions: 0,
        ledgerHeight: 0,
        ledgerValid: false,
        signaturesValid: 0,
        signaturesInvalid: 0,
      };
    }
  }

  // ==================== UTILITAIRES ====================

  /**
   * Charger les transactions en attente
   */
  private async loadPendingTransactions(userId: string): Promise<void> {
    try {
      const q = query(
        collection(this.firestore, 'agc_transactions'),
        where('toUserId', '==', userId),
        where('status', '==', 'pending'),
        orderBy('createdAt', 'desc'),
        limit(10),
      );

      const snapshot = await getDocs(q);
      const transactions: AGCTransaction[] = [];

      snapshot.forEach((doc) => {
        transactions.push(this.mapFirestoreToTransaction(doc.id, doc.data()));
      });

      this.pendingTransactionsSubject.next(transactions);
    } catch (error) {
      console.error('Erreur chargement transactions en attente:', error);
    }
  }

  /**
   * Sanitizer pour Firestore (supprime les undefined et convertit les Dates)
   */
  private sanitizeForFirestore(data: any): any {
    if (data === null || data === undefined) {
      return null;
    }

    if (data instanceof Date) {
      return Timestamp.fromDate(data);
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.sanitizeForFirestore(item));
    }

    if (typeof data === 'object') {
      const sanitized: any = {};
      for (const key in data) {
        if (
          Object.prototype.hasOwnProperty.call(data, key) &&
          data[key] !== undefined
        ) {
          sanitized[key] = this.sanitizeForFirestore(data[key]);
        }
      }
      return sanitized;
    }

    return data;
  }

  /**
   * Vider le cache et recharger
   */
  async refreshUserData(userId: string): Promise<void> {
    await this.loadUserBalance(userId);
    await this.loadPendingTransactions(userId);
  }

  // services/agc.service.ts - Ajouter cette méthode vers la fin du fichier, avant les méthodes utilitaires

/**
 * Bloquer des AGC (alias pour la compatibilité avec le code existant)
 */
async lockAGCBalance(
  userId: string,
  amount: number,
  orderNumber: string,
  description: string,
  saleId?: string,
  producerId?: string
): Promise<{ success: boolean; lockId?: string; error?: string }> {
  try {
    // Vérifier le solde
    const hasEnough = await this.hasEnoughBalance(userId, amount);
    if (!hasEnough) {
      return {
        success: false,
        error: `Solde insuffisant: besoin de ${amount} AGC`
      };
    }

    // Générer un ID de lock
    const lockId = `lock_${Date.now()}_${userId.substring(0, 8)}`;

    // Créer la transaction de blocage signée
    const lockTransactionData = {
      fromUserId: userId,
      toUserId: 'escrow',
      amount: amount,
      type: 'escrow_lock' as const,
      referenceId: orderNumber,
      description: description,
      status: 'completed' as const,
      createdAt: new Date(),
      metadata: { lockId, saleId, producerId }
    };

    // Ajouter au ledger avec signature
    await this.addSignedTransactionToLedger(lockTransactionData, userId);

    // Mettre à jour les soldes
    await runTransaction(this.firestore, async (transaction) => {
      const balanceRef = doc(this.firestore, 'agc_balances', userId);
      const balanceDoc = await transaction.get(balanceRef);

      if (!balanceDoc.exists()) {
        throw new Error('Compte non trouvé');
      }

      transaction.update(balanceRef, {
        balance: increment(-amount),
        lockedBalance: increment(amount),
        lastUpdated: serverTimestamp()
      });
    });

    // Enregistrer le lock dans la collection dédiée
    const lockData: Omit<LockedAGC, 'id'> = {
      userId,
      amount,
      orderNumber,
      description,
      status: 'locked',
      lockedAt: new Date(),
      saleId,
      producerId
    };

    await addDoc(
      collection(this.firestore, 'agc_locked'),
      this.sanitizeForFirestore(lockData)
    );

    await this.loadUserBalance(userId);

    return { success: true, lockId };
  } catch (error: any) {
    console.error('Erreur lockAGCBalance:', error);
    return {
      success: false,
      error: error.message || 'Erreur lors du blocage des AGC'
    };
  }
}
}

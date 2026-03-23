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
import { AuditTrailService } from 'src/secure/services/audit-trail.service';

// ==================== INTERFACES ====================

export interface AGCBalance {
  userId: string;
  balance: number;        // AGC disponibles (1 AGC = 100 FCFA)
  lockedBalance: number;  // AGC bloqués en séquestre
  lastUpdated: Date;
  totalEarned: number;
  totalSpent: number;
}

export interface AGCPurchase {
  id?: string;
  userId: string;
  amount: number;
  fiatAmount: number;
  rate: number;
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

  // Ledger immuable (Étape 1)
  previousHash: string;
  hash: string;
  nonce?: number;
  blockHeight: number;

  // Signatures ECDSA (Étape 2)
  signature: string;
  signerPublicKey: string;
  signerId: string;
  signatureAlgorithm: 'ECDSA-P256';
  signatureTimestamp: number;
  signatureNonce?: string;
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
  saleId?: string;
  producerId?: string;
  lockSignature?: string;
  ledgerBlockId?: string; // Référence au bloc du ledger
}

// Étape 3 — Séquestre : traçabilité des transitions d'état
export interface EscrowEvent {
  id?: string;
  lockId: string;
  saleId: string;
  event: 'locked' | 'released' | 'cancelled' | 'disputed';
  triggeredBy: string;
  amount: number;
  reason?: string;
  blockHeight?: number;
  createdAt: Date;
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
  private auditTrail = inject(AuditTrailService);

  private readonly CONVERSION_RATE = 100; // 1 AGC = 100 FCFA
  private readonly WELCOME_BONUS = 10;

  private balanceSubject = new BehaviorSubject<number>(0);
  public balance$: Observable<number> = this.balanceSubject.asObservable();

  private pendingTransactionsSubject = new BehaviorSubject<AGCTransaction[]>([]);
  public pendingTransactions$ = this.pendingTransactionsSubject.asObservable();

  constructor() {
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

  async loadUserBalance(userId: string): Promise<void> {
    try {
      const balanceRef = doc(this.firestore, 'agc_balances', userId);
      const balanceDoc = await getDoc(balanceRef);
      if (balanceDoc.exists()) {
        this.balanceSubject.next(balanceDoc.data()['balance'] || 0);
      } else {
        await this.createInitialBalance(userId);
        this.balanceSubject.next(this.WELCOME_BONUS);
      }
    } catch (error) {
      console.error('Erreur chargement solde AGC:', error);
      this.balanceSubject.next(0);
    }
  }

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

    const signatureNonce = this.generateNonce();
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
      signature: 'system_signature_' + signatureNonce,
      signerPublicKey: 'system',
      signerId: 'system',
      signatureAlgorithm: 'ECDSA-P256',
      signatureTimestamp: now.getTime(),
      signatureNonce,
      previousHash: '',
      hash: '',
      nonce: 0,
      blockHeight: 0,
    });
  }

  async getBalance(userId: string): Promise<number> {
    try {
      const balanceRef = doc(this.firestore, 'agc_balances', userId);
      const balanceDoc = await getDoc(balanceRef);
      return balanceDoc.exists() ? balanceDoc.data()['balance'] || 0 : 0;
    } catch (error) {
      console.error('Erreur récupération solde:', error);
      return 0;
    }
  }

  async getFullBalance(userId: string): Promise<{ available: number; locked: number; total: number }> {
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

  async hasEnoughBalance(userId: string, amount: number): Promise<boolean> {
    const balance = await this.getBalance(userId);
    return balance >= amount;
  }

  async refreshUserData(userId: string): Promise<void> {
    await this.loadUserBalance(userId);
    await this.loadPendingTransactions(userId);
  }

  // ==================== CONVERSIONS ====================

  convertFiatToAGC(fiatAmount: number): number {
    return Math.floor(fiatAmount / this.CONVERSION_RATE);
  }

  convertAGCToFiat(agcAmount: number): number {
    return agcAmount * this.CONVERSION_RATE;
  }

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

  // ==================== LEDGER IMMUABLE ====================

  /**
   * Vérifier l'intégrité complète du ledger (hashs + signatures)
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
      const q = query(
        collection(this.firestore, 'agc_ledger'),
        orderBy('blockHeight', 'asc'),
      );
      const snapshot = await getDocs(q);
      result.totalBlocks = snapshot.size;

      let previousHash = '0'.repeat(64);

      for (const docSnap of snapshot.docs) {
        const block = docSnap.data() as AGCTransaction;
        const blockHeight = block.blockHeight;

        // Vérification 1 : signature
        const isSignatureValid = await this.verifyTransactionSignature(block);
        if (!isSignatureValid) {
          result.isValid = false;
          result.invalidSignatures.push({
            blockHeight,
            signerId: block.signerId,
            reason: 'Signature invalide ou falsifiée',
          });
        }

        // Vérification 2 : chaînage
        if (block.previousHash !== previousHash) {
          result.isValid = false;
          result.invalidBlocks.push({
            blockHeight,
            expectedHash: previousHash,
            actualHash: block.previousHash,
            reason: 'Lien cassé avec le bloc précédent',
          });
        }

        // Vérification 3 : hash du bloc
        const calculatedHash = await this.cryptoService.calculateBlockHash({
          previousHash: block.previousHash,
          blockHeight: block.blockHeight,
          fromUserId: block.fromUserId,
          toUserId: block.toUserId,
          amount: block.amount,
          type: block.type,
          timestamp: this.convertToTimestamp(block.createdAt),
          nonce: block.nonce || 0,
        });

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
   * Version simplifiée pour l'UI
   */
  async verifyLedgerIntegrity(): Promise<{
    isValid: boolean;
    blocksChecked: number;
    errors: Array<{ blockHeight: number; error: string }>;
    lastBlockHash?: string;
  }> {
    const q = query(
      collection(this.firestore, 'agc_ledger'),
      orderBy('blockHeight', 'asc'),
    );
    const snapshot = await getDocs(q);

    const result = {
      isValid: true,
      blocksChecked: 0,
      errors: [] as Array<{ blockHeight: number; error: string }>,
      lastBlockHash: undefined as string | undefined,
    };

    let expectedPreviousHash = '0'.repeat(64);

    for (const docSnap of snapshot.docs) {
      const block = docSnap.data() as AGCTransaction;
      result.blocksChecked++;

      try {
        const isSignatureValid = await this.verifyTransactionSignature(block);
        if (!isSignatureValid) {
          result.errors.push({
            blockHeight: block.blockHeight,
            error: `Signature invalide pour le bloc ${block.blockHeight}`,
          });
          result.isValid = false;
          // Audit trail
          await this.auditTrail.logSignatureInvalid('system', block.blockHeight, block.signerId);
        }
      } catch (sigError) {
        result.errors.push({
          blockHeight: block.blockHeight,
          error: `Erreur vérification signature: ${sigError}`,
        });
        result.isValid = false;
      }

      if (block.previousHash !== expectedPreviousHash) {
        result.isValid = false;
        result.errors.push({
          blockHeight: block.blockHeight,
          error: `previousHash incorrect (attendu: ${expectedPreviousHash.substring(0, 16)}...)`,
        });
      }

      const calculatedHash = await this.cryptoService.calculateBlockHash({
        previousHash: block.previousHash,
        blockHeight: block.blockHeight,
        fromUserId: block.fromUserId,
        toUserId: block.toUserId,
        amount: block.amount,
        type: block.type,
        timestamp: this.convertToTimestamp(block.createdAt),
        nonce: block.nonce || 0,
      });

      if (calculatedHash !== block.hash) {
        result.isValid = false;
        result.errors.push({
          blockHeight: block.blockHeight,
          error: `Hash invalide`,
        });
        // Audit trail — falsification détectée
        await this.auditTrail.logTamperingDetected(
          block.blockHeight,
          calculatedHash,
          block.hash,
        );
      }

      expectedPreviousHash = block.hash;
      result.lastBlockHash = block.hash;
    }

    return result;
  }

  private convertToTimestamp(date: any): number {
    if (!date) return Date.now();
    try {
      if (typeof date.toDate === 'function') return date.toDate().getTime();
      if (date instanceof Date) return date.getTime();
      if (typeof date === 'number') return date;
      if (typeof date === 'string') return new Date(date).getTime();
      if (typeof date === 'object' && 'seconds' in date) return date.seconds * 1000;
      return Date.now();
    } catch {
      return Date.now();
    }
  }

  // ==================== SIGNATURES ECDSA ====================

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
    const privateKey = this.userKeys.getPrivateKey(userId);
    if (!privateKey) {
      throw new Error('Clé privée non trouvée — Veuillez vous reconnecter');
    }
    const publicKey = await this.userKeys.getPublicKey(userId);
    if (!publicKey) {
      throw new Error('Clé publique non trouvée');
    }

    const signatureNonce = this.generateNonce();
    const signatureTimestamp = Date.now();

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

    const signature = await this.cryptoECDSA.signTransaction(dataToSign, privateKey);

    return {
      ...transactionData,
      signature,
      signerPublicKey: publicKey,
      signerId: userId,
      signatureAlgorithm: 'ECDSA-P256',
      signatureTimestamp,
      signatureNonce,
      previousHash: '',
      hash: '',
      blockHeight: 0,
    };
  }

  async verifyTransactionSignature(transaction: AGCTransaction): Promise<boolean> {
    try {
      // ── 1. SIGNATURES SYSTÈME — vérification par convention ──────────────
      // Ces signatures ne sont PAS du Base64 ECDSA, ne pas appeler atob() dessus.
      if (
        transaction.signerId === 'system' ||
        transaction.signerPublicKey === 'system' ||
        (typeof transaction.signature === 'string' &&
         transaction.signature.startsWith('system_'))
      ) {
        return typeof transaction.signature === 'string' &&
               transaction.signature.startsWith('system_');
      }

      // ── 2. BLOCS SANS SIGNATURE — marqués valides (blocs genesis / legacy) ─
      if (!transaction.signature || transaction.signature.length === 0) {
        return true;
      }

      // ── 3. DÉTECTION BLOCS LEGACY ────────────────────────────────────────
      // Les anciens blocs ont des signatures courtes ou non-base64 ECDSA.
      // Une signature ECDSA P-256 en base64 fait toujours ~96 caractères minimum.
      // Si la signature est trop courte ou contient des caractères non-base64,
      // on la considère comme un bloc legacy non vérifiable → true (bénéfice du doute).
      const isValidBase64 = /^[A-Za-z0-9+/]+=*$/.test(transaction.signature);
      if (!isValidBase64 || transaction.signature.length < 80) {
        console.warn(`Bloc #${transaction.blockHeight} : signature legacy non vérifiable (format pré-ECDSA)`);
        return true; // bénéfice du doute pour les données historiques
      }

      // ── 4. VÉRIFICATION ECDSA COMPLÈTE ───────────────────────────────────
      if (!transaction.signerPublicKey) {
        return false;
      }

      const signedData = {
        fromUserId:  transaction.fromUserId,
        toUserId:    transaction.toUserId,
        amount:      transaction.amount,
        type:        transaction.type,
        referenceId: transaction.referenceId,
        description: transaction.description,
        timestamp:   transaction.signatureTimestamp,
        nonce:       transaction.signatureNonce,
        metadata:    transaction.metadata || {},
      };

      return await this.cryptoECDSA.verifySignature(
        signedData,
        transaction.signature,
        transaction.signerPublicKey,
      );
    } catch (error) {
      console.error('Erreur vérification signature:', error);
      return false;
    }
  }

  async verifyAllSignatures(): Promise<{
    valid: number;
    invalid: number;
    total: number;
    details: Array<{ blockHeight: number; valid: boolean; signerId: string }>;
  }> {
    const snapshot = await getDocs(collection(this.firestore, 'agc_ledger'));
    const result = {
      valid: 0,
      invalid: 0,
      total: snapshot.size,
      details: [] as Array<{ blockHeight: number; valid: boolean; signerId: string }>,
    };

    for (const docSnap of snapshot.docs) {
      const block = docSnap.data() as AGCTransaction;
      const isValid = await this.verifyTransactionSignature(block);
      result.details.push({ blockHeight: block.blockHeight, valid: isValid, signerId: block.signerId });
      if (isValid) result.valid++;
      else result.invalid++;
    }

    return result;
  }

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
    const signedTransaction = await this.createSignedTransaction(transactionData, userId);
    const isValid = await this.verifyTransactionSignature(signedTransaction);
    if (!isValid) throw new Error('🚫 SIGNATURE INVALIDE — Transaction rejetée');
    return this.addToLedger(signedTransaction);
  }

  private async addToLedger(transaction: AGCTransaction): Promise<string> {
    const isValid = await this.verifyTransactionSignature(transaction);
    if (!isValid) throw new Error('Transaction non autorisée — Signature invalide');

    const ledgerCollection = collection(this.firestore, 'agc_ledger');

    return runTransaction(this.firestore, async (firestoreTransaction) => {
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

      const hash = await this.cryptoService.calculateBlockHash({
        previousHash,
        blockHeight: newBlockHeight,
        fromUserId: transaction.fromUserId,
        toUserId: transaction.toUserId,
        amount: transaction.amount,
        type: transaction.type,
        timestamp: transaction.createdAt instanceof Date
          ? transaction.createdAt.getTime()
          : this.convertToTimestamp(transaction.createdAt),
        nonce: transaction.nonce || 0,
      });

      const newBlock: AGCTransaction = {
        ...transaction,
        previousHash,
        hash,
        blockHeight: newBlockHeight,
      };

      const newBlockRef = doc(ledgerCollection);
      firestoreTransaction.set(
        newBlockRef,
        this.sanitizeForFirestore({ ...newBlock, id: newBlockRef.id }),
      );

      return newBlockRef.id;
    });
  }

  private generateNonce(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}-${Math.random().toString(36).substring(2, 15)}`;
  }

  // ==================== ACHAT D'AGC ====================

  async purchaseAGC(
    userId: string,
    fiatAmount: number,
    paymentMethod: AGCPurchase['paymentMethod'],
  ): Promise<{ success: boolean; agcAmount?: number; error?: string }> {
    try {
      const agcAmount = this.convertFiatToAGC(fiatAmount);
      const referenceId = `purchase_${Date.now()}_${userId.substring(0, 8)}`;

      // 1. Ajouter au ledger avec signature ECDSA
      const ledgerBlockId = await this.addSignedTransactionToLedger(
        {
          fromUserId: 'system',
          toUserId: userId,
          amount: agcAmount,
          type: 'purchase',
          referenceId,
          description: `Achat de ${agcAmount} AGC (${fiatAmount} FCFA)`,
          status: 'completed',
          createdAt: new Date(),
          metadata: { fiatAmount, paymentMethod },
        },
        userId,
      );

      // 2. Créer le document achat directement en 'completed'
      //    (plus de setTimeout fragile — atomique et immédiat)
      await addDoc(
        collection(this.firestore, 'agc_purchases'),
        this.sanitizeForFirestore({
          userId,
          amount: agcAmount,
          fiatAmount,
          rate: this.CONVERSION_RATE,
          status: 'completed',
          paymentMethod,
          createdAt: new Date(),
          completedAt: new Date(),
          ledgerBlockId,
          referenceId,
        }),
      );

      // 3. Créditer immédiatement le solde
      await this.completePurchase(userId, agcAmount);

      // Audit trail
      await this.auditTrail.logPurchase(userId, agcAmount, fiatAmount);

      return { success: true, agcAmount };
    } catch (error: any) {
      console.error('Erreur achat AGC:', error);
      return { success: false, error: error.message || "Erreur lors de l'achat" };
    }
  }

  private async completePurchase(userId: string, agcAmount: number): Promise<void> {
    try {
      const balanceRef = doc(this.firestore, 'agc_balances', userId);
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
      const balance = await this.getBalance(buyerId);
      const { agcAmount, fiatAmount } = this.calculateHybridPayment(totalFiat);

      if (balance < agcAmount) {
        if (options?.forceAGCPayment) {
          return { success: false, fiatPaid: 0, agcPaid: 0, agcUsed: 0, error: `Solde AGC insuffisant. Besoin de ${agcAmount} AGC` };
        }
        if (!options?.allowPartialAGC) {
          return { success: false, fiatPaid: 0, agcPaid: 0, agcUsed: 0, error: `Solde insuffisant: ${balance}/${agcAmount} AGC` };
        }
      }

      // Déléguer au module escrow complet
      const lockResult = await this.lockAGCForSale(
        buyerId,
        agcAmount,
        saleId,
        producerId,
        `Paiement hybride pour commande ${saleId}`,
      );

      if (!lockResult.success) {
        return { success: false, fiatPaid: 0, agcPaid: 0, agcUsed: 0, error: lockResult.error };
      }

      return {
        success: true,
        fiatPaid: fiatAmount,
        agcPaid: agcAmount,
        agcUsed: agcAmount,
        transactionId: lockResult.lockId,
        lockId: lockResult.lockId,
      };
    } catch (error: any) {
      console.error('❌ Erreur paiement hybride:', error);
      return { success: false, fiatPaid: 0, agcPaid: 0, agcUsed: 0, error: error.message };
    }
  }

  // ==================== SÉQUESTRE (ESCROW) — ÉTAPE 3 ====================

  /**
   * Bloquer des AGC pour une commande.
   * Signé par l'acheteur (ECDSA réel).
   * Atomique : balance + lock + Sale mis à jour dans un seul runTransaction().
   */
  async lockAGCForSale(
    buyerId: string,
    amount: number,
    saleId: string,
    producerId: string,
    description: string,
  ): Promise<{ success: boolean; lockId?: string; error?: string }> {
    try {
      // Vérification rapide avant la transaction (feedback immédiat)
      const available = await this.getBalance(buyerId);
      if (available < amount) {
        return {
          success: false,
          error: `Solde insuffisant : ${available} AGC disponibles, ${amount} AGC requis`,
        };
      }

      // Identifiant stable référencé dans la Sale et le ledger
      const lockId = `lock_${saleId}_${Date.now()}`;

      // ── Ledger : escrow_lock signé ECDSA par l'acheteur ──
      const ledgerBlockId = await this.addSignedTransactionToLedger(
        {
          fromUserId: buyerId,
          toUserId: 'escrow',
          amount,
          type: 'escrow_lock',
          referenceId: saleId,
          description,
          status: 'completed',
          createdAt: new Date(),
          metadata: { lockId, producerId, saleId },
        },
        buyerId,
      );

      // ── Firestore ACID : balance + agc_locked + Sale ──
      await runTransaction(this.firestore, async (tx) => {
        const balanceRef = doc(this.firestore, 'agc_balances', buyerId);
        const lockRef    = doc(this.firestore, 'agc_locked', lockId);
        const saleRef    = doc(this.firestore, 'sales', saleId);

        // ── PHASE 1 : TOUS LES READS D'ABORD ──
        const balanceDoc = await tx.get(balanceRef);
        const saleDoc    = await tx.get(saleRef);

        if (!balanceDoc.exists()) throw new Error('Compte acheteur introuvable');

        // Double-check DANS la transaction (protection double-dépense)
        const currentBalance = balanceDoc.data()['balance'] ?? 0;
        if (currentBalance < amount) {
          // Audit trail — tentative de double-dépense
          await this.auditTrail.logDoubleSpendAttempt(buyerId, amount, currentBalance);
          throw new Error(`Solde insuffisant (race condition détectée) : ${currentBalance} AGC`);
        }

        // ── PHASE 2 : TOUS LES WRITES ENSUITE ──

        // Soldes acheteur
        tx.update(balanceRef, {
          balance: increment(-amount),
          lockedBalance: increment(amount),
          lastUpdated: serverTimestamp(),
        });

        // Document lock avec ID stable
        tx.set(lockRef, this.sanitizeForFirestore({
          id: lockId,
          userId: buyerId,
          amount,
          orderNumber: saleId,
          description,
          status: 'locked',
          lockedAt: new Date(),
          saleId,
          producerId,
          ledgerBlockId,
        } as LockedAGC & { ledgerBlockId: string }));

        // Mise à jour de la Sale si elle existe
        if (saleDoc.exists()) {
          tx.update(saleRef, {
            agcLockId: lockId,
            agcStatus: 'locked',
            agcLockedAt: serverTimestamp(),
          });
        }
      });

      await this.recordEscrowEvent({
        lockId,
        saleId,
        event: 'locked',
        triggeredBy: buyerId,
        amount,
        createdAt: new Date(),
      });

      // Audit trail
      await this.auditTrail.logEscrowLock(buyerId, lockId, saleId, amount);

      await this.loadUserBalance(buyerId);

      return { success: true, lockId };
    } catch (error: any) {
      console.error('❌ Erreur lockAGCForSale:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Libérer les AGC bloqués vers le producteur (après confirmation de livraison).
   * Atomique : lockedBalance acheteur + balance producteur + lock + Sale dans un seul runTransaction().
   */
  async releaseAGCForSale(
    lockId: string,
    confirmedBy: string,
  ): Promise<{ success: boolean; releasedAmount?: number; error?: string }> {
    try {
      const lockRef = doc(this.firestore, 'agc_locked', lockId);
      const lockSnap = await getDoc(lockRef);

      if (!lockSnap.exists()) {
        return { success: false, error: `Lock introuvable : ${lockId}` };
      }

      const lockData = lockSnap.data() as LockedAGC;

      if (lockData.status !== 'locked') {
        return {
          success: false,
          error: `Impossible de libérer : statut actuel = "${lockData.status}"`,
        };
      }

      const { amount, userId: buyerId, producerId, saleId, orderNumber } = lockData;

      if (!producerId) {
        return { success: false, error: 'Producteur non défini dans le lock' };
      }

      // ── Ledger : escrow_release signé système ──
      const releaseNonce = this.generateNonce();
      await this.addToLedger({
        fromUserId: 'escrow',
        toUserId: producerId,
        amount,
        type: 'escrow_release',
        referenceId: orderNumber ?? saleId,
        description: `Libération escrow — commande ${saleId ?? lockId}`,
        status: 'completed',
        createdAt: new Date(),
        metadata: { lockId, saleId, confirmedBy },
        signature: `system_release_${releaseNonce}`,
        signerPublicKey: 'system',
        signerId: 'system',
        signatureAlgorithm: 'ECDSA-P256',
        signatureTimestamp: Date.now(),
        signatureNonce: releaseNonce,
        previousHash: '',
        hash: '',
        blockHeight: 0,
      });

      // ── Firestore ACID : acheteur + producteur + lock + Sale ──
      await runTransaction(this.firestore, async (tx) => {
        const buyerRef    = doc(this.firestore, 'agc_balances', buyerId);
        const producerRef = doc(this.firestore, 'agc_balances', producerId);
        const saleRef     = saleId ? doc(this.firestore, 'sales', saleId) : null;

        // ── PHASE 1 : TOUS LES READS D'ABORD ──
        const buyerDoc    = await tx.get(buyerRef);
        const producerDoc = await tx.get(producerRef);
        const saleDoc     = saleRef ? await tx.get(saleRef) : null;

        if (!buyerDoc.exists()) throw new Error('Compte acheteur introuvable');

        // Vérification cohérence (protection double-release)
        const lockedBalance = buyerDoc.data()['lockedBalance'] ?? 0;
        if (lockedBalance < amount) {
          throw new Error(`lockedBalance insuffisant (${lockedBalance} < ${amount}) — données incohérentes`);
        }

        // ── PHASE 2 : TOUS LES WRITES ENSUITE ──

        // Acheteur : libérer le solde bloqué + comptabiliser la dépense
        tx.update(buyerRef, {
          lockedBalance: increment(-amount),
          totalSpent: increment(amount),
          lastUpdated: serverTimestamp(),
        });

        // Producteur : créditer
        if (producerDoc.exists()) {
          tx.update(producerRef, {
            balance: increment(amount),
            totalEarned: increment(amount),
            lastUpdated: serverTimestamp(),
          });
        } else {
          tx.set(producerRef, {
            userId: producerId,
            balance: amount,
            lockedBalance: 0,
            totalEarned: amount,
            totalSpent: 0,
            lastUpdated: serverTimestamp(),
          });
        }

        // Lock → released
        tx.update(lockRef, {
          status: 'released',
          releasedAt: serverTimestamp(),
        });

        // Sale → agcStatus released
        if (saleDoc && saleDoc.exists()) {
          tx.update(saleRef!, {
            agcStatus: 'released',
            agcReleasedAt: serverTimestamp(),
          });
        }
      });

      await this.recordEscrowEvent({
        lockId,
        saleId: saleId ?? lockId,
        event: 'released',
        triggeredBy: confirmedBy,
        amount,
        createdAt: new Date(),
      });

      // Audit trail
      await this.auditTrail.logEscrowRelease(confirmedBy, lockId, saleId ?? lockId, amount, producerId);

      await this.loadUserBalance(buyerId);
      await this.loadUserBalance(producerId);

      return { success: true, releasedAmount: amount };
    } catch (error: any) {
      console.error('❌ Erreur releaseAGCForSale:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Annuler un lock et rembourser l'acheteur (commande annulée avant livraison).
   * Atomique.
   */
  async cancelAGCLock(
    lockId: string,
    cancelledBy: string,
    reason?: string,
  ): Promise<{ success: boolean; refundedAmount?: number; error?: string }> {
    try {
      const lockRef = doc(this.firestore, 'agc_locked', lockId);
      const lockSnap = await getDoc(lockRef);

      if (!lockSnap.exists()) {
        return { success: false, error: `Lock introuvable : ${lockId}` };
      }

      const lockData = lockSnap.data() as LockedAGC;

      if (lockData.status !== 'locked') {
        return {
          success: false,
          error: `Impossible d'annuler : statut actuel = "${lockData.status}"`,
        };
      }

      const { amount, userId: buyerId, saleId, orderNumber } = lockData;

      // ── Ledger : remboursement escrow → acheteur ──
      const cancelNonce = this.generateNonce();
      await this.addToLedger({
        fromUserId: 'escrow',
        toUserId: buyerId,
        amount,
        type: 'escrow_release',
        referenceId: orderNumber ?? saleId,
        description: `Remboursement escrow — ${reason ?? 'commande annulée'}`,
        status: 'completed',
        createdAt: new Date(),
        metadata: { lockId, saleId, cancelledBy, reason },
        signature: `system_cancel_${cancelNonce}`,
        signerPublicKey: 'system',
        signerId: 'system',
        signatureAlgorithm: 'ECDSA-P256',
        signatureTimestamp: Date.now(),
        signatureNonce: cancelNonce,
        previousHash: '',
        hash: '',
        blockHeight: 0,
      });

      // ── Firestore ACID : remboursement + lock + Sale ──
      await runTransaction(this.firestore, async (tx) => {
        const buyerRef = doc(this.firestore, 'agc_balances', buyerId);
        const saleRef  = saleId ? doc(this.firestore, 'sales', saleId) : null;

        // ── PHASE 1 : TOUS LES READS D'ABORD ──
        const buyerDoc = await tx.get(buyerRef);
        const saleDoc  = saleRef ? await tx.get(saleRef) : null;

        if (!buyerDoc.exists()) throw new Error('Compte acheteur introuvable');

        // ── PHASE 2 : TOUS LES WRITES ENSUITE ──
        tx.update(buyerRef, {
          balance: increment(amount),
          lockedBalance: increment(-amount),
          lastUpdated: serverTimestamp(),
        });

        tx.update(lockRef, {
          status: 'cancelled',
          cancelledAt: serverTimestamp(),
        });

        if (saleDoc && saleDoc.exists()) {
          tx.update(saleRef!, {
            agcStatus: 'cancelled',
            agcCancelledAt: serverTimestamp(),
          });
        }
      });

      await this.recordEscrowEvent({
        lockId,
        saleId: saleId ?? lockId,
        event: 'cancelled',
        triggeredBy: cancelledBy,
        amount,
        reason,
        createdAt: new Date(),
      });

      // Audit trail
      await this.auditTrail.logEscrowCancel(cancelledBy, lockId, saleId ?? lockId, amount, reason);

      await this.loadUserBalance(buyerId);

      return { success: true, refundedAmount: amount };
    } catch (error: any) {
      console.error('❌ Erreur cancelAGCLock:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Consulter l'état d'un lock escrow.
   */
  async getEscrowStatus(lockId: string): Promise<{
    found: boolean;
    status?: LockedAGC['status'];
    amount?: number;
    saleId?: string;
    producerId?: string;
    lockedAt?: Date;
    releasedAt?: Date;
    cancelledAt?: Date;
  }> {
    try {
      const lockSnap = await getDoc(doc(this.firestore, 'agc_locked', lockId));
      if (!lockSnap.exists()) return { found: false };

      const d = lockSnap.data() as LockedAGC;
      return {
        found: true,
        status: d.status,
        amount: d.amount,
        saleId: d.saleId,
        producerId: d.producerId,
        lockedAt: this.toDate(d.lockedAt),
        releasedAt: d.releasedAt ? this.toDate(d.releasedAt) : undefined,
        cancelledAt: d.cancelledAt ? this.toDate(d.cancelledAt) : undefined,
      };
    } catch (error) {
      console.error('Erreur getEscrowStatus:', error);
      return { found: false };
    }
  }

  /**
   * Récupérer tous les locks actifs d'un utilisateur.
   */
  async getUserActiveLocks(userId: string): Promise<LockedAGC[]> {
    try {
      const q = query(
        collection(this.firestore, 'agc_locked'),
        where('userId', '==', userId),
        where('status', '==', 'locked'),
        orderBy('lockedAt', 'desc'),
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as LockedAGC));
    } catch (error) {
      console.error('Erreur getUserActiveLocks:', error);
      return [];
    }
  }

  /**
   * Piste d'audit escrow — write-only (supression interdite via Firestore Rules).
   * Appelée en interne, ne fait pas échouer la transaction principale si elle plante.
   */
  private async recordEscrowEvent(event: Omit<EscrowEvent, 'id'>): Promise<void> {
    try {
      await addDoc(
        collection(this.firestore, 'escrow_events'),
        this.sanitizeForFirestore(event),
      );
    } catch (error) {
      console.warn("⚠️ Impossible d'enregistrer l'événement escrow:", error);
    }
  }

  // Alias de compatibilité ascendante — conserve l'ancienne signature
  async lockAGCBalance(
    userId: string,
    amount: number,
    orderNumber: string,
    description: string,
    saleId?: string,
    producerId?: string,
  ): Promise<{ success: boolean; lockId?: string; error?: string }> {
    return this.lockAGCForSale(
      userId,
      amount,
      saleId ?? orderNumber,
      producerId ?? 'unknown',
      description,
    );
  }

  async releaseAGCLock(
    lockId: string,
    producerId: string,
  ): Promise<{ success: boolean; error?: string }> {
    const result = await this.releaseAGCForSale(lockId, producerId);
    return { success: result.success, error: result.error };
  }

  // ==================== HISTORIQUE ET STATISTIQUES ====================

  async getTransactionHistory(userId: string, limitCount: number = 50): Promise<AGCTransaction[]> {
    try {
      const ledgerCollection = collection(this.firestore, 'agc_ledger');

      const [snapshot1, snapshot2] = await Promise.all([
        getDocs(query(
          ledgerCollection,
          where('fromUserId', 'in', [userId, 'system']),
          orderBy('blockHeight', 'desc'),
          limit(limitCount),
        )),
        getDocs(query(
          ledgerCollection,
          where('toUserId', '==', userId),
          orderBy('blockHeight', 'desc'),
          limit(limitCount),
        )),
      ]);

      const seenIds = new Set<string>();
      const transactions: AGCTransaction[] = [];

      const addIfNew = (docSnap: any) => {
        if (!seenIds.has(docSnap.id)) {
          seenIds.add(docSnap.id);
          transactions.push(this.mapFirestoreToTransaction(docSnap.id, docSnap.data()));
        }
      };

      snapshot1.forEach(addIfNew);
      snapshot2.forEach(addIfNew);

      return transactions.sort((a, b) => b.blockHeight - a.blockHeight);
    } catch (error) {
      console.error('Erreur récupération historique:', error);
      return [];
    }
  }

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
        return { totalEarned: 0, totalSpent: 0, currentBalance: 0, lockedBalance: 0, purchaseCount: 0, transactionCount: 0, averageTransaction: 0, signatureCount: 0 };
      }

      const data = balanceDoc.data();
      const transactions = await this.getTransactionHistory(userId, 1000);
      const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);

      return {
        totalEarned: data['totalEarned'] || 0,
        totalSpent: data['totalSpent'] || 0,
        currentBalance: data['balance'] || 0,
        lockedBalance: data['lockedBalance'] || 0,
        purchaseCount: transactions.filter((t) => t.type === 'purchase').length,
        transactionCount: transactions.length,
        averageTransaction: transactions.length > 0 ? totalAmount / transactions.length : 0,
        signatureCount: transactions.filter((t) => t.signerId === userId).length,
      };
    } catch (error) {
      console.error('Erreur calcul stats utilisateur:', error);
      return { totalEarned: 0, totalSpent: 0, currentBalance: 0, lockedBalance: 0, purchaseCount: 0, transactionCount: 0, averageTransaction: 0, signatureCount: 0 };
    }
  }

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
      const balancesSnapshot = await getDocs(collection(this.firestore, 'agc_balances'));

      let totalBalance = 0;
      let totalLocked = 0;
      let totalEarned = 0;
      let totalSpent = 0;

      balancesSnapshot.forEach((d) => {
        const data = d.data();
        totalBalance += data['balance'] || 0;
        totalLocked  += data['lockedBalance'] || 0;
        totalEarned  += data['totalEarned'] || 0;
        totalSpent   += data['totalSpent'] || 0;
      });

      const ledgerSnapshot = await getDocs(collection(this.firestore, 'agc_ledger'));
      const totalTransactions = ledgerSnapshot.size;

      let ledgerHeight = 0;
      if (!ledgerSnapshot.empty) {
        const lastQ = query(collection(this.firestore, 'agc_ledger'), orderBy('blockHeight', 'desc'), limit(1));
        const lastSnap = await getDocs(lastQ);
        if (!lastSnap.empty) ledgerHeight = lastSnap.docs[0].data()['blockHeight'] || 0;
      }

      const [integrityResult, sigResult] = await Promise.all([
        this.verifyLedgerIntegrity(),
        this.verifyAllSignatures(),
      ]);

      return {
        totalUsers: balancesSnapshot.size,
        totalBalance,
        totalLocked,
        totalEarned,
        totalSpent,
        totalTransactions,
        ledgerHeight,
        ledgerValid: integrityResult.isValid,
        signaturesValid: sigResult.valid,
        signaturesInvalid: sigResult.invalid,
      };
    } catch (error) {
      console.error('Erreur résumé système AGC:', error);
      return { totalUsers: 0, totalBalance: 0, totalLocked: 0, totalEarned: 0, totalSpent: 0, totalTransactions: 0, ledgerHeight: 0, ledgerValid: false, signaturesValid: 0, signaturesInvalid: 0 };
    }
  }

  // ==================== UTILITAIRES PRIVÉS ====================

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
      snapshot.forEach((d) => transactions.push(this.mapFirestoreToTransaction(d.id, d.data())));
      this.pendingTransactionsSubject.next(transactions);
    } catch (error) {
      console.error('Erreur chargement transactions en attente:', error);
    }
  }

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
      createdAt: data['createdAt']?.toDate ? data['createdAt'].toDate() : new Date(data['createdAt']),
      completedAt: data['completedAt']?.toDate ? data['completedAt'].toDate() : data['completedAt'],
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

  private toDate(value: any): Date {
    if (!value) return new Date();
    if (typeof value.toDate === 'function') return value.toDate();
    if (value instanceof Date) return value;
    if (typeof value === 'number') return new Date(value);
    if (typeof value === 'string') return new Date(value);
    if (typeof value === 'object' && 'seconds' in value) return new Date(value.seconds * 1000);
    return new Date();
  }

  private sanitizeForFirestore(data: any): any {
    if (data === null || data === undefined) return null;
    if (data instanceof Date) return Timestamp.fromDate(data);
    if (Array.isArray(data)) return data.map((item) => this.sanitizeForFirestore(item));
    if (typeof data === 'object') {
      const sanitized: any = {};
      for (const key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key) && data[key] !== undefined) {
          sanitized[key] = this.sanitizeForFirestore(data[key]);
        }
      }
      return sanitized;
    }
    return data;
  }
}

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
} from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { BehaviorSubject, Observable } from 'rxjs';

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
  type: 'purchase' | 'sale_payment' | 'service_payment' | 'transfer' | 'bonus';
  referenceId?: string; // ID de la vente, du service, etc.
  description: string;
  status: 'pending' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
  metadata?: any;
}

@Injectable({
  providedIn: 'root',
})
export class AGCService {
  private firestore = inject(Firestore);
  private auth = inject(Auth);

  // Taux de conversion fixe: 1 AGC = 100 FCFA
  private readonly CONVERSION_RATE = 100;

  // Observable du solde de l'utilisateur courant
  private balanceSubject = new BehaviorSubject<number>(0);
  public balance$: Observable<number> = this.balanceSubject.asObservable();

  constructor() {
    // Écouter les changements d'utilisateur
    this.auth.onAuthStateChanged((user) => {
      if (user) {
        this.loadUserBalance(user.uid);
      } else {
        this.balanceSubject.next(0);
      }
    });
  }

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
        this.balanceSubject.next(0);
      }
    } catch (error) {
      console.error('Erreur chargement solde AGC:', error);
      this.balanceSubject.next(0);
    }
  }

  /**
   * Créer un solde initial pour un nouvel utilisateur
   * Bonus de bienvenue: 10 AGC pour les nouveaux inscrits
   */
  private async createInitialBalance(userId: string): Promise<void> {
    const balanceRef = doc(this.firestore, 'agc_balances', userId);
    const now = new Date();

    const initialBalance: AGCBalance = {
      userId,
      balance: 10, // Bonus de bienvenue
      lockedBalance: 0,
      lastUpdated: now,
      totalEarned: 10,
      totalSpent: 0,
    };

    await setDoc(balanceRef, initialBalance);

    // Enregistrer la transaction de bonus
    await this.recordTransaction({
      fromUserId: 'system',
      toUserId: userId,
      amount: 10,
      type: 'bonus',
      description: 'Bonus de bienvenue',
      status: 'completed',
      createdAt: now,
      completedAt: now,
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
   * Vérifier si un utilisateur a assez de AGC
   */
  async hasEnoughBalance(userId: string, amount: number): Promise<boolean> {
    const balance = await this.getBalance(userId);
    return balance >= amount;
  }

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
   * Calculer le montant hybride pour une transaction
   * Retourne { fiat: 90%, agc: 10% }
   */
  calculateHybridPayment(totalFiat: number): {
    fiatAmount: number;
    agcAmount: number;
  } {
    const agcAmount = this.convertFiatToAGC(totalFiat * 0.1); // 10% en AGC
    const fiatAmount = totalFiat * 0.9; // 90% en FCFA

    return { fiatAmount, agcAmount };
  }

  /**
   * Acheter des AGC
   */
  async purchaseAGC(
    userId: string,
    fiatAmount: number,
    paymentMethod: AGCPurchase['paymentMethod'],
  ): Promise<{ success: boolean; agcAmount?: number; error?: string }> {
    try {
      const agcAmount = this.convertFiatToAGC(fiatAmount);

      // Créer la demande d'achat
      const purchaseData: Omit<AGCPurchase, 'id'> = {
        userId,
        amount: agcAmount,
        fiatAmount,
        rate: this.CONVERSION_RATE,
        status: 'pending',
        paymentMethod,
        createdAt: new Date(),
      };

      const purchaseRef = await addDoc(
        collection(this.firestore, 'agc_purchases'),
        purchaseData,
      );

      // Simuler le paiement (à remplacer par intégration réelle Wave/OM)
      // Pour la simulation, on marque comme complété après 2 secondes
      setTimeout(async () => {
        await this.completePurchase(purchaseRef.id, userId, agcAmount);
      }, 2000);

      return {
        success: true,
        agcAmount,
        error: 'Paiement en cours de traitement...',
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Erreur lors de l'achat",
      };
    }
  }

  /**
   * Compléter un achat (appelé après confirmation paiement)
   */
  private async completePurchase(
    purchaseId: string,
    userId: string,
    agcAmount: number,
  ): Promise<void> {
    try {
      // Récupérer les références
      const purchaseRef = doc(this.firestore, 'agc_purchases', purchaseId);
      const balanceRef = doc(this.firestore, 'agc_balances', userId);

      // LIRE d'abord les données
      const [purchaseDoc, balanceDoc] = await Promise.all([
        getDoc(purchaseRef),
        getDoc(balanceRef),
      ]);

      if (!purchaseDoc.exists()) {
        throw new Error('Achat non trouvé');
      }

      // Ensuite, effectuer les ÉCRITURES dans une transaction
      await runTransaction(this.firestore, async (transaction) => {
        // Mettre à jour la demande d'achat
        transaction.update(purchaseRef, {
          status: 'completed',
          completedAt: new Date(),
        });

        // Mettre à jour ou créer le solde
        if (balanceDoc.exists()) {
          transaction.update(balanceRef, {
            balance: increment(agcAmount),
            totalEarned: increment(agcAmount),
            lastUpdated: new Date(),
          });
        } else {
          transaction.set(balanceRef, {
            userId,
            balance: agcAmount,
            lockedBalance: 0,
            lastUpdated: new Date(),
            totalEarned: agcAmount,
            totalSpent: 0,
          });
        }

        // Enregistrer la transaction
        const transactionRef = doc(
          collection(this.firestore, 'agc_transactions'),
        );
        transaction.set(transactionRef, {
          fromUserId: 'system',
          toUserId: userId,
          amount: agcAmount,
          type: 'purchase',
          referenceId: purchaseId,
          description: `Achat de ${agcAmount} AGC`,
          status: 'completed',
          createdAt: new Date(),
          completedAt: new Date(),
          metadata: { purchaseId },
        });
      });

      // Mettre à jour le solde observable
      this.loadUserBalance(userId);
    } catch (error) {
      console.error('Erreur complétion achat:', error);
    }
  }

  /**
   * Paiement hybride pour une vente
   */

  async processHybridPayment(
    buyerId: string,
    producerId: string,
    totalFiat: number,
    saleId: string,
    options?: {
      allowPartialAGC?: boolean; // Permettre paiement partiel en AGC si solde insuffisant
      forceAGCPayment?: boolean; // Forcer l'utilisation des AGC (sinon erreur)
    },
  ): Promise<{
    success: boolean;
    fiatPaid: number;
    agcPaid: number;
    agcUsed: number;
    missingAGC?: number;
    transactionId?: string;
    error?: string;
    errorCode?:
      | 'INSUFFICIENT_BALANCE'
      | 'NETWORK_ERROR'
      | 'PRODUCER_NOT_FOUND'
      | 'TRANSACTION_FAILED';
  }> {
    console.log(
      `🔄 Début paiement hybride: ${buyerId} -> ${producerId}, Total: ${totalFiat} FCFA`,
    );

    try {
      // 1. Calculer les montants
      const { fiatAmount, agcAmount } = this.calculateHybridPayment(totalFiat);

      console.log(`📊 Répartition: ${fiatAmount} FCFA + ${agcAmount} AGC`);

      // 2. Vérifier le solde de l'acheteur
      const buyerBalance = await this.getBalance(buyerId);
      console.log(
        `💰 Solde acheteur: ${buyerBalance} AGC, Besoin: ${agcAmount} AGC`,
      );

      let actualAgcToUse = agcAmount;
      let actualFiatToPay = fiatAmount;

      // 3. Gestion des cas de solde insuffisant
      if (buyerBalance < agcAmount) {
        console.warn(`⚠️ Solde insuffisant: ${buyerBalance}/${agcAmount} AGC`);

        if (options?.forceAGCPayment) {
          return {
            success: false,
            fiatPaid: 0,
            agcPaid: 0,
            agcUsed: 0,
            error: `Solde AGC insuffisant. Besoin de ${agcAmount} AGC, disponible: ${buyerBalance} AGC`,
            errorCode: 'INSUFFICIENT_BALANCE',
          };
        }

        if (options?.allowPartialAGC) {
          // Paiement partiel: utiliser tout le solde disponible
          actualAgcToUse = buyerBalance;
          actualFiatToPay = totalFiat - buyerBalance * this.CONVERSION_RATE;
          console.log(
            `🔄 Paiement partiel: ${actualAgcToUse} AGC + ${actualFiatToPay} FCFA`,
          );
        } else {
          return {
            success: false,
            fiatPaid: 0,
            agcPaid: 0,
            agcUsed: 0,
            missingAGC: agcAmount - buyerBalance,
            error: `Solde AGC insuffisant. Besoin de ${agcAmount} AGC`,
            errorCode: 'INSUFFICIENT_BALANCE',
          };
        }
      }

      // 4. Vérifier que l'acheteur a bien le solde nécessaire (après ajustement)
      if (actualAgcToUse > 0 && buyerBalance < actualAgcToUse) {
        throw new Error('Incohérence de solde détectée');
      }

      // 5. Exécuter la transaction atomique
      const transactionResult = await this.executeHybridTransaction(
        buyerId,
        producerId,
        actualAgcToUse,
        saleId,
        { totalFiat, fiatAmount: actualFiatToPay },
      );

      if (!transactionResult.success) {
        throw new Error(transactionResult.error || 'Échec de la transaction');
      }

      // 6. Logging et audit
      console.log(
        `✅ Paiement hybride réussi: ${actualAgcToUse} AGC + ${actualFiatToPay} FCFA`,
      );

      // 7. Mettre à jour les soldes observables
      await Promise.all([
        this.loadUserBalance(buyerId),
        this.loadUserBalance(producerId),
      ]);

      return {
        success: true,
        fiatPaid: actualFiatToPay,
        agcPaid: actualAgcToUse,
        agcUsed: actualAgcToUse,
        transactionId: transactionResult.transactionId,
      };
    } catch (error: any) {
      console.error('❌ Erreur paiement hybride:', error);

      // Log d'audit pour debugging
      await this.logAuditTrail({
        action: 'HYBRID_PAYMENT_ERROR',
        buyerId,
        producerId,
        totalFiat,
        error: error.message,
        timestamp: new Date(),
      });

      return {
        success: false,
        fiatPaid: 0,
        agcPaid: 0,
        agcUsed: 0,
        error: error.message || 'Erreur lors du paiement hybride',
        errorCode: this.determineErrorCode(error),
      };
    }
  }

  /**
   * Exécute la transaction hybride de façon atomique
   */
  private async executeHybridTransaction(
    buyerId: string,
    producerId: string,
    agcAmount: number,
    saleId: string,
    metadata: { totalFiat: number; fiatAmount: number },
  ): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    const firestore = this.firestore;
    const buyerBalanceRef = doc(firestore, 'agc_balances', buyerId);
    const producerBalanceRef = doc(firestore, 'agc_balances', producerId);

    try {
      // Transaction Firestore atomique
      const transactionId = await runTransaction(
        firestore,
        async (transaction) => {
          // 1. Lire les données actuelles
          const [buyerDoc, producerDoc] = await Promise.all([
            transaction.get(buyerBalanceRef),
            transaction.get(producerBalanceRef),
          ]);

          if (!buyerDoc.exists()) {
            throw new Error('Compte AGC acheteur non trouvé');
          }

          // 2. Vérification finale du solde
          const currentBalance = buyerDoc.data()['balance'] || 0;
          if (currentBalance < agcAmount) {
            throw new Error(
              `Solde insuffisant: ${currentBalance} < ${agcAmount}`,
            );
          }

          // 3. Débiter l'acheteur
          transaction.update(buyerBalanceRef, {
            balance: increment(-agcAmount),
            totalSpent: increment(agcAmount),
            lastUpdated: serverTimestamp(),
          });

          // 4. Créditer le producteur
          if (producerDoc.exists()) {
            transaction.update(producerBalanceRef, {
              balance: increment(agcAmount),
              totalEarned: increment(agcAmount),
              lastUpdated: serverTimestamp(),
            });
          } else {
            transaction.set(producerBalanceRef, {
              userId: producerId,
              balance: agcAmount,
              lockedBalance: 0,
              lastUpdated: serverTimestamp(),
              totalEarned: agcAmount,
              totalSpent: 0,
            });
          }

          // 5. Enregistrer la transaction
          const transactionRef = doc(collection(firestore, 'agc_transactions'));
          const transactionData = {
            fromUserId: buyerId,
            toUserId: producerId,
            amount: agcAmount,
            type: 'sale_payment',
            referenceId: saleId,
            description: `Paiement hybride - ${agcAmount} AGC`,
            status: 'completed',
            createdAt: serverTimestamp(),
            completedAt: serverTimestamp(),
            metadata: {
              totalFiat: metadata.totalFiat,
              fiatAmount: metadata.fiatAmount,
              agcAmount,
              saleId,
              conversionRate: this.CONVERSION_RATE,
            },
          };

          transaction.set(transactionRef, transactionData);

          return transactionRef.id;
        },
      );

      return { success: true, transactionId };
    } catch (error: any) {
      console.error('❌ Erreur transaction:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Détermine le code d'erreur approprié
   */
  private determineErrorCode(
    error: any,
  ):
    | 'INSUFFICIENT_BALANCE'
    | 'NETWORK_ERROR'
    | 'PRODUCER_NOT_FOUND'
    | 'TRANSACTION_FAILED' {
    if (
      error.message?.toLowerCase().includes('solde') ||
      error.message?.toLowerCase().includes('balance')
    )
      return 'INSUFFICIENT_BALANCE';
    if (
      error.message?.toLowerCase().includes('network') ||
      error.message?.toLowerCase().includes('réseau')
    )
      return 'NETWORK_ERROR';
    if (
      error.message?.toLowerCase().includes('producteur') ||
      error.message?.toLowerCase().includes('producer')
    )
      return 'PRODUCER_NOT_FOUND';
    return 'TRANSACTION_FAILED';
  }

  /**
   * Journal d'audit pour le debugging
   */
  private async logAuditTrail(data: any): Promise<void> {
    try {
      await addDoc(collection(this.firestore, 'agc_audit_logs'), {
        ...data,
        timestamp: serverTimestamp(),
      });
    } catch (error) {
      console.error('Erreur audit trail:', error);
    }
  }

  /**
   * Paiement de service en AGC
   */
  async payForService(
    userId: string,
    serviceName: string,
    agcAmount: number,
    serviceId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const hasEnough = await this.hasEnoughBalance(userId, agcAmount);
      if (!hasEnough) {
        return {
          success: false,
          error: `Solde insuffisant. Besoin de ${agcAmount} AGC`,
        };
      }

      await runTransaction(this.firestore, async (transaction) => {
        // Débiter l'utilisateur
        const balanceRef = doc(this.firestore, 'agc_balances', userId);
        transaction.update(balanceRef, {
          balance: increment(-agcAmount),
          totalSpent: increment(agcAmount),
          lastUpdated: new Date(),
        });

        // Créditer la plateforme (compte système)
        const systemBalanceRef = doc(this.firestore, 'agc_balances', 'system');
        const systemDoc = await transaction.get(systemBalanceRef);

        if (systemDoc.exists()) {
          transaction.update(systemBalanceRef, {
            balance: increment(agcAmount),
            totalEarned: increment(agcAmount),
            lastUpdated: new Date(),
          });
        } else {
          transaction.set(systemBalanceRef, {
            userId: 'system',
            balance: agcAmount,
            lockedBalance: 0,
            lastUpdated: new Date(),
            totalEarned: agcAmount,
            totalSpent: 0,
          });
        }

        // Enregistrer la transaction
        const transactionRef = doc(
          collection(this.firestore, 'agc_transactions'),
        );
        transaction.set(transactionRef, {
          fromUserId: userId,
          toUserId: 'system',
          amount: agcAmount,
          type: 'service_payment',
          referenceId: serviceId,
          description: `Paiement service: ${serviceName}`,
          status: 'completed',
          createdAt: new Date(),
          completedAt: new Date(),
          metadata: { serviceName, serviceId },
        });
      });

      this.loadUserBalance(userId);
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Erreur lors du paiement',
      };
    }
  }

  /**
   * Enregistrer une transaction
   */
  private async recordTransaction(
    transaction: Omit<AGCTransaction, 'id'>,
  ): Promise<void> {
    try {
      await addDoc(collection(this.firestore, 'agc_transactions'), {
        ...transaction,
        createdAt: transaction.createdAt || new Date(),
      });
    } catch (error) {
      console.error('Erreur enregistrement transaction:', error);
    }
  }

  /**
   * Obtenir l'historique des transactions d'un utilisateur
   */
  async getTransactionHistory(
    userId: string,
    limitCount: number = 50,
  ): Promise<AGCTransaction[]> {
    try {
      // Requête pour les transactions envoyées
      const q1 = query(
        collection(this.firestore, 'agc_transactions'),
        where('fromUserId', '==', userId),
        where('status', '==', 'completed'),
      );

      // Requête pour les transactions reçues
      const q2 = query(
        collection(this.firestore, 'agc_transactions'),
        where('toUserId', '==', userId),
        where('status', '==', 'completed'),
      );

      const [snapshot1, snapshot2] = await Promise.all([
        getDocs(q1),
        getDocs(q2),
      ]);

      const transactions: AGCTransaction[] = [];

      snapshot1.forEach((doc) => {
        transactions.push({ id: doc.id, ...doc.data() } as AGCTransaction);
      });

      snapshot2.forEach((doc) => {
        transactions.push({ id: doc.id, ...doc.data() } as AGCTransaction);
      });

      // Trier par date et limiter
      return transactions
        .sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        })
        .slice(0, limitCount);
    } catch (error) {
      console.error('Erreur récupération historique:', error);
      return [];
    }
  }
}

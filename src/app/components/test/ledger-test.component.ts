// src/app/components/test/ledger-test/ledger-test.component.ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  doc,
  updateDoc,
} from 'firebase/firestore';
import { AGCService, AGCTransaction } from 'src/app/services/agc.service';
import { AuthService } from 'src/app/services/auth.service';
import { FirebaseService } from 'src/app/services/firebase.service';
import { CryptoService } from 'src/secure/services/crypto.service';

@Component({
  selector: 'app-ledger-test',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ledger-test.component.html',
  styleUrls: ['./ledger-test.component.css'],
})
export class LedgerTestComponent {
  private agcService = inject(AGCService);
  private cryptoService = inject(CryptoService);
  private authService = inject(AuthService);
  private firebaseService = inject(FirebaseService);

  isProcessing = false;
  errorMessage = '';
  successMessage = '';
  verificationResult: any = null;
  recentTransactions: AGCTransaction[] = [];
  userEmail: string = '';
  userUid: string = ''; // ✅ Stocker l'UID pour éviter les appels répétés

  ngOnInit() {
    const user = this.authService.getUserData();
    if (user) {
      this.userEmail = user.email;
      this.userUid = user.uid; // ✅ Stocker l'UID
    }
    this.loadRecentTransactions();
  }

  async testPurchase() {
    this.isProcessing = true;
    this.clearMessages();

    try {
      const user = this.authService.getUserData();
      if (!user) {
        this.errorMessage = "❌ Connectez-vous d'abord";
        return;
      }

      this.successMessage = '⏳ Achat en cours...';

      // Simuler un achat de 1000 FCFA = 10 AGC
      const result = await this.agcService.purchaseAGC(user.uid, 1000, 'wave');

      if (result.success) {
        // ✅ Correction: Vérifier que agcAmount existe
        const agcAmount = result.agcAmount || 0;
        this.successMessage = `✅ Achat initié: ${agcAmount} AGC (équivalent à ${agcAmount * 100} FCFA)`;
        await this.loadRecentTransactions();
        await this.verifyIntegrity();
      } else {
        this.errorMessage = result.error || "Erreur lors de l'achat";
      }
    } catch (error: any) {
      this.errorMessage = error.message;
    } finally {
      this.isProcessing = false;
    }
  }

  async testHybridPayment() {
    this.isProcessing = true;
    this.clearMessages();

    try {
      const user = this.authService.getUserData();
      if (!user) {
        this.errorMessage = "❌ Connectez-vous d'abord";
        return;
      }

      this.successMessage = '⏳ Paiement hybride en cours...';

      // Simuler un paiement hybride de 10,000 FCFA
      const result = await this.agcService.processHybridPayment(
        user.uid,
        'test_producer_id',
        10000, // 10,000 FCFA
        'test_sale_' + Date.now(),
        { allowPartialAGC: true },
      );

      if (result.success) {
        this.successMessage = `✅ Paiement réussi: ${result.agcUsed || 0} AGC + ${result.fiatPaid || 0} FCFA`;
        await this.loadRecentTransactions();
        await this.verifyIntegrity();
      } else {
        this.errorMessage = result.error || 'Erreur lors du paiement';
      }
    } catch (error: any) {
      this.errorMessage = error.message;
    } finally {
      this.isProcessing = false;
    }
  }

  async verifyIntegrity() {
    this.isProcessing = true;
    this.clearMessages();

    try {
      this.verificationResult = await (
        this.agcService as any
      ).verifyLedgerIntegrity();

      if (this.verificationResult.isValid) {
        this.successMessage = `✅ LEDGER VALIDE: ${this.verificationResult.blocksChecked} bloc(s) vérifié(s)`;
      } else {
        this.errorMessage = `❌ LEDGER CORROMPU: ${this.verificationResult.errors.length} erreur(s) détectée(s)`;
      }
    } catch (error: any) {
      this.errorMessage = error.message;
    } finally {
      this.isProcessing = false;
    }
  }

  async simulateTampering() {
    this.isProcessing = true;
    this.clearMessages();

    try {
      const firestore = this.firebaseService.firestore;
      const ledgerCollection = collection(firestore, 'agc_ledger');
      const q = query(
        ledgerCollection,
        orderBy('blockHeight', 'desc'),
        limit(1),
      );
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const lastBlock = snapshot.docs[0];
        const blockRef = doc(firestore, 'agc_ledger', lastBlock.id);

        // SIMULATION: Modifier le montant du dernier bloc
        await updateDoc(blockRef, {
          amount: 9999, // Montant arbitraire
        });

        this.successMessage =
          '⚠️ SIMULATION: Dernier bloc modifié (attaque simulée)';

        // Vérifier immédiatement pour voir la corruption
        setTimeout(async () => {
          await this.verifyIntegrity();
        }, 1000);
      } else {
        this.errorMessage = 'Aucun bloc trouvé dans le ledger';
      }
    } catch (error: any) {
      this.errorMessage = error.message;
    } finally {
      this.isProcessing = false;
    }
  }

  async checkBalance() {
    try {
      const user = this.authService.getUserData();
      if (user) {
        const balance = await this.agcService.getBalance(user.uid);
        this.successMessage = `💰 Solde AGC: ${balance} AGC (${balance * 100} FCFA)`;
      } else {
        this.errorMessage = 'Utilisateur non connecté';
      }
    } catch (error: any) {
      this.errorMessage = error.message;
    }
  }

  private async loadRecentTransactions() {
    try {
      const user = this.authService.getUserData();
      if (user) {
        const history = await this.agcService.getTransactionHistory(
          user.uid,
          10,
        );
        this.recentTransactions = history;
      }
    } catch (error) {
      console.error('Erreur chargement transactions:', error);
    }
  }

  private clearMessages() {
    this.errorMessage = '';
    this.successMessage = '';
  }

  // ✅ Méthodes pour le template
  getTypeIcon(type: string): string {
    const icons: Record<string, string> = {
      purchase: '🛒',
      sale_payment: '💰',
      bonus: '🎁',
      escrow_lock: '🔒',
      escrow_release: '🔓',
      transfer: '↔️',
      service_payment: '⚙️',
    };
    return icons[type] || '📝';
  }

  // ✅ Retourne l'UID ou une chaîne vide (jamais void)
  getUserUid(): string {
    return this.userUid || '';
  }

  // ✅ Vérifie si une transaction appartient à l'utilisateur
  isUserTransaction(fromId: string, toId: string): 'Moi' | 'Autre' | string {
    if (fromId === this.userUid || toId === this.userUid) {
      return 'Moi';
    }
    return 'Autre';
  }

  // ✅ Formate l'ID pour l'affichage
  formatUserId(userId: string | undefined, type: 'from' | 'to'): string {
    if (!userId) return 'inconnu';
    if (userId === this.userUid) return 'Moi';
    return userId.substring(0, 6) + '...';
  }
  // À ajouter dans la classe LedgerTestComponent
  balance: number = 0;

  async getBalance(): Promise<number> {
    try {
      const user = this.authService.getUserData();
      if (user) {
        this.balance = await this.agcService.getBalance(user.uid);
      }
    } catch (error) {
      console.error('Erreur récupération solde:', error);
    }
    return this.balance;
  }

  // components/test/ledger-test/ledger-test.component.ts

  // ✅ Ajouter cette méthode utilitaire
  formatDate(date: any): string {
    if (!date) return 'N/A';

    try {
      // Firestore Timestamp
      if (date && typeof date.toDate === 'function') {
        return date.toDate().toLocaleString('fr-FR');
      }
      // Date JavaScript
      else if (date instanceof Date) {
        return date.toLocaleString('fr-FR');
      }
      // Chaîne ISO
      else if (typeof date === 'string') {
        return new Date(date).toLocaleString('fr-FR');
      }
      // Nombre (timestamp)
      else if (typeof date === 'number') {
        return new Date(date).toLocaleString('fr-FR');
      }
      // Objet avec seconds
      else if (date && typeof date === 'object' && 'seconds' in date) {
        return new Date(date.seconds * 1000).toLocaleString('fr-FR');
      } else {
        return String(date);
      }
    } catch (error) {
      console.error('Erreur formatage date:', error);
      return 'Date invalide';
    }
  }

  // ✅ Version simplifiée pour le template
  getDisplayDate(date: any): string {
    return this.formatDate(date);
  }

  // components/test/ledger-test/ledger-test.component.ts

  async diagnoseBlockCorruption() {
    try {
      const firestore = this.firebaseService.firestore;
      const ledgerCollection = collection(firestore, 'agc_ledger');
      const q = query(ledgerCollection, orderBy('blockHeight', 'asc'));
      const snapshot = await getDocs(q);

      const blocks: any[] = [];
      snapshot.forEach((doc) => {
        blocks.push({
          id: doc.id,
          ...doc.data(),
        });
      });

      console.log('🔍 DIAGNOSTIC COMPLET DU LEDGER:');

      // Analyser chaque bloc
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        console.log(`\n📦 Bloc #${i}:`, {
          id: block.id,
          type: block.type,
          amount: block.amount,
          fromUserId: block.fromUserId?.substring(0, 8) + '...',
          toUserId: block.toUserId?.substring(0, 8) + '...',
          previousHash: block.previousHash?.substring(0, 16) + '...',
          hash: block.hash?.substring(0, 16) + '...',
        });

        // Vérifier le type de createdAt
        console.log(`  📅 createdAt:`, {
          type: typeof block.createdAt,
          isDate: block.createdAt instanceof Date,
          hasToDate: typeof block.createdAt?.toDate === 'function',
          value: block.createdAt,
        });
      }

      // Analyser spécifiquement le bloc #2 (corrompu)
      if (blocks.length > 2) {
        const block2 = blocks[2];
        console.log('\n🔬 ANALYSE DÉTAILLÉE DU BLOC #2:');

        // Extraire toutes les propriétés
        console.log('  Propriétés complètes:', JSON.stringify(block2, null, 2));

        // Tester différentes combinaisons de hash
        const crypto = this.cryptoService;

        // Option 1: Avec timestamp actuel
        const hash1 = await crypto.calculateBlockHash({
          previousHash: block2.previousHash,
          blockHeight: block2.blockHeight,
          fromUserId: block2.fromUserId,
          toUserId: block2.toUserId,
          amount: block2.amount,
          type: block2.type,
          timestamp: Date.now(),
          nonce: block2.nonce || 0,
        });

        // Option 2: Avec timestamp de createdAt
        let timestamp2 = Date.now();
        if (block2.createdAt) {
          if (typeof block2.createdAt.toDate === 'function') {
            timestamp2 = block2.createdAt.toDate().getTime();
          } else if (block2.createdAt instanceof Date) {
            timestamp2 = block2.createdAt.getTime();
          } else if (typeof block2.createdAt === 'string') {
            timestamp2 = new Date(block2.createdAt).getTime();
          } else if (typeof block2.createdAt === 'number') {
            timestamp2 = block2.createdAt;
          }
        }

        const hash2 = await crypto.calculateBlockHash({
          previousHash: block2.previousHash,
          blockHeight: block2.blockHeight,
          fromUserId: block2.fromUserId,
          toUserId: block2.toUserId,
          amount: block2.amount,
          type: block2.type,
          timestamp: timestamp2,
          nonce: block2.nonce || 0,
        });

        // Option 3: Avec les valeurs exactes stockées
        const hash3 = await crypto.calculateBlockHash({
          previousHash: block2.previousHash,
          blockHeight: block2.blockHeight,
          fromUserId: block2.fromUserId,
          toUserId: block2.toUserId,
          amount: block2.amount,
          type: block2.type,
          timestamp: block2.timestamp || timestamp2, // Si timestamp est stocké
          nonce: block2.nonce || 0,
        });

        console.log('\n🔐 RÉSULTATS DES TESTS DE HASH:');
        console.log(`  Hash stocké:        ${block2.hash}`);
        console.log(
          `  Hash test 1 (now):  ${hash1} ${hash1 === block2.hash ? '✅' : '❌'}`,
        );
        console.log(
          `  Hash test 2 (date): ${hash2} ${hash2 === block2.hash ? '✅' : '❌'}`,
        );
        console.log(
          `  Hash test 3 (exact):${hash3} ${hash3 === block2.hash ? '✅' : '❌'}`,
        );
      }
    } catch (error) {
      console.error('Erreur diagnostic:', error);
    }
  }
}

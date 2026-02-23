// services/agc-init.service.ts
import { Injectable, inject } from '@angular/core';
import { Firestore, collection, getDocs, doc, setDoc } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';

@Injectable({
  providedIn: 'root'
})
export class AGCInitService {
  private firestore = inject(Firestore);
  private auth = inject(Auth);

  private readonly BONUS_AMOUNT = 10;
  private initialized = false;

  /**
   * Initialiser le système AGC
   */
  async initializeAGC(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      console.log('🚀 Initialisation du système AGC...');

      // 1. S'assurer que la collection agc_balances existe
      await this.ensureCollectionExists();

      // 2. Initialiser les soldes pour tous les utilisateurs
      await this.initializeAllBalances();

      // 3. Écouter les nouveaux utilisateurs
      this.listenForNewUsers();

      this.initialized = true;
      console.log('✅ Système AGC initialisé avec succès');

    } catch (error) {
      console.error('❌ Erreur lors de l\'initialisation du système AGC:', error);
    }
  }

  /**
   * S'assurer que la collection existe (Firestore la crée automatiquement au premier document)
   */
  private async ensureCollectionExists(): Promise<void> {
    // Firestore crée automatiquement les collections lors du premier ajout
    // On peut juste vérifier qu'on peut accéder à la collection
    try {
      await getDocs(collection(this.firestore, 'agc_balances'));
    } catch (error) {
      console.log('Création de la collection agc_balances...');
    }
  }

  /**
   * Initialiser les soldes pour tous les utilisateurs existants
   */
  private async initializeAllBalances(): Promise<void> {
    try {
      // Récupérer tous les utilisateurs
      const usersSnapshot = await getDocs(collection(this.firestore, 'users'));
      const balancesSnapshot = await getDocs(collection(this.firestore, 'agc_balances'));

      // Créer un Map des soldes existants
      const existingBalances = new Map();
      balancesSnapshot.docs.forEach(doc => {
        existingBalances.set(doc.id, doc.data());
      });

      let newBalancesCount = 0;

      // Pour chaque utilisateur sans solde, en créer un
      for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;

        if (!existingBalances.has(userId)) {
          const userData = userDoc.data();

          await setDoc(doc(this.firestore, 'agc_balances', userId), {
            userId,
            balance: this.BONUS_AMOUNT,
            lockedBalance: 0,
            lastUpdated: new Date(),
            totalEarned: this.BONUS_AMOUNT,
            totalSpent: 0
          });

          newBalancesCount++;
          console.log(`✅ Bonus AGC attribué à ${userData['email'] || userId}`);
        }
      }

      console.log(`🎉 ${newBalancesCount} nouveaux soldes AGC créés`);

    } catch (error) {
      console.error('Erreur lors de l\'initialisation des soldes:', error);
    }
  }

  /**
   * Écouter les nouveaux utilisateurs et leur attribuer un bonus
   */
  private listenForNewUsers(): void {
    // Note: Pour écouter en temps réel les nouveaux utilisateurs,
    // il faudrait utiliser onSnapshot, mais cela peut être coûteux
    // On peut plutôt utiliser une Cloud Function ou le faire à la connexion

    this.auth.onAuthStateChanged(async (user) => {
      if (user) {
        await this.ensureUserBalance(user.uid);
      }
    });
  }

  /**
   * S'assurer qu'un utilisateur a un solde (appelé à chaque connexion)
   */
  async ensureUserBalance(userId: string): Promise<void> {
    try {
      const balancesSnapshot = await getDocs(collection(this.firestore, 'agc_balances'));
      const existingBalance = balancesSnapshot.docs.find(d => d.id === userId);

      if (!existingBalance) {
        // Récupérer les données utilisateur
        const userSnapshot = await getDocs(collection(this.firestore, 'users'));
        const userData = userSnapshot.docs.find(d => d.id === userId)?.data();

        await setDoc(doc(this.firestore, 'agc_balances', userId), {
          userId,
          balance: this.BONUS_AMOUNT,
          lockedBalance: 0,
          lastUpdated: new Date(),
          totalEarned: this.BONUS_AMOUNT,
          totalSpent: 0
        });

        console.log(`🎁 Bonus de bienvenue AGC attribué à ${userData?.['email'] || userId}`);
      }
    } catch (error) {
      console.error('Erreur lors de la vérification du solde utilisateur:', error);
    }
  }

  /**
   * Obtenir des statistiques sur les soldes AGC
   */
  async getAGCStats(): Promise<any> {
    try {
      const balancesSnapshot = await getDocs(collection(this.firestore, 'agc_balances'));
      const usersSnapshot = await getDocs(collection(this.firestore, 'users'));

      let totalBalance = 0;
      let totalLocked = 0;
      let totalEarned = 0;
      let totalSpent = 0;

      balancesSnapshot.docs.forEach(doc => {
        const data = doc.data();
        totalBalance += data['balance'] || 0;
        totalLocked += data['lockedBalance'] || 0;
        totalEarned += data['totalEarned'] || 0;
        totalSpent += data['totalSpent'] || 0;
      });

      return {
        totalUsers: usersSnapshot.size,
        usersWithBalance: balancesSnapshot.size,
        totalBalance,
        totalLocked,
        totalEarned,
        totalSpent,
        averageBalance: balancesSnapshot.size > 0 ? totalBalance / balancesSnapshot.size : 0
      };

    } catch (error) {
      console.error('Erreur lors du calcul des stats AGC:', error);
      return null;
    }
  }
}

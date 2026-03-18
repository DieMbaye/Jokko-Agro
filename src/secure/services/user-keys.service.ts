// services/user-keys.service.ts
import { Injectable, inject } from '@angular/core';
import { Firestore, doc, setDoc, getDoc, updateDoc } from '@angular/fire/firestore';
import { CryptoECDAService } from './crypto-ecdsa.service';

@Injectable({
  providedIn: 'root'
})
export class UserKeysService {
  private firestore = inject(Firestore);
  private cryptoECDSA = inject(CryptoECDAService);

  /**
   * Générer et sauvegarder les clés pour un nouvel utilisateur
   */
  async generateAndSaveUserKeys(userId: string): Promise<{
    publicKey: string;
    success: boolean;
  }> {
    try {
      // 1. Générer la paire de clés
      const { publicKey, privateKey } = await this.cryptoECDSA.generateKeyPair();

      // 2. Sauvegarder dans Firestore (la clé privée est CHIFFRÉE !)
      const userKeysRef = doc(this.firestore, 'user_keys', userId);

      // La clé privée doit être chiffrée avant stockage !
      // Pour l'exemple, on simule un chiffrement
      const encryptedPrivateKey = await this.encryptPrivateKey(privateKey, userId);

      await setDoc(userKeysRef, {
        userId,
        publicKey,
        encryptedPrivateKey,
        algorithm: 'ECDSA-P256',
        createdAt: new Date(),
        lastUsed: new Date()
      });

      // 3. Stocker la clé privée dans le sessionStorage (temporaire)
      // Ne JAMAIS stocker en localStorage !
      sessionStorage.setItem(`private_key_${userId}`, privateKey);

      return { publicKey, success: true };
    } catch (error) {
      console.error('Erreur génération clés:', error);
      return { publicKey: '', success: false };
    }
  }

  /**
   * Récupérer la clé publique d'un utilisateur
   */
  async getPublicKey(userId: string): Promise<string | null> {
    try {
      const userKeysRef = doc(this.firestore, 'user_keys', userId);
      const docSnap = await getDoc(userKeysRef);

      if (docSnap.exists()) {
        return docSnap.data()['publicKey'];
      }
      return null;
    } catch (error) {
      console.error('Erreur récupération clé publique:', error);
      return null;
    }
  }

  /**
   * Récupérer la clé privée (depuis sessionStorage)
   */
  getPrivateKey(userId: string): string | null {
    return sessionStorage.getItem(`private_key_${userId}`);
  }

  /**
   * Chiffrer la clé privée avant stockage
   * (Implémentation simplifiée - à renforcer en production)
   */
  private async encryptPrivateKey(privateKey: string, userId: string): Promise<string> {
    // TODO: Utiliser un vrai chiffrement avec un mot de passe utilisateur
    // Pour l'instant, on simule un encodage
    return btoa(privateKey);
  }
}

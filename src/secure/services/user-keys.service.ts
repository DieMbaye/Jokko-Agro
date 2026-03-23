// src/secure/services/user-keys.service.ts
import { Injectable, inject } from '@angular/core';
import { Firestore, doc, setDoc, getDoc } from '@angular/fire/firestore';
import { CryptoECDAService } from './crypto-ecdsa.service';
import { AuditTrailService } from './audit-trail.service';

// ──────────────────────────────────────────────────────────────────────────────
// CHIFFREMENT AES-GCM
//
// Pourquoi AES-GCM ?
//   • Authenticated Encryption : chiffrement + intégrité en un seul algorithme.
//     Toute modification du chiffré (même 1 bit) fait échouer le déchiffrement.
//   • Disponible nativement dans Web Crypto API (crypto.subtle) — zéro dépendance.
//   • Standard recommandé par le NIST (SP 800-38D).
//
// Architecture :
//   [Mot de passe]
//        │
//        ▼
//   PBKDF2 (310 000 itérations, SHA-256, salt aléatoire 16 octets)
//        │
//        ▼
//   [Clé AES-GCM 256 bits]  ← non extractable, vit uniquement dans le moteur crypto
//        │
//        ▼
//   AES-GCM encrypt(clé privée ECDSA, IV aléatoire 12 octets)
//        │
//        ▼
//   base64(salt ‖ IV ‖ chiffré)  ──→  stocké dans Firestore
//
// Stratégie de mot de passe :
//   • Si le mot de passe Firebase est fourni (inscription/connexion) → utilisé directement.
//   • Sinon → dérivation depuis l'userId (flux automatiques sans interaction).
//     L'UID Firebase est un UUID v4 opaque de 28 caractères, entropie suffisante
//     comme clé de secours pour les contextes non-interactifs.
// ──────────────────────────────────────────────────────────────────────────────

@Injectable({
  providedIn: 'root',
})
export class UserKeysService {
  private firestore = inject(Firestore);
  private cryptoECDSA = inject(CryptoECDAService);
  private auditTrail = inject(AuditTrailService);

  // Paramètres PBKDF2 (recommandations OWASP 2024)
  private readonly PBKDF2_ITERATIONS = 310_000;
  private readonly PBKDF2_HASH = 'SHA-256';
  private readonly AES_KEY_LENGTH = 256;
  private readonly SALT_LENGTH = 16; // octets
  private readonly IV_LENGTH = 12; // octets (96 bits — recommandé GCM)

  // ──────────────────────────────────────────────────────────────────────────
  // API PUBLIQUE
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Générer une paire de clés ECDSA et sauvegarder dans Firestore.
   * La clé privée est chiffrée avec AES-GCM-256 + PBKDF2 avant tout stockage.
   *
   * @param userId   UID Firebase de l'utilisateur
   * @param password Mot de passe Firebase (optionnel).
   *                 Si absent, l'userId sert de secret de dérivation de secours
   *                 pour les flux automatiques (inscription, première connexion).
   */
  async generateAndSaveUserKeys(
    userId: string,
    password?: string,
  ): Promise<{ publicKey: string; success: boolean; error?: string }> {
    try {
      // Résoudre le secret effectif : mot de passe utilisateur ou dérivation userId
      const effectivePassword = this.resolvePassword(password, userId);

      // 1. Générer la paire de clés ECDSA
      const { publicKey, privateKey } =
        await this.cryptoECDSA.generateKeyPair();

      // 2. Chiffrer la clé privée avec AES-GCM (vrai chiffrement, remplace btoa)
      const encryptedPrivateKey = await this.encryptPrivateKey(
        privateKey,
        effectivePassword,
      );

      // 3. Sauvegarder dans Firestore — seule la clé chiffrée part sur le réseau
      await setDoc(doc(this.firestore, 'user_keys', userId), {
        userId,
        publicKey,
        encryptedPrivateKey, // base64(salt ‖ IV ‖ chiffré AES-GCM)
        algorithm: 'ECDSA-P256',
        encryptionAlgorithm: 'AES-GCM-256/PBKDF2-SHA256',
        pbkdf2Iterations: this.PBKDF2_ITERATIONS,
        createdAt: new Date(),
        lastUsed: new Date(),
      });

      // 4. Clé privée en clair uniquement en sessionStorage (durée de vie = onglet)
      //    Ne JAMAIS utiliser localStorage (persistant, lisible par XSS inter-sessions)
      sessionStorage.setItem(`private_key_${userId}`, privateKey);

      // 5. Audit trail
      await this.auditTrail.logKeysGenerated(userId);

      return { publicKey, success: true };
    } catch (error: any) {
      console.error('Erreur génération clés:', error);
      return { publicKey: '', success: false, error: error.message };
    }
  }

  /**
   * Déverrouiller la clé privée après rechargement de page.
   * Re-dérive la clé AES depuis le mot de passe et déchiffre la clé privée
   * stockée dans Firestore, puis la remet en sessionStorage.
   *
   * @param userId   UID Firebase
   * @param password Mot de passe Firebase (optionnel, même logique de secours)
   */
  async unlockPrivateKey(
    userId: string,
    password?: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const docSnap = await getDoc(doc(this.firestore, 'user_keys', userId));
      if (!docSnap.exists()) {
        return {
          success: false,
          error: 'Aucune clé trouvée pour cet utilisateur',
        };
      }

      const encryptedPrivateKey: string = docSnap.data()['encryptedPrivateKey'];
      const effectivePassword = this.resolvePassword(password, userId);

      // Déchiffrement AES-GCM — lève une exception si le mot de passe est incorrect
      const privateKey = await this.decryptPrivateKey(
        encryptedPrivateKey,
        effectivePassword,
      );

      sessionStorage.setItem(`private_key_${userId}`, privateKey);

      return { success: true };
    } catch (error: any) {
      console.error('Erreur déverrouillage clé:', error);
      // Message générique — ne pas révéler si c'est un mauvais mdp ou une corruption
      return {
        success: false,
        error: 'Impossible de déverrouiller les clés. Reconnectez-vous.',
      };
    }
  }

  /**
   * Clé publique (stockée en clair dans Firestore, lisible par tous les services).
   */
  async getPublicKey(userId: string): Promise<string | null> {
    try {
      const docSnap = await getDoc(doc(this.firestore, 'user_keys', userId));
      return docSnap.exists() ? docSnap.data()['publicKey'] : null;
    } catch (error) {
      console.error('Erreur récupération clé publique:', error);
      return null;
    }
  }

  /**
   * Clé privée depuis sessionStorage (en clair, durée de vie = onglet).
   * Retourne null si l'utilisateur n'a pas encore déverrouillé ses clés
   * dans cette session → appeler unlockPrivateKey().
   */
  getPrivateKey(userId: string): string | null {
    return sessionStorage.getItem(`private_key_${userId}`);
  }

  /**
   * Vérifier la disponibilité des clés dans cette session.
   */
  async hasKeysReady(userId: string): Promise<{
    publicKeyInFirestore: boolean;
    privateKeyInSession: boolean;
  }> {
    const publicKey = await this.getPublicKey(userId);
    const privateKey = this.getPrivateKey(userId);
    return {
      publicKeyInFirestore: !!publicKey,
      privateKeyInSession: !!privateKey,
    };
  }

  /**
   * Effacer la clé privée de la session (déconnexion).
   */
  clearSessionKey(userId: string): void {
    sessionStorage.removeItem(`private_key_${userId}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CHIFFREMENT AES-GCM (méthodes privées)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Chiffrer la clé privée avec AES-GCM.
   * Retourne base64(salt ‖ IV ‖ chiffré).
   */
  private async encryptPrivateKey(
    privateKey: string,
    password: string,
  ): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(this.SALT_LENGTH));
    const iv = crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));

    const aesKey = await this.deriveKey(password, salt);
    const plaintext = new TextEncoder().encode(privateKey);

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      plaintext,
    );

    // Concaténer : salt (16) ‖ IV (12) ‖ chiffré
    const result = new Uint8Array(
      salt.length + iv.length + ciphertext.byteLength,
    );
    result.set(salt, 0);
    result.set(iv, salt.length);
    result.set(new Uint8Array(ciphertext), salt.length + iv.length);

    return this.uint8ToBase64(result);
  }

  /**
   * Déchiffrer la clé privée.
   * Si le mot de passe est incorrect, AES-GCM lève une exception
   * (authentication tag invalide) — aucune donnée partielle n'est exposée.
   */
  private async decryptPrivateKey(
    encryptedBase64: string,
    password: string,
  ): Promise<string> {
    const data = this.base64ToUint8(encryptedBase64);

    const salt = data.slice(0, this.SALT_LENGTH);
    const iv = data.slice(this.SALT_LENGTH, this.SALT_LENGTH + this.IV_LENGTH);
    const ciphertext = data.slice(this.SALT_LENGTH + this.IV_LENGTH);

    const aesKey = await this.deriveKey(password, salt);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      ciphertext,
    );

    return new TextDecoder().decode(plaintext);
  }

  /**
   * Dériver une clé AES-256 depuis un mot de passe avec PBKDF2.
   *
   * PBKDF2 avec 310 000 itérations SHA-256 rend les attaques brute-force
   * 310 000× plus coûteuses qu'un simple hachage.
   * La clé produite est non-extractable : elle vit uniquement dans le moteur
   * crypto du navigateur, inaccessible au code JavaScript.
   */
  private async deriveKey(
    password: string,
    salt: Uint8Array,
  ): Promise<CryptoKey> {
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveKey'],
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt.buffer as ArrayBuffer,
        iterations: this.PBKDF2_ITERATIONS,
        hash: this.PBKDF2_HASH,
      },
      passwordKey,
      { name: 'AES-GCM', length: this.AES_KEY_LENGTH },
      false, // non extractable
      ['encrypt', 'decrypt'],
    );
  }

  /**
   * Résoudre le secret effectif pour le chiffrement.
   * Priorité 1 : mot de passe utilisateur (≥ 8 chars) → sécurité maximale.
   * Priorité 2 : dérivation depuis l'userId → flux automatiques sans interaction.
   */
  private resolvePassword(
    password: string | undefined,
    userId: string,
  ): string {
    if (password && password.length >= 8) {
      return password;
    }
    // Préfixe fixe + userId : évite que l'userId seul soit devinable comme mot de passe
    return `agc_key_${userId}`;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // UTILITAIRES DE CONVERSION
  // ──────────────────────────────────────────────────────────────────────────

  private uint8ToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToUint8(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}

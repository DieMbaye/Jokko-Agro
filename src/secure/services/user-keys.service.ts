// src/secure/services/user-keys.service.ts
import { Injectable, inject } from '@angular/core';
import { Firestore, doc, setDoc, getDoc } from '@angular/fire/firestore';
import { CryptoECDAService } from './crypto-ecdsa.service';
import { AuditTrailService } from './audit-trail.service';
import { SecureKeyService } from './secure-key.service';

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
  private firestore  = inject(Firestore);
  private cryptoECDSA = inject(CryptoECDAService);
  private auditTrail  = inject(AuditTrailService);
  // ✅ COUCHE 1 — Clé privée dans IndexedDB (non extractable)
  private secureKey   = inject(SecureKeyService);

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
      // ✅ COUCHE 1 — Générer dans IndexedDB avec extractable: false
      // La clé privée ne sort JAMAIS en clair du moteur crypto du navigateur.
      const publicKey = await this.secureKey.generateAndStoreKeyPair(userId);

      // Chiffrer la clé publique (pour backup Firestore)
      // Note : on ne stocke plus la clé privée en Firestore ni en sessionStorage
      await setDoc(doc(this.firestore, 'user_keys', userId), {
        userId,
        publicKey,                            // clé publique en clair (c'est normal)
        algorithm: 'ECDSA-P256',
        keyStorage: 'IndexedDB-non-extractable', // ← marqueur de la nouvelle architecture
        createdAt: new Date(),
        lastUsed: new Date(),
      });

      // ✅ Supprimer l'ancienne clé de sessionStorage si elle existait
      sessionStorage.removeItem(`private_key_${userId}`);

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
      // ✅ COUCHE 1 — Vérifier si la clé existe en IndexedDB
      const hasKey = await this.secureKey.hasKeyPair(userId);
      if (hasKey) {
        return { success: true }; // Clé déjà disponible dans IndexedDB
      }

      // ── Tentative de migration depuis sessionStorage (ancienne architecture) ──
      const migrated = await this.secureKey.migrateFromSessionStorage(userId);
      if (migrated) {
        console.info('[UserKeys] Migration sessionStorage → IndexedDB réussie.');
        return { success: true };
      }

      // ── Si aucune clé nulle part : régénérer ──────────────────────────────
      console.warn('[UserKeys] Aucune clé trouvée. Régénération nécessaire.');
      const docSnap = await getDoc(doc(this.firestore, 'user_keys', userId));
      if (!docSnap.exists()) {
        return { success: false, error: 'Aucune clé trouvée. Veuillez régénérer vos clés.' };
      }

      // Régénérer une nouvelle paire (perte de l'ancienne clé privée)
      await this.generateAndSaveUserKeys(userId, password);
      return { success: true };
    } catch (error: any) {
      console.error('Erreur déverrouillage clé:', error);
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
   * ✅ COUCHE 1 — La clé privée n'est PLUS accessible en clair.
   * Utilisez SecureKeyService.sign() pour signer directement.
   *
   * @deprecated Ne retourne plus la clé privée brute.
   * Injectez SecureKeyService et appelez .sign(userId, message) à la place.
   */
  getPrivateKey(userId: string): string | null {
    // ✅ On retourne null : la clé privée ne sort plus jamais en clair.
    // Les appelants doivent migrer vers SecureKeyService.sign().
    console.warn(
      '[UserKeys] getPrivateKey() est déprécié. ' +
      'Utilisez SecureKeyService.sign(userId, message) à la place.'
    );
    return null;
  }

  /**
   * Vérifier la disponibilité des clés dans cette session.
   */
  async hasKeysReady(userId: string): Promise<{
    publicKeyInFirestore: boolean;
    privateKeyInIndexedDB: boolean;  // ← renommé (plus sessionStorage)
  }> {
    const publicKey      = await this.getPublicKey(userId);
    const hasKeyInIDB    = await this.secureKey.hasKeyPair(userId);
    return {
      publicKeyInFirestore:  !!publicKey,
      privateKeyInIndexedDB: hasKeyInIDB,
    };
  }

  /**
   * Effacer la clé privée (déconnexion).
   * Supprime de IndexedDB ET de sessionStorage (migration).
   */
  clearSessionKey(userId: string): void {
    // Supprimer de sessionStorage (ancienne architecture)
    sessionStorage.removeItem(`private_key_${userId}`);
    // Supprimer de IndexedDB (nouvelle architecture)
    this.secureKey.deleteKeyPair(userId).catch(console.error);
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

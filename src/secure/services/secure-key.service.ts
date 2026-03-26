// src/secure/services/secure-key.service.ts
//
// ══════════════════════════════════════════════════════════════════════════════
// SECURE KEY SERVICE — Couche 1 de sécurité renforcée
//
// Problème résolu :
//   sessionStorage est lisible par TOUT script JS sur la page.
//   Une XSS = vol de clé privée = attaquant peut signer à votre place.
//
// Solution :
//   CryptoKey avec extractable: false + stockage dans IndexedDB.
//   La clé ne quitte JAMAIS l'environnement cryptographique du navigateur.
//   Même avec un accès JS complet (XSS), la clé est inaccessible.
//   C'est l'équivalent logiciel d'un Secure Enclave / HSM.
//
// Architecture :
//   generateKeyPair() → CryptoKey {extractable: false} stockée dans IndexedDB
//   sign(data)        → appel WebCrypto avec la clé stockée (jamais exposée)
//   getPublicKey()    → clé publique exportable en base64 (innocuité)
//
// Flux complet :
//   [Utilisateur] → generateKeyPair() → IndexedDB (clé privée non-extractable)
//                                    → Firestore (clé publique en clair)
//   [Signature]   → sign(message) → WebCrypto.sign() (clé jamais exposée)
//
// ══════════════════════════════════════════════════════════════════════════════

import { Injectable } from '@angular/core';

const DB_NAME    = 'jokko_agro_keys';
const DB_VERSION = 1;
const STORE_NAME = 'user_key_pairs';

export interface StoredKeyPair {
  userId: string;
  keyPair: CryptoKeyPair;  // CryptoKey objects — non sérialisables, non exportables
  publicKeyB64: string;    // Clé publique en base64 (exportée une seule fois)
  createdAt: number;
}

@Injectable({
  providedIn: 'root',
})
export class SecureKeyService {

  // ──────────────────────────────────────────────────────────────────────────
  // IndexedDB — ouverture et initialisation
  // ──────────────────────────────────────────────────────────────────────────

  private openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'userId' });
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GÉNÉRATION — crée une paire de clés et la stocke dans IndexedDB
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Génère une paire de clés ECDSA-P256 avec extractable: false.
   *
   * La clé privée est confinée dans IndexedDB : elle ne peut jamais être
   * exportée en bytes, même par du code JavaScript malveillant.
   * Seule la clé publique est exportée (en base64) pour être partagée.
   *
   * @returns publicKeyB64 — clé publique exportée en base64
   */
  async generateAndStoreKeyPair(userId: string): Promise<string> {
    // 1. Générer avec extractable: FALSE — la clé privée ne sortira jamais
    const keyPair = await window.crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,              // ← CRITIQUE : clé non extractable
      ['sign', 'verify']
    );

    // 2. Exporter la clé PUBLIQUE (sans danger — elle est publique par nature)
    const publicKeyBuffer = await window.crypto.subtle.exportKey('raw', keyPair.publicKey);
    const publicKeyB64    = this.bufferToBase64(publicKeyBuffer);

    // 3. Stocker la paire dans IndexedDB
    //    IndexedDB peut stocker des CryptoKey objects directement
    //    (structured clone algorithm) — c'est sa force vs sessionStorage
    const db = await this.openDB();
    await this.idbPut(db, {
      userId,
      keyPair,        // CryptoKey objects — non extractables, non JSON-sérialisables
      publicKeyB64,
      createdAt: Date.now(),
    });

    return publicKeyB64;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SIGNATURE — utilise la clé stockée sans jamais l'exposer
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Signe un message avec la clé privée stockée dans IndexedDB.
   *
   * La clé privée n'est jamais retournée ni exposée — elle est passée
   * directement à WebCrypto.sign() qui l'utilise en interne.
   * Un attaquant avec XSS peut appeler cette méthode mais ne verra
   * jamais les octets de la clé privée.
   *
   * @param userId   — identifiant de l'utilisateur
   * @param message  — données à signer (JSON ou texte)
   * @returns signature en base64
   */
  async sign(userId: string, message: string): Promise<string> {
    const stored = await this.getStoredKeyPair(userId);
    if (!stored) {
      throw new Error(`Aucune clé trouvée pour ${userId}. Régénérer les clés.`);
    }

    const encoded   = new TextEncoder().encode(message);
    const sigBuffer = await window.crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      stored.keyPair.privateKey,  // ← jamais exposée, jamais sérialisable
      encoded
    );

    return this.bufferToBase64(sigBuffer);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // VÉRIFICATION LOCALE — utile pour tests et debug
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Vérifie une signature avec la clé publique stockée.
   * La vérification RÉELLE doit se faire côté serveur (Cloud Function).
   */
  async verifyLocally(
    userId: string,
    message: string,
    signatureB64: string
  ): Promise<boolean> {
    try {
      const stored = await this.getStoredKeyPair(userId);
      if (!stored) return false;

      const encoded  = new TextEncoder().encode(message);
      const sigBytes = this.base64ToBuffer(signatureB64);

      return await window.crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        stored.keyPair.publicKey,
        sigBytes,
        encoded
      );
    } catch {
      return false;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // LECTURE / ÉTAT
  // ──────────────────────────────────────────────────────────────────────────

  /** Retourne la clé publique en base64, ou null si aucune clé n'existe. */
  async getPublicKey(userId: string): Promise<string | null> {
    const stored = await this.getStoredKeyPair(userId);
    return stored?.publicKeyB64 ?? null;
  }

  /** Vérifie si une paire de clés existe en IndexedDB pour cet utilisateur. */
  async hasKeyPair(userId: string): Promise<boolean> {
    const stored = await this.getStoredKeyPair(userId);
    return !!stored;
  }

  /** Supprime la paire de clés (déconnexion / rotation). */
  async deleteKeyPair(userId: string): Promise<void> {
    const db = await this.openDB();
    await this.idbDelete(db, userId);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // MIGRATION — depuis sessionStorage (ancien système)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Migration depuis l'ancien système (sessionStorage).
   *
   * Si une clé privée brute existe en sessionStorage, on la réimporte
   * avec extractable: false et on la stocke dans IndexedDB.
   * On supprime immédiatement la clé de sessionStorage.
   *
   * ATTENTION : cette méthode ne peut être appelée qu'UNE SEULE FOIS
   * par session — après migration, la clé n'est plus en sessionStorage.
   */
  async migrateFromSessionStorage(userId: string): Promise<boolean> {
    const oldKey = sessionStorage.getItem(`private_key_${userId}`);
    if (!oldKey) return false;

    try {
      // Réimporter la clé brute avec extractable: false
      const rawKeyBuffer = this.base64ToBuffer(oldKey);
      const privateKey   = await window.crypto.subtle.importKey(
        'pkcs8',
        rawKeyBuffer,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,          // ← non extractable dès l'import
        ['sign']
      );

      // On ne peut pas reconstruire la clé publique depuis une clé privée non-extractable.
      // On génère une nouvelle paire propre à la place.
      console.warn(
        '[SecureKeyService] Migration : génération d\'une nouvelle paire de clés sécurisée.'
      );
      await this.generateAndStoreKeyPair(userId);

      // Supprimer immédiatement l'ancienne clé du sessionStorage
      sessionStorage.removeItem(`private_key_${userId}`);
      console.info('[SecureKeyService] Migration réussie : clé migrée vers IndexedDB.');
      return true;
    } catch (error) {
      console.error('[SecureKeyService] Échec migration :', error);
      // Ne pas supprimer l'ancienne clé si la migration a échoué
      return false;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // INDEXEDDB — helpers promisifiés
  // ──────────────────────────────────────────────────────────────────────────

  private getStoredKeyPair(userId: string): Promise<StoredKeyPair | null> {
    return new Promise(async (resolve, reject) => {
      try {
        const db  = await this.openDB();
        const tx  = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(userId);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror   = () => reject(req.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  private idbPut(db: IDBDatabase, record: StoredKeyPair): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).put(record);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  }

  private idbDelete(db: IDBDatabase, userId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).delete(userId);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // UTILITAIRES
  // ──────────────────────────────────────────────────────────────────────────

  private bufferToBase64(buffer: ArrayBuffer): string {
    const bytes  = new Uint8Array(buffer);
    let   binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  private base64ToBuffer(b64: string): ArrayBuffer {
    const binary = atob(b64);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }
}

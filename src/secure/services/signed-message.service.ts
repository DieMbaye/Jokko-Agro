// src/secure/services/signed-message.service.ts
//
// ══════════════════════════════════════════════════════════════════════════════
// SIGNED MESSAGE SERVICE — Couche 3 : Nonce anti-rejeu
//
// Problème résolu :
//   Sans nonce, une signature valide peut être "rejouée" :
//   - Quelqu'un intercepte la requête de lock AGC pour la commande X.
//   - Il renvoie la même requête signée plus tard → double-lock frauduleux.
//
// Solution :
//   Chaque message signé contient :
//   1. Un UUID aléatoire (nonce)   → unicité absolue, rejouable = impossible
//   2. Un timestamp Unix            → fenêtre de 5 minutes côté serveur
//   3. Une version de protocole     → invalidation si rotation des clés
//
//   Côté Cloud Function :
//   - Le nonce est vérifié dans Firestore (collection used_nonces)
//   - S'il existe déjà → rejeté immédiatement (replay attack)
//   - Le timestamp est vérifié (± 5 minutes)
//   - Le nonce est marqué "consommé" avec TTL 10 minutes
//
// ══════════════════════════════════════════════════════════════════════════════

import { Injectable, inject } from '@angular/core';
import { SecureKeyService } from './secure-key.service';

export interface SignedMessage {
  /** Payload métier */
  payload: Record<string, unknown>;

  /** Nonce : UUID v4 aléatoire — consommé une seule fois côté serveur */
  nonce: string;

  /** Timestamp Unix (secondes) — fenêtre de ±5 minutes */
  timestamp: number;

  /** Version du protocole — permet d'invalider les anciens formats */
  version: string;

  /** Signature ECDSA-P256 en base64 (signe le JSON canonique ci-dessus) */
  signature: string;
}

@Injectable({
  providedIn: 'root',
})
export class SignedMessageService {
  private secureKey = inject(SecureKeyService);

  /** Fenêtre de validité du timestamp (5 minutes en secondes) */
  readonly TIMESTAMP_WINDOW_S = 300;

  /** Version courante du protocole */
  readonly PROTOCOL_VERSION = '2.0';  // v2.0 = IndexedDB + nonce

  // ──────────────────────────────────────────────────────────────────────────
  // CRÉATION D'UN MESSAGE SIGNÉ
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Crée un message signé avec nonce anti-rejeu.
   *
   * Le JSON canonique signé est :
   *   { payload, nonce, timestamp, version }
   *
   * La signature couvre l'intégralité de ce JSON → impossibilité de modifier
   * le payload sans invalider la signature.
   *
   * @param userId  — utilisateur qui signe
   * @param payload — données métier à signer (checkpoint, lock AGC, etc.)
   * @returns SignedMessage prêt à être envoyé à la Cloud Function
   */
  async createSignedMessage(
    userId: string,
    payload: Record<string, unknown>
  ): Promise<SignedMessage> {
    // 1. Générer un nonce UUID non rejouable
    const nonce     = crypto.randomUUID();  // ← UUID v4 aléatoire
    const timestamp = Math.floor(Date.now() / 1000);  // Unix timestamp en secondes

    // 2. Construire le contenu à signer (sans la signature elle-même)
    const messageContent = {
      payload,
      nonce,
      timestamp,
      version: this.PROTOCOL_VERSION,
    };

    // 3. Signer le JSON canonique (sérialisé de manière déterministe)
    const canonicalJson = this.canonicalize(messageContent);
    const signature     = await this.secureKey.sign(userId, canonicalJson);

    return {
      payload,
      nonce,
      timestamp,
      version: this.PROTOCOL_VERSION,
      signature,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // VÉRIFICATION LOCALE (pour debug — la vraie vérification est côté serveur)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Vérifie qu'un SignedMessage est localement valide.
   *
   * ATTENTION : cette vérification est indicative.
   * La vérification AUTHORITATIVE se fait dans la Cloud Function
   * qui vérifie également le nonce dans Firestore.
   */
  async verifyLocally(
    userId: string,
    msg: SignedMessage
  ): Promise<{ valid: boolean; reason?: string }> {
    // Vérifier le timestamp
    const now  = Math.floor(Date.now() / 1000);
    const diff = Math.abs(now - msg.timestamp);
    if (diff > this.TIMESTAMP_WINDOW_S) {
      return { valid: false, reason: `Message expiré (${diff}s > ${this.TIMESTAMP_WINDOW_S}s)` };
    }

    // Vérifier la version
    if (msg.version !== this.PROTOCOL_VERSION) {
      return { valid: false, reason: `Version invalide : ${msg.version}` };
    }

    // Vérifier la signature
    const messageContent = {
      payload:   msg.payload,
      nonce:     msg.nonce,
      timestamp: msg.timestamp,
      version:   msg.version,
    };
    const canonicalJson = this.canonicalize(messageContent);
    const sigValid      = await this.secureKey.verifyLocally(userId, canonicalJson, msg.signature);

    if (!sigValid) {
      return { valid: false, reason: 'Signature invalide' };
    }

    return { valid: true };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SÉRIALISATION CANONIQUE
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Sérialisation JSON canonique : clés triées alphabétiquement.
   *
   * Garantit que le même objet produit TOUJOURS le même JSON,
   * quelle que soit l'ordre d'insertion des propriétés.
   * Essentiel pour la vérification de signature.
   */
  private canonicalize(obj: unknown): string {
    if (obj === null || typeof obj !== 'object') {
      return JSON.stringify(obj);
    }

    if (Array.isArray(obj)) {
      return '[' + obj.map(v => this.canonicalize(v)).join(',') + ']';
    }

    const keys    = Object.keys(obj as object).sort();
    const entries = keys.map(k => {
      const val = (obj as Record<string, unknown>)[k];
      return JSON.stringify(k) + ':' + this.canonicalize(val);
    });
    return '{' + entries.join(',') + '}';
  }
}

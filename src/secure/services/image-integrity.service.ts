// src/secure/services/image-integrity.service.ts
//
// ══════════════════════════════════════════════════════════════════════════════
// IMAGE INTEGRITY SERVICE — Couche 4 : Hash de vérification pour le scoring IA
//
// Problème résolu :
//   Le scoring TensorFlow.js s'exécute dans le navigateur.
//   Un utilisateur avancé peut :
//   1. Modifier les résultats du score avant envoi
//   2. Envoyer une image différente de celle scorée
//
// Solution :
//   AVANT toute analyse TF.js, on calcule le hash SHA-256 de l'image brute.
//   Ce hash est signé et envoyé avec la preuve.
//
//   Côté Cloud Function :
//   - On re-télécharge l'image depuis son CID IPFS
//   - On recalcule le hash SHA-256 côté serveur
//   - Si hash différent → l'image a été modifiée → certification rejetée
//   - Le score IA reste un indicateur mais l'intégrité est cryptographiquement prouvée
//
// ══════════════════════════════════════════════════════════════════════════════

import { Injectable } from '@angular/core';

export interface ImageProof {
  /** Hash SHA-256 de l'image brute (ArrayBuffer) en hex */
  sha256Hex: string;

  /** Taille du fichier en octets */
  fileSizeBytes: number;

  /** Type MIME détecté */
  mimeType: string;

  /** Timestamp de calcul du hash (avant envoi) */
  hashedAt: number;
}

export interface ScoredImageProof extends ImageProof {
  /** Score TF.js (indicatif, non autoritatif) */
  aiScore: number;

  /** Catégorie détectée par TF.js */
  aiCategory: string;

  /** Avertissement : le score peut être faux, le hash est la preuve forte */
  scoreIsTrustLevel: 'indicative_only';
}

@Injectable({
  providedIn: 'root',
})
export class ImageIntegrityService {

  // ──────────────────────────────────────────────────────────────────────────
  // HASH DE L'IMAGE — à appeler AVANT toute analyse TF.js
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Calcule le hash SHA-256 d'un fichier image.
   *
   * CRITIQUE : cette méthode doit être appelée AVANT toute analyse IA
   * et avant tout redimensionnement ou compression de l'image.
   * Le hash doit refléter l'image ORIGINALE telle qu'uploadée par l'utilisateur.
   *
   * La Cloud Function re-calculera ce hash depuis IPFS et comparera.
   *
   * @param file — fichier image brut (avant traitement)
   * @returns ImageProof avec le hash SHA-256 en hex
   */
  async computeImageProof(file: File): Promise<ImageProof> {
    // Lire le fichier comme ArrayBuffer (octets bruts)
    const buffer = await this.fileToArrayBuffer(file);

    // Calculer SHA-256 via WebCrypto (natif, rapide, sûr)
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', buffer);
    const sha256Hex  = this.bufferToHex(hashBuffer);

    return {
      sha256Hex,
      fileSizeBytes: file.size,
      mimeType:      file.type || 'application/octet-stream',
      hashedAt:      Math.floor(Date.now() / 1000),
    };
  }

  /**
   * Calcule le hash ET exécute le scoring TF.js.
   *
   * Le hash est calculé sur l'image originale AVANT le scoring,
   * garantissant que l'image envoyée à IPFS correspond bien à celle scorée.
   *
   * @param file    — fichier image brut
   * @param scorer  — fonction de scoring TF.js (fournie par l'appelant)
   */
  async computeProofAndScore(
    file: File,
    scorer: (file: File) => Promise<{ score: number; category: string }>
  ): Promise<ScoredImageProof> {
    // 1. Hash en PREMIER — avant tout traitement
    const proof = await this.computeImageProof(file);

    // 2. Scoring APRÈS le hash (le score peut être manipulé, pas le hash)
    let aiScore    = 0;
    let aiCategory = 'unknown';
    try {
      const result = await scorer(file);
      aiScore      = result.score;
      aiCategory   = result.category;
    } catch (error) {
      console.warn('[ImageIntegrity] Erreur scoring TF.js :', error);
      // Ne pas bloquer — le hash reste valide même si le score échoue
    }

    return {
      ...proof,
      aiScore,
      aiCategory,
      scoreIsTrustLevel: 'indicative_only', // ← rappel explicite dans le payload
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // VÉRIFICATION LOCALE (pour debug)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Vérifie qu'un fichier correspond à un hash attendu.
   * Utile pour vérifier côté client avant envoi.
   */
  async verifyFileHash(file: File, expectedHex: string): Promise<boolean> {
    const proof = await this.computeImageProof(file);
    return proof.sha256Hex === expectedHex;
  }

  /**
   * Calcule le hash d'une image depuis une URL distante (IPFS gateway).
   * Mimique ce que fait la Cloud Function côté serveur.
   *
   * USAGE : tests et debug uniquement.
   * La vérification authoritative se fait dans la Cloud Function.
   */
  async hashFromUrl(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Erreur fetch image : ${response.status} ${response.statusText}`);
    }
    const buffer     = await response.arrayBuffer();
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', buffer);
    return this.bufferToHex(hashBuffer);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // UTILITAIRES
  // ──────────────────────────────────────────────────────────────────────────

  private fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  private bufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}

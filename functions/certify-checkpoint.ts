// functions/src/certify-checkpoint.ts
//
// ══════════════════════════════════════════════════════════════════════════════
// CLOUD FUNCTION : certifyCheckpoint
// Couches 2, 3 et 4 — Validation serveur complète
//
// Cette Cloud Function est le gardien unique de la certification.
// Le client Angular n'est qu'une interface — toute logique de sécurité
// est ici, côté serveur, hors de portée du code JavaScript du navigateur.
//
// COUCHE 2 — Validation serveur :
//   - Authentification Firebase obligatoire
//   - Validation des entrées (regex, plages)
//   - Vérification ECDSA de la signature avec la clé publique Firestore
//   - Rate limiting (1 checkpoint / 60s par produit)
//   - Écriture atomique avec audit trail
//
// COUCHE 3 — Nonce anti-rejeu :
//   - Vérification que le nonce n'a pas déjà été utilisé (used_nonces)
//   - Fenêtre de timestamp ± 5 minutes
//   - Marquage du nonce comme consommé après usage
//
// COUCHE 4 — Hash de vérification image :
//   - Re-téléchargement de l'image depuis IPFS
//   - Recalcul SHA-256 côté serveur
//   - Comparaison avec le hash soumis par le client
//
// ══════════════════════════════════════════════════════════════════════════════

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import * as https from 'https';
import { onCall } from 'firebase-functions/v2/https';
// ── Initialisation Firebase Admin (une seule fois dans index.ts normalement)
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// ────────────────────────────────────────────────────────────────────────────
// INTERFACES
// ────────────────────────────────────────────────────────────────────────────

interface CheckpointPayload {
  productId: string;
  certificationId: string;
  proofHash: string; // Hash SHA-256 de l'image en hex (64 chars)
  ipfsCID: string; // CID IPFS de l'image uploadée
  checkpointIndex: number; // Index du checkpoint (0 à N-1)
  aiScore?: number; // Score TF.js (indicatif uniquement)
  imageHashHex: string; // Hash SHA-256 de l'image brute pour vérification
}

interface SignedRequest {
  payload: CheckpointPayload;
  nonce: string; // UUID v4 — consommé une seule fois
  timestamp: number; // Unix timestamp en secondes
  version: string; // '2.0'
  signature: string; // Signature ECDSA-P256 en base64
}

// ────────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ────────────────────────────────────────────────────────────────────────────

const TIMESTAMP_WINDOW_S = 300; // ±5 minutes
const RATE_LIMIT_MS = 60_000; // 60 secondes entre checkpoints
const NONCE_TTL_S = 600; // 10 minutes — durée de vie du nonce consommé
const IPFS_GATEWAY = 'https://gateway.pinata.cloud/ipfs/';
const PROTOCOL_VERSION = '2.0';

// ────────────────────────────────────────────────────────────────────────────
// CLOUD FUNCTION PRINCIPALE
// ────────────────────────────────────────────────────────────────────────────

export const certifyCheckpoint = onCall(async (request) => {
  const data = request.data as SignedRequest;
  const context = request;

  // ── 1. AUTHENTIFICATION OBLIGATOIRE ──────────────────────────────────────
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Vous devez être connecté pour certifier un checkpoint.',
    );
  }
  const userId = context.auth.uid;

  // ── 2. VALIDATION DE LA STRUCTURE ─────────────────────────────────────────
  validateRequestStructure(data);

  // ── 3. COUCHE 3 — Vérification du nonce (anti-rejeu) ──────────────────────
  await verifyAndConsumeNonce(data.nonce, data.timestamp);

  // ── 4. COUCHE 2 — Récupérer la clé publique de l'utilisateur ──────────────
  const publicKeyB64 = await getUserPublicKey(userId);

  // ── 5. COUCHE 2 — Vérifier la signature ECDSA côté serveur ────────────────
  const messageContent = {
    payload: data.payload,
    nonce: data.nonce,
    timestamp: data.timestamp,
    version: data.version,
  };
  await verifyECDSASignature(messageContent, data.signature, publicKeyB64);

  // ── 6. COUCHE 2 — Vérifier l'appartenance du produit ──────────────────────
  const product = await verifyProductOwnership(
    data.payload.productId,
    data.payload.certificationId,
    userId,
  );

  // ── 7. COUCHE 2 — Validation des données métier ────────────────────────────
  validateCheckpointData(data.payload);

  // ── 8. COUCHE 2 — Rate limiting ────────────────────────────────────────────
  await enforceRateLimit(data.payload.productId);

  // ── 9. COUCHE 4 — Vérifier l'intégrité de l'image depuis IPFS ─────────────
  const imageVerified = await verifyImageIntegrity(
    data.payload.ipfsCID,
    data.payload.imageHashHex,
  );
  if (!imageVerified) {
    await logSecurityEvent(userId, 'IMAGE_HASH_MISMATCH', data.payload);
    throw new functions.https.HttpsError(
      'data-loss',
      "Intégrité de l'image compromise. Le hash ne correspond pas à l'image IPFS.",
    );
  }

  // ── 10. COUCHE 2 — Écriture atomique sécurisée ────────────────────────────
  await db.runTransaction(async (tx) => {
    const certRef = db.doc(`certifications/${data.payload.certificationId}`);
    const certDoc = await tx.get(certRef);

    if (!certDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Certification introuvable.',
      );
    }

    const certData = certDoc.data()!;
    const checkpoints: any[] = certData['checkpoints'] || [];
    const idx = data.payload.checkpointIndex;

    if (idx < 0 || idx >= checkpoints.length) {
      throw new functions.https.HttpsError(
        'out-of-range',
        `Index ${idx} hors des limites (0..${checkpoints.length - 1})`,
      );
    }

    if (checkpoints[idx]?.completed) {
      throw new functions.https.HttpsError(
        'already-exists',
        'Ce checkpoint est déjà certifié.',
      );
    }

    // Mettre à jour le checkpoint
    checkpoints[idx] = {
      ...checkpoints[idx],
      completed: true,
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      proofHash: data.payload.proofHash,
      ipfsCID: data.payload.ipfsCID,
      imageHashHex: data.payload.imageHashHex, // ← hash vérifié côté serveur
      aiScore: data.payload.aiScore ?? null,
      serverVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    tx.update(certRef, {
      checkpoints,
      lastCertificationAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Audit trail immuable (append-only, protégé par Rules)
    tx.create(db.collection('audit_logs').doc(), {
      actorId: userId,
      action: 'CHECKPOINT_CERTIFIED',
      severity: 'info',
      description: `Checkpoint #${idx} certifié pour le produit ${data.payload.productId}`,
      targetId: data.payload.certificationId,
      targetType: 'certification',
      metadata: {
        checkpointIndex: idx,
        proofHash: data.payload.proofHash,
        ipfsCID: data.payload.ipfsCID,
        imageVerified: true,
        aiScore: data.payload.aiScore ?? null,
        nonce: data.nonce, // ← traçabilité anti-rejeu
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  return {
    success: true,
    certifiedAt: new Date().toISOString(),
    imageVerified: true,
  };
});

// ────────────────────────────────────────────────────────────────────────────
// COUCHE 3 — NONCE ANTI-REJEU
// ────────────────────────────────────────────────────────────────────────────

/**
 * Vérifie que :
 * 1. Le timestamp est dans la fenêtre ±5 minutes
 * 2. Le nonce n'a pas déjà été utilisé (Firestore)
 * 3. Marque le nonce comme consommé (TTL 10 minutes)
 *
 * Cette vérification doit être la PREMIÈRE après l'authentification
 * pour éviter tout traitement inutile sur les replays.
 */
async function verifyAndConsumeNonce(
  nonce: string,
  timestamp: number,
): Promise<void> {
  // 3a. Vérifier le timestamp
  const nowS = Math.floor(Date.now() / 1000);
  const diff = Math.abs(nowS - timestamp);
  if (diff > TIMESTAMP_WINDOW_S) {
    throw new functions.https.HttpsError(
      'deadline-exceeded',
      `Message expiré : ${diff}s hors de la fenêtre de ${TIMESTAMP_WINDOW_S}s.`,
    );
  }

  // 3b. Valider le format du nonce (UUID v4)
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(nonce)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Format de nonce invalide.',
    );
  }

  // 3c. Vérifier que le nonce n'a pas déjà été utilisé
  const nonceRef = db.doc(`used_nonces/${nonce}`);
  const nonceDoc = await nonceRef.get();

  if (nonceDoc.exists) {
    // ← REPLAY ATTACK DÉTECTÉE
    throw new functions.https.HttpsError(
      'already-exists',
      'Nonce déjà utilisé. Rejeu de message détecté.',
    );
  }

  // 3d. Marquer le nonce comme consommé
  //     TTL 10 minutes : après ça, le nonce peut être supprimé (cleanup job)
  await nonceRef.set({
    usedAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: new Date(Date.now() + NONCE_TTL_S * 1000),
  });
}

// ────────────────────────────────────────────────────────────────────────────
// COUCHE 2 — VÉRIFICATION ECDSA CÔTÉ SERVEUR
// ────────────────────────────────────────────────────────────────────────────

/**
 * Vérifie la signature ECDSA-P256 côté serveur avec la clé publique Firestore.
 *
 * Utilise le module 'crypto' de Node.js (pas WebCrypto navigateur).
 * La clé publique est lue depuis Firestore — jamais fournie par le client.
 */
async function verifyECDSASignature(
  messageContent: object,
  signatureB64: string,
  publicKeyB64: string,
): Promise<void> {
  try {
    // Sérialisation canonique (clés triées — même algo que le client)
    const canonicalJson = canonicalize(messageContent);

    // Importer la clé publique (format raw P-256 en base64)
    const publicKeyRaw = Buffer.from(publicKeyB64, 'base64');

    // Créer le KeyObject depuis les bytes bruts de la clé publique P-256
    const publicKeyObj = crypto.createPublicKey({
      key: publicKeyRaw,
      format: 'der',
      type: 'spki',
    });

    const verify = crypto.createVerify('SHA256');
    const msgBuffer = Buffer.from(canonicalJson, 'utf-8');
    verify.update(msgBuffer);

    const sigBuffer = Buffer.from(signatureB64, 'base64');
    const isValid = verify.verify(publicKeyObj, sigBuffer);

    if (!isValid) {
      throw new Error('Signature invalide');
    }
  } catch (error: any) {
    throw new functions.https.HttpsError(
      'permission-denied',
      `Signature ECDSA invalide : ${error.message}`,
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// COUCHE 4 — VÉRIFICATION HASH IMAGE DEPUIS IPFS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Télécharge l'image depuis IPFS et recalcule son hash SHA-256.
 * Compare avec le hash soumis par le client.
 *
 * Si le hash diffère : l'image a été modifiée après calcul du hash côté client.
 * Cela signifie que le client a soumis une image différente de celle qu'il
 * a hashée — manipulation détectée.
 */
async function verifyImageIntegrity(
  ipfsCID: string,
  claimedHashHex: string,
): Promise<boolean> {
  try {
    const url = `${IPFS_GATEWAY}${ipfsCID}`;
    const buffer = await fetchUrl(url);

    // Recalculer le hash SHA-256 côté serveur
    const serverHash = crypto.createHash('sha256').update(buffer).digest('hex');

    const match = serverHash === claimedHashHex;
    if (!match) {
      console.error(
        `[certifyCheckpoint] Hash mismatch:\n  client: ${claimedHashHex}\n  server: ${serverHash}`,
      );
    }
    return match;
  } catch (error) {
    console.error(
      '[certifyCheckpoint] Erreur vérification image IPFS :',
      error,
    );
    // En cas d'erreur réseau IPFS, on rejette par précaution
    throw new functions.https.HttpsError(
      'unavailable',
      "Impossible de vérifier l'intégrité de l'image depuis IPFS.",
    );
  }
}

/** Télécharge une URL et retourne le Buffer complet. */
function fetchUrl(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} pour ${url}`));
          return;
        }
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

// ────────────────────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────────────────────

async function getUserPublicKey(userId: string): Promise<string> {
  const doc = await db.doc(`user_keys/${userId}`).get();
  if (!doc.exists) {
    throw new functions.https.HttpsError(
      'not-found',
      'Clé publique introuvable. Régénérez vos clés.',
    );
  }
  const publicKey = doc.data()!['publicKey'];
  if (!publicKey || typeof publicKey !== 'string') {
    throw new functions.https.HttpsError(
      'internal',
      'Clé publique malformée en base de données.',
    );
  }
  return publicKey;
}

async function verifyProductOwnership(
  productId: string,
  certificationId: string,
  userId: string,
): Promise<any> {
  const productDoc = await db.doc(`products/${productId}`).get();
  if (!productDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Produit introuvable.');
  }

  const product = productDoc.data()!;
  if (product['producerId'] !== userId) {
    throw new functions.https.HttpsError(
      'permission-denied',
      "Vous n'êtes pas le propriétaire de ce produit.",
    );
  }

  return product;
}

async function enforceRateLimit(productId: string): Promise<void> {
  const productDoc = await db.doc(`products/${productId}`).get();
  if (!productDoc.exists) return;

  const lastCert = productDoc.data()!['lastCertificationAt'];
  if (!lastCert) return;

  const lastMs = lastCert.toDate?.()?.getTime() ?? 0;
  const elapsed = Date.now() - lastMs;

  if (elapsed < RATE_LIMIT_MS) {
    const waitS = Math.ceil((RATE_LIMIT_MS - elapsed) / 1000);
    throw new functions.https.HttpsError(
      'resource-exhausted',
      `Trop fréquent. Attendez encore ${waitS}s avant le prochain checkpoint.`,
    );
  }
}

function validateRequestStructure(data: SignedRequest): void {
  if (!data?.payload || !data.nonce || !data.timestamp || !data.signature) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Structure de requête invalide : payload, nonce, timestamp et signature sont requis.',
    );
  }
  if (data.version !== PROTOCOL_VERSION) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      `Version de protocole invalide : ${data.version}. Attendu : ${PROTOCOL_VERSION}.`,
    );
  }
}

function validateCheckpointData(payload: CheckpointPayload): void {
  // Hash SHA-256 : 64 caractères hexadécimaux
  if (!/^[a-f0-9]{64}$/i.test(payload.proofHash)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'proofHash invalide.',
    );
  }
  if (!/^[a-f0-9]{64}$/i.test(payload.imageHashHex)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'imageHashHex invalide.',
    );
  }
  // CID IPFS : commence par Qm (v1) ou bafy (v2)
  if (!/^(Qm[1-9A-Za-z]{44}|bafy[a-z0-9]{52})/.test(payload.ipfsCID)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'CID IPFS invalide.',
    );
  }
  if (payload.checkpointIndex < 0 || payload.checkpointIndex > 20) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'checkpointIndex hors limites.',
    );
  }
  if (
    payload.aiScore !== undefined &&
    (payload.aiScore < 0 || payload.aiScore > 100)
  ) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'aiScore hors de [0, 100].',
    );
  }
}

async function logSecurityEvent(
  userId: string,
  event: string,
  metadata: any,
): Promise<void> {
  try {
    await db.collection('audit_logs').add({
      actorId: userId,
      action: 'tampering_detected',
      severity: 'critical',
      description: `🚨 Événement de sécurité : ${event} pour utilisateur ${userId.substring(0, 8)}…`,
      metadata: { event, ...metadata },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.error('[certifyCheckpoint] Erreur log sécurité :', e);
  }
}

/** Sérialisation JSON canonique (clés triées) — identique au client Angular. */
function canonicalize(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalize).join(',') + ']';
  const keys = Object.keys(obj as object).sort();
  const entries = keys.map((k) => {
    const val = (obj as Record<string, unknown>)[k];
    return JSON.stringify(k) + ':' + canonicalize(val);
  });
  return '{' + entries.join(',') + '}';
}

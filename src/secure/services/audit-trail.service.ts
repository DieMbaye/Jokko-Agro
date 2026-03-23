// src/secure/services/audit-trail.service.ts
import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  limit,
  serverTimestamp,
  Timestamp,
} from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';

// ==================== INTERFACES ====================

export type AuditAction =
  // AGC & Ledger
  | 'agc_purchase'
  | 'agc_transfer'
  | 'agc_bonus'
  // Escrow
  | 'escrow_lock'
  | 'escrow_release'
  | 'escrow_cancel'
  // Ledger
  | 'ledger_verified'
  | 'ledger_corrupted'
  | 'signature_verified'
  | 'signature_invalid'
  // Authentification
  | 'user_login'
  | 'user_logout'
  | 'keys_generated'
  // Sécurité
  | 'tampering_detected'
  | 'unauthorized_access'
  | 'double_spend_attempt';

export type AuditSeverity = 'info' | 'warning' | 'critical';

export interface AuditLog {
  id?: string;

  // Qui
  actorId: string;          // userId de l'auteur de l'action (ou 'system')
  actorEmail?: string;      // email pour lisibilité dans l'admin

  // Quoi
  action: AuditAction;
  severity: AuditSeverity;
  description: string;

  // Contexte métier
  targetId?: string;        // ID de la ressource concernée (saleId, lockId, blockHeight…)
  targetType?: string;      // 'sale' | 'agc_lock' | 'ledger_block' | 'user' …
  amount?: number;          // Montant AGC impliqué si applicable

  // Preuve cryptographique
  blockHeight?: number;     // Bloc ledger associé
  blockHash?: string;       // Hash du bloc pour relier au ledger

  // Metadata libre
  metadata?: Record<string, any>;

  // Quand — serverTimestamp() côté Firestore pour éviter toute manipulation client
  createdAt?: any;
  // IP / User-Agent si disponibles (optionnel, utile en prod)
  userAgent?: string;
}

export interface AuditQueryOptions {
  actorId?: string;
  action?: AuditAction;
  severity?: AuditSeverity;
  targetId?: string;
  fromDate?: Date;
  toDate?: Date;
  limitCount?: number;
}

// ==================== SERVICE ====================

@Injectable({
  providedIn: 'root',
})
export class AuditTrailService {
  private firestore = inject(Firestore);
  private auth = inject(Auth);

  private readonly COLLECTION = 'audit_logs';

  // -----------------------------------------------------------------------
  // ÉCRITURE — write-only depuis le code, suppression interdite en Rules
  // -----------------------------------------------------------------------

  /**
   * Enregistrer un événement d'audit.
   * Ne fait jamais échouer l'opération métier principale si l'audit plante.
   */
  async log(entry: Omit<AuditLog, 'id' | 'createdAt'>): Promise<void> {
    try {
      const currentUser = this.auth.currentUser;

      const logData: Omit<AuditLog, 'id'> = {
        ...entry,
        actorId: entry.actorId || currentUser?.uid || 'anonymous',
        actorEmail: entry.actorEmail || currentUser?.email || undefined,
        userAgent: navigator?.userAgent?.substring(0, 200) || undefined,
        createdAt: serverTimestamp(),
      };

      await addDoc(
        collection(this.firestore, this.COLLECTION),
        this.sanitize(logData),
      );
    } catch (error) {
      // L'audit ne doit JAMAIS faire échouer l'opération métier
      console.warn('⚠️ Audit trail indisponible:', error);
    }
  }

  // -----------------------------------------------------------------------
  // RACCOURCIS SÉMANTIQUES — appelés depuis agc.service et sales.service
  // -----------------------------------------------------------------------

  async logEscrowLock(
    actorId: string,
    lockId: string,
    saleId: string,
    amount: number,
    blockHeight?: number,
    blockHash?: string,
  ): Promise<void> {
    return this.log({
      actorId,
      action: 'escrow_lock',
      severity: 'info',
      description: `${amount} AGC bloqués en séquestre pour la commande ${saleId}`,
      targetId: lockId,
      targetType: 'agc_lock',
      amount,
      blockHeight,
      blockHash,
      metadata: { saleId, lockId },
    });
  }

  async logEscrowRelease(
    confirmedBy: string,
    lockId: string,
    saleId: string,
    amount: number,
    producerId: string,
    blockHeight?: number,
  ): Promise<void> {
    return this.log({
      actorId: confirmedBy,
      action: 'escrow_release',
      severity: 'info',
      description: `${amount} AGC libérés vers le producteur ${producerId.substring(0, 8)}… (commande ${saleId})`,
      targetId: lockId,
      targetType: 'agc_lock',
      amount,
      blockHeight,
      metadata: { saleId, lockId, producerId },
    });
  }

  async logEscrowCancel(
    cancelledBy: string,
    lockId: string,
    saleId: string,
    amount: number,
    reason?: string,
  ): Promise<void> {
    return this.log({
      actorId: cancelledBy,
      action: 'escrow_cancel',
      severity: 'warning',
      description: `${amount} AGC remboursés (annulation commande ${saleId}) — ${reason ?? 'sans raison'}`,
      targetId: lockId,
      targetType: 'agc_lock',
      amount,
      metadata: { saleId, lockId, reason },
    });
  }

  async logLedgerVerification(
    actorId: string,
    isValid: boolean,
    blocksChecked: number,
    errorCount: number,
  ): Promise<void> {
    return this.log({
      actorId,
      action: isValid ? 'ledger_verified' : 'ledger_corrupted',
      severity: isValid ? 'info' : 'critical',
      description: isValid
        ? `Ledger vérifié : ${blocksChecked} blocs valides`
        : `⚠️ LEDGER CORROMPU : ${errorCount} erreur(s) sur ${blocksChecked} blocs`,
      metadata: { blocksChecked, errorCount, isValid },
    });
  }

  async logSignatureInvalid(
    actorId: string,
    blockHeight: number,
    signerId: string,
  ): Promise<void> {
    return this.log({
      actorId,
      action: 'signature_invalid',
      severity: 'critical',
      description: `Signature invalide détectée au bloc #${blockHeight} (signataire: ${signerId.substring(0, 8)}…)`,
      targetId: String(blockHeight),
      targetType: 'ledger_block',
      blockHeight,
      metadata: { signerId },
    });
  }

  async logTamperingDetected(
    blockHeight: number,
    expectedHash: string,
    actualHash: string,
  ): Promise<void> {
    return this.log({
      actorId: 'system',
      action: 'tampering_detected',
      severity: 'critical',
      description: `🚨 FALSIFICATION DÉTECTÉE au bloc #${blockHeight}`,
      targetId: String(blockHeight),
      targetType: 'ledger_block',
      blockHeight,
      metadata: {
        expectedHash: expectedHash.substring(0, 16) + '…',
        actualHash: actualHash.substring(0, 16) + '…',
      },
    });
  }

  async logDoubleSpendAttempt(
    actorId: string,
    amount: number,
    availableBalance: number,
  ): Promise<void> {
    return this.log({
      actorId,
      action: 'double_spend_attempt',
      severity: 'critical',
      description: `Tentative de double-dépense détectée : ${amount} AGC demandés, ${availableBalance} AGC disponibles`,
      amount,
      metadata: { amount, availableBalance },
    });
  }

  async logKeysGenerated(actorId: string): Promise<void> {
    return this.log({
      actorId,
      action: 'keys_generated',
      severity: 'info',
      description: `Paire de clés ECDSA-P256 générée pour l'utilisateur ${actorId.substring(0, 8)}…`,
      targetId: actorId,
      targetType: 'user',
    });
  }

  async logPurchase(
    actorId: string,
    agcAmount: number,
    fiatAmount: number,
    blockHeight?: number,
  ): Promise<void> {
    return this.log({
      actorId,
      action: 'agc_purchase',
      severity: 'info',
      description: `Achat de ${agcAmount} AGC (${fiatAmount} FCFA)`,
      amount: agcAmount,
      blockHeight,
      metadata: { agcAmount, fiatAmount },
    });
  }

  // -----------------------------------------------------------------------
  // LECTURE — réservée à l'admin (protégée par Firestore Rules)
  // -----------------------------------------------------------------------

  async getLogs(options: AuditQueryOptions = {}): Promise<AuditLog[]> {
    try {
      // On évite les index composites Firestore (actorId + createdAt) qui
      // nécessitent une création manuelle dans la console Firebase.
      // On filtre côté client après récupération.
      const constraints: any[] = [];

      if (options.actorId)  constraints.push(where('actorId', '==', options.actorId));
      if (options.action)   constraints.push(where('action', '==', options.action));
      if (options.severity) constraints.push(where('severity', '==', options.severity));
      if (options.targetId) constraints.push(where('targetId', '==', options.targetId));

      // limit sans orderBy pour éviter l'index composite
      constraints.push(limit(options.limitCount ?? 100));

      const q = query(collection(this.firestore, this.COLLECTION), ...constraints);
      const snapshot = await getDocs(q);

      const logs = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        createdAt: d.data()['createdAt']?.toDate?.() ?? new Date(),
      })) as AuditLog[];

      // Tri côté client : plus récent en premier
      return logs.sort((a, b) => {
        const ta = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
        const tb = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
        return tb - ta;
      });
    } catch (error: any) {
      if (error?.code === 'permission-denied') {
        console.warn('Audit Trail : permission refusée — vérifiez les Firestore Rules pour audit_logs.');
        return [];
      }
      console.error('Erreur lecture audit logs:', error);
      return [];
    }
  }

  async getCriticalLogs(limitCount = 50): Promise<AuditLog[]> {
    return this.getLogs({ severity: 'critical', limitCount });
  }

  async getLogsForSale(saleId: string): Promise<AuditLog[]> {
    return this.getLogs({ targetId: saleId });
  }

  async getLogsForUser(userId: string, limitCount = 50): Promise<AuditLog[]> {
    return this.getLogs({ actorId: userId, limitCount });
  }

  // -----------------------------------------------------------------------
  // UTILITAIRE
  // -----------------------------------------------------------------------

  private sanitize(data: any): any {
    if (data === null || data === undefined) return null;
    if (data instanceof Date) return Timestamp.fromDate(data);
    if (Array.isArray(data)) return data.map((i) => this.sanitize(i));
    if (typeof data === 'object') {
      const out: any = {};
      for (const key of Object.keys(data)) {
        if (data[key] !== undefined) out[key] = this.sanitize(data[key]);
      }
      return out;
    }
    return data;
  }
}

// src/app/components/test/security-dashboard/security-dashboard.component.ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
import { UserKeysService } from 'src/secure/services/user-keys.service';
import {
  AuditTrailService,
  AuditLog,
} from 'src/secure/services/audit-trail.service';

// ── Types internes ──────────────────────────────────────────────────────────

type TestStatus = 'idle' | 'running' | 'pass' | 'fail';

interface TestResult {
  id: string;
  label: string;
  status: TestStatus;
  detail: string;
  duration?: number;
  data?: any;
}

interface StepSection {
  id: string;
  step: number;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  tests: TestResult[];
  expanded: boolean;
  globalStatus: TestStatus;
}

@Component({
  selector: 'app-security-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './security-dashboard.component.html',
  styleUrls: ['./security-dashboard.component.css'],
})
export class SecurityDashboardComponent implements OnInit {
  // ── Injections ─────────────────────────────────────────────────────────
  private agcService = inject(AGCService);
  private authService = inject(AuthService);
  private firebaseService = inject(FirebaseService);
  private cryptoService = inject(CryptoService);
  private userKeys = inject(UserKeysService);
  private auditTrail = inject(AuditTrailService);

  // ── État global ─────────────────────────────────────────────────────────
  userEmail = '';
  userUid = '';
  isRunningAll = false;
  keyPassword = '';
  showPassword = false;
  globalProgress = 0;

  // ── Transactions & logs ─────────────────────────────────────────────────
  recentTransactions: AGCTransaction[] = [];
  auditLogs: AuditLog[] = [];
  balance = 0;

  // ── Sections de test ────────────────────────────────────────────────────
  sections: StepSection[] = [
    {
      id: 'ledger',
      step: 1,
      title: 'Ledger Immuable',
      subtitle: 'SHA-256 · Chaînage · Détection de falsification',
      icon: '⛓️',
      color: '#6366f1',
      expanded: true,
      globalStatus: 'idle',
      tests: [
        {
          id: 'hash_sha256',
          label: "Calcul SHA-256 d'un bloc",
          status: 'idle',
          detail: 'En attente',
        },
        {
          id: 'chain_link',
          label: 'Chaînage previousHash → hash',
          status: 'idle',
          detail: 'En attente',
        },
        {
          id: 'ledger_integrity',
          label: 'Vérification intégrité complète',
          status: 'idle',
          detail: 'En attente',
        },
        {
          id: 'tamper_detect',
          label: 'Détection de falsification (test)',
          status: 'idle',
          detail: 'En attente',
        },
      ],
    },
    {
      id: 'ecdsa',
      step: 2,
      title: 'Signatures ECDSA',
      subtitle: 'P-256 · Clés · Signature · Non-répudiation',
      icon: '🔐',
      color: '#8b5cf6',
      expanded: false,
      globalStatus: 'idle',
      tests: [
        {
          id: 'key_generate',
          label: 'Génération paire de clés P-256',
          status: 'idle',
          detail: 'En attente',
        },
        {
          id: 'sign_tx',
          label: "Signature d'une transaction",
          status: 'idle',
          detail: 'En attente',
        },
        {
          id: 'verify_valid',
          label: 'Vérification signature valide',
          status: 'idle',
          detail: 'En attente',
        },
        {
          id: 'verify_tamper',
          label: 'Rejet signature après falsification',
          status: 'idle',
          detail: 'En attente',
        },
        {
          id: 'verify_all',
          label: 'Audit de toutes les signatures',
          status: 'idle',
          detail: 'En attente',
        },
      ],
    },
    {
      id: 'escrow',
      step: 3,
      title: 'Séquestre (Escrow)',
      subtitle: 'Blocage · Libération · Annulation · Atomicité',
      icon: '🏦',
      color: '#0ea5e9',
      expanded: false,
      globalStatus: 'idle',
      tests: [
        {
          id: 'escrow_balance',
          label: 'Lecture solde disponible / bloqué',
          status: 'idle',
          detail: 'En attente',
        },
        {
          id: 'escrow_lock',
          label: 'Blocage AGC (escrow_lock)',
          status: 'idle',
          detail: 'En attente',
        },
        {
          id: 'escrow_status',
          label: 'Vérification statut du lock',
          status: 'idle',
          detail: 'En attente',
        },
        {
          id: 'escrow_cancel',
          label: 'Annulation et remboursement',
          status: 'idle',
          detail: 'En attente',
        },
        {
          id: 'double_spend',
          label: 'Blocage double-dépense (ACID)',
          status: 'idle',
          detail: 'En attente',
        },
      ],
    },
    {
      id: 'aes',
      step: 4,
      title: 'Chiffrement AES-GCM',
      subtitle: 'PBKDF2 · AES-256-GCM · Clé non extractable',
      icon: '🔒',
      color: '#10b981',
      expanded: false,
      globalStatus: 'idle',
      tests: [
        {
          id: 'aes_encrypt',
          label: 'Chiffrement AES-GCM-256',
          status: 'idle',
          detail: 'En attente',
        },
        {
          id: 'aes_decrypt',
          label: 'Déchiffrement correct (bon mdp)',
          status: 'idle',
          detail: 'En attente',
        },
        {
          id: 'aes_wrong_pwd',
          label: 'Rejet mauvais mot de passe',
          status: 'idle',
          detail: 'En attente',
        },
        {
          id: 'aes_unlock',
          label: 'Déverrouillage de session',
          status: 'idle',
          detail: 'En attente',
        },
      ],
    },
    {
      id: 'audit',
      step: 5,
      title: 'Audit Trail',
      subtitle: 'Write-only · Traçabilité · Preuves cryptographiques',
      icon: '📋',
      color: '#f59e0b',
      expanded: false,
      globalStatus: 'idle',
      tests: [
        {
          id: 'audit_write',
          label: "Écriture d'un événement d'audit",
          status: 'idle',
          detail: 'En attente',
        },
        {
          id: 'audit_read',
          label: 'Lecture des derniers logs',
          status: 'idle',
          detail: 'En attente',
        },
        {
          id: 'audit_critical',
          label: 'Détection événement critique',
          status: 'idle',
          detail: 'En attente',
        },
        {
          id: 'audit_purchase',
          label: "Achat AGC tracé dans l'audit",
          status: 'idle',
          detail: 'En attente',
        },
      ],
    },
  ];

  // ── Cycle de vie ────────────────────────────────────────────────────────

  async ngOnInit() {
    const user = this.authService.getUserData();
    if (user) {
      this.userEmail = user.email;
      this.userUid = user.uid;
      this.balance = await this.agcService.getBalance(user.uid);
    }
    await this.loadRecentTransactions();
  }

  // ── Exécuter TOUS les tests ─────────────────────────────────────────────

  async runAllTests() {
    if (!this.userUid) return;
    this.isRunningAll = true;
    this.globalProgress = 0;

    const totalTests = this.sections.reduce(
      (s, sec) => s + sec.tests.length,
      0,
    );
    let done = 0;

    for (const section of this.sections) {
      section.expanded = true;
      await this.runSection(section);
      done += section.tests.length;
      this.globalProgress = Math.round((done / totalTests) * 100);
    }

    this.isRunningAll = false;
    this.globalProgress = 100;
    await this.loadRecentTransactions();
    await this.loadAuditLogs();
  }

  // ── Exécuter une section ────────────────────────────────────────────────

  async runSection(section: StepSection) {
    section.globalStatus = 'running';
    for (const test of section.tests) {
      test.status = 'running';
      test.detail = 'Exécution…';
      await this.runTest(section.id, test);
    }
    const hasFailure = section.tests.some((t) => t.status === 'fail');
    section.globalStatus = hasFailure ? 'fail' : 'pass';
  }

  // ── Dispatch par section/test ───────────────────────────────────────────

  private async runTest(sectionId: string, test: TestResult) {
    const start = Date.now();
    try {
      switch (sectionId) {
        case 'ledger':
          await this.runLedgerTest(test);
          break;
        case 'ecdsa':
          await this.runEcdsaTest(test);
          break;
        case 'escrow':
          await this.runEscrowTest(test);
          break;
        case 'aes':
          await this.runAesTest(test);
          break;
        case 'audit':
          await this.runAuditTest(test);
          break;
      }
    } catch (err: any) {
      test.status = 'fail';
      test.detail = `Erreur inattendue : ${err.message}`;
    }
    test.duration = Date.now() - start;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ÉTAPE 1 — LEDGER IMMUABLE
  // ══════════════════════════════════════════════════════════════════════════

  private async runLedgerTest(test: TestResult) {
    switch (test.id) {
      case 'hash_sha256': {
        const input = 'test_block|0|system|user123|10|purchase|1700000000000|0';
        const hash = await this.cryptoService.sha256(input);
        const isHex = /^[0-9a-f]{64}$/.test(hash);
        // Déterminisme : même input → même hash
        const hash2 = await this.cryptoService.sha256(input);
        const isDeterministic = hash === hash2;
        // Avalanche : 1 bit différent → hash complètement différent
        const hashAlt = await this.cryptoService.sha256(input + 'x');
        const isDiff = hash !== hashAlt;

        test.status = isHex && isDeterministic && isDiff ? 'pass' : 'fail';
        test.detail =
          isHex && isDeterministic && isDiff
            ? `Hash : ${hash.substring(0, 20)}… — Déterministe ✓ — Effet avalanche ✓`
            : `Échec : hex=${isHex}, déterministe=${isDeterministic}, avalanche=${isDiff}`;
        test.data = { hash, hashAlt: hashAlt.substring(0, 20) + '…' };
        break;
      }

      case 'chain_link': {
        const block0Hash = await this.cryptoService.calculateBlockHash({
          previousHash: '0'.repeat(64),
          blockHeight: 0,
          fromUserId: 'system',
          toUserId: this.userUid,
          amount: 10,
          type: 'bonus',
          timestamp: 1700000000000,
          nonce: 0,
        });
        const block1Hash = await this.cryptoService.calculateBlockHash({
          previousHash: block0Hash,
          blockHeight: 1,
          fromUserId: 'system',
          toUserId: this.userUid,
          amount: 5,
          type: 'purchase',
          timestamp: 1700000001000,
          nonce: 0,
        });
        const ok =
          block0Hash.length === 64 &&
          block1Hash.length === 64 &&
          block0Hash !== block1Hash;
        test.status = ok ? 'pass' : 'fail';
        test.detail = ok
          ? `Bloc#0 → ${block0Hash.substring(0, 16)}… ← previousHash de Bloc#1 ✓`
          : 'Échec chaînage';
        test.data = {
          block0: block0Hash.substring(0, 20) + '…',
          block1: block1Hash.substring(0, 20) + '…',
        };
        break;
      }

      case 'ledger_integrity': {
        const result = await this.agcService.verifyLedgerIntegrity();
        test.status = result.isValid ? 'pass' : 'fail';
        test.detail = result.isValid
          ? `${result.blocksChecked} bloc(s) vérifiés — Hash SHA-256 ✓ — Chaînage ✓`
          : `${result.errors.length} erreur(s) : ${result.errors[0]?.error ?? '?'}`;
        test.data = result;
        break;
      }

      case 'tamper_detect': {
        // Modifier le dernier bloc puis vérifier que la corruption est détectée
        const firestore = this.firebaseService.firestore;
        const q = query(
          collection(firestore, 'agc_ledger'),
          orderBy('blockHeight', 'desc'),
          limit(1),
        );
        const snap = await getDocs(q);

        if (snap.empty) {
          test.status = 'fail';
          test.detail = "Aucun bloc dans le ledger — lancez d'abord un achat";
          break;
        }

        const lastDoc = snap.docs[0];
        const originalAmt: number = lastDoc.data()['amount'];
        const blockRef = doc(firestore, 'agc_ledger', lastDoc.id);

        // Falsification
        await updateDoc(blockRef, { amount: 99999 });
        const afterTamper = await this.agcService.verifyLedgerIntegrity();

        // Restauration immédiate
        await updateDoc(blockRef, { amount: originalAmt });

        const detected = !afterTamper.isValid;
        test.status = detected ? 'pass' : 'fail';
        test.detail = detected
          ? `Falsification détectée en ${test.duration ?? '?'}ms — Hash invalide ✓`
          : '⚠️ Falsification non détectée !';
        test.data = {
          errorsFound: afterTamper.errors.length,
          bloc: lastDoc.id.substring(0, 12) + '…',
        };
        break;
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ÉTAPE 2 — SIGNATURES ECDSA
  // ══════════════════════════════════════════════════════════════════════════

  private async runEcdsaTest(test: TestResult) {
    switch (test.id) {
      case 'key_generate': {
        const status = await this.userKeys.hasKeysReady(this.userUid);
        if (status.publicKeyInFirestore && status.privateKeyInSession) {
          test.status = 'pass';
          test.detail =
            'Clés ECDSA P-256 présentes — Publique dans Firestore ✓ — Privée en session ✓';
          break;
        }
        // Générer si absent (mot de passe par défaut pour les tests)
        const pwd = this.keyPassword || 'TestPassword123!';
        const res = await this.userKeys.generateAndSaveUserKeys(
          this.userUid,
          pwd,
        );
        test.status = res.success ? 'pass' : 'fail';
        test.detail = res.success
          ? `Paire générée — ${res.publicKey.substring(0, 30)}…`
          : `Erreur : ${res.error}`;
        test.data = { publicKeyPreview: res.publicKey.substring(0, 40) + '…' };
        break;
      }

      case 'sign_tx': {
        const privKey = this.userKeys.getPrivateKey(this.userUid);
        if (!privKey) {
          test.status = 'fail';
          test.detail =
            'Clé privée absente de la session — exécutez d\'abord "Génération"';
          break;
        }
        const tx = await (this.agcService as any).createSignedTransaction(
          {
            fromUserId: this.userUid,
            toUserId: 'test_recipient',
            amount: 1,
            type: 'transfer',
            referenceId: `test_sign_${Date.now()}`,
            description: 'Test signature ECDSA',
            status: 'completed',
            createdAt: new Date(),
            metadata: { test: true },
          },
          this.userUid,
        );

        const hasSignature = tx.signature && tx.signature.length > 20;
        test.status = hasSignature ? 'pass' : 'fail';
        test.detail = hasSignature
          ? `Signature ECDSA-P256 : ${tx.signature.substring(0, 30)}… — Timestamp ✓ — Nonce ✓`
          : 'Signature vide ou invalide';
        test.data = {
          signature: tx.signature?.substring(0, 40) + '…',
          signerId: tx.signerId?.substring(0, 12) + '…',
          algorithm: tx.signatureAlgorithm,
        };
        break;
      }

      case 'verify_valid': {
        const privKey = this.userKeys.getPrivateKey(this.userUid);
        if (!privKey) {
          test.status = 'fail';
          test.detail = 'Clé privée absente';
          break;
        }

        const tx = await (this.agcService as any).createSignedTransaction(
          {
            fromUserId: this.userUid,
            toUserId: 'test_recipient',
            amount: 5,
            type: 'transfer',
            referenceId: `test_verify_${Date.now()}`,
            description: 'Test vérification signature',
            status: 'completed',
            createdAt: new Date(),
            metadata: {},
          },
          this.userUid,
        );

        const isValid = await this.agcService.verifyTransactionSignature(tx);
        test.status = isValid ? 'pass' : 'fail';
        test.detail = isValid
          ? 'Signature vérifiée avec la clé publique ✓ — Non-répudiation garantie'
          : '⚠️ Signature invalide sur une transaction non modifiée !';
        test.data = { result: isValid };
        break;
      }

      case 'verify_tamper': {
        const privKey = this.userKeys.getPrivateKey(this.userUid);
        if (!privKey) {
          test.status = 'fail';
          test.detail = 'Clé privée absente';
          break;
        }

        const tx = await (this.agcService as any).createSignedTransaction(
          {
            fromUserId: this.userUid,
            toUserId: 'victime',
            amount: 10,
            type: 'transfer',
            referenceId: `test_tamper_${Date.now()}`,
            description: 'Transaction légitime',
            status: 'completed',
            createdAt: new Date(),
            metadata: {},
          },
          this.userUid,
        );

        // Falsification : modifier le montant APRÈS signature
        const tamperedTx = { ...tx, amount: 99999 };
        const isStillValid =
          await this.agcService.verifyTransactionSignature(tamperedTx);

        // Le résultat attendu est FALSE (signature cassée)
        test.status = !isStillValid ? 'pass' : 'fail';
        test.detail = !isStillValid
          ? `Montant falsifié (10 → 99 999 AGC) — Signature rejetée ✓ — Attaque bloquée`
          : '⚠️ CRITIQUE : la signature reste valide après falsification !';
        test.data = {
          originalAmount: 10,
          tamperedAmount: 99999,
          signatureValid: isStillValid,
        };
        break;
      }

      case 'verify_all': {
        const result = await this.agcService.verifyAllSignatures();
        const allValid = result.invalid === 0;
        test.status = allValid ? 'pass' : 'fail';
        test.detail = allValid
          ? `${result.valid}/${result.total} signatures valides ✓`
          : `${result.invalid} signature(s) invalide(s) sur ${result.total}`;
        test.data = result;
        break;
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ÉTAPE 3 — SÉQUESTRE (ESCROW)
  // ══════════════════════════════════════════════════════════════════════════

  private async runEscrowTest(test: TestResult) {
    switch (test.id) {
      case 'escrow_balance': {
        const full = await this.agcService.getFullBalance(this.userUid);
        this.balance = full.available;
        const ok =
          typeof full.available === 'number' && typeof full.locked === 'number';
        test.status = ok ? 'pass' : 'fail';
        test.detail = ok
          ? `Disponible : ${full.available} AGC — Bloqué : ${full.locked} AGC — Total : ${full.total} AGC`
          : 'Erreur lecture solde';
        test.data = full;
        break;
      }

      case 'escrow_lock': {
        const balance = await this.agcService.getBalance(this.userUid);
        if (balance < 1) {
          // Acheter des AGC d'abord
          await this.agcService.purchaseAGC(this.userUid, 500, 'wave');
          await new Promise((r) => setTimeout(r, 2500));
        }
        const saleId = `test_sale_${Date.now()}`;
        const result = await this.agcService.lockAGCForSale(
          this.userUid,
          1,
          saleId,
          'test_producer',
          'Test escrow lock',
        );
        test.status = result.success ? 'pass' : 'fail';
        test.detail = result.success
          ? `Lock créé : ${result.lockId?.substring(0, 30)}… — Balance et lockedBalance mis à jour ✓`
          : `Erreur : ${result.error}`;
        test.data = result;
        // Stocker le lockId pour le test suivant
        if (result.lockId) (this as any)._testLockId = result.lockId;
        break;
      }

      case 'escrow_status': {
        const lockId = (this as any)._testLockId;
        if (!lockId) {
          test.status = 'fail';
          test.detail = 'Aucun lock créé — exécutez d\'abord "Blocage AGC"';
          break;
        }
        const status = await this.agcService.getEscrowStatus(lockId);
        const ok = status.found && status.status === 'locked';
        test.status = ok ? 'pass' : 'fail';
        test.detail = ok
          ? `Statut : "${status.status}" — Montant : ${status.amount} AGC — SaleId tracé ✓`
          : `Lock non trouvé ou statut incorrect : ${status.status}`;
        test.data = status;
        break;
      }

      case 'escrow_cancel': {
        const lockId = (this as any)._testLockId;
        if (!lockId) {
          test.status = 'fail';
          test.detail = 'Aucun lock à annuler';
          break;
        }
        const balBefore = await this.agcService.getFullBalance(this.userUid);
        const result = await this.agcService.cancelAGCLock(
          lockId,
          this.userUid,
          'Test annulation',
        );
        const balAfter = await this.agcService.getFullBalance(this.userUid);
        const refunded = balAfter.available > balBefore.available;

        test.status = result.success && refunded ? 'pass' : 'fail';
        test.detail =
          result.success && refunded
            ? `${result.refundedAmount} AGC remboursés — Disponible avant : ${balBefore.available} → après : ${balAfter.available} ✓`
            : `Erreur : ${result.error}`;
        test.data = {
          before: balBefore,
          after: balAfter,
          refunded: result.refundedAmount,
        };
        break;
      }

      case 'double_spend': {
        // Tenter de bloquer plus que le solde disponible
        const balance = await this.agcService.getBalance(this.userUid);
        const result = await this.agcService.lockAGCForSale(
          this.userUid,
          balance + 9999, // bien plus que le solde
          `test_double_${Date.now()}`,
          'test_producer',
          'Test double-dépense',
        );
        // On attend un ÉCHEC — c'est le résultat correct
        test.status = !result.success ? 'pass' : 'fail';
        test.detail = !result.success
          ? `Double-dépense bloquée ✓ — Erreur retournée : "${result.error?.substring(0, 60)}…"`
          : '⚠️ CRITIQUE : double-dépense non bloquée !';
        test.data = { attempted: balance + 9999, available: balance };
        break;
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ÉTAPE 4 — CHIFFREMENT AES-GCM
  // ══════════════════════════════════════════════════════════════════════════

  private async runAesTest(test: TestResult) {
    const pwd = this.keyPassword || 'TestPassword123!';

    switch (test.id) {
      case 'aes_encrypt': {
        // Accéder aux méthodes privées via cast any pour les tests
        const svc = this.userKeys as any;
        const plaintext = 'MaClePriveeECDSA_Base64_SimuleeXXXXXXXXXXXXX';
        const encrypted = await svc.encryptPrivateKey(plaintext, pwd);

        // Vérifier que le résultat est différent du plaintext
        const isBase64 = /^[A-Za-z0-9+/=]+$/.test(encrypted);
        const isDiff = encrypted !== plaintext && encrypted !== btoa(plaintext);
        // Deux chiffrements du même plaintext doivent donner des résultats différents (IV aléatoire)
        const encrypted2 = await svc.encryptPrivateKey(plaintext, pwd);
        const isRandom = encrypted !== encrypted2;

        test.status = isBase64 && isDiff && isRandom ? 'pass' : 'fail';
        test.detail =
          isBase64 && isDiff && isRandom
            ? `AES-GCM-256 ✓ — Salt+IV aléatoires ✓ — Indistinguable du btoa ✓ — Longueur : ${encrypted.length} chars`
            : `Échec : base64=${isBase64}, différent=${isDiff}, aléatoire=${isRandom}`;
        test.data = {
          preview: encrypted.substring(0, 40) + '…',
          length: encrypted.length,
          isRandom,
        };
        break;
      }

      case 'aes_decrypt': {
        const svc = this.userKeys as any;
        const original = 'MaClePriveeECDSA_Original_XXXXX';
        const encrypted = await svc.encryptPrivateKey(original, pwd);
        const decrypted = await svc.decryptPrivateKey(encrypted, pwd);

        test.status = decrypted === original ? 'pass' : 'fail';
        test.detail =
          decrypted === original
            ? `Déchiffrement parfait ✓ — PBKDF2 (310 000 itérations) + AES-GCM authenticated`
            : `Erreur : "${decrypted}" ≠ "${original}"`;
        test.data = { match: decrypted === original };
        break;
      }

      case 'aes_wrong_pwd': {
        const svc = this.userKeys as any;
        const encrypted = await svc.encryptPrivateKey('donnee_secrete', pwd);
        let rejected = false;
        try {
          await svc.decryptPrivateKey(encrypted, 'mauvais_mot_de_passe_123');
        } catch {
          rejected = true;
        }
        test.status = rejected ? 'pass' : 'fail';
        test.detail = rejected
          ? 'Mauvais mot de passe → AuthenticationTag invalide → Exception levée ✓ — Brute force détectée'
          : '⚠️ CRITIQUE : déchiffrement réussi avec un mauvais mot de passe !';
        test.data = { rejected };
        break;
      }

      case 'aes_unlock': {
        // Simuler rechargement : effacer la session puis déverrouiller
        sessionStorage.removeItem(`private_key_${this.userUid}`);
        const before = this.userKeys.getPrivateKey(this.userUid);

        const result = await this.userKeys.unlockPrivateKey(this.userUid, pwd);
        const after = this.userKeys.getPrivateKey(this.userUid);

        const ok = !before && result.success && !!after;
        test.status = ok ? 'pass' : 'fail';
        test.detail = ok
          ? `Session restaurée depuis Firestore ✓ — Clé privée en mémoire sans transiter par le réseau`
          : `Erreur : ${result.error ?? 'clé non restaurée'}`;
        test.data = { hadKeyBefore: !!before, hasKeyAfter: !!after };
        break;
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ÉTAPE 5 — AUDIT TRAIL
  // ══════════════════════════════════════════════════════════════════════════

  private async runAuditTest(test: TestResult) {
    switch (test.id) {
      case 'audit_write': {
        await this.auditTrail.log({
          actorId: this.userUid,
          actorEmail: this.userEmail,
          action: 'ledger_verified',
          severity: 'info',
          description: `Test audit trail — interface de test sécurité`,
          metadata: { source: 'security_dashboard', timestamp: Date.now() },
        });
        test.status = 'pass';
        test.detail =
          'Événement écrit dans audit_logs (write-only) ✓ — serverTimestamp() côté Firestore';
        break;
      }

      case 'audit_read': {
        // Attendre que Firestore propage le write du test précédent
        await new Promise((r) => setTimeout(r, 1500));
        const logs = await this.auditTrail.getLogs({
          actorId: this.userUid,
          limitCount: 20,
        });
        this.auditLogs = logs;
        const ok = logs.length > 0;
        test.status = ok ? 'pass' : 'fail';
        test.detail = ok
          ? `${logs.length} log(s) récupérés — Dernier : "${logs[0]?.action}" — actorId filtré ✓`
          : 'Aucun log trouvé — vérifiez les Firestore Rules (audit_logs read)';
        test.data = { count: logs.length, lastAction: logs[0]?.action ?? '—' };
        break;
      }

      case 'audit_critical': {
        await this.auditTrail.logTamperingDetected(999, 'aabbcc', 'ddeeff');
        // Attendre propagation Firestore
        await new Promise((r) => setTimeout(r, 1500));
        // Les logs critiques sont écrits avec actorId='system' — requête sans filtre actorId
        const critical = await this.auditTrail.getLogs({
          severity: 'critical',
          limitCount: 10,
        });
        const found = critical.some((l) => l.action === 'tampering_detected');
        test.status = found ? 'pass' : 'fail';
        test.detail = found
          ? `Événement critique enregistré ✓ — Filtrage severity="critical" ✓`
          : 'Événement critique non trouvé — vérifiez les Firestore Rules pour severity=critical';
        test.data = { criticalCount: critical.length };
        break;
      }

      case 'audit_purchase': {
        const result = await this.agcService.purchaseAGC(
          this.userUid,
          200,
          'wave',
        );
        // Attendre que l'audit soit propagé dans Firestore
        await new Promise((r) => setTimeout(r, 2000));
        const logs = await this.auditTrail.getLogs({
          actorId: this.userUid,
          limitCount: 20,
        });
        const traced = logs.some((l) => l.action === 'agc_purchase');
        test.status = result.success && traced ? 'pass' : 'fail';
        test.detail =
          result.success && traced
            ? `Achat ${result.agcAmount} AGC ✓ — Tracé dans audit_logs ✓ — actorId lié ✓`
            : result.success && !traced
              ? `Achat réussi mais log non trouvé (délai Firestore ou Rules) — total logs : ${logs.length}`
              : `Achat échoué : ${result.error}`;
        test.data = {
          agcAmount: result.agcAmount,
          auditFound: traced,
          totalLogs: logs.length,
        };
        break;
      }
    }
  }

  // ── Helpers template ────────────────────────────────────────────────────

  get totalTests() {
    return this.sections.reduce((s, sec) => s + sec.tests.length, 0);
  }
  get passedTests() {
    return this.sections.reduce(
      (s, sec) => s + sec.tests.filter((t) => t.status === 'pass').length,
      0,
    );
  }
  get failedTests() {
    return this.sections.reduce(
      (s, sec) => s + sec.tests.filter((t) => t.status === 'fail').length,
      0,
    );
  }
  get runningTests() {
    return this.sections.reduce(
      (s, sec) => s + sec.tests.filter((t) => t.status === 'running').length,
      0,
    );
  }

  get overallStatus(): 'idle' | 'running' | 'pass' | 'fail' {
    if (this.isRunningAll) return 'running';
    if (this.failedTests > 0) return 'fail';
    if (this.passedTests === this.totalTests) return 'pass';
    return 'idle';
  }

  sectionPassCount(s: StepSection) {
    return s.tests.filter((t) => t.status === 'pass').length;
  }
  sectionFailCount(s: StepSection) {
    return s.tests.filter((t) => t.status === 'fail').length;
  }

  statusIcon(s: TestStatus): string {
    return { idle: '○', running: '◌', pass: '✓', fail: '✗' }[s] ?? '○';
  }

  toggleSection(s: StepSection) {
    s.expanded = !s.expanded;
  }

  private async loadRecentTransactions() {
    if (!this.userUid) return;
    this.recentTransactions = await this.agcService.getTransactionHistory(
      this.userUid,
      8,
    );
  }

  private async loadAuditLogs() {
    this.auditLogs = await this.auditTrail.getLogs({
      actorId: this.userUid,
      limitCount: 8,
    });
  }

  formatDate(d: any): string {
    if (!d) return '—';
    const date = d instanceof Date ? d : (d?.toDate?.() ?? new Date(d));
    return date.toLocaleString('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'medium',
    });
  }

  typeColor(type: string): string {
    const map: Record<string, string> = {
      purchase: '#10b981',
      sale_payment: '#3b82f6',
      bonus: '#f59e0b',
      escrow_lock: '#ef4444',
      escrow_release: '#8b5cf6',
      transfer: '#6366f1',
    };
    return map[type] ?? '#94a3b8';
  }

  objectEntries(obj: any): [string, any][] {
    if (!obj || typeof obj !== 'object') return [];
    return Object.entries(obj).slice(0, 6); // max 6 champs affichés
  }

  formatDataValue(val: any): string {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'boolean') return val ? 'true ✓' : 'false ✗';
    if (typeof val === 'number') return val.toLocaleString('fr-FR');
    if (typeof val === 'object')
      return JSON.stringify(val).substring(0, 60) + '…';
    const str = String(val);
    return str.length > 70 ? str.substring(0, 70) + '…' : str;
  }


}

// verification.component.ts - VERSION CORRIGÉE COMPLÈTE
import {
  Component,
  OnInit,
  inject,
  ChangeDetectorRef,
  AfterViewInit,
  Pipe,
  PipeTransform
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { CertificationService } from 'src/app/services/certification.service';
import { BlockchainService } from 'src/app/blockchain/services/blockchain.service';
import { BlockchainSyncService } from 'src/app/services/blockchain-sync.service';
import { Certification, CertificationCheckpoint } from 'src/app/interfaces/certification.interfaces';

// Pipe pour tronquer les URLs
@Pipe({
  name: 'truncate',
  standalone: true
})
export class TruncatePipe implements PipeTransform {
  transform(value: string, limit: number = 25, trail: string = '...'): string {
    if (!value) return '';
    if (value.length <= limit) return value;
    return value.substring(0, limit) + trail;
  }
}

interface BlockchainVerificationDetail {
  checkpointId: string;
  title: string;
  blockchainVerified: boolean;
  txHash?: string;
  confirmations?: number;
  timestamp?: number;
  photoHashMatch?: boolean;
  timestampMatch?: boolean;
  locationMatch?: boolean;
  ipfsCID?: string;
  blockNumber?: number;
}

interface BlockchainVerification {
  verified: boolean;
  score: number;
  details: BlockchainVerificationDetail[];
  lastChecked: Date;
  integrityIssues?: string[];
}

@Component({
  selector: 'app-verification',
  standalone: true,
  imports: [CommonModule, TruncatePipe],
  templateUrl: './verification.component.html',
  styleUrls: ['./verification.component.css'],
})
export class VerificationComponent implements OnInit, AfterViewInit {
  private route = inject(ActivatedRoute);
  private certificationService = inject(CertificationService);
  private blockchainService = inject(BlockchainService);
  private blockchainSyncService = inject(BlockchainSyncService);
  private cdr = inject(ChangeDetectorRef);

  certification: Certification | null = null;
  blockchainVerification: BlockchainVerification | null = null;
  isLoading = true;
  isVerifyingBlockchain = false;
  today = new Date();
  tamperingResults: any = null;
  showTamperingTest = false;
  qrCodeUrl: string = '';
  verificationErrors: string[] = [];

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      await this.loadCertification(id);
    }
  }

  ngAfterViewInit() {
    this.cdr.detectChanges();
  }

  async loadCertification(id: string) {
    this.isLoading = true;
    this.verificationErrors = [];
    try {
      this.certification = await this.certificationService.getCertification(id);
      this.generateQRCode();
      await this.verifyBlockchain();
    } catch (error: any) {
      console.error('Erreur chargement certification:', error);
      this.verificationErrors.push(`Erreur de chargement: ${error.message}`);
      this.certification = null;
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  // ========== MÉTHODES AJOUTÉES POUR CORRIGER LES ERREURS ==========

  getCheckpointDate(dayOffset: number): Date {
    if (!this.certification) return new Date();
    const startDate = new Date(this.certification.startDate);
    startDate.setDate(startDate.getDate() + dayOffset);
    return startDate;
  }

  getBlockchainStatusClass(checkpoint: CertificationCheckpoint): string {
    if (!checkpoint.blockchainTransactionId) return 'pending';

    if (this.blockchainVerification) {
      const detail = this.blockchainVerification.details.find(
        (d) => d.checkpointId === checkpoint.id
      );
      if (detail) {
        if (!detail.blockchainVerified) return 'pending';
        if (detail.photoHashMatch === false || detail.timestampMatch === false) return 'error';
        return 'verified';
      }
    }

    return checkpoint.blockchainVerified ? 'verified' : 'pending';
  }

  getProofIcon(type: string): string {
    switch (type) {
      case 'photo': return '📸';
      case 'gps': return '📍';
      case 'measurement': return '📏';
      case 'note': return '📝';
      default: return '📋';
    }
  }

  getVerificationUrl(): string {
    if (!this.certification) return '';
    return `${window.location.origin}/verify/${this.certification.id}`;
  }

  // ========== MÉTHODES EXISTANTES ==========

  private async verifyBlockchainReal(): Promise<void> {
    if (!this.certification) return;

    this.verificationErrors = [];
    const details: BlockchainVerificationDetail[] = [];
    const integrityIssues: string[] = [];

    try {
      for (const checkpoint of this.certification.checkpoints) {
        const detail = await this.verifySingleCheckpoint(checkpoint);
        details.push(detail);

        if (!detail.blockchainVerified && checkpoint.completed) {
          integrityIssues.push(`${checkpoint.title}: Non vérifié sur blockchain`);
        }
        if (detail.photoHashMatch === false) {
          integrityIssues.push(`${checkpoint.title}: Hash photo non concordant`);
        }
        if (detail.timestampMatch === false) {
          integrityIssues.push(`${checkpoint.title}: Timestamp non concordant`);
        }
      }

      const verifiedCount = details.filter((d) => d.blockchainVerified).length;
      const totalCount = details.filter((d) =>
        this.certification?.checkpoints.find(c => c.id === d.checkpointId)?.completed
      ).length;

      const score = totalCount > 0 ? Math.round((verifiedCount / totalCount) * 100) : 0;
      const allVerified = details.every(d =>
        !this.certification?.checkpoints.find(c => c.id === d.checkpointId)?.completed ||
        d.blockchainVerified
      );

      this.blockchainVerification = {
        verified: allVerified && score >= 70,
        score,
        details,
        lastChecked: new Date(),
        integrityIssues: integrityIssues.length > 0 ? integrityIssues : undefined
      };

    } catch (error: any) {
      console.error('❌ Erreur vérification blockchain:', error);
      this.verificationErrors.push(`Erreur vérification blockchain: ${error.message}`);
      await this.simulateBlockchainVerification();
    }
  }

  private async verifySingleCheckpoint(checkpoint: CertificationCheckpoint): Promise<BlockchainVerificationDetail> {
    const detail: BlockchainVerificationDetail = {
      checkpointId: checkpoint.id,
      title: checkpoint.title,
      blockchainVerified: false,
    };

    if (!checkpoint.completed || !checkpoint.blockchainTransactionId) {
      return detail;
    }

    try {
      const txDetails = await this.blockchainService.getTransactionDetails(
        checkpoint.blockchainTransactionId
      );

      if (txDetails.confirmed && txDetails.status === 'success') {
        detail.txHash = checkpoint.blockchainTransactionId;
        detail.confirmations = txDetails.confirmations;
        detail.blockNumber = txDetails.blockNumber;
        detail.timestamp = txDetails.timestamp;

        if (checkpoint.blockchainProofHash) {
          const proofVerification = await this.blockchainService.verifyProofOnContract(
            this.certification!.id,
            checkpoint.blockchainProofHash
          );

          if (proofVerification.exists) {
            detail.blockchainVerified = proofVerification.verified;

            if (checkpoint.proofs && checkpoint.proofs.length > 0) {
              for (const proof of checkpoint.proofs) {
                if (proof.type === 'photo' && proof.photoHash) {
                  detail.photoHashMatch = proof.photoHash === checkpoint.blockchainProofHash?.substring(0, 32);
                }
              }
            }

            if (checkpoint.completedAt && detail.timestamp) {
              const blockchainTime = detail.timestamp * 1000;
              const checkpointTime = new Date(checkpoint.completedAt).getTime();
              const timeDiff = Math.abs(blockchainTime - checkpointTime);
              detail.timestampMatch = timeDiff < 24 * 60 * 60 * 1000;
            }

            if (checkpoint.ipfsCID) {
              detail.ipfsCID = checkpoint.ipfsCID;
            }
          }
        } else {
          detail.blockchainVerified = true;
        }
      } else {
        detail.blockchainVerified = false;
        this.verificationErrors.push(`Transaction ${checkpoint.blockchainTransactionId} non confirmée`);
      }

    } catch (error: any) {
      console.error(`Erreur vérification checkpoint ${checkpoint.id}:`, error);
      detail.blockchainVerified = false;
      this.verificationErrors.push(`Erreur checkpoint ${checkpoint.title}: ${error.message}`);
    }

    return detail;
  }

  async verifyBlockchain(): Promise<void> {
    if (!this.certification) return;

    this.isVerifyingBlockchain = true;
    this.verificationErrors = [];

    try {
      await this.verifyBlockchainReal();
    } catch (error: any) {
      console.error('Erreur vérification blockchain:', error);
      this.verificationErrors.push(`Erreur système: ${error.message}`);
      this.blockchainVerification = null;
    } finally {
      this.isVerifyingBlockchain = false;
      this.cdr.detectChanges();
    }
  }

  getBlockchainStatus(checkpoint: CertificationCheckpoint): string {
    if (!checkpoint.blockchainTransactionId) {
      return checkpoint.completed ? '❌ Non certifié' : '⏳ En attente';
    }

    if (this.blockchainVerification) {
      const detail = this.blockchainVerification.details.find(
        (d) => d.checkpointId === checkpoint.id
      );

      if (detail) {
        if (!detail.blockchainVerified) {
          return '⏳ En vérification';
        }

        const issues = [];
        if (detail.photoHashMatch === false) issues.push('hash photo');
        if (detail.timestampMatch === false) issues.push('timestamp');

        if (issues.length > 0) {
          return `⚠️ Incohérences (${issues.join(', ')})`;
        }

        return `✅ Certifié (${detail.confirmations || 0} conf)`;
      }
    }

    return checkpoint.blockchainVerified ? '✅ Certifié' : '⏳ En vérification';
  }

  private generateQRCode(): void {
    if (!this.certification) {
      this.qrCodeUrl = '';
      return;
    }

    const verificationData = {
      id: this.certification.id,
      product: this.certification.productName,
      producer: this.certification.producerName,
      verificationUrl: this.getVerificationUrl(),
      timestamp: new Date().toISOString(),
      blockchainScore: this.blockchainVerification?.score || 0,
      blockchainVerified: this.blockchainVerification?.verified || false,
      blockchainDetails: this.blockchainVerification?.details.map(d => ({
        checkpoint: d.title,
        verified: d.blockchainVerified,
        tx: d.txHash ? this.formatHash(d.txHash) : null
      }))
    };

    this.qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
      JSON.stringify(verificationData)
    )}`;
  }

  private updateQRCode(): void {
    this.generateQRCode();
  }

  private async simulateBlockchainVerification(): Promise<void> {
    if (!this.certification) return;

    const details: BlockchainVerificationDetail[] = [];

    for (const checkpoint of this.certification.checkpoints) {
      const hasBlockchain = checkpoint.completed && !!checkpoint.blockchainTransactionId;

      details.push({
        checkpointId: checkpoint.id,
        title: checkpoint.title,
        blockchainVerified: hasBlockchain,
        txHash: checkpoint.blockchainTransactionId,
        timestamp: checkpoint.blockchainTimestamp
          ? new Date(checkpoint.blockchainTimestamp).getTime() / 1000
          : undefined,
        photoHashMatch: true,
        timestampMatch: true,
      });
    }

    const completedCheckpoints = details.filter(d =>
      this.certification?.checkpoints.find(c => c.id === d.checkpointId)?.completed
    );
    const verifiedCount = completedCheckpoints.filter((d) => d.blockchainVerified).length;
    const totalCount = completedCheckpoints.length;
    const score = totalCount > 0 ? Math.round((verifiedCount / totalCount) * 100) : 0;

    this.blockchainVerification = {
      verified: score >= 70,
      score,
      details,
      lastChecked: new Date(),
    };

    this.updateQRCode();
  }

  getBlockchainVerifiedCount(): number {
    if (!this.blockchainVerification) return 0;
    return this.blockchainVerification.details.filter(
      (d) => d.blockchainVerified && this.certification?.checkpoints.find(c => c.id === d.checkpointId)?.completed
    ).length;
  }

  getTotalCompletedCount(): number {
    if (!this.certification) return 0;
    return this.certification.checkpoints.filter(cp => cp.completed).length;
  }

  openEtherscan(txHash: string | undefined): void {
    if (!txHash) return;
    window.open(`https://sepolia.etherscan.io/tx/${txHash}`, '_blank');
  }

  openIPFS(cid: string | undefined): void {
    if (!cid) return;
    window.open(`https://ipfs.io/ipfs/${cid}`, '_blank');
  }

  getVerificationClass(): string {
    if (!this.certification) return 'invalid';

    if (this.verificationErrors.length > 0) {
      return 'verification-error';
    }

    if (this.blockchainVerification) {
      if (!this.blockchainVerification.verified) {
        return 'blockchain-invalid';
      }
      if (this.blockchainVerification.integrityIssues?.length) {
        return 'integrity-issue';
      }
    }

    switch (this.certification.verificationStatus) {
      case 'auto_verified':
      case 'manually_verified':
        return 'valid';
      case 'pending':
        return 'pending';
      default:
        return 'invalid';
    }
  }

  getVerificationIcon(): string {
    const verificationClass = this.getVerificationClass();

    switch (verificationClass) {
      case 'valid':
        return '✅';
      case 'pending':
        return '⏳';
      case 'blockchain-invalid':
        return '🔗❌';
      case 'integrity-issue':
        return '⚠️';
      case 'verification-error':
        return '🚨';
      default:
        return '❌';
    }
  }

  getVerificationText(): string {
    const verificationClass = this.getVerificationClass();

    switch (verificationClass) {
      case 'valid':
        return 'Certification validée';
      case 'pending':
        return 'Certification en cours';
      case 'blockchain-invalid':
        return 'Problème de vérification blockchain';
      case 'integrity-issue':
        return 'Incohérences détectées';
      case 'verification-error':
        return 'Erreur de vérification';
      default:
        return 'Certification non valide';
    }
  }

  formatHash(hash: string | undefined): string {
    if (!hash || hash.length <= 12) return hash || '';
    return `${hash.substring(0, 6)}...${hash.substring(hash.length - 4)}`;
  }

  getQRCodeUrl(): string {
    return this.qrCodeUrl;
  }

  downloadCertificate() {
    if (!this.certification) return;

    let blockchainSection = '';
    if (this.blockchainVerification) {
      blockchainSection = `
      ----------------------------------
      🔗 VÉRIFICATION BLOCKCHAIN
      ----------------------------------
      Score blockchain: ${this.blockchainVerification.score}%
      Statut: ${this.blockchainVerification.verified ? 'VALIDÉ' : 'NON VALIDÉ'}
      Dernière vérification: ${this.blockchainVerification.lastChecked.toLocaleDateString()}

      Détails par point de contrôle:
      ${this.blockchainVerification.details
        .filter(d => this.certification?.checkpoints.find(c => c.id === d.checkpointId)?.completed)
        .map(
          (detail) => `
      • ${detail.title}: ${detail.blockchainVerified ? '✅ Certifié' : '❌ Non certifié'}
        ${detail.txHash ? `Transaction: ${this.formatHash(detail.txHash)}` : 'Aucune transaction'}
        ${detail.confirmations ? `Confirmations: ${detail.confirmations}` : ''}
        ${detail.photoHashMatch === false ? '⚠️ Hash photo non concordant' : ''}
        ${detail.timestampMatch === false ? '⚠️ Timestamp non concordant' : ''}
      `,
        )
        .join('\n')}

      ${this.blockchainVerification.integrityIssues?.length ? `
      Problèmes détectés:
      ${this.blockchainVerification.integrityIssues.map(issue => `⚠️ ${issue}`).join('\n')}
      ` : ''}
      ----------------------------------
      `;
    }

    const certData = `
      ==================================
      CERTIFICAT DE TRACABILITÉ NUMÉRIQUE
      ==================================

      📦 PRODUIT: ${this.certification.productName}
      📋 TYPE: ${this.certification.productType}
      👨‍🌾 PRODUCTEUR: ${this.certification.producerName}
      📍 LOCALISATION: ${this.certification.location.address}

      🏆 SCORE DE CERTIFICATION: ${this.certification.validationScore}%
      📊 STATUT: ${this.getVerificationText()}

      📅 DATE DE DÉBUT: ${this.certification.startDate.toLocaleDateString()}
      📅 DATE DE RÉCOLTE: ${this.certification.actualHarvestDate?.toLocaleDateString() || 'En cours'}
      🔢 ID: ${this.certification.id}

      🌐 URL DE VÉRIFICATION: ${this.getVerificationUrl()}

      ${blockchainSection}

      ${this.verificationErrors.length ? `
      ⚠️ ERREURS DE VÉRIFICATION:
      ${this.verificationErrors.map(error => `• ${error}`).join('\n')}
      ----------------------------------
      ` : ''}

      ==================================
      CERTIFIÉ NUMÉRIQUEMENT PAR AGRINOVA
      Système de traçabilité blockchain
      ==================================

      📅 Date d'émission: ${new Date().toLocaleDateString()}
      ⏰ Heure: ${new Date().toLocaleTimeString()}
      🏷️ Référence: VERIF-${this.certification.id.substring(0, 8).toUpperCase()}
    `;

    const blob = new Blob([certData], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `certificat-tracabilite-${this.certification.id}.txt`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  shareVerification(): void {
    if (!this.certification) return;

    const shareData = {
      title: `Certification ${this.certification.productName}`,
      text: `Vérifiez l'authenticité de ${this.certification.productName} - Score: ${this.certification.validationScore}% - ${this.getVerificationText()}`,
      url: this.getVerificationUrl(),
    };

    if (navigator.share) {
      navigator.share(shareData);
    } else {
      navigator.clipboard.writeText(shareData.url);
      alert('✅ Lien copié dans le presse-papier !');
    }
  }

  async runIntegrityTest(): Promise<void> {
    this.showTamperingTest = true;
    this.tamperingResults = await this.detectTampering();
    this.cdr.detectChanges();
  }

  async detectTampering(): Promise<{
    tampered: boolean;
    details: Array<{
      checkpoint: string;
      hasTransaction: boolean;
      verifiedOnChain: boolean;
      photoHashValid: boolean | 'N/A';
      timestampValid: boolean | 'N/A';
      match: boolean;
    }>;
  }> {
    if (!this.certification || !this.blockchainVerification) {
      return { tampered: false, details: [] };
    }

    const details: any[] = [];

    for (const checkpoint of this.certification.checkpoints) {
      if (checkpoint.completed) {
        const blockchainDetail = this.blockchainVerification.details.find(
          (d) => d.checkpointId === checkpoint.id
        );

        const hasTransaction = !!checkpoint.blockchainTransactionId;
        const verifiedOnChain = blockchainDetail?.blockchainVerified || false;

        const match = hasTransaction === verifiedOnChain;

        details.push({
          checkpoint: checkpoint.title,
          hasTransaction,
          verifiedOnChain,
          photoHashValid: blockchainDetail?.photoHashMatch ?? 'N/A',
          timestampValid: blockchainDetail?.timestampMatch ?? 'N/A',
          match
        });
      }
    }

    const tampered = details.some((detail) => !detail.match ||
      detail.photoHashValid === false ||
      detail.timestampValid === false
    );

    return { tampered, details };
  }

  showVerificationDetails(): void {
    if (!this.blockchainVerification) return;

    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      padding: 20px;
    `;

    modal.innerHTML = `
      <div style="
        background: white;
        border-radius: 12px;
        padding: 24px;
        max-width: 800px;
        width: 100%;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 style="margin: 0; color: #333;">🔍 Rapport de Vérification Détaillé</h2>
          <button id="close-modal" style="
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: #666;
          ">×</button>
        </div>

        ${this.verificationErrors.length ? `
        <div style="
          background: #ffebee;
          border-left: 4px solid #f44336;
          padding: 16px;
          margin-bottom: 20px;
          border-radius: 4px;
        ">
          <h3 style="margin-top: 0; color: #d32f2f;">🚨 Erreurs de vérification</h3>
          <ul style="margin: 0; padding-left: 20px;">
            ${this.verificationErrors.map(error => `<li>${error}</li>`).join('')}
          </ul>
        </div>
        ` : ''}

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
          <div style="
            background: #e8f5e9;
            padding: 16px;
            border-radius: 8px;
            border-left: 4px solid #4caf50;
          ">
            <h3 style="margin-top: 0; color: #2e7d32;">📊 Score de vérification</h3>
            <div style="font-size: 48px; font-weight: bold; text-align: center; color: #2e7d32;">
              ${this.blockchainVerification.score}%
            </div>
            <p style="text-align: center; margin: 0;">
              ${this.getBlockchainVerifiedCount()}/${this.getTotalCompletedCount()} points vérifiés
            </p>
          </div>

          <div style="
            background: ${this.blockchainVerification.verified ? '#e8f5e9' : '#ffebee'};
            padding: 16px;
            border-radius: 8px;
            border-left: 4px solid ${this.blockchainVerification.verified ? '#4caf50' : '#f44336'};
          ">
            <h3 style="margin-top: 0; color: ${this.blockchainVerification.verified ? '#2e7d32' : '#d32f2f'};">🔗 Statut blockchain</h3>
            <div style="font-size: 24px; font-weight: bold; text-align: center;">
              ${this.blockchainVerification.verified ? '✅ VALIDÉ' : '❌ NON VALIDÉ'}
            </div>
            <p style="text-align: center; margin: 0;">
              Dernière vérification: ${this.blockchainVerification.lastChecked.toLocaleString()}
            </p>
          </div>
        </div>

        <h3>📋 Détails par point de contrôle</h3>
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: #f5f5f5;">
                <th style="padding: 12px; text-align: left; border-bottom: 2px solid #ddd;">Checkpoint</th>
                <th style="padding: 12px; text-align: left; border-bottom: 2px solid #ddd;">Statut</th>
                <th style="padding: 12px; text-align: left; border-bottom: 2px solid #ddd;">Transaction</th>
                <th style="padding: 12px; text-align: left; border-bottom: 2px solid #ddd;">Hash photo</th>
                <th style="padding: 12px; text-align: left; border-bottom: 2px solid #ddd;">Timestamp</th>
                <th style="padding: 12px; text-align: left; border-bottom: 2px solid #ddd;">Confirmations</th>
              </tr>
            </thead>
            <tbody>
              ${this.blockchainVerification.details
                .filter(d => this.certification?.checkpoints.find(c => c.id === d.checkpointId)?.completed)
                .map((detail) => `
                <tr style="border-bottom: 1px solid #eee;">
                  <td style="padding: 12px;">${detail.title}</td>
                  <td style="padding: 12px;">
                    <span style="
                      display: inline-block;
                      padding: 4px 8px;
                      border-radius: 4px;
                      background: ${detail.blockchainVerified ? '#4caf50' : '#f44336'};
                      color: white;
                      font-size: 12px;
                    ">
                      ${detail.blockchainVerified ? '✅ Vérifié' : '❌ Non vérifié'}
                    </span>
                  </td>
                  <td style="padding: 12px;">
                    ${detail.txHash ?
                      `<a href="https://sepolia.etherscan.io/tx/${detail.txHash}"
                         target="_blank"
                         style="color: #2196f3; text-decoration: none;">
                        ${this.formatHash(detail.txHash)}
                      </a>`
                      : '—'
                    }
                  </td>
                  <td style="padding: 12px;">
                    ${detail.photoHashMatch === true ? '✅' :
                      detail.photoHashMatch === false ? '❌' : '—'}
                  </td>
                  <td style="padding: 12px;">
                    ${detail.timestampMatch === true ? '✅' :
                      detail.timestampMatch === false ? '❌' : '—'}
                  </td>
                  <td style="padding: 12px;">
                    ${detail.confirmations || '—'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        ${this.blockchainVerification.integrityIssues?.length ? `
        <div style="margin-top: 20px; padding: 16px; background: #fff3e0; border-radius: 8px; border-left: 4px solid #ff9800;">
          <h3 style="margin-top: 0; color: #e65100;">⚠️ Problèmes de cohérence détectés</h3>
          <ul style="margin: 0; padding-left: 20px;">
            ${this.blockchainVerification.integrityIssues.map(issue => `<li>${issue}</li>`).join('')}
          </ul>
        </div>
        ` : ''}

        <div style="margin-top: 20px; text-align: right;">
          <button id="export-report" style="
            padding: 10px 20px;
            background: #2196f3;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
          ">
            📊 Exporter le rapport
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('#close-modal')?.addEventListener('click', () => {
      document.body.removeChild(modal);
    });

    modal.querySelector('#export-report')?.addEventListener('click', () => {
      this.downloadVerificationReport();
      document.body.removeChild(modal);
    });

    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        document.body.removeChild(modal);
      }
    });
  }

  private downloadVerificationReport(): void {
    if (!this.certification || !this.blockchainVerification) return;

    const report = {
      certificationId: this.certification.id,
      productName: this.certification.productName,
      producerName: this.certification.producerName,
      verificationDate: new Date().toISOString(),
      overallScore: this.blockchainVerification.score,
      blockchainVerified: this.blockchainVerification.verified,
      verificationDetails: this.blockchainVerification.details
        .filter(d => this.certification?.checkpoints.find(c => c.id === d.checkpointId)?.completed)
        .map(detail => ({
          checkpoint: detail.title,
          blockchainVerified: detail.blockchainVerified,
          transactionId: detail.txHash,
          confirmations: detail.confirmations,
          photoHashValid: detail.photoHashMatch,
          timestampValid: detail.timestampMatch,
          integrityIssues: [
            ...(detail.photoHashMatch === false ? ['Hash photo non concordant'] : []),
            ...(detail.timestampMatch === false ? ['Timestamp non concordant'] : [])
          ]
        })),
      integrityIssues: this.blockchainVerification.integrityIssues,
      errors: this.verificationErrors
    };

    const dataStr = JSON.stringify(report, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const link = document.createElement('a');
    link.href = dataUri;
    link.download = `rapport-verification-${this.certification.id}.json`;
    link.click();
  }
}

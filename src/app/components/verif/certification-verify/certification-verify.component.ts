// components/public/certification-verify/certification-verify.component.ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { CertificationService } from '../../../services/certification.service';
import { QRCodeModule } from 'angularx-qrcode';
import { BlockchainService } from 'src/app/blockchain/services/blockchain.service';
import { doc, getDoc } from 'firebase/firestore';

@Component({
  selector: 'app-certification-verify',
  standalone: true,
  imports: [CommonModule, QRCodeModule],
  template: `
    <div class="verify-container">
      <!-- Header avec QR Code -->
      <header class="verify-header">
        <div class="header-content">
          <div class="certification-title">
            <h1>Certification Produit</h1>
            <p class="certification-id">ID: {{ certificationId }}</p>
          </div>

          <div class="qr-section">
            <qrcode [qrdata]="verificationUrl"
                    [width]="120"
                    [errorCorrectionLevel]="'M'">
            </qrcode>
            <p class="qr-hint">Scannez pour vérifier</p>
          </div>
        </div>
      </header>

      <main class="verify-main">
        <!-- Résultat de vérification -->
        <section class="verification-result" [class]="verificationResult?.valid ? 'valid' : 'invalid'">
          <div class="result-icon">
            {{ verificationResult?.valid ? '✓' : '✗' }}
          </div>
          <div class="result-content">
            <h2>{{ verificationResult?.valid ? 'Certification Valide' : 'Certification Invalide' }}</h2>
            <p *ngIf="verificationResult?.valid">
              Ce produit a été certifié avec succès via Jokko-Agro
            </p>
            <p *ngIf="!verificationResult?.valid">
              Cette certification présente des problèmes de validité
            </p>
            <div class="result-score">
              <span class="score-label">Score de vérification:</span>
              <span class="score-value">{{ verificationResult?.score || 0 }}/100</span>
            </div>
          </div>
        </section>

        <!-- Informations produit -->
        <section class="product-info">
          <h2>Informations du Produit</h2>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">Nom:</span>
              <span class="info-value">{{ certification?.productName }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Producteur:</span>
              <span class="info-value">{{ certification?.producerName }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Type certification:</span>
              <span class="info-value">{{ certification?.certificationType | titlecase }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Durée:</span>
              <span class="info-value">{{ certification?.durationDays }} jours</span>
            </div>
            <div class="info-item">
              <span class="info-label">Date début:</span>
              <span class="info-value">{{ certification?.startDate | date:'dd/MM/yyyy' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Date fin:</span>
              <span class="info-value">{{ certification?.estimatedEndDate | date:'dd/MM/yyyy' }}</span>
            </div>
          </div>
        </section>

        <!-- Timeline des checkpoints -->
        <section class="checkpoints-section">
          <h2>Historique de Traçabilité</h2>

          <div class="timeline">
            <div *ngFor="let checkpoint of certification?.checkpoints"
                 class="timeline-item"
                 [class.completed]="checkpoint.completed">

              <div class="timeline-marker">
                <div class="marker-icon">
                  {{ getStepIcon(checkpoint.step) }}
                </div>
              </div>

              <div class="timeline-content">
                <div class="content-header">
                  <h3>{{ checkpoint.title }}</h3>
                  <span class="timeline-date">
                    {{ checkpoint.completedAt | date:'dd/MM/yyyy' }}
                  </span>
                </div>

                <p class="checkpoint-desc">{{ checkpoint.description }}</p>

                <div class="checkpoint-proofs">
                  <div *ngIf="checkpoint.photoUrl" class="proof-item">
                    <span class="proof-label">Photo:</span>
                    <a [href]="checkpoint.photoUrl" target="_blank" class="proof-link">
                      Voir sur IPFS
                    </a>
                  </div>

                  <div *ngIf="checkpoint.blockchainTransactionId" class="proof-item">
                    <span class="proof-label">Blockchain:</span>
                    <a [href]="getEtherscanUrl(checkpoint.blockchainTransactionId)"
                       target="_blank"
                       class="proof-link">
                      {{ formatTxHash(checkpoint.blockchainTransactionId) }}
                      <span class="verification-badge"
                            [class.verified]="checkpoint.blockchainVerified">
                        {{ checkpoint.blockchainVerified ? '✓ Vérifié' : '⏳ En attente' }}
                      </span>
                    </a>
                  </div>

                  <div *ngIf="checkpoint.location" class="proof-item">
                    <span class="proof-label">Localisation:</span>
                    <span class="proof-value">
                      {{ checkpoint.location.lat.toFixed(6) }}, {{ checkpoint.location.lng.toFixed(6) }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Blockchain Proofs -->
        <section class="blockchain-section">
          <h2>Preuves Blockchain</h2>

          <div class="blockchain-stats">
            <div class="stat-card">
              <div class="stat-icon">⛓️</div>
              <div class="stat-content">
                <span class="stat-value">{{ certification?.blockchainTransactions?.length || 0 }}</span>
                <span class="stat-label">Transactions</span>
              </div>
            </div>

            <div class="stat-card">
              <div class="stat-icon">✓</div>
              <div class="stat-content">
                <span class="stat-value">{{ getVerifiedCount() }}</span>
                <span class="stat-label">Confirmées</span>
              </div>
            </div>

            <div class="stat-card">
              <div class="stat-icon">🔒</div>
              <div class="stat-content">
                <span class="stat-value">{{ getIntegrityScore() }}%</span>
                <span class="stat-label">Intégrité</span>
              </div>
            </div>
          </div>

          <div class="transactions-list">
            <h3>Dernières transactions</h3>
            <div *ngFor="let tx of certification?.blockchainTransactions" class="transaction-item">
              <a [href]="getEtherscanUrl(tx)" target="_blank" class="transaction-link">
                {{ formatTxHash(tx) }}
              </a>
              <button class="btn-verify-tx" (click)="verifyTransaction(tx)">
                Vérifier
              </button>
            </div>
          </div>
        </section>

        <!-- Warnings -->
        <section *ngIf="verificationResult?.warnings?.length" class="warnings-section">
          <h3>Avertissements</h3>
          <div class="warnings-list">
            <div *ngFor="let warning of verificationResult?.warnings" class="warning-item">
              ⚠️ {{ warning }}
            </div>
          </div>
        </section>
      </main>

      <!-- Actions -->
      <footer class="verify-footer">
        <div class="footer-actions">
          <button class="btn-secondary" (click)="printCertificate()">
            <span class="btn-icon">🖨️</span>
            Imprimer
          </button>
          <button class="btn-primary" (click)="shareCertification()">
            <span class="btn-icon">📤</span>
            Partager
          </button>
          <button class="btn-blockchain" (click)="viewOnBlockchain()">
            <span class="btn-icon">⛓️</span>
            Voir sur Blockchain
          </button>
        </div>

        <div class="footer-info">
          <p>Vérifié le {{ currentDate | date:'dd/MM/yyyy à HH:mm' }}</p>
          <p class="blockchain-info">
            ⛓️ Certifié via Jokko-Agro Blockchain • Powered by Ethereum
          </p>
        </div>
      </footer>
    </div>
  `,
  styleUrls: ['./certification-verify.component.css']
})
export class CertificationVerifyComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private certificationService = inject(CertificationService);
  private blockchainService = inject(BlockchainService);

  certificationId: string = '';
  certification: any = null;
  verificationResult: any = null;
  currentDate = new Date();
  verificationUrl: string = '';

  ngOnInit() {
    this.route.params.subscribe(params => {
      this.certificationId = params['id'];
      this.verificationUrl = `${window.location.origin}/verify/${this.certificationId}`;
      this.verifyCertification();
    });
  }

  async verifyCertification() {
    try {
      this.verificationResult = await this.certificationService.verifyCertification(this.certificationId);

      // Récupérer les détails de la certification
      const certRef = doc(this.firestore, 'certifications', this.certificationId);
      const certSnap = await getDoc(certRef);

      if (certSnap.exists()) {
        this.certification = {
          id: certSnap.id,
          ...certSnap.data(),
          startDate: certSnap.data()['startDate']?.toDate(),
          estimatedEndDate: certSnap.data()['estimatedEndDate']?.toDate()
        };
      }
    } catch (error) {
      console.error('Erreur vérification:', error);
    }
  }

  getStepIcon(step: string): string {
    const icons: { [key: string]: string } = {
      'INIT': '🌱',
      'FOLLOW_UP': '📈',
      'HARVEST': '✂️',
      'CHECKPOINT': '📍',
      'FINAL': '🏁'
    };
    return icons[step] || '📋';
  }

  getEtherscanUrl(txHash: string): string {
    return `https://sepolia.etherscan.io/tx/${txHash}`;
  }

  formatTxHash(txHash: string): string {
    return `${txHash.substring(0, 6)}...${txHash.substring(txHash.length - 4)}`;
  }

  getVerifiedCount(): number {
    if (!this.certification) return 0;
    return this.certification.checkpoints?.filter((cp: any) => cp.blockchainVerified).length || 0;
  }

  getIntegrityScore(): number {
    if (!this.certification || !this.certification.checkpoints) return 0;
    const total = this.certification.checkpoints.length;
    const verified = this.getVerifiedCount();
    return total > 0 ? Math.round((verified / total) * 100) : 0;
  }

  async verifyTransaction(txHash: string) {
    try {
      const result = await this.blockchainService.getTransactionDetails(txHash);
      if (result.confirmed) {
        alert(`Transaction confirmée! Bloc: ${result.blockNumber}`);
      } else {
        alert('Transaction en attente de confirmation...');
      }
    } catch (error) {
      alert('Erreur lors de la vérification de la transaction');
    }
  }

  printCertificate() {
    window.print();
  }

  shareCertification() {
    if (navigator.share) {
      navigator.share({
        title: 'Certification Produit Jokko-Agro',
        text: `Vérifiez la certification de ${this.certification?.productName}`,
        url: this.verificationUrl
      });
    } else {
      // Fallback: copier le lien
      navigator.clipboard.writeText(this.verificationUrl);
      alert('Lien copié dans le presse-papier!');
    }
  }

  viewOnBlockchain() {
    // Implémenter la vue sur un explorateur blockchain
    console.log('View on blockchain');
  }

  // Injection manuelle de firestore (pour l'exemple)
  private firestore: any;
}

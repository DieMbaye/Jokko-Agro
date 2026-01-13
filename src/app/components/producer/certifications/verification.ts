// verification.component.ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { CertificationService } from 'src/app/services/certification.service';
import { Certification } from 'src/app/services/certification.interfaces';

@Component({
  selector: 'app-verification',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="verification-container">
      <div class="verification-header">
        <h1>🏆 Vérification de Certification</h1>
        <p>Scannez ce QR code pour vérifier l'authenticité du produit</p>
      </div>

      @if (isLoading) {
        <div class="loading">Chargement...</div>
      }

      @if (!isLoading && certification) {
        <div class="verification-card">
          <!-- En-tête de vérification -->
          <div class="verification-status" [class]="getVerificationClass()">
            <div class="status-icon">{{ getVerificationIcon() }}</div>
            <div class="status-text">{{ getVerificationText() }}</div>
          </div>

          <!-- Informations du produit -->
          <div class="product-section">
            <h2>{{ certification.productName }}</h2>
            <div class="product-details">
              <div class="detail-item">
                <span class="label">🌱 Type:</span>
                <span class="value">{{ certification.productType | titlecase }}</span>
              </div>
              <div class="detail-item">
                <span class="label">👨‍🌾 Producteur:</span>
                <span class="value">{{ certification.producerName }}</span>
              </div>
              <div class="detail-item">
                <span class="label">📍 Localisation:</span>
                <span class="value">{{ certification.location.address || 'Localisation certifiée' }}</span>
              </div>
              <div class="detail-item">
                <span class="label">📅 Période:</span>
                <span class="value">
                  {{ certification.startDate | date:'dd/MM/yyyy' }} -
                  {{ certification.expectedHarvestDate | date:'dd/MM/yyyy' }}
                </span>
              </div>
              <div class="detail-item">
                <span class="label">⭐ Score:</span>
                <span class="value score">{{ certification.validationScore }}%</span>
              </div>
            </div>
          </div>

          <!-- Timeline de certification -->
          <div class="certification-timeline">
            <h3>📋 Points de contrôle</h3>
            <div class="timeline">
              @for (checkpoint of certification.checkpoints; track checkpoint.id; let i = $index) {
                <div class="timeline-item" [class.completed]="checkpoint.completed">
                  <div class="timeline-marker">
                    <div class="marker-dot"></div>
                    @if (i < certification.checkpoints.length - 1) {
                      <div class="marker-line"></div>
                    }
                  </div>
                  <div class="timeline-content">
                    <div class="checkpoint-info">
                      <h4>{{ checkpoint.title }} (J+{{ checkpoint.dayOffset }})</h4>
                      <p>{{ checkpoint.description }}</p>
                      <div class="checkpoint-status">
                        <span [class]="'status ' + (checkpoint.completed ? 'completed' : 'pending')">
                          {{ checkpoint.completed ? '✅ Complété' : '⏳ En attente' }}
                        </span>
                        @if (checkpoint.completed) {
                          <span class="score">Score: {{ checkpoint.verificationScore }}%</span>
                        }
                      </div>
                    </div>
                  </div>
                </div>
              }
            </div>
          </div>

          <!-- QR Code -->
          <div class="qr-section">
            <h3>📱 Code de vérification</h3>
            <div class="qr-container">
              <img [src]="getQRCodeUrl()" alt="QR Code de vérification">
              <div class="qr-info">
                <p><strong>ID de certification:</strong> {{ certification.id }}</p>
                <p><strong>Date de vérification:</strong> {{ today | date:'dd/MM/yyyy à HH:mm' }}</p>
              </div>
            </div>
            <button class="btn-download" (click)="downloadCertificate()">
              📄 Télécharger le certificat
            </button>
          </div>
        </div>
      }

      @if (!isLoading && !certification) {
        <div class="not-found">
          <div class="not-found-icon">❌</div>
          <h3>Certification non trouvée</h3>
          <p>Le code de vérification est invalide ou la certification a été supprimée.</p>
        </div>
      }
    </div>
  `,
  styles: [`
    .verification-container {
      padding: 2rem;
      max-width: 800px;
      margin: 0 auto;
      min-height: 100vh;
      background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
    }

    .verification-header {
      text-align: center;
      margin-bottom: 3rem;
    }

    .verification-header h1 {
      color: #2c3e50;
      margin-bottom: 0.5rem;
    }

    .verification-header p {
      color: #7f8c8d;
      font-size: 1.1rem;
    }

    .verification-card {
      background: white;
      border-radius: 20px;
      padding: 2rem;
      box-shadow: 0 10px 30px rgba(0,0,0,0.1);
    }

    .verification-status {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1.5rem;
      border-radius: 15px;
      margin-bottom: 2rem;
    }

    .verification-status.valid {
      background: #e8f5e9;
      border: 2px solid #27ae60;
    }

    .verification-status.pending {
      background: #fff3e0;
      border: 2px solid #f39c12;
    }

    .verification-status.invalid {
      background: #ffebee;
      border: 2px solid #e53935;
    }

    .status-icon {
      font-size: 2.5rem;
    }

    .status-text {
      font-size: 1.2rem;
      font-weight: 600;
    }

    .product-section {
      margin-bottom: 2rem;
    }

    .product-section h2 {
      color: #2c3e50;
      margin-bottom: 1.5rem;
      text-align: center;
    }

    .product-details {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 1rem;
      background: #f8f9fa;
      padding: 1.5rem;
      border-radius: 12px;
    }

    .detail-item {
      display: flex;
      justify-content: space-between;
      padding: 0.5rem 0;
      border-bottom: 1px solid #e0e0e0;
    }

    .detail-item:last-child {
      border-bottom: none;
    }

    .label {
      color: #666;
      font-weight: 500;
    }

    .value {
      color: #2c3e50;
      font-weight: 600;
    }

    .value.score {
      color: #27ae60;
    }

    .certification-timeline {
      margin: 2rem 0;
    }

    .certification-timeline h3 {
      color: #2c3e50;
      margin-bottom: 1.5rem;
    }

    .timeline {
      position: relative;
      padding-left: 30px;
    }

    .timeline::before {
      content: '';
      position: absolute;
      left: 15px;
      top: 0;
      bottom: 0;
      width: 2px;
      background: #e0e0e0;
    }

    .timeline-item {
      position: relative;
      margin-bottom: 2rem;
    }

    .timeline-marker {
      position: absolute;
      left: -30px;
      top: 10px;
    }

    .marker-dot {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #ddd;
      border: 3px solid white;
      box-shadow: 0 0 0 2px #ddd;
    }

    .timeline-item.completed .marker-dot {
      background: #27ae60;
      box-shadow: 0 0 0 2px #27ae60;
    }

    .marker-line {
      position: absolute;
      left: 7px;
      top: 16px;
      width: 2px;
      height: calc(100% + 2rem);
      background: #27ae60;
    }

    .timeline-content {
      background: #f8f9fa;
      padding: 1.5rem;
      border-radius: 10px;
    }

    .checkpoint-info h4 {
      margin: 0 0 0.5rem 0;
      color: #2c3e50;
    }

    .checkpoint-info p {
      margin: 0 0 1rem 0;
      color: #666;
    }

    .checkpoint-status {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .status {
      padding: 0.3rem 0.8rem;
      border-radius: 20px;
      font-size: 0.9rem;
      font-weight: 600;
    }

    .status.completed {
      background: #e8f5e9;
      color: #27ae60;
    }

    .status.pending {
      background: #fff3e0;
      color: #f39c12;
    }

    .qr-section {
      text-align: center;
      margin-top: 3rem;
      padding-top: 2rem;
      border-top: 2px solid #eee;
    }

    .qr-container {
      display: inline-block;
      background: white;
      padding: 1.5rem;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      margin-bottom: 1.5rem;
    }

    .qr-container img {
      width: 200px;
      height: 200px;
      display: block;
      margin: 0 auto 1rem;
    }

    .qr-info {
      text-align: left;
      font-size: 0.9rem;
      color: #666;
    }

    .btn-download {
      background: linear-gradient(135deg, #1976d2, #2196f3);
      color: white;
      border: none;
      padding: 1rem 2rem;
      border-radius: 10px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s;
    }

    .btn-download:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(33, 150, 243, 0.3);
    }

    .loading {
      text-align: center;
      padding: 3rem;
      color: #666;
    }

    .not-found {
      text-align: center;
      padding: 3rem;
      color: #666;
    }

    .not-found-icon {
      font-size: 4rem;
      margin-bottom: 1rem;
    }

    @media (max-width: 768px) {
      .verification-container {
        padding: 1rem;
      }

      .verification-card {
        padding: 1.5rem;
      }

      .product-details {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class VerificationComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private certificationService = inject(CertificationService);

  certification: Certification | null = null;
  isLoading = true;
  today = new Date();

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      await this.loadCertification(id);
    }
  }

  async loadCertification(id: string) {
    try {
      this.certification = await this.certificationService.getCertification(id);
    } catch (error) {
      console.error('Erreur chargement certification:', error);
      this.certification = null;
    } finally {
      this.isLoading = false;
    }
  }

  getVerificationClass(): string {
    if (!this.certification) return 'invalid';

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
    switch (this.getVerificationClass()) {
      case 'valid': return '✅';
      case 'pending': return '⏳';
      default: return '❌';
    }
  }

  getVerificationText(): string {
    switch (this.getVerificationClass()) {
      case 'valid': return 'Certification validée';
      case 'pending': return 'Certification en cours';
      default: return 'Certification non valide';
    }
  }

  getQRCodeUrl(): string {
    if (!this.certification) return '';
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
      JSON.stringify({
        id: this.certification.id,
        type: 'certification',
        url: `${window.location.origin}/verify/${this.certification.id}`,
        timestamp: new Date().toISOString(),
      })
    )}`;
  }

  downloadCertificate() {
    // TODO: Implémenter la génération de certificat PDF
    alert('Téléchargement du certificat à implémenter');
  }
}

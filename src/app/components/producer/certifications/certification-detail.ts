// certification-detail.ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CertificationService } from 'src/app/services/certification.service';
import { Certification, CertificationCheckpoint } from 'src/app/services/certification.interfaces';

@Component({
  selector: 'app-certification-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="certification-detail-container">
      <!-- En-tête -->
      <div class="detail-header">
        <button class="back-btn" (click)="goBack()">← Retour aux certifications</button>
        <div class="header-content">
          <h1>
            <span class="product-icon">{{ getProductIcon(certification?.productType) }}</span>
            {{ certification?.productName || 'Chargement...' }}
          </h1>
          <div class="header-actions">
            <button class="action-btn" (click)="refresh()">🔄 Actualiser</button>
            <button class="action-btn danger" (click)="cancelCertification()"
                    *ngIf="certification?.status === 'active'">❌ Annuler</button>
          </div>
        </div>
      </div>

      @if (isLoading) {
        <div class="loading">Chargement...</div>
      }

      @if (!isLoading && certification) {
        <!-- Informations principales -->
        <div class="overview-section">
          <div class="status-card">
            <div class="status-header">
              <span [class]="'status-badge ' + getStatusBadgeClass(certification.status)">
                {{ getStatusText(certification.status) }}
              </span>
              <div class="score-display">
                <div class="score-circle">{{ certification.validationScore }}%</div>
                <span>Score global</span>
              </div>
            </div>

            <div class="info-grid">
              <div class="info-item">
                <span class="info-label">🌱 Type</span>
                <span class="info-value">{{ certification.productType | titlecase }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">🏷️ Catégorie</span>
                <span class="info-value">{{ certification.productCategory }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">📍 Localisation</span>
                <span class="info-value">{{ certification.location.address || 'Non spécifié' }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">👨‍🌾 Producteur</span>
                <span class="info-value">{{ certification.producerName }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">📅 Début</span>
                <span class="info-value">{{ certification.startDate | date:'dd/MM/yyyy' }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">📅 Fin estimée</span>
                <span class="info-value">{{ certification.expectedHarvestDate | date:'dd/MM/yyyy' }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">⏱️ Durée</span>
                <span class="info-value">{{ certification.durationDays }} jours</span>
              </div>
              <div class="info-item">
                <span class="info-label">📊 Progression</span>
                <span class="info-value">
                  {{ certification.completedCheckpoints }}/{{ certification.totalCheckpoints }} points
                  ({{ getProgressPercentage(certification) }}%)
                </span>
              </div>
            </div>
          </div>

          <!-- Image initiale -->
          @if (initialImage) {
            <div class="initial-photo">
              <h3>📸 Photo initiale</h3>
              <img [src]="initialImage" alt="Photo initiale">
              <p class="photo-info">
                Prise le {{ certification.initialProof.timestamp | date:'dd/MM/yyyy à HH:mm' }}
              </p>
            </div>
          }
        </div>

        <!-- Onglets -->
        <div class="detail-tabs">
          <button [class.active]="activeTab === 'timeline'"
                  (click)="activeTab = 'timeline'">📅 Timeline</button>
          <button [class.active]="activeTab === 'checkpoints'"
                  (click)="activeTab = 'checkpoints'">📋 Points de contrôle</button>
          <button [class.active]="activeTab === 'proofs'"
                  (click)="activeTab = 'proofs'">📎 Preuves</button>
          <button [class.active]="activeTab === 'product'"
                  (click)="activeTab = 'product'">📦 Produit final</button>
        </div>

        <!-- Contenu des onglets -->
        <div class="tab-content">
          <!-- Timeline -->
          @if (activeTab === 'timeline') {
            <div class="timeline-view">
              <div class="timeline">
                @for (checkpoint of certification.checkpoints; track checkpoint.id; let i = $index) {
                  <div class="timeline-item"
                       [class.completed]="checkpoint.completed"
                       [class.current]="!checkpoint.completed && checkpoint.order === certification.currentCheckpointIndex">

                    <div class="timeline-marker">
                      <div class="marker-dot"></div>
                      @if (i < certification.checkpoints.length - 1) {
                        <div class="marker-line"></div>
                      }
                    </div>

                    <div class="timeline-content">
                      <div class="checkpoint-header">
                        <h4>{{ checkpoint.title }}</h4>
                        <div class="checkpoint-meta">
                          <span class="day-badge">J+{{ checkpoint.dayOffset }}</span>
                          <span [class]="'status-badge ' + (checkpoint.completed ? 'completed' : 'pending')">
                            {{ checkpoint.completed ? '✅ Complété' : '⏳ En attente' }}
                          </span>
                        </div>
                      </div>

                      <p class="checkpoint-desc">{{ checkpoint.description }}</p>

                      <div class="checkpoint-details">
                        <div class="required-proofs">
                          <strong>Preuves requises:</strong>
                          @for (proof of checkpoint.requiredProofs; track proof) {
                            <span class="proof-badge">{{
                              proof === 'photo' ? '📸' :
                              proof === 'gps' ? '📍' :
                              proof === 'measurement' ? '📏' : '📝'
                            }}</span>
                          }
                        </div>

                        @if (checkpoint.completed) {
                          <div class="completion-info">
                            <span>Complété le {{ checkpoint.completedAt | date:'dd/MM/yyyy à HH:mm' }}</span>
                            <span class="score">Score: {{ checkpoint.verificationScore }}%</span>
                          </div>

                          <button class="btn-view-proofs" (click)="viewCheckpointProofs(checkpoint)">
                            👁️ Voir les preuves
                          </button>
                        } @else if (checkpoint.order === certification.currentCheckpointIndex) {
                          <div class="current-checkpoint">
                            <p>📍 <strong>Point de contrôle actuel</strong></p>
                            <button class="btn-complete"
                                    [routerLink]="['/producer/certification', certification.id, 'checkpoint', checkpoint.id]">
                              📸 Compléter ce point
                            </button>
                          </div>
                        } @else {
                          <div class="upcoming-checkpoint">
                            <p>Prévu pour le {{ getCheckpointDate(checkpoint.dayOffset) | date:'dd/MM/yyyy' }}</p>
                          </div>
                        }
                      </div>
                    </div>
                  </div>
                }
              </div>
            </div>
          }

          <!-- Liste des checkpoints -->
          @if (activeTab === 'checkpoints') {
            <div class="checkpoints-grid">
              @for (checkpoint of certification.checkpoints; track checkpoint.id) {
                <div class="checkpoint-card"
                     [class.completed]="checkpoint.completed"
                     [class.current]="!checkpoint.completed && checkpoint.order === certification.currentCheckpointIndex">

                  <div class="checkpoint-header">
                    <div class="checkpoint-icon">
                      @switch (checkpoint.requiredProofs[0]) {
                        @case ('photo') { 📸 }
                        @case ('gps') { 📍 }
                        @case ('measurement') { 📏 }
                        @case ('note') { 📝 }
                        @default { 📋 }
                      }
                    </div>
                    <div class="checkpoint-info">
                      <h4>{{ checkpoint.title }}</h4>
                      <p class="checkpoint-description">{{ checkpoint.description }}</p>
                      <div class="checkpoint-meta">
                        <span class="day-badge">J+{{ checkpoint.dayOffset }}</span>
                        <span class="status-badge">
                          {{ checkpoint.completed ? '✅ Complété' : '⏳ En attente' }}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div class="checkpoint-body">
                    <div class="instructions">
                      <strong>Instructions:</strong> {{ checkpoint.instructions }}
                    </div>

                    <div class="required-proofs">
                      <strong>Preuves requises:</strong>
                      <div class="proofs-list">
                        @for (proof of checkpoint.requiredProofs; track proof) {
                          <span class="proof-badge">{{
                            proof === 'photo' ? '📸 Photo' :
                            proof === 'gps' ? '📍 GPS' :
                            proof === 'measurement' ? '📏 Mesure' : '📝 Note'
                          }}</span>
                        }
                      </div>
                    </div>

                    @if (checkpoint.completed) {
                      <div class="completion-details">
                        <p><strong>Complété le:</strong> {{ checkpoint.completedAt | date:'dd/MM/yyyy à HH:mm' }}</p>
                        <p><strong>Score:</strong> {{ checkpoint.verificationScore }}%</p>
                        <p><strong>Notes:</strong> {{ checkpoint.verificationNotes || 'Aucune' }}</p>
                      </div>

                      <button class="btn-view-proofs" (click)="viewCheckpointProofs(checkpoint)">
                        👁️ Voir les preuves
                      </button>
                    } @else if (checkpoint.order === certification.currentCheckpointIndex) {
                      <div class="current-actions">
                        <p>📍 Ce point de contrôle est actif</p>
                        <button class="btn-complete"
                                [routerLink]="['/producer/certification', certification.id, 'checkpoint', checkpoint.id]">
                          📸 Compléter maintenant
                        </button>
                      </div>
                    } @else {
                      <div class="upcoming-info">
                        <p>⏳ Prévu pour le {{ getCheckpointDate(checkpoint.dayOffset) | date:'dd/MM/yyyy' }}</p>
                      </div>
                    }
                  </div>
                </div>
              }
            </div>
          }

          <!-- Preuves -->
          @if (activeTab === 'proofs') {
            <div class="proofs-section">
              <div class="proofs-summary">
                <h3>📎 Résumé des preuves</h3>
                <div class="summary-grid">
                  <div class="summary-item">
                    <span class="summary-label">Total des preuves</span>
                    <span class="summary-value">{{ getTotalProofs() }}</span>
                  </div>
                  <div class="summary-item">
                    <span class="summary-label">Preuves vérifiées</span>
                    <span class="summary-value">{{ getVerifiedProofs() }}</span>
                  </div>
                  <div class="summary-item">
                    <span class="summary-label">Taux de vérification</span>
                    <span class="summary-value">{{ getVerificationRate() }}%</span>
                  </div>
                </div>
              </div>

              <div class="proofs-list">
                <h3>📋 Liste des preuves par checkpoint</h3>

                @for (checkpoint of certification.checkpoints; track checkpoint.id) {
                  @if (checkpoint.proofs && checkpoint.proofs.length > 0) {
                    <div class="checkpoint-proofs">
                      <h4>{{ checkpoint.title }} (J+{{ checkpoint.dayOffset }})</h4>

                      <div class="proofs-grid">
                        @for (proof of checkpoint.proofs; track proof.timestamp) {
                          <div class="proof-item">
                            <div class="proof-header">
                              <span class="proof-type">{{
                                proof.type === 'photo' ? '📸 Photo' :
                                proof.type === 'gps' ? '📍 GPS' :
                                proof.type === 'measurement' ? '📏 Mesure' : '📝 Note'
                              }}</span>
                              <span [class]="'proof-status ' + (proof.verified ? 'verified' : 'pending')">
                                {{ proof.verified ? '✅ Vérifié' : '⏳ En attente' }}
                              </span>
                            </div>

                            <div class="proof-content">
                              @if (proof.type === 'photo' && proof.photoUrl) {
                                <img [src]="getImageUrl(proof.photoUrl)"
                                     alt="Photo du checkpoint"
                                     class="proof-photo">
                              }

                              @if (proof.type === 'gps' && proof.gps) {
                                <p><strong>Coordonnées:</strong> {{ proof.gps.lat | number:'1.6-6' }}, {{ proof.gps.lng | number:'1.6-6' }}</p>
                                <p><strong>Précision:</strong> {{ proof.gps.accuracy }}m</p>
                              }

                              @if (proof.type === 'measurement' && proof.measurement) {
                                <p><strong>Valeur:</strong> {{ proof.measurement.value }} {{ proof.measurement.unit }}</p>
                              }

                              @if (proof.type === 'note' && proof.note) {
                                <p class="proof-note">{{ proof.note }}</p>
                              }
                            </div>

                            <div class="proof-footer">
                              <span class="proof-date">{{ proof.timestamp | date:'dd/MM/yyyy à HH:mm' }}</span>
                              <span class="proof-device">{{ proof.deviceInfo }}</span>
                            </div>
                          </div>
                        }
                      </div>
                    </div>
                  }
                }
              </div>
            </div>
          }

          <!-- Produit final -->
          @if (activeTab === 'product') {
            <div class="product-section">
              @if (certification.finalProduct) {
                <div class="product-card">
                  <div class="product-header">
                    <h3>📦 Produit certifié créé</h3>
                    <span class="product-status">✅ Publié</span>
                  </div>

                  <div class="product-details">
                    <div class="product-info">
                      <p><strong>Nom:</strong> {{ certification.finalProduct.name }}</p>
                      <p><strong>Quantité:</strong> {{ certification.finalProduct.quantity }} {{ certification.finalProduct.unit }}</p>
                      <p><strong>Prix:</strong> {{ certification.finalProduct.price | currency:'XOF':'symbol':'1.0-0' }}</p>
                    </div>

                    <div class="product-actions">
                      <button class="btn-primary" (click)="viewProduct()">👁️ Voir le produit</button>
                      <button class="btn-secondary" (click)="editProduct()">✏️ Modifier</button>
                    </div>
                  </div>
                </div>
              } @else {
                <div class="no-product">
                  <div class="empty-icon">📦</div>
                  <h4>Aucun produit créé</h4>
                  <p>Un produit certifié sera automatiquement créé à la fin de la certification</p>

                  @if (certification.status === 'completed' || certification.status === 'verified') {
                    <button class="btn-primary" (click)="createProduct()">
                      🚀 Créer un produit certifié
                    </button>
                  }
                </div>
              }

              <!-- Informations de certification -->
              <div class="certification-info">
                <h4>🏆 Informations de certification</h4>
                <div class="info-grid">
                  <div class="info-item">
                    <span class="info-label">Statut de vérification</span>
                    <span class="info-value">{{
                      certification.verificationStatus === 'auto_verified' ? '✅ Auto-vérifié' :
                      certification.verificationStatus === 'manually_verified' ? '✅ Vérifié manuellement' :
                      certification.verificationStatus === 'rejected' ? '❌ Rejeté' : '⏳ En attente'
                    }}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">Date de vérification</span>
                    <span class="info-value">{{
                      certification.verifiedAt ? (certification.verifiedAt | date:'dd/MM/yyyy') : 'Non vérifié'
                    }}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">Vérificateur</span>
                    <span class="info-value">{{ certification.verifierId || 'Non attribué' }}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">QR Code</span>
                    <span class="info-value">
                      <button class="btn-qr" (click)="viewQRCode()">📱 Voir QR Code</button>
                    </span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">Certificat</span>
                    <span class="info-value">
                      <button class="btn-certificate" (click)="viewCertificate()">📄 Voir certificat</button>
                    </span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">Lien de vérification</span>
                    <span class="info-value">
                      <button class="btn-link" (click)="copyVerificationLink()">🔗 Copier le lien</button>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          }
        </div>
      }

      <!-- Message d'erreur -->
      @if (errorMessage) {
        <div class="error-message">
          ❌ {{ errorMessage }}
        </div>
      }
    </div>
  `,
  styles: [`
    .certification-detail-container {
      padding: 2rem;
      max-width: 1400px;
      margin: 0 auto;
    }

    .detail-header {
      margin-bottom: 2rem;
    }

    .back-btn {
      background: none;
      border: none;
      color: #666;
      font-size: 1rem;
      cursor: pointer;
      padding: 0.5rem 0;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .back-btn:hover {
      color: #27ae60;
    }

    .header-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }

    .header-content h1 {
      margin: 0;
      font-size: 2rem;
      color: #2c3e50;
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .product-icon {
      font-size: 2.5rem;
    }

    .header-actions {
      display: flex;
      gap: 1rem;
    }

    .action-btn {
      padding: 0.6rem 1.2rem;
      border: 2px solid #ddd;
      border-radius: 8px;
      background: white;
      color: #666;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .action-btn:hover {
      background: #f8f9fa;
      border-color: #ccc;
    }

    .action-btn.danger {
      border-color: #ffcdd2;
      color: #e53935;
    }

    .action-btn.danger:hover {
      background: #ffebee;
    }

    /* Section vue d'ensemble */
    .overview-section {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 2rem;
      margin-bottom: 2rem;
    }

    .status-card {
      background: white;
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
    }

    .status-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid #eee;
    }

    .status-badge {
      display: inline-block;
      padding: 0.4rem 1rem;
      border-radius: 20px;
      font-weight: 600;
      font-size: 0.9rem;
    }

    .badge-draft { background: #f0f0f0; color: #666; }
    .badge-active { background: #e8f5e9; color: #27ae60; }
    .badge-completed { background: #e3f2fd; color: #1976d2; }
    .badge-verified { background: #fff3e0; color: #f39c12; }
    .badge-cancelled { background: #ffebee; color: #e53935; }
    .badge-expired { background: #f5f5f5; color: #9e9e9e; }

    .score-display {
      text-align: center;
    }

    .score-circle {
      width: 70px;
      height: 70px;
      border-radius: 50%;
      background: linear-gradient(135deg, #27ae60, #2ecc71);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 1.2rem;
      margin: 0 auto 0.5rem;
    }

    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 1rem;
    }

    .info-item {
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
    }

    .info-label {
      color: #666;
      font-size: 0.9rem;
    }

    .info-value {
      font-weight: 500;
      color: #2c3e50;
    }

    .initial-photo {
      background: white;
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
    }

    .initial-photo h3 {
      margin: 0 0 1rem 0;
      color: #2c3e50;
    }

    .initial-photo img {
      width: 100%;
      max-height: 300px;
      object-fit: cover;
      border-radius: 8px;
      margin-bottom: 0.8rem;
    }

    .photo-info {
      color: #666;
      font-size: 0.9rem;
      margin: 0;
    }

    /* Onglets */
    .detail-tabs {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 2rem;
      border-bottom: 1px solid #ddd;
      padding-bottom: 1rem;
    }

    .detail-tabs button {
      padding: 0.8rem 1.5rem;
      border: none;
      background: none;
      color: #666;
      font-size: 1rem;
      font-weight: 500;
      cursor: pointer;
      border-radius: 8px;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      transition: all 0.2s;
    }

    .detail-tabs button:hover {
      background: #f8f9fa;
      color: #2c3e50;
    }

    .detail-tabs button.active {
      background: #e8f5e9;
      color: #27ae60;
      font-weight: 600;
    }

    /* Timeline */
    .timeline-view {
      background: white;
      border-radius: 12px;
      padding: 2rem;
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
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
      z-index: 1;
    }

    .timeline-item.completed .marker-dot {
      background: #27ae60;
      box-shadow: 0 0 0 2px #27ae60;
    }

    .timeline-item.current .marker-dot {
      background: #f39c12;
      box-shadow: 0 0 0 2px #f39c12;
      animation: pulse 2s infinite;
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
      border: 1px solid #e0e0e0;
    }

    .checkpoint-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1rem;
    }

    .checkpoint-header h4 {
      margin: 0;
      color: #2c3e50;
      flex: 1;
    }

    .checkpoint-meta {
      display: flex;
      gap: 1rem;
      align-items: center;
    }

    .day-badge {
      background: #e3f2fd;
      color: #1976d2;
      padding: 0.3rem 0.8rem;
      border-radius: 20px;
      font-size: 0.85rem;
      font-weight: 600;
    }

    .checkpoint-desc {
      margin: 0 0 1rem 0;
      color: #666;
    }

    .checkpoint-details {
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid #eee;
    }

    .required-proofs {
      margin-bottom: 1rem;
    }

    .proof-badge {
      background: #f0f0f0;
      padding: 0.3rem 0.6rem;
      border-radius: 6px;
      font-size: 0.9rem;
      margin-right: 0.5rem;
    }

    .completion-info {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 1rem 0;
      padding: 0.8rem;
      background: #e8f5e9;
      border-radius: 8px;
      color: #27ae60;
    }

    .score {
      font-weight: 600;
    }

    .btn-view-proofs {
      background: none;
      border: 2px solid #ddd;
      padding: 0.5rem 1rem;
      border-radius: 8px;
      color: #666;
      cursor: pointer;
      font-size: 0.9rem;
    }

    .btn-view-proofs:hover {
      background: #f8f9fa;
    }

    .current-checkpoint {
      padding: 1rem;
      background: #fff3e0;
      border-radius: 8px;
      border: 2px dashed #f39c12;
      margin: 1rem 0;
    }

    .btn-complete {
      display: inline-block;
      background: #f39c12;
      color: white;
      border: none;
      padding: 0.8rem 1.5rem;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.3s;
      margin-top: 0.5rem;
    }

    .btn-complete:hover {
      background: #e67e22;
      transform: translateY(-2px);
    }

    .upcoming-checkpoint {
      padding: 0.8rem;
      background: #f8f9fa;
      border-radius: 8px;
      color: #7f8c8d;
    }

    /* Grid des checkpoints */
    .checkpoints-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
      gap: 1.5rem;
    }

    .checkpoint-card {
      background: white;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
      border: 1px solid #e0e0e0;
    }

    .checkpoint-card.current {
      border: 2px solid #f39c12;
      box-shadow: 0 0 0 3px rgba(243, 156, 18, 0.1);
    }

    .checkpoint-card .checkpoint-header {
      display: flex;
      align-items: center;
      padding: 1.5rem;
      gap: 1rem;
      background: #f8f9fa;
    }

    .checkpoint-icon {
      font-size: 2rem;
      width: 50px;
      height: 50px;
      background: white;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    .checkpoint-info {
      flex: 1;
    }

    .checkpoint-info h4 {
      margin: 0 0 0.3rem 0;
      color: #2c3e50;
    }

    .checkpoint-description {
      margin: 0 0 0.8rem 0;
      color: #666;
      font-size: 0.9rem;
    }

    .checkpoint-body {
      padding: 1.5rem;
    }

    .instructions {
      margin-bottom: 1rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid #eee;
    }

    .completion-details {
      margin: 1rem 0;
      padding: 1rem;
      background: #e8f5e9;
      border-radius: 8px;
    }

    .current-actions {
      text-align: center;
      padding: 1rem;
      background: #fff3e0;
      border-radius: 8px;
      margin: 1rem 0;
    }

    .upcoming-info {
      text-align: center;
      padding: 1rem;
      color: #7f8c8d;
    }

    /* Section preuves */
    .proofs-section {
      background: white;
      border-radius: 12px;
      padding: 2rem;
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
    }

    .proofs-summary {
      margin-bottom: 2rem;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid #eee;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1.5rem;
      margin-top: 1.5rem;
    }

    .summary-item {
      text-align: center;
      padding: 1.5rem;
      background: #f8f9fa;
      border-radius: 10px;
    }

    .summary-label {
      display: block;
      color: #666;
      font-size: 0.9rem;
      margin-bottom: 0.5rem;
    }

    .summary-value {
      display: block;
      font-size: 2rem;
      font-weight: bold;
      color: #2c3e50;
    }

    .proofs-list {
      margin-top: 2rem;
    }

    .checkpoint-proofs {
      margin-bottom: 2rem;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid #eee;
    }

    .checkpoint-proofs h4 {
      margin: 0 0 1rem 0;
      color: #2c3e50;
    }

    .proofs-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 1rem;
    }

    .proof-item {
      background: #f8f9fa;
      border-radius: 10px;
      padding: 1rem;
      border: 1px solid #e0e0e0;
    }

    .proof-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid #ddd;
    }

    .proof-type {
      font-weight: 600;
      color: #2c3e50;
    }

    .proof-status {
      font-size: 0.8rem;
      padding: 0.2rem 0.6rem;
      border-radius: 12px;
      font-weight: 600;
    }

    .proof-status.verified {
      background: #e8f5e9;
      color: #27ae60;
    }

    .proof-status.pending {
      background: #fff3e0;
      color: #f39c12;
    }

    .proof-photo {
      width: 100%;
      max-height: 200px;
      object-fit: cover;
      border-radius: 8px;
      margin: 0.5rem 0;
    }

    .proof-note {
      background: white;
      padding: 0.8rem;
      border-radius: 8px;
      margin: 0.5rem 0;
      font-style: italic;
    }

    .proof-footer {
      margin-top: 1rem;
      padding-top: 0.5rem;
      border-top: 1px solid #ddd;
      display: flex;
      justify-content: space-between;
      font-size: 0.8rem;
      color: #666;
    }

    /* Section produit */
    .product-section {
      background: white;
      border-radius: 12px;
      padding: 2rem;
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
    }

    .product-card {
      background: #f8f9fa;
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 2rem;
      border: 2px solid #e0e0e0;
    }

    .product-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }

    .product-status {
      background: #e8f5e9;
      color: #27ae60;
      padding: 0.3rem 0.8rem;
      border-radius: 20px;
      font-weight: 600;
      font-size: 0.9rem;
    }

    .product-details {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .product-actions {
      display: flex;
      gap: 1rem;
    }

    .btn-primary {
      background: linear-gradient(135deg, #27ae60, #2ecc71);
      color: white;
      border: none;
      padding: 0.8rem 1.5rem;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
    }

    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(39, 174, 96, 0.3);
    }

    .btn-secondary {
      background: #f5f5f5;
      color: #666;
      border: 2px solid #ddd;
      padding: 0.8rem 1.5rem;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
    }

    .btn-secondary:hover {
      background: #e0e0e0;
    }

    .no-product {
      text-align: center;
      padding: 3rem;
      color: #7f8c8d;
      margin-bottom: 2rem;
    }

    .empty-icon {
      font-size: 4rem;
      margin-bottom: 1rem;
      opacity: 0.3;
    }

    .no-product h4 {
      margin: 0 0 0.5rem 0;
      color: #2c3e50;
    }

    .certification-info {
      margin-top: 2rem;
      padding-top: 1.5rem;
      border-top: 1px solid #eee;
    }

    .certification-info h4 {
      margin: 0 0 1.5rem 0;
      color: #2c3e50;
    }

    .btn-qr, .btn-certificate, .btn-link {
      background: #e3f2fd;
      color: #1976d2;
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-size: 0.9rem;
      cursor: pointer;
    }

    .btn-qr:hover, .btn-certificate:hover, .btn-link:hover {
      background: #bbdefb;
    }

    /* Messages */
    .loading {
      text-align: center;
      padding: 3rem;
      color: #666;
    }

    .error-message {
      background: #ffebee;
      color: #c62828;
      padding: 1rem;
      border-radius: 8px;
      margin-top: 1rem;
      border-left: 4px solid #c62828;
    }

    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(243, 156, 18, 0.7); }
      70% { box-shadow: 0 0 0 10px rgba(243, 156, 18, 0); }
      100% { box-shadow: 0 0 0 0 rgba(243, 156, 18, 0); }
    }

    @media (max-width: 768px) {
      .certification-detail-container {
        padding: 1rem;
      }

      .overview-section {
        grid-template-columns: 1fr;
      }

      .header-content {
        flex-direction: column;
        align-items: flex-start;
        gap: 1rem;
      }

      .checkpoints-grid {
        grid-template-columns: 1fr;
      }

      .proofs-grid {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class CertificationDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private certificationService = inject(CertificationService);

  certification: Certification | null = null;
  initialImage: string | null = null;

  // Tabs
  activeTab: 'timeline' | 'checkpoints' | 'proofs' | 'product' = 'timeline';

  // State
  isLoading = true;
  errorMessage = '';

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigate(['/producer/certifications']);
      return;
    }

    await this.loadCertification(id);
  }

  async loadCertification(id: string) {
    this.isLoading = true;

    try {
      this.certification = await this.certificationService.getCertification(id);

      // Récupérer l'image initiale
      this.initialImage = this.certificationService.getImage(`${id}_initial`);

      console.log('Certification chargée:', this.certification);
    } catch (error: any) {
      console.error('Erreur chargement certification:', error);
      this.errorMessage = error.message || 'Erreur lors du chargement';
    } finally {
      this.isLoading = false;
    }
  }

  // Méthodes utilitaires
  getProductIcon(productType?: string): string {
    return this.certificationService.getProductIcon(productType || '');
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'draft': return 'badge-draft';
      case 'active': return 'badge-active';
      case 'completed': return 'badge-completed';
      case 'verified': return 'badge-verified';
      case 'cancelled': return 'badge-cancelled';
      case 'expired': return 'badge-expired';
      default: return 'badge-draft';
    }
  }

  getStatusText(status: string): string {
    const texts: { [key: string]: string } = {
      draft: 'Brouillon',
      active: 'En cours',
      completed: 'Terminé',
      verified: 'Certifié',
      cancelled: 'Annulé',
      expired: 'Expiré'
    };
    return texts[status] || status;
  }

  getProgressPercentage(cert: Certification): number {
    if (cert.totalCheckpoints === 0) return 0;
    return Math.round((cert.completedCheckpoints / cert.totalCheckpoints) * 100);
  }

  getCheckpointDate(dayOffset: number): Date {
    if (!this.certification) return new Date();
    return new Date(this.certification.startDate.getTime() + dayOffset * 24 * 60 * 60 * 1000);
  }

  // Méthodes pour les preuves
  getTotalProofs(): number {
    if (!this.certification) return 0;
    return this.certification.checkpoints.reduce((total, checkpoint) =>
      total + (checkpoint.proofs?.length || 0), 0);
  }

  getVerifiedProofs(): number {
    if (!this.certification) return 0;
    return this.certification.checkpoints.reduce((total, checkpoint) =>
      total + (checkpoint.proofs?.filter(p => p.verified).length || 0), 0);
  }

  getVerificationRate(): number {
    const total = this.getTotalProofs();
    const verified = this.getVerifiedProofs();
    if (total === 0) return 0;
    return Math.round((verified / total) * 100);
  }

  getImageUrl(photoUrl: string): string {
    if (photoUrl.startsWith('local://')) {
      // Récupérer de l'image store
      const parts = photoUrl.split('://')[1];
      const imageData = this.certificationService.getImage(parts);
      return imageData || 'assets/images/placeholder.jpg';
    }
    return photoUrl;
  }

  // Méthodes d'action
  viewCheckpointProofs(checkpoint: CertificationCheckpoint) {
    alert(`Preuves pour ${checkpoint.title}: ${checkpoint.proofs?.length || 0} preuves`);
    // Vous pouvez ouvrir un modal ici
  }

  async refresh() {
    if (!this.certification) return;
    await this.loadCertification(this.certification.id);
  }

  async cancelCertification() {
    if (!this.certification || !confirm('Voulez-vous vraiment annuler cette certification ?')) {
      return;
    }

    try {
      // TODO: Implémenter la méthode cancelCertification dans le service
      console.log('Annulation de la certification:', this.certification.id);
      this.errorMessage = '';
      // Rediriger vers la liste
      this.router.navigate(['/producer/certifications']);
    } catch (error: any) {
      this.errorMessage = error.message || 'Erreur lors de l\'annulation';
    }
  }

  viewProduct() {
    if (this.certification?.finalProduct) {
      this.router.navigate([`/producer/products/${this.certification.finalProduct.id}`]);
    }
  }

  editProduct() {
    // TODO: Implémenter l'édition du produit
    alert('Édition du produit à implémenter');
  }

  createProduct() {
    // TODO: Implémenter la création manuelle de produit
    alert('Création de produit à implémenter');
  }

  viewQRCode() {
    if (this.certification) {
      // Ouvrir le QR code dans une nouvelle fenêtre
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
        window.location.origin + '/verify/' + this.certification.id
      )}`;
      window.open(qrUrl, '_blank');
    }
  }

  viewCertificate() {
    if (this.certification) {
      // Générer un certificat PDF ou ouvrir une page
      const certUrl = `${window.location.origin}/certificate/${this.certification.id}`;
      window.open(certUrl, '_blank');
    }
  }

  copyVerificationLink() {
    if (this.certification) {
      const link = `${window.location.origin}/verify/${this.certification.id}`;
      navigator.clipboard.writeText(link).then(() => {
        alert('Lien copié dans le presse-papier !');
      });
    }
  }

  goBack() {
    this.router.navigate(['/producer/certifications']);
  }
}

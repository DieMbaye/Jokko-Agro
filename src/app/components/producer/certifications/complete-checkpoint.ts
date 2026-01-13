// complete-checkpoint.component.ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CertificationService } from 'src/app/services/certification.service';
import { Certification } from 'src/app/services/certification.interfaces';

@Component({
  selector: 'app-complete-checkpoint',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="complete-checkpoint-container">
      <div class="checkpoint-header">
        <button class="back-btn" (click)="goBack()">← Retour</button>
        <h1>📸 Compléter le point de contrôle</h1>
      </div>

      @if (isLoading) {
        <div class="loading">Chargement...</div>
      }

      @if (!isLoading && certification && checkpoint) {
        <div class="checkpoint-content">
          <!-- Informations du checkpoint -->
          <div class="checkpoint-info">
            <div class="checkpoint-card">
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
                <div class="checkpoint-details">
                  <h3>{{ checkpoint.title }}</h3>
                  <p class="checkpoint-description">{{ checkpoint.description }}</p>
                  <div class="checkpoint-meta">
                    <span class="day-badge">J+{{ checkpoint.dayOffset }}</span>
                    <span class="status-badge" [class.completed]="checkpoint.completed">
                      {{ checkpoint.completed ? 'Complété' : 'À compléter' }}
                    </span>
                  </div>
                </div>
              </div>

              <div class="instructions">
                <h4>📋 Instructions</h4>
                <p>{{ checkpoint.instructions }}</p>

                <div class="required-proofs">
                  <h5>Preuves requises:</h5>
                  <div class="proofs-list">
                    @for (proof of checkpoint.requiredProofs; track proof) {
                      <span class="proof-badge">
                        {{
                          proof === 'photo' ? '📸 Photo' :
                          proof === 'gps' ? '📍 Localisation GPS' :
                          proof === 'measurement' ? '📏 Mesure' : '📝 Note'
                        }}
                      </span>
                    }
                  </div>
                </div>
              </div>
            </div>

            <!-- Informations de la certification -->
            <div class="certification-info">
              <h4>🌱 Certification</h4>
              <div class="cert-details">
                <p><strong>Produit:</strong> {{ certification.productName }}</p>
                <p><strong>Type:</strong> {{ certification.productType }}</p>
                <p><strong>Localisation:</strong> {{ certification.location.address }}</p>
                <p><strong>Date de début:</strong> {{ certification.startDate | date:'dd/MM/yyyy' }}</p>
              </div>
            </div>
          </div>

          <!-- Formulaire de complétion -->
          <div class="checkpoint-form">
            <h3>Ajouter les preuves</h3>

            <!-- Photo -->
            @if (checkpoint.requiredProofs.includes('photo')) {
              <div class="form-section">
                <label>📸 Photo du champ</label>
                <div class="photo-upload-area"
                     (click)="triggerPhotoUpload()">
                  <input #photoInput
                         type="file"
                         accept="image/*"
                         capture="environment"
                         (change)="onPhotoSelected($event)"
                         hidden>

                  @if (photoPreview) {
                    <img [src]="photoPreview" class="photo-preview">
                    <div class="photo-overlay">
                      <button type="button" class="btn-change">Changer la photo</button>
                    </div>
                  } @else {
                    <div class="upload-instructions">
                      <div class="upload-icon">📸</div>
                      <p>Cliquez pour prendre une photo</p>
                      <small>Photo actuelle du champ/plantation</small>
                    </div>
                  }
                </div>
              </div>
            }

            <!-- Mesure -->
            @if (checkpoint.requiredProofs.includes('measurement') && checkpoint.measurementType) {
              <div class="form-section">
                <label>📏 Mesure - {{ getMeasurementLabel(checkpoint.measurementType) }}</label>
                <div class="measurement-input">
                  <input type="number"
                         [(ngModel)]="measurementValue"
                         [placeholder]="'Valeur en ' + checkpoint.measurementUnit"
                         step="0.01"
                         min="0">
                  <span class="measurement-unit">{{ checkpoint.measurementUnit }}</span>
                </div>
              </div>
            }

            <!-- Note -->
            @if (checkpoint.requiredProofs.includes('note')) {
              <div class="form-section">
                <label>📝 Notes et observations</label>
                <textarea [(ngModel)]="noteText"
                          placeholder="Décrivez l'état de la culture, observations..."
                          rows="4"></textarea>
              </div>
            }

            <!-- Boutons d'action -->
            <div class="form-actions">
              <button class="btn-secondary" (click)="goBack()">Annuler</button>
              <button class="btn-primary"
                      [disabled]="!isFormValid() || isSubmitting"
                      (click)="submitCheckpoint()">
                @if (isSubmitting) {
                  <span class="spinner"></span> Enregistrement...
                } @else {
                  ✅ Soumettre le point de contrôle
                }
              </button>
            </div>
          </div>
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
    .complete-checkpoint-container {
      padding: 2rem;
      max-width: 1200px;
      margin: 0 auto;
    }

    .checkpoint-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 2px solid #e0e0e0;
    }

    .back-btn {
      background: none;
      border: 2px solid #ddd;
      padding: 0.5rem 1rem;
      border-radius: 8px;
      cursor: pointer;
      font-size: 1rem;
      transition: all 0.2s;
    }

    .back-btn:hover {
      background: #f5f5f5;
    }

    .checkpoint-content {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2rem;
    }

    .checkpoint-card {
      background: white;
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
      margin-bottom: 1.5rem;
    }

    .checkpoint-header {
      display: flex;
      align-items: center;
      gap: 1.5rem;
      border-bottom: none;
      padding-bottom: 0;
    }

    .checkpoint-icon {
      font-size: 2.5rem;
      width: 70px;
      height: 70px;
      background: #f0f7ff;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .checkpoint-details h3 {
      margin: 0 0 0.5rem 0;
      color: #2c3e50;
    }

    .checkpoint-description {
      margin: 0 0 1rem 0;
      color: #666;
    }

    .checkpoint-meta {
      display: flex;
      gap: 1rem;
    }

    .day-badge {
      background: #e3f2fd;
      color: #1976d2;
      padding: 0.3rem 0.8rem;
      border-radius: 20px;
      font-weight: 600;
    }

    .status-badge {
      background: #f0f0f0;
      color: #666;
      padding: 0.3rem 0.8rem;
      border-radius: 20px;
      font-weight: 600;
    }

    .status-badge.completed {
      background: #e8f5e9;
      color: #27ae60;
    }

    .instructions {
      margin-top: 1.5rem;
    }

    .instructions h4 {
      margin: 0 0 0.8rem 0;
      color: #2c3e50;
    }

    .required-proofs h5 {
      margin: 1rem 0 0.5rem 0;
      color: #666;
    }

    .proofs-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .proof-badge {
      background: #f8f9fa;
      border: 1px solid #ddd;
      padding: 0.4rem 0.8rem;
      border-radius: 6px;
      font-size: 0.9rem;
    }

    .certification-info {
      background: #f8f9fa;
      border-radius: 12px;
      padding: 1.5rem;
    }

    .certification-info h4 {
      margin: 0 0 1rem 0;
      color: #2c3e50;
    }

    .cert-details p {
      margin: 0.5rem 0;
      color: #666;
    }

    /* Formulaire */
    .checkpoint-form {
      background: white;
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
    }

    .form-section {
      margin-bottom: 1.5rem;
    }

    .form-section label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 600;
      color: #2c3e50;
    }

    .photo-upload-area {
      border: 3px dashed #ddd;
      border-radius: 12px;
      padding: 2rem;
      text-align: center;
      cursor: pointer;
      position: relative;
      transition: border-color 0.3s;
      overflow: hidden;
    }

    .photo-upload-area:hover {
      border-color: #27ae60;
    }

    .photo-preview {
      width: 100%;
      max-height: 300px;
      object-fit: cover;
      border-radius: 8px;
    }

    .photo-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.3s;
    }

    .photo-upload-area:hover .photo-overlay {
      opacity: 1;
    }

    .btn-change {
      background: white;
      color: #2c3e50;
      border: none;
      padding: 0.8rem 1.5rem;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
    }

    .upload-instructions {
      color: #666;
    }

    .upload-icon {
      font-size: 3rem;
      margin-bottom: 1rem;
      opacity: 0.7;
    }

    .measurement-input {
      display: flex;
      gap: 1rem;
      align-items: center;
    }

    .measurement-input input {
      flex: 1;
      padding: 0.8rem 1rem;
      border: 2px solid #ddd;
      border-radius: 8px;
      font-size: 1rem;
    }

    .measurement-unit {
      font-weight: 600;
      color: #666;
      min-width: 80px;
    }

    textarea {
      width: 100%;
      padding: 0.8rem 1rem;
      border: 2px solid #ddd;
      border-radius: 8px;
      font-size: 1rem;
      font-family: inherit;
      resize: vertical;
    }

    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: 1rem;
      margin-top: 2rem;
      padding-top: 1.5rem;
      border-top: 1px solid #eee;
    }

    .btn-primary {
      background: linear-gradient(135deg, #27ae60, #2ecc71);
      color: white;
      border: none;
      padding: 0.8rem 1.5rem;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s;
    }

    .btn-primary:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(39, 174, 96, 0.3);
    }

    .btn-primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .btn-secondary {
      background: #f5f5f5;
      color: #666;
      border: 2px solid #ddd;
      padding: 0.8rem 1.5rem;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-secondary:hover {
      background: #e0e0e0;
    }

    .error-message {
      background: #ffebee;
      color: #c62828;
      padding: 1rem;
      border-radius: 8px;
      margin-top: 1rem;
      border-left: 4px solid #c62828;
    }

    .spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top: 2px solid white;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-right: 0.5rem;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    @media (max-width: 768px) {
      .checkpoint-content {
        grid-template-columns: 1fr;
      }

      .complete-checkpoint-container {
        padding: 1rem;
      }
    }
  `]
})
export class CompleteCheckpointComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private certificationService = inject(CertificationService);

  certificationId = '';
  checkpointId = '';
  certification: Certification | null = null;
  checkpoint: any = null;

  // Form data
  photoFile: File | null = null;
  photoPreview: string | null = null;
  measurementValue: number | null = null;
  noteText = '';

  // State
  isLoading = true;
  isSubmitting = false;
  errorMessage = '';

  async ngOnInit() {
    this.certificationId = this.route.snapshot.paramMap.get('id') || '';
    this.checkpointId = this.route.snapshot.paramMap.get('checkpointId') || '';

    if (!this.certificationId || !this.checkpointId) {
      this.router.navigate(['/producer/certifications']);
      return;
    }

    await this.loadData();
  }

  async loadData() {
    this.isLoading = true;

    try {
      this.certification = await this.certificationService.getCertification(this.certificationId);
      this.checkpoint = this.certification?.checkpoints.find(cp => cp.id === this.checkpointId);

      if (!this.certification || !this.checkpoint) {
        throw new Error('Certification ou checkpoint non trouvé');
      }

      // Vérifier si le checkpoint peut être complété
      if (this.checkpoint.completed) {
        this.errorMessage = 'Ce checkpoint est déjà complété';
      }
    } catch (error: any) {
      console.error('Erreur chargement:', error);
      this.errorMessage = error.message || 'Erreur lors du chargement';
    } finally {
      this.isLoading = false;
    }
  }

  triggerPhotoUpload() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = (event: any) => this.onPhotoSelected(event);
    input.click();
  }

  onPhotoSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      // Validation
      if (!file.type.startsWith('image/')) {
        this.errorMessage = 'Veuillez sélectionner une image';
        return;
      }

      if (file.size > 5 * 1024 * 1024) { // 5MB
        this.errorMessage = 'L\'image est trop volumineuse (max 5MB)';
        return;
      }

      this.photoFile = file;

      // Aperçu
      const reader = new FileReader();
      reader.onload = () => {
        this.photoPreview = reader.result as string;
      };
      reader.readAsDataURL(file);

      this.errorMessage = '';
    }
  }

  getMeasurementLabel(type: string): string {
    switch (type) {
      case 'weight': return 'Poids';
      case 'height': return 'Hauteur';
      case 'count': return 'Nombre';
      case 'volume': return 'Volume';
      default: return 'Mesure';
    }
  }

  isFormValid(): boolean {
    // Vérifier les preuves requises
    if (this.checkpoint?.requiredProofs.includes('photo') && !this.photoFile) {
      return false;
    }

    if (this.checkpoint?.requiredProofs.includes('measurement') &&
        this.measurementValue === null) {
      return false;
    }

    if (this.checkpoint?.requiredProofs.includes('note') &&
        !this.noteText.trim()) {
      return false;
    }

    return true;
  }

  async submitCheckpoint() {
    if (!this.isFormValid() || !this.certification || !this.checkpoint) {
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';

    try {
      console.log('Soumission checkpoint...');

      await this.certificationService.completeCheckpoint(
        this.certificationId,
        this.checkpointId,
        {
          photo: this.photoFile || undefined,
          measurement: this.measurementValue !== null ? {
            value: this.measurementValue,
            unit: this.checkpoint.measurementUnit || 'unit'
          } : undefined,
          note: this.noteText.trim() || undefined
        }
      );

      // Retour à la certification
      this.router.navigate([`/producer/certification/${this.certificationId}`]);

    } catch (error: any) {
      console.error('Erreur soumission:', error);
      this.errorMessage = error.message || 'Erreur lors de la soumission';
      this.isSubmitting = false;
    }
  }

  goBack() {
    this.router.navigate([`/producer/certification/${this.certificationId}`]);
  }
}

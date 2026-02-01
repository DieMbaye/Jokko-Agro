// complete-checkpoint.component.ts - CORRIGÉ
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CertificationService } from 'src/app/services/certification.service';
import { Certification } from 'src/app/interfaces/certification.interfaces';
import { BlockchainService } from 'src/app/services/blockchain.service';

@Component({
  selector: 'app-complete-checkpoint',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './complete-checkpoint.component.html',
  styleUrls: ['./complete-checkpoint.component.css'],
})
export class CompleteCheckpointComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private certificationService = inject(CertificationService);
  private blockchainService = inject(BlockchainService);

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
  successMessage = '';

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
      this.certification = await this.certificationService.getCertification(
        this.certificationId,
      );
      this.checkpoint = this.certification?.checkpoints.find(
        (cp) => cp.id === this.checkpointId,
      );

      if (!this.certification || !this.checkpoint) {
        throw new Error('Certification ou checkpoint non trouvé');
      }

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
      if (!file.type.startsWith('image/')) {
        this.errorMessage = 'Veuillez sélectionner une image';
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        this.errorMessage = "L'image est trop volumineuse (max 5MB)";
        return;
      }

      this.photoFile = file;

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
      case 'weight':
        return 'Poids';
      case 'height':
        return 'Hauteur';
      case 'count':
        return 'Nombre';
      case 'volume':
        return 'Volume';
      default:
        return 'Mesure';
    }
  }

  isFormValid(): boolean {
    if (this.checkpoint?.requiredProofs.includes('photo') && !this.photoFile) {
      return false;
    }

    if (
      this.checkpoint?.requiredProofs.includes('measurement') &&
      this.measurementValue === null
    ) {
      return false;
    }

    if (
      this.checkpoint?.requiredProofs.includes('note') &&
      !this.noteText.trim()
    ) {
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

      // 1. Compléter le checkpoint via le service de certification
      const updatedCertification = await this.certificationService.completeCheckpoint(
        this.certificationId,
        this.checkpointId,
        {
          photo: this.photoFile || undefined,
          measurement:
            this.measurementValue !== null
              ? {
                  value: this.measurementValue,
                  unit: this.checkpoint.measurementUnit || 'unit',
                }
              : undefined,
          note: this.noteText.trim() || undefined,
        }
      );

      // 2. Enregistrer la preuve sur la blockchain (optionnel)
      let blockchainRecord = null;
      if (this.photoFile && this.blockchainService) {
        try {
          blockchainRecord = await this.blockchainService.registerProofOnBlockchain(
            await this.blockchainService.createCanonicalObject({
              productId: this.certification.id,
              photoFile: this.photoFile,
              lat: this.certification.location.lat,
              lng: this.certification.location.lng,
              step: 'CHECKPOINT',
              checkpointId: this.checkpoint.id,
              checkpointOrder: this.checkpoint.order,
            }),
          );

          console.log(
            '✅ Preuve enregistrée sur blockchain:',
            blockchainRecord?.transactionId,
          );
        } catch (blockchainError) {
          console.warn('Blockchain non disponible:', blockchainError);
        }
      }

      // 3. Afficher le succès
      this.successMessage = `✅ Checkpoint complété ! ${blockchainRecord?.transactionId ? `Transaction blockchain: ${blockchainRecord.transactionId}` : ''}`;

      // Retour à la certification
      setTimeout(() => {
        this.router.navigate([
          `/producer/certification/${this.certificationId}`,
        ]);
      }, 2000);
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

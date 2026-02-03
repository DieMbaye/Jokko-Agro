// complete-checkpoint.component.ts - CORRIGÉ
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CertificationService } from 'src/app/services/certification.service';
import { Certification } from 'src/app/interfaces/certification.interfaces';
import { BlockchainService } from 'src/app/blockchain/services/blockchain.service';

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

// complete-checkpoint.component.ts - MISE À JOUR
async submitCheckpoint() {
  if (!this.isFormValid() || !this.certification || !this.checkpoint) {
    return;
  }

  this.isSubmitting = true;
  this.errorMessage = '';

  try {
    // 1. Utiliser le service blockchain pour créer une preuve
    let blockchainProof = null;

    if (this.photoFile) {
      blockchainProof = await this.blockchainService.createCertificationProof(
        this.certification.id,
        this.photoFile,
        'CHECKPOINT',
        this.checkpoint.id,
        this.checkpoint.order,
        {
          lat: this.certification.location.lat,
          lng: this.certification.location.lng
        }
      );

      if (!blockchainProof.success) {
        console.warn('Blockchain non disponible, sauvegarde locale seulement');
      }
    }

    // 2. Compléter le checkpoint
    const updatedCertification = await this.certificationService.completeCheckpoint(
      this.certificationId,
      this.checkpointId,
      {
        photo: this.photoFile || undefined,
        measurement: this.measurementValue !== null ? {
          value: this.measurementValue,
          unit: this.checkpoint.measurementUnit || 'unit'
        } : undefined,
        note: this.noteText.trim() || undefined,
      }
    );

    // 3. Afficher le résultat
    if (blockchainProof?.success) {
      this.successMessage = `✅ Checkpoint complété et certifié sur blockchain!`;
      console.log('Transaction:', blockchainProof.blockchainProof?.txHash);
      console.log('IPFS CID:', blockchainProof.ipfsProof?.cid);
    } else {
      this.successMessage = '✅ Checkpoint complété (sans blockchain)';
    }

    // 4. Redirection
    setTimeout(() => {
      this.router.navigate([`/producer/certification/${this.certificationId}`]);
    }, 2000);

  } catch (error: any) {
    console.error('Erreur:', error);
    this.errorMessage = error.message || 'Erreur lors de la soumission';
    this.isSubmitting = false;
  }
}

  goBack() {
    this.router.navigate([`/producer/certification/${this.certificationId}`]);
  }
}

// components/producer/certification-track/certification-track.component.ts
import {
  Component,
  OnInit,
  inject,
  ViewChild,
  ElementRef,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  CertificationService,
  Certification,
  CertificationCheckpoint,
} from '../../../../services/certification.service';
import { GeolocationService } from '../../../../services/geolocation.service';
import { BlockchainService } from 'src/app/blockchain/services/blockchain.service';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-certification-track',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './certification-track.component.html',
  styleUrls: ['./certification-track.component.css'],
})
export class CertificationTrackComponent implements OnInit {
  @ViewChild('photoInput') photoInput!: ElementRef<HTMLInputElement>;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private certificationService = inject(CertificationService);
  private geolocationService = inject(GeolocationService);
  private blockchainService = inject(BlockchainService);
  private cdr = inject(ChangeDetectorRef);

  certificationId: string = '';
  certification: Certification | null = null;

  showCheckpointModal = false;
  currentCheckpoint: CertificationCheckpoint | null = null;
  currentCheckpointIndex: number = 0;

  checkpointPhotoFile: File | null = null;
  checkpointPhotoPreview: string | null = null;
  checkpointNotes: string = '';

  currentLocation: { lat: number; lng: number } | null = null;
  locationAccuracy: number = 0;

  validationErrors: string[] = [];
  isSubmitting = false;
  isLoading = true;

  ngOnInit() {
    this.route.params.subscribe((params) => {
      this.certificationId = params['id'];
      this.loadCertification();
    });
  }

  async loadCertification() {
    this.isLoading = true;
    try {
      const certification =
        await this.certificationService.getCertificationById(
          this.certificationId,
        );

      this.certification = certification;
      this.isLoading = false;

      this.cdr.markForCheck();
    } catch (error) {
      console.error('Erreur chargement certification:', error);
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  showCompletionConfirmation() {
    const confirmation = confirm(
      'Félicitations ! Tous les checkpoints sont complétés.\n\n' +
        'Voulez-vous finaliser la certification et publier le produit sur le marché ?\n\n' +
        '✓ Le produit sera publié avec statut "disponible"\n' +
        '✓ Le certificat de certification sera généré\n' +
        '✓ Les acheteurs pourront voir votre produit certifié',
    );

    if (confirmation) {
      this.completeAndPublishCertification();
    } else {
      this.showNotification(
        'info',
        'Vous pouvez finaliser la certification plus tard depuis cette page.',
      );
    }
  }

  showCompleteButton(checkpoint: CertificationCheckpoint): boolean {
    return !checkpoint.completed && this.isCurrentCheckpoint(checkpoint);
  }

  getButtonText(checkpoint: CertificationCheckpoint): string {
    return checkpoint.order === 1 ? 'Commencer' : 'Compléter';
  }

  async initializeCheckpoints() {
    try {
      this.isLoading = true;

      const result =
        await this.certificationService.initializeCertificationCheckpoints(
          this.certificationId,
        );

      if (result.success) {
        this.showNotification('success', 'Checkpoints initialisés avec succès');
        await this.loadCertification();
      } else {
        this.showNotification(
          'error',
          result.error || "Erreur d'initialisation",
        );
      }
    } catch (error: any) {
      console.error('Erreur initialisation checkpoints:', error);
      this.showNotification(
        'error',
        error.message || "Erreur d'initialisation",
      );
    } finally {
      this.isLoading = false;
    }
  }

  async completeAndPublishCertification() {
    this.isLoading = true;
    try {
      const result =
        await this.certificationService.completeCertificationAndPublish(
          this.certificationId,
        );

      if (result.success) {
        this.showNotification(
          'success',
          'Certification terminée et produit publié avec succès !\n' +
            'Votre produit est maintenant visible sur le marché.',
        );

        await this.loadCertification();

        setTimeout(() => {
          if (result.productId) {
            this.router.navigate(['/producer/products', result.productId]);
          }
        }, 3000);
      } else {
        throw new Error(result.error || 'Erreur lors de la publication');
      }
    } catch (error: any) {
      console.error('Erreur publication produit:', error);
      this.showNotification(
        'error',
        error.message || 'Erreur lors de la publication',
      );
    } finally {
      this.isLoading = false;
    }
  }

  getStatusText(status: string): string {
    const texts: { [key: string]: string } = {
      draft: 'Brouillon',
      active: 'En cours',
      completed: 'Terminé',
      verified: 'Vérifié',
      expired: 'Expiré',
      cancelled: 'Annulé',
    };
    return texts[status] || status;
  }

  getCheckpointStatus(checkpoint: CertificationCheckpoint): string {
    if (checkpoint.completed) {
      return checkpoint.blockchainVerified ? 'verified' : 'pending';
    }
    return 'upcoming';
  }

  isCurrentCheckpoint(checkpoint: CertificationCheckpoint): boolean {
    if (!this.certification) return false;

    const firstIncompleteIndex = this.certification.checkpoints.findIndex(
      (cp) => !cp.completed,
    );
    const checkpointIndex = this.certification.checkpoints.findIndex(
      (cp) => cp.id === checkpoint.id,
    );

    return checkpointIndex === firstIncompleteIndex;
  }

  openCheckpointModal(checkpoint: CertificationCheckpoint, index: number) {
    if (!checkpoint.completed && this.isCurrentCheckpoint(checkpoint)) {
      this.currentCheckpoint = checkpoint;
      this.currentCheckpointIndex = index;
      this.showCheckpointModal = true;
      this.resetCheckpointForm();
    }
  }

  closeCheckpointModal() {
    this.showCheckpointModal = false;
    this.currentCheckpoint = null;
    this.resetCheckpointForm();
  }

  resetCheckpointForm() {
    this.checkpointPhotoFile = null;
    this.checkpointPhotoPreview = null;
    this.checkpointNotes = '';
    this.currentLocation = null;
    this.validationErrors = [];
  }

  triggerPhotoUpload() {
    this.photoInput.nativeElement.click();
  }

  onPhotoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];

      if (this.validatePhotoFile(file)) {
        this.checkpointPhotoFile = file;

        const reader = new FileReader();
        reader.onload = () => {
          this.checkpointPhotoPreview = reader.result as string;
        };
        reader.readAsDataURL(file);
      }
    }
  }

  validatePhotoFile(file: File): boolean {
    const validTypes = ['image/jpeg', 'image/png'];
    const maxSize = 10 * 1024 * 1024;

    if (!validTypes.includes(file.type)) {
      this.validationErrors.push('Format invalide. Utilisez JPG ou PNG.');
      return false;
    }

    if (file.size > maxSize) {
      this.validationErrors.push('Fichier trop volumineux (max 10MB).');
      return false;
    }

    return true;
  }

  removePhoto() {
    this.checkpointPhotoFile = null;
    this.checkpointPhotoPreview = null;
  }

  async getCurrentLocation() {
    try {
      const position = await this.geolocationService.getCurrentPosition();
      this.currentLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      this.locationAccuracy = position.coords.accuracy;
    } catch (error: any) {
      console.error('Erreur géolocalisation:', error);
      this.validationErrors.push("Impossible d'obtenir la localisation.");
    }
  }

  updateValidationErrors(): boolean {
    if (!this.currentCheckpoint) return false;

    const errors: string[] = [];

    if (this.currentCheckpoint.photoRequired && !this.checkpointPhotoFile) {
      errors.push('Une photo est requise pour ce checkpoint.');
    }

    if (this.currentCheckpoint.locationRequired && !this.currentLocation) {
      errors.push('La localisation est requise pour ce checkpoint.');
    }

    if (JSON.stringify(errors) !== JSON.stringify(this.validationErrors)) {
      setTimeout(() => {
        this.validationErrors = errors;
        this.cdr.markForCheck();
      });
    }

    return errors.length === 0;
  }

  canSubmitCheckpoint(): boolean {
    return this.updateValidationErrors();
  }

  async submitCheckpoint() {
    if (!this.currentCheckpoint || !this.canSubmitCheckpoint()) return;

    this.isSubmitting = true;
    try {
      if (!this.checkpointPhotoFile || !this.currentLocation) {
        throw new Error('Photo et localisation requises');
      }

      const result = await this.certificationService.uploadCheckpointProof(
        this.certificationId,
        this.currentCheckpointIndex,
        this.checkpointPhotoFile,
        this.currentLocation,
        this.checkpointNotes,
      );

      if (result.success) {
        await this.loadCertification();
        this.closeCheckpointModal();

        if (
          this.currentCheckpointIndex ===
          (this.certification?.checkpoints.length || 0) - 1
        ) {
          this.showCompletionConfirmation();
        } else {
          this.showNotification(
            'success',
            'Checkpoint enregistré avec succès!',
          );
        }
      } else {
        throw new Error(result.error || "Erreur lors de l'enregistrement");
      }
    } catch (error: any) {
      console.error('Erreur enregistrement checkpoint:', error);
      this.validationErrors.push(error.message);
    } finally {
      this.isSubmitting = false;
    }
  }

  viewCheckpointDetails(checkpoint: CertificationCheckpoint) {
    console.log('View checkpoint:', checkpoint);
  }

  viewPhoto(photoUrl: string) {
    window.open(photoUrl, '_blank');
  }

  getEtherscanUrl(txHash: string): string {
    return `https://sepolia.etherscan.io/tx/${txHash}`;
  }

  formatTxHash(txHash: string): string {
    return `${txHash.substring(0, 10)}...${txHash.substring(txHash.length - 8)}`;
  }

  getVerifiedCount(): number {
    if (!this.certification) return 0;
    return this.certification.checkpoints.filter((cp) => cp.blockchainVerified)
      .length;
  }

  getIntegrityScore(): number {
    if (!this.certification || this.certification.totalCheckpoints === 0)
      return 0;
    return Math.round(
      (this.getVerifiedCount() / this.certification.totalCheckpoints) * 100,
    );
  }

  verifyOnBlockchain() {
    console.log('Verify on blockchain');
  }

  viewCertificate() {
    if (this.certification?.certificateUrl) {
      window.open(this.certification.certificateUrl, '_blank');
    }
  }

  generateQRCode() {
    console.log('Generate QR code');
  }

  exportData() {
    console.log('Export data');
  }

  showNotification(type: 'success' | 'error' | 'info', message: string) {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.remove();
    }, 3000);
  }

  goBack() {
    this.router.navigate(['/producer/certifications']);
  }
}

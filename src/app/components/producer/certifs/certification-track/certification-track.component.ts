// components/producer/certification-track/certification-track.component.ts
import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  ViewChild,
  ElementRef,
  ChangeDetectorRef,
  NgZone,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  CertificationService,
  Certification,
  CertificationCheckpoint,
  CheckpointSubmissionResult,
} from '../../../../services/certification.service';
import { BlockchainService } from '../../../../blockchain/services/blockchain.service';
import {
  SmartGeolocationService,
  LocationData,
} from '../../../../services/smart-geolocation.service';
import {
  ImageComparisonResult,
  ImageComparisonService,
} from 'src/app/services/image-comparison.service';

// Types
interface LocationMessage {
  type: 'success' | 'warning' | 'error' | 'info';
  text: string;
}

interface AccuracyConfig {
  excellent: number;
  good: number;
  medium: number;
  poor: number;
  bad: number;
}

@Component({
  selector: 'app-certification-track',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './certification-track.component.html',
  styleUrls: ['./certification-track.component.css'],
})
export class CertificationTrackComponent implements OnInit, OnDestroy {
  // ViewChild
  @ViewChild('photoInput') photoInput!: ElementRef<HTMLInputElement>;

  // Dependencies
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly certificationService = inject(CertificationService);
  private readonly geolocationService = inject(SmartGeolocationService); // Garder le même nom pour compatibilité
  private readonly blockchainService = inject(BlockchainService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly ngZone = inject(NgZone);

  // Constants
  private readonly ACCURACY_CONFIG: AccuracyConfig = {
    excellent: 5,
    good: 15,
    medium: 30,
    poor: 50,
    bad: Infinity,
  };

  private readonly LOCATION_THRESHOLDS =
    this.geolocationService.getThresholds();
  private preheatedLocation: any = null;
  private isPreheating = false;
  // State
  certificationId = '';
  certification: Certification | null = null;

  // UI State
  isLoading = true;
  isSubmitting = false;
  isGettingLocation = false;
  showCheckpointModal = false;

  // Checkpoint
  currentCheckpoint: CertificationCheckpoint | null = null;
  currentCheckpointIndex = 0;

  // Form Data
  checkpointPhotoFile: File | null = null;
  checkpointPhotoPreview: string | null = null;
  checkpointNotes = '';

  // Location
  currentLocation: { lat: number; lng: number } | null = null;
  locationAccuracy = 0;
  locationStatus = '';
  locationMessage: LocationMessage | null = null;

  // Validation
  validationErrors: string[] = [];
  imageValidationResult: ImageComparisonResult | null = null;

  scanParticles: Array<{ left: number; top: number; delay: number }> = [];
  scanLines: Array<{ position: number; delay: number }> = [];

  ngOnInit(): void {
    this.loadCertificationFromRoute();
    this.initScanParticles();
    this.initScanLines();
  }

  private initScanParticles(): void {
    this.scanParticles = Array.from({ length: 20 }, () => ({
      left: Math.random() * 100,
      top: Math.random() * 100,
      delay: Math.random() * 2000,
    }));
  }

  private initScanLines(): void {
    this.scanLines = Array.from({ length: 3 }, (_, i) => ({
      position: Math.random() * 100,
      delay: i * 500,
    }));
  }

  ngOnDestroy(): void {
    this.cleanupResources();
  }

  // ============== Initialization ==============

  private loadCertificationFromRoute(): void {
    this.route.params.subscribe((params) => {
      this.certificationId = params['id'];
      this.loadCertification();
    });
  }

  async loadCertification(): Promise<void> {
    this.setLoading(true);

    try {
      const certification =
        await this.certificationService.getCertificationById(
          this.certificationId,
        );

      this.ngZone.run(() => {
        this.certification = certification;
        this.setLoading(false);
      });
    } catch (error) {
      this.handleError('Erreur chargement certification', error);
    }
  }

  // ============== Navigation ==============

  goBack(): void {
    this.router.navigate(['/producer/certifications']);
  }

  // ============== Checkpoint Management ==============

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

  showCompleteButton(checkpoint: CertificationCheckpoint): boolean {
    return !checkpoint.completed && this.isCurrentCheckpoint(checkpoint);
  }

  getButtonText(checkpoint: CertificationCheckpoint): string {
    return checkpoint.order === 1 ? 'Commencer' : 'Compléter';
  }

  openCheckpointModal(
    checkpoint: CertificationCheckpoint,
    index: number,
  ): void {
    if (!checkpoint.completed && this.isCurrentCheckpoint(checkpoint)) {
      this.currentCheckpoint = checkpoint;
      this.currentCheckpointIndex = index;
      this.showCheckpointModal = true;
      this.resetCheckpointForm();
      this.initScanParticles(); // <-- Réinitialiser pour une nouvelle animation
      this.initScanLines();
      // LANCER LE PRÉCHAUFFAGE IMMÉDIATEMENT
      this.preheatLocation();
    }
  }

  closeCheckpointModal(): void {
    this.showCheckpointModal = false;
    this.currentCheckpoint = null;
    this.resetCheckpointForm();
  }

  private resetCheckpointForm(): void {
    this.checkpointPhotoFile = null;
    this.checkpointPhotoPreview = null;
    this.checkpointNotes = '';
    this.currentLocation = null;
    this.locationAccuracy = 0;
    this.locationMessage = null;
    this.validationErrors = [];
  }

  isScanning = false;
  scanProgress = 0;

  // MODIFIER la méthode onPhotoSelected

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;

    if (input.files && input.files[0]) {
      const file = input.files[0];

      if (this.validatePhoto(file)) {
        this.checkpointPhotoFile = file;
        this.generatePhotoPreview(file);

        // Scanner l'image directement
        this.scanImage();
      }
    }
  }
  private getPreviousCheckpoint(): CertificationCheckpoint | null {
    if (!this.certification || this.currentCheckpointIndex === 0) {
      return null;
    }

    // Récupérer le checkpoint précédent (index - 1)
    const previousIndex = this.currentCheckpointIndex - 1;
    return this.certification.checkpoints[previousIndex] || null;
  }
  // Dans certification-track.component.ts

  // Dans certification-track.component.ts

  // AJOUTER l'injection du service
  private readonly imageComparisonService = inject(ImageComparisonService);

  // CORRIGER la méthode scanImage
  async scanImage(): Promise<void> {
    if (!this.checkpointPhotoFile) return;

    this.isScanning = true;
    this.scanProgress = 0;
    this.imageValidationResult = null;

    const progressInterval = setInterval(() => {
      if (this.scanProgress < 90 && this.isScanning) {
        this.scanProgress += Math.random() * 15;
        if (this.scanProgress > 90) this.scanProgress = 90;
      }
    }, 100);

    try {
      const previousCheckpoint = this.getPreviousCheckpoint();

      if (!previousCheckpoint?.photoUrl) {
        // Premier checkpoint
        await new Promise((resolve) => setTimeout(resolve, 1000));
        this.imageValidationResult = {
          similarity: 100,
          isValid: true,
          warnings: [],
          action: 'accept',
          details: {
            structuralSimilarity: 1,
            featureSimilarity: 1,
            colorConsistency: 1,
            exifValid: true,
            isDownloadedImage: false,
            lightingConsistent: true,
          },
        };
      } else {
        // Utiliser le service de comparaison
        const comparison = await this.imageComparisonService.compareImages(
          this.checkpointPhotoFile,
          previousCheckpoint.photoUrl,
          {
            previousCheckpointDate: previousCheckpoint.completedAt,
            expectedGrowthDays:
              this.currentCheckpoint!.daysFromStart -
              previousCheckpoint.daysFromStart,
            location: previousCheckpoint.location,
          },
        );

        this.imageValidationResult = comparison;
      }

      this.scanProgress = 100;

      setTimeout(() => {
        this.isScanning = false;
      }, 500);
    } catch (error) {
      console.error('❌ Erreur scan:', error);
      this.handleError('Erreur scan image', error);
      this.isScanning = false;
    } finally {
      clearInterval(progressInterval);
    }
  }

  private simulateScanProgress(): void {
    const interval = setInterval(() => {
      if (this.scanProgress < 90) {
        this.scanProgress += Math.random() * 15;
      } else {
        clearInterval(interval);
      }
    }, 100);
  }

  getValidationTitle(): string {
    if (!this.imageValidationResult) return '';

    switch (this.imageValidationResult.action) {
      case 'accept':
        return 'Image validée ✓';
      case 'review':
        return 'Analyse mitigée ⚠';
      case 'reject':
        return 'Image rejetée ✗';
      default:
        return "Résultat de l'analyse";
    }
  }

  // AJOUTER cette méthode pour le gradient
  getSimilarityGradient(similarity: number): string {
    if (similarity >= 85) {
      return 'linear-gradient(90deg, #10b981, #34d399, #6ee7b7)';
    } else if (similarity >= 70) {
      return 'linear-gradient(90deg, #f59e0b, #fbbf24, #fcd34d)';
    } else {
      return 'linear-gradient(90deg, #ef4444, #f87171, #fca5a5)';
    }
  }

  // AJOUTER cette méthode pour l'événement scanComplete
  onScanComplete(result: any): void {
    console.log('Scan completed:', result);
    // Vous pouvez utiliser le résultat ici si nécessaire
  }

  // MODIFIER la méthode removePhoto

  removePhoto(): void {
    this.checkpointPhotoFile = null;
    this.checkpointPhotoPreview = null;
    this.isScanning = false;
    this.imageValidationResult = null;
  }
  // ============== Photo Management ==============

  triggerPhotoUpload(): void {
    this.photoInput.nativeElement.click();
  }

  private validatePhoto(file: File): boolean {
    const validTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    const maxSize = 10 * 1024 * 1024; // 10MB
    let isValid = true;

    if (!validTypes.includes(file.type)) {
      this.addValidationError('Format invalide. Utilisez JPG ou PNG.');
      isValid = false;
    }

    if (file.size > maxSize) {
      this.addValidationError('Fichier trop volumineux (max 10MB).');
      isValid = false;
    }

    return isValid;
  }

  private generatePhotoPreview(file: File): void {
    const reader = new FileReader();
    reader.onload = () => {
      this.ngZone.run(() => {
        this.checkpointPhotoPreview = reader.result as string;
      });
    };
    reader.readAsDataURL(file);
  }

  private initializeLocationAcquisition(): void {
    this.ngZone.run(() => {
      this.isGettingLocation = true;
      this.locationStatus = 'Initialisation du GPS...';
      this.locationMessage = null;
      this.clearLocationValidationErrors();
      this.cdr.markForCheck();
    });
  }

  private getPreviousCheckpointLocation(): LocationData | null {
    const previousCheckpoints = this.certification!.checkpoints.filter(
      (cp, idx) =>
        idx < this.currentCheckpointIndex && cp.completed && cp.location,
    ).map((cp) => ({
      lat: cp.location!.lat,
      lng: cp.location!.lng,
      accuracy: cp.location!.accuracy || 10,
      timestamp: cp.completedAt?.getTime() || Date.now(),
    }));

    return previousCheckpoints.length > 0
      ? previousCheckpoints[previousCheckpoints.length - 1]
      : null;
  }

  private handleLocationError(error: any): void {
    this.ngZone.run(() => {
      this.isGettingLocation = false;

      let errorMessage = this.getLocationErrorMessage(error);

      this.locationMessage = {
        type: 'error',
        text: errorMessage,
      };

      this.addValidationError(errorMessage);
      this.cdr.markForCheck();
    });
  }

  private getLocationErrorMessage(error: any): string {
    if (error.message === 'PERMISSION_DENIED') {
      return '❌ Accès à la position refusé. Veuillez activer la localisation.';
    }

    if (error.code === 1) {
      return '❌ Permission de localisation refusée';
    }

    if (error.code === 2) {
      return '❌ Position non disponible. Vérifiez votre signal GPS.';
    }

    if (error.code === 3) {
      return "⏱️ Délai d'attente dépassé. Réessayez.";
    }

    return error.message || '❌ Erreur de géolocalisation';
  }

  async improveLocationAccuracy(): Promise<void> {
    if (!this.currentLocation) {
      await this.getCurrentLocation();
      return;
    }

    if (this.locationAccuracy > this.LOCATION_THRESHOLDS.ACCEPTABLE) {
      const userConfirmed = await this.confirmAccuracyImprovement();

      if (userConfirmed) {
        await this.getCurrentLocation();
      }
    }
  }

  private confirmAccuracyImprovement(): Promise<boolean> {
    return new Promise((resolve) => {
      this.ngZone.run(() => {
        const result = confirm(
          `Précision actuelle: ${Math.round(this.locationAccuracy)}m\n\n` +
            `Pour une meilleure précision :\n` +
            `• Placez-vous à l'extérieur\n` +
            `• Éloignez-vous des murs\n` +
            `• Tenez le téléphone en hauteur\n\n` +
            `Réessayer ?`,
        );
        resolve(result);
      });
    });
  }

  // ============== Accuracy Helpers ==============

  getAccuracyPercentage(accuracy: number): number {
    if (!accuracy && accuracy !== 0) return 0;

    let percentage = 100 - (accuracy / 50) * 100;

    percentage = percentage > 100 ? 100 : percentage;
    percentage = percentage < 0 ? 0 : percentage;

    return percentage;
  }

  getAccuracyColor(accuracy: number): string {
    if (!accuracy && accuracy !== 0) return '#94a3b8';

    if (accuracy <= this.ACCURACY_CONFIG.excellent) return '#10b981';
    if (accuracy <= this.ACCURACY_CONFIG.good) return '#3b82f6';
    if (accuracy <= this.ACCURACY_CONFIG.medium) return '#f59e0b';
    if (accuracy <= this.ACCURACY_CONFIG.poor) return '#ef4444';

    return '#7f1d1d';
  }

  getAccuracyMessage(accuracy: number): string {
    if (!accuracy && accuracy !== 0) return 'Non disponible';

    if (accuracy <= this.ACCURACY_CONFIG.excellent) return 'Excellente';
    if (accuracy <= this.ACCURACY_CONFIG.good) return 'Bonne';
    if (accuracy <= this.ACCURACY_CONFIG.medium) return 'Moyenne';
    if (accuracy <= this.ACCURACY_CONFIG.poor) return 'Faible';

    return 'Très faible';
  }

  getAccuracyClass(accuracy: number): string {
    if (!accuracy && accuracy !== 0) return 'accuracy-unknown';

    if (accuracy <= this.ACCURACY_CONFIG.excellent) return 'accuracy-excellent';
    if (accuracy <= this.ACCURACY_CONFIG.good) return 'accuracy-good';
    if (accuracy <= this.ACCURACY_CONFIG.medium) return 'accuracy-medium';
    if (accuracy <= this.ACCURACY_CONFIG.poor) return 'accuracy-poor';

    return 'accuracy-bad';
  }

  // ============== Validation ==============

  canSubmitCheckpoint(): boolean {
    if (!this.currentCheckpoint) return false;

    const errors = this.validateCheckpoint();
    this.updateValidationErrors(errors);

    return errors.length === 0;
  }

  private validateCheckpoint(): string[] {
    const errors: string[] = [];

    this.validatePhotoRequirement(errors);
    this.validateLocationRequirement(errors);

    return errors;
  }

  private validatePhotoRequirement(errors: string[]): void {
    if (this.currentCheckpoint?.photoRequired && !this.checkpointPhotoFile) {
      errors.push('📸 Une photo est requise pour ce checkpoint.');
    }
  }

  // Ajoutez cette méthode helper
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  private validateLocationRequirements(): void {
    if (!this.currentCheckpoint?.locationRequired) return;
    if (!this.currentLocation) return;

    if (this.locationAccuracy > this.LOCATION_THRESHOLDS.ACCEPTABLE) {
      this.addValidationError(
        `⚠️ Précision GPS: ${Math.round(this.locationAccuracy)}m ` +
          `(acceptable: ${this.LOCATION_THRESHOLDS.ACCEPTABLE}m)`,
      );
    }
  }

  // Au lieu de mettre à jour directement validationErrors
  private updateValidationErrors(newErrors: string[]): void {
    const errorsChanged =
      JSON.stringify(this.validationErrors) !== JSON.stringify(newErrors);

    if (errorsChanged) {
      // ✅ SOLUTION : Décaler la mise à jour APRÈS le cycle de détection
      setTimeout(() => {
        this.ngZone.run(() => {
          this.validationErrors = newErrors;
          this.cdr.markForCheck();
        });
      }, 0);
    }
  }

  private addValidationError(error: string): void {
    if (!this.validationErrors.includes(error)) {
      setTimeout(() => {
        this.ngZone.run(() => {
          this.validationErrors.push(error);
          this.cdr.markForCheck();
        });
      }, 0);
    }
  }

  private clearLocationValidationErrors(): void {
    this.validationErrors = this.validationErrors.filter(
      (error) =>
        !error.includes('GPS') &&
        !error.includes('localisation') &&
        !error.includes('position'),
    );
  }

  // ============== Checkpoint Submission ==============

  // MODIFIER cette méthode dans le component
  async submitCheckpoint(): Promise<void> {
    if (!this.currentCheckpoint || !this.canSubmitCheckpoint()) return;

    this.setSubmitting(true);
    this.imageValidationResult = null;

    try {
      // ÉTAPE 1: Valider l'image avec IA (sauf premier checkpoint)

      // CORRIGER la méthode submitCheckpoint (partie validation)
      if (
        this.currentCheckpoint.photoRequired &&
        this.checkpointPhotoFile &&
        this.currentCheckpointIndex > 0
      ) {
        const validation =
          await this.certificationService.validateCheckpointImage(
            this.certificationId,
            this.currentCheckpointIndex,
            this.checkpointPhotoFile,
          );

        this.imageValidationResult = {
          similarity: validation.similarity,
          isValid: validation.valid,
          warnings: validation.warnings,
          action: validation.action,
          details: {
            structuralSimilarity: validation.similarity / 100,
            featureSimilarity: validation.similarity / 100,
            colorConsistency: validation.similarity / 100,
            exifValid: validation.warnings.length === 0,
            isDownloadedImage: validation.warnings.some((w) =>
              w.includes('téléchargée'),
            ),
            lightingConsistent: validation.warnings.length < 2,
          },
        };

        // Afficher les résultats
        if (validation.warnings.length > 0) {
          validation.warnings.forEach((w) => this.addValidationError(w));
        }

        // Bloquer si rejeté
        if (validation.action === 'reject') {
          this.showNotification(
            'error',
            `❌ Image trop différente du checkpoint précédent (${validation.similarity.toFixed(1)}% de similarité)`,
          );
          this.setSubmitting(false);
          return;
        }

        // Demander confirmation si révision
        if (validation.action === 'review') {
          const confirmed = await this.confirmReviewSubmission(validation);
          if (!confirmed) {
            this.setSubmitting(false);
            return;
          }
        }
      }

      // ÉTAPE 2: Continuer avec la soumission normale
      const result = await this.certificationService.uploadCheckpointProof(
        this.certificationId,
        this.currentCheckpointIndex,
        this.checkpointPhotoFile!,
        this.currentLocation!,
        this.checkpointNotes,
      );

      await this.handleSubmissionSuccess(result);
    } catch (error) {
      this.handleSubmissionError(error);
    } finally {
      this.setSubmitting(false);
    }
  }

  // ✅ AJOUTER cette méthode helper
  getSimilarityColor(similarity: number): string {
    if (similarity >= 85) return '#10b981';
    if (similarity >= 70) return '#f59e0b';
    if (similarity >= 50) return '#ef4444';
    return '#7f1d1d';
  }

  private async confirmReviewSubmission(validation: any): Promise<boolean> {
    return new Promise((resolve) => {
      const message =
        `⚠️ Attention: L'image soumise présente des différences avec le checkpoint précédent.\n\n` +
        `Similarité: ${validation.similarity.toFixed(1)}%\n` +
        `Avertissements:\n${validation.warnings.join('\n')}\n\n` +
        `Voulez-vous quand même continuer ?`;

      resolve(confirm(message));
    });
  }

  private async validateSubmissionRequirements(): Promise<void> {
    if (!this.checkpointPhotoFile) {
      throw new Error('Photo requise');
    }

    if (!this.currentLocation) {
      throw new Error('Localisation requise');
    }

    if (this.locationAccuracy > this.LOCATION_THRESHOLDS.REJECT) {
      throw new Error(
        `Précision GPS insuffisante (${Math.round(this.locationAccuracy)}m)`,
      );
    }
  }

  private async handleSubmissionSuccess(
    result: CheckpointSubmissionResult,
  ): Promise<void> {
    if (!result.success) {
      throw new Error(result.error || 'Erreur lors de la soumission');
    }

    await this.loadCertification();

    this.ngZone.run(() => {
      this.closeCheckpointModal();
      this.cdr.markForCheck();
    });

    await this.handlePostSubmission();
  }

  private async handlePostSubmission(): Promise<void> {
    const isLastCheckpoint =
      this.currentCheckpointIndex ===
      (this.certification?.checkpoints.length || 0) - 1;

    if (isLastCheckpoint) {
      setTimeout(() => this.showCompletionConfirmation(), 0);
    } else {
      this.showNotification('success', '✅ Checkpoint enregistré avec succès!');
    }
  }

  private handleSubmissionError(error: any): void {
    this.ngZone.run(() => {
      const errorMessage = error.message || 'Erreur lors de la soumission';
      this.addValidationError(errorMessage);
      this.cdr.markForCheck();
    });

    this.handleError('Erreur soumission checkpoint', error);
  }

  private showCompletionConfirmation(): void {
    setTimeout(() => {
      const confirmation = confirm(
        '🎉 Félicitations ! Tous les checkpoints sont complétés.\n\n' +
          'Voulez-vous finaliser la certification et publier le produit ?\n\n' +
          '✓ Produit visible sur le marché\n' +
          '✓ Certificat généré\n' +
          '✓ Traçabilité blockchain activée',
      );

      if (confirmation) {
        this.ngZone.run(() => {
          this.completeAndPublishCertification();
        });
      }
    }, 0);
  }

  async completeAndPublishCertification(): Promise<void> {
    this.setLoading(true);

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
    } catch (error) {
      this.handleError('Erreur publication produit', error);
    } finally {
      this.setLoading(false);
    }
  }

  // ============== Blockchain ==============

  getEtherscanUrl(txHash: string): string {
    return `https://sepolia.etherscan.io/tx/${txHash}`;
  }

  formatTxHash(txHash: string): string {
    if (!txHash) return '';
    return `${txHash.substring(0, 6)}...${txHash.substring(txHash.length - 4)}`;
  }

  getVerifiedCount(): number {
    if (!this.certification) return 0;
    return this.certification.checkpoints.filter((cp) => cp.blockchainVerified)
      .length;
  }

  getIntegrityScore(): number {
    if (!this.certification || this.certification.totalCheckpoints === 0)
      return 0;

    const verifiedCount = this.getVerifiedCount();
    return Math.round(
      (verifiedCount / this.certification.totalCheckpoints) * 100,
    );
  }

  hasMultipleTransactions(): boolean {
    if (!this.certification?.blockchainTransactions) {
      return false;
    }
    return this.certification.blockchainTransactions.length > 1;
  }

  getTransactionCount(): number {
    return this.certification?.blockchainTransactions?.length || 0;
  }

  async verifyOnBlockchain(): Promise<void> {
    if (!this.certification) return;

    const transactions = this.certification.blockchainTransactions || [];

    if (transactions.length === 0) {
      this.showNotification(
        'info',
        'Aucune transaction blockchain trouvée pour cette certification',
      );
      return;
    }

    const firstTx = transactions[0];
    window.open(this.getEtherscanUrl(firstTx), '_blank');

    if (transactions.length > 1) {
      setTimeout(
        () => this.promptViewAllTransactions(transactions.length),
        1000,
      );
    }
  }

  private promptViewAllTransactions(count: number): void {
    const confirmMultiple = confirm(
      `${count} transactions trouvées.\n\n` +
        `La première transaction a été ouverte sur Etherscan.\n\n` +
        `Voulez-vous voir TOUTES les transactions ?`,
    );

    if (confirmMultiple) {
      this.viewAllTransactions();
    }
  }

  viewAllTransactions(): void {
    if (!this.certification?.blockchainTransactions?.length) {
      this.showNotification('info', 'Aucune transaction à afficher');
      return;
    }

    const transactions = this.certification.blockchainTransactions;

    if (transactions.length === 1) {
      window.open(this.getEtherscanUrl(transactions[0]), '_blank');
    } else {
      this.promptSelectTransaction(transactions);
    }
  }

  private promptSelectTransaction(transactions: string[]): void {
    const txList = transactions
      .map((tx: string, i: number) => `${i + 1}. ${this.formatTxHash(tx)}`)
      .join('\n');

    const choice = prompt(
      `Plusieurs transactions trouvées (${transactions.length}).\n` +
        `Entrez le numéro de la transaction à voir:\n\n${txList}\n\n` +
        `Ou cliquez sur Annuler pour voir toutes les transactions.`,
      '1',
    );

    if (choice === null) {
      this.openAllTransactions(transactions);
    } else {
      this.openSelectedTransaction(transactions, parseInt(choice) - 1);
    }
  }

  private openAllTransactions(transactions: string[]): void {
    transactions.forEach((tx, index) => {
      setTimeout(() => {
        window.open(this.getEtherscanUrl(tx), '_blank');
      }, index * 200);
    });
  }

  private openSelectedTransaction(transactions: string[], index: number): void {
    if (index >= 0 && index < transactions.length) {
      window.open(this.getEtherscanUrl(transactions[index]), '_blank');
    } else {
      this.showNotification('error', 'Numéro de transaction invalide');
    }
  }

  async refreshBlockchainStatus(): Promise<void> {
    if (!this.certification) return;

    this.setLoading(true);
    this.showNotification('info', '🔄 Vérification des statuts blockchain...');

    try {
      const updatedCount = await this.updateBlockchainStatuses();

      this.showBlockchainRefreshResult(updatedCount);

      if (updatedCount > 0) {
        await this.loadCertification();
      }
    } catch (error) {
      this.handleError('Erreur rafraîchissement blockchain', error);
    } finally {
      this.setLoading(false);
    }
  }

  private async updateBlockchainStatuses(): Promise<number> {
    const checkpoints = this.certification!.checkpoints;
    let updatedCount = 0;

    for (let i = 0; i < checkpoints.length; i++) {
      const cp = checkpoints[i];

      if (cp.blockchainTransactionId && !cp.blockchainVerified) {
        const result = await this.blockchainService.getTransactionDetails(
          cp.blockchainTransactionId,
        );

        if (result.confirmed && result.status === 'success') {
          await this.certificationService.updateCheckpointBlockchainStatus(
            this.certificationId,
            i,
            {
              blockchainVerified: true,
              lastBlockchainCheck: new Date(),
              blockchainConfirmations: result.confirmations,
            },
          );
          updatedCount++;
        }
      }
    }

    return updatedCount;
  }

  private showBlockchainRefreshResult(updatedCount: number): void {
    if (updatedCount > 0) {
      this.showNotification(
        'success',
        `✅ ${updatedCount} transaction(s) vérifiée(s) avec succès`,
      );
    } else {
      this.showNotification('info', 'Aucune nouvelle confirmation');
    }
  }

  // ============== Certificate & QR Code ==============

  viewCertificate(): void {
    if (!this.certification) return;
    this.router.navigate(['/verify', this.certificationId]);
  }

  async generateQRCode(): Promise<void> {
    if (!this.certification) return;

    this.setLoading(true);

    try {
      let { verificationUrl, qrCodeUrl } = this.certification;

      if (!verificationUrl || !qrCodeUrl) {
        const certificate = await this.certificationService.generateCertificate(
          this.certificationId,
        );

        verificationUrl = certificate.verificationUrl;
        qrCodeUrl = certificate.qrCodeUrl;

        this.certification.verificationUrl = verificationUrl;
        this.certification.qrCodeUrl = qrCodeUrl;
      }

      this.displayQRCodeModal(verificationUrl, qrCodeUrl);
    } catch (error) {
      this.handleError('Erreur génération QR code', error);
    } finally {
      this.setLoading(false);
    }
  }

  private displayQRCodeModal(verificationUrl: string, qrCodeUrl: string): void {
    const modalHtml = `
      <div class="qr-modal-overlay">
        <div class="qr-modal-content">
          <h3>QR Code de vérification</h3>
          <img src="${qrCodeUrl}" alt="QR Code" class="qr-modal-image">
          <p class="qr-modal-url">${verificationUrl}</p>
          <div class="qr-modal-actions">
            <button class="qr-btn qr-btn-primary" onclick="window.open('${qrCodeUrl}', '_blank')">
              Télécharger
            </button>
            <button class="qr-btn qr-btn-secondary" onclick="this.closest('.qr-modal-overlay').remove()">
              Fermer
            </button>
          </div>
        </div>
      </div>
    `;

    const div = document.createElement('div');
    div.innerHTML = modalHtml;
    document.body.appendChild(div);

    const closeModal = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        div.remove();
        document.removeEventListener('keydown', closeModal);
      }
    };

    document.addEventListener('keydown', closeModal);
  }

  // ============== Data Export ==============

  exportData(): void {
    if (!this.certification) return;

    const data = {
      certification: this.certification,
      verificationScore: this.getIntegrityScore(),
      verifiedCount: this.getVerifiedCount(),
      totalCheckpoints: this.certification.totalCheckpoints,
      exportDate: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = `certification-${this.certificationId}.json`;
    a.click();

    window.URL.revokeObjectURL(url);
    this.showNotification('success', 'Données exportées avec succès');
  }

  // ============== Utility Methods ==============

  getStatusText(status: string): string {
    const statusMap: Record<string, string> = {
      draft: 'Brouillon',
      active: 'En cours',
      completed: 'Terminé',
      verified: 'Vérifié',
      expired: 'Expiré',
      cancelled: 'Annulé',
    };

    return statusMap[status] || status;
  }

  getCheckpointStatus(checkpoint: CertificationCheckpoint): string {
    if (checkpoint.completed) {
      return checkpoint.blockchainVerified ? 'verified' : 'pending';
    }
    return 'upcoming';
  }

  viewCheckpointDetails(checkpoint: CertificationCheckpoint): void {
    // Implémenter la logique d'affichage des détails
    console.log('View checkpoint:', checkpoint);
  }

  viewPhoto(photoUrl: string): void {
    window.open(photoUrl, '_blank');
  }

  // ============== UI State Management ==============

  private setLoading(isLoading: boolean): void {
    this.ngZone.run(() => {
      this.isLoading = isLoading;
      this.cdr.markForCheck();
    });
  }

  private setSubmitting(isSubmitting: boolean): void {
    this.ngZone.run(() => {
      this.isSubmitting = isSubmitting;
      this.cdr.markForCheck();
    });
  }

  private updateLocationStatus(status: string): void {
    this.ngZone.run(() => {
      this.locationStatus = status;
      this.cdr.markForCheck();
    });
  }

  // ============== Notification System ==============

  showNotification(type: 'success' | 'error' | 'info', message: string): void {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    const styles = this.getNotificationStyles(type);
    Object.assign(notification.style, styles);

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease-in';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  private getNotificationStyles(type: string): Partial<CSSStyleDeclaration> {
    const baseStyles: Partial<CSSStyleDeclaration> = {
      position: 'fixed',
      top: '20px',
      right: '20px',
      padding: '12px 20px',
      color: 'white',
      borderRadius: '8px',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
      zIndex: '10001',
      animation: 'slideIn 0.3s ease-out',
    };

    const colorMap = {
      success: '#2d6a4f',
      error: '#dc2626',
      info: '#3b82f6',
    };

    return {
      ...baseStyles,
      background: colorMap[type as keyof typeof colorMap] || '#3b82f6',
    };
  }

  // ============== Error Handling ==============

  private handleError(context: string, error: any): void {
    console.error(`${context}:`, error);

    this.ngZone.run(() => {
      this.setLoading(false);
      this.setSubmitting(false);

      const errorMessage = error?.message || error || 'Erreur inconnue';
      this.showNotification('error', `${context}: ${errorMessage}`);
      this.cdr.markForCheck();
    });
  }

  // ============== Cleanup ==============

  private cleanupResources(): void {
    if (this.checkpointPhotoPreview) {
      URL.revokeObjectURL(this.checkpointPhotoPreview);
    }
  }

  private async preheatLocation(): Promise<void> {
    if (this.isPreheating) return;
    this.isPreheating = true;

    try {
      this.locationMessage = {
        type: 'info',
        text: '📡 Préparation du GPS...',
      };

      // ❌ ERREUR: Pas d'appel au service
      // ✅ CORRECTION:
      this.geolocationService
        .acquireWithCorrection()
        .then((location) => {
          this.preheatedLocation = location;
          this.isPreheating = false;
          if (this.showCheckpointModal) {
            this.locationMessage = {
              type: 'success',
              text: '✓ GPS prêt',
            };
            this.cdr.markForCheck();
          }
        })
        .catch((error) => {
          console.warn('⚠️ Échec préchauffage:', error);
          this.isPreheating = false;
        });
    } catch (error) {
      this.isPreheating = false;
    }
  }

  private readonly MAX_ALLOWED_DISTANCE_BETWEEN_CHECKPOINTS = 100; // 100 mètres maximum

  async getCurrentLocation(): Promise<void> {
    if (this.isGettingLocation) return;

    this.initializeLocationAcquisition();

    try {
      // Récupérer la localisation du checkpoint précédent
      const previousLocation = this.getPreviousCheckpointLocation();

      // Préparer le point de référence si disponible
      const referencePoint = previousLocation
        ? {
            lat: previousLocation.lat,
            lng: previousLocation.lng,
          }
        : undefined;

      // Si on a une position préchauffée
      if (this.preheatedLocation) {
        const location = this.preheatedLocation;
        this.preheatedLocation = null;
        this.isPreheating = false;

        // Vérifier la cohérence avec le point de référence
        if (referencePoint) {
          const distance = this.calculateDistance(
            location.lat,
            location.lng,
            referencePoint.lat,
            referencePoint.lng,
          );

          if (distance > this.MAX_ALLOWED_DISTANCE_BETWEEN_CHECKPOINTS) {
            this.locationMessage = {
              type: 'error',
              text: `❌ Trop loin du dernier checkpoint (${Math.round(distance)}m > ${this.MAX_ALLOWED_DISTANCE_BETWEEN_CHECKPOINTS}m)`,
            };
            this.isGettingLocation = false;
            this.cdr.markForCheck();
            return; // ❌ BLOQUER ici - ne pas accepter la position
          }
        }

        this.processLocationResult(location);
        return;
      }

      this.locationMessage = {
        type: 'info',
        text: '🧠 Acquisition de la position...',
      };

      // Passer le point de référence au service
      const location =
        await this.geolocationService.acquireWithCorrection(referencePoint);

      this.processLocationResult(location);
    } catch (error) {
      console.error("❌ Erreur lors de l'acquisition de la position:", error);
      this.handleLocationError(error);
    }
  }

  // Dans certification-track.component.ts

  private processLocationResult(location: any): void {
    this.ngZone.run(() => {
      this.currentLocation = {
        lat: location.lat,
        lng: location.lng,
      };

      this.locationAccuracy = location.realAccuracy;

      // Récupérer le point de référence (checkpoint précédent)
      const previousLocation = this.getPreviousCheckpointLocation();

      let message = '';
      let messageType: 'success' | 'warning' | 'error' = 'success';

      if (previousLocation) {
        // ✅ Ce n'est PAS le premier checkpoint - on compare avec le précédent
        const distanceToPrevious = this.calculateDistance(
          location.lat,
          location.lng,
          previousLocation.lat,
          previousLocation.lng,
        );

        if (
          distanceToPrevious > this.MAX_ALLOWED_DISTANCE_BETWEEN_CHECKPOINTS
        ) {
          message = `❌ Trop loin du dernier checkpoint (${Math.round(distanceToPrevious)}m > ${this.MAX_ALLOWED_DISTANCE_BETWEEN_CHECKPOINTS}m)`;
          messageType = 'error';

          this.currentLocation = null;
          this.locationAccuracy = 0;

          this.locationMessage = {
            type: 'error',
            text: message,
          };

          this.addValidationError(message);
          this.isGettingLocation = false;
          this.cdr.markForCheck();
          return;
        }

        if (distanceToPrevious <= 30) {
          message = `🎯 Parfaitement cohérent (${distanceToPrevious.toFixed(1)}m du dernier checkpoint)`;
        } else if (distanceToPrevious <= 50) {
          message = `✓ Bonne cohérence (${distanceToPrevious.toFixed(1)}m)`;
        } else {
          message = `⚠️ Distance acceptable (${distanceToPrevious.toFixed(1)}m)`;
          messageType = 'warning';
        }

        this.checkLocationConsistency({
          lat: location.lat,
          lng: location.lng,
          accuracy: this.locationAccuracy,
          timestamp: Date.now(),
        });
      } else {
        // ✅ PREMIER CHECKPOINT - pas de comparaison, c'est la référence
        message = `📍 Position initiale enregistrée comme référence`;
        messageType = 'success';

        console.log(
          '📍 Premier checkpoint - cette position servira de référence',
        );
      }

      this.locationMessage = {
        type: messageType,
        text: message,
      };

      this.validateLocationRequirements();
      this.isGettingLocation = false;
      this.cdr.markForCheck();
    });
  }

  // MODIFIER cette méthode pour renforcer la validation
  private validateLocationRequirement(errors: string[]): void {
    if (!this.currentCheckpoint?.locationRequired) return;

    if (!this.currentLocation) {
      errors.push('📍 Localisation requise');
      return;
    }

    // ✅ Vérifier la distance avec le checkpoint précédent
    const previousLocation = this.getPreviousCheckpointLocation();
    if (previousLocation) {
      const distance = this.calculateDistance(
        this.currentLocation.lat,
        this.currentLocation.lng,
        previousLocation.lat,
        previousLocation.lng,
      );

      if (distance > this.MAX_ALLOWED_DISTANCE_BETWEEN_CHECKPOINTS) {
        errors.push(
          `❌ Distance trop grande: ${Math.round(distance)}m > ${this.MAX_ALLOWED_DISTANCE_BETWEEN_CHECKPOINTS}m`,
        );
        return; // ❌ Sortir immédiatement - ne pas continuer la validation
      }
    }

    // ✅ Vérifier la précision
    if (this.locationAccuracy > this.LOCATION_THRESHOLDS.ACCEPTABLE) {
      errors.push(
        `⚠️ Précision GPS insuffisante: ${Math.round(this.locationAccuracy)}m (max: ${this.LOCATION_THRESHOLDS.ACCEPTABLE}m)`,
      );
    }
  }

  // MODIFIER cette méthode pour s'assurer qu'elle bloque vraiment
  private async checkLocationConsistency(
    currentLocation: LocationData,
  ): Promise<boolean> {
    if (!this.certification || !this.currentCheckpoint) return true;

    const previousLocation = this.getPreviousCheckpointLocation();

    if (previousLocation) {
      const consistency = this.geolocationService.checkConsistency(
        currentLocation,
        previousLocation,
        { maxDistance: 50, maxAccuracy: 30 },
      );

      if (!consistency.consistent) {
        this.addValidationError(
          consistency.warning || '⚠️ Incohérence de localisation',
        );

        // ❌ Blocage si incohérence trop importante
        if (
          consistency.distance > this.MAX_ALLOWED_DISTANCE_BETWEEN_CHECKPOINTS
        ) {
          this.locationMessage = {
            type: 'error',
            text: `❌ Trop loin du dernier checkpoint (${Math.round(consistency.distance)}m > ${this.MAX_ALLOWED_DISTANCE_BETWEEN_CHECKPOINTS}m)`,
          };

          // IMPORTANT: Réinitialiser la position
          this.currentLocation = null;
          this.locationAccuracy = 0;

          return false; // ❌ Retourner false pour indiquer que c'est invalide
        } else {
          this.locationMessage = {
            type: 'warning',
            text: `⚠️ Position à ${Math.round(consistency.distance)}m du dernier checkpoint`,
          };
          return false;
        }
      } else {
        // ✅ Feedback positif
        this.locationMessage = {
          type: 'success',
          text: `✓ Position cohérente (${Math.round(consistency.distance)}m du dernier checkpoint)`,
        };
        return true;
      }
    }

    return true;
  }
}

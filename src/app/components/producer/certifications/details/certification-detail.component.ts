import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CertificationService } from 'src/app/services/certification.service';
import { AuthService } from 'src/app/services/auth.service';
import {
  Certification,
  CertificationCheckpoint,
  CheckpointProof,
} from 'src/app/interfaces/certification.interfaces';

@Component({
  selector: 'app-certification-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './certification-detail.component.html',
  styleUrls: ['./certification-detail.component.css'],
})
export class CertificationDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private certificationService = inject(CertificationService);
  private authService = inject(AuthService);

  certification: Certification | null = null;
  initialImage: string | null = null;
  checkpointImages: Map<string, string> = new Map();

  // Tabs
  activeTab: 'timeline' | 'checkpoints' | 'proofs' | 'product' | 'analytics' =
    'timeline';

  // State
  isLoading = true;
  isProcessing = false;
  errorMessage = '';
  showPublishModal = false;
  showCompletionModal = false;
  showVerificationModal = false;

  // Filtres
  checkpointFilter: 'all' | 'completed' | 'pending' = 'all';

  // Publication
  selectedCheckpoints: { [key: string]: any } = {};
  publishPrice = 0;
  publishQuantity = 0;
  publishUnit = 'kg';
  publishDescription = '';

  // Preuves sélectionnées pour visualisation
  selectedProofs: CheckpointProof[] = [];
  selectedCheckpointForProofs: CertificationCheckpoint | null = null;
  showProofsModal = false;

  // Image sélectionnée
  selectedImage: string | null = null;
  showImageModal = false;

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigate(['/producer/certifications']);
      return;
    }

    await this.loadCertification(id);
  }

  // ========== MÉTHODES DE CHARGEMENT ==========

  async loadCertification(id: string) {
    this.isLoading = true;
    this.errorMessage = '';

    try {
      this.certification = await this.certificationService.getCertification(id);

      // Récupérer les images
      this.initialImage = this.certificationService.getImage(`${id}_initial`);

      // Récupérer les images des checkpoints
      this.certification.checkpoints.forEach((checkpoint) => {
        const imageKey = `${id}_${checkpoint.id}`;
        const image = this.certificationService.getImage(imageKey);
        if (image) {
          this.checkpointImages.set(checkpoint.id, image);
        }
      });

      // Vérifier si la certification est complète
      this.checkCompletionStatus();

    } catch (error: any) {
      console.error('Erreur chargement certification:', error);
      this.errorMessage = error.message || 'Erreur lors du chargement';
      this.showNotification('error', this.errorMessage);
    } finally {
      this.isLoading = false;
    }
  }

  private checkCompletionStatus() {
    if (this.certification &&
        this.certification.status === 'completed' &&
        !this.certification.finalProduct?.published) {

      const hasSeenModal = localStorage.getItem(`cert_completion_seen_${this.certification.id}`);

      if (!hasSeenModal) {
        setTimeout(() => {
          this.showCompletionModal = true;
          localStorage.setItem(`cert_completion_seen_${this.certification?.id}`, 'true');
        }, 1500);
      }
    }
  }

  async refresh() {
    if (!this.certification) return;
    await this.loadCertification(this.certification.id);
    this.showNotification('info', 'Certification actualisée');
  }

  // ========== MÉTHODES UTILITAIRES ==========

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
      expired: 'Expiré',
    };
    return texts[status] || status;
  }

  getProgressPercentage(cert: Certification): number {
    if (cert.totalCheckpoints === 0) return 0;
    return Math.round((cert.completedCheckpoints / cert.totalCheckpoints) * 100);
  }

  getCheckpointDate(dayOffset: number): Date {
    if (!this.certification) return new Date();
    return new Date(
      this.certification.startDate.getTime() + dayOffset * 24 * 60 * 60 * 1000,
    );
  }

  getRemainingDays(): number {
    if (!this.certification) return 0;
    const now = new Date();
    const diffTime = this.certification.expectedHarvestDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  }

  getTotalProofs(): number {
    if (!this.certification) return 0;
    return this.certification.checkpoints.reduce(
      (total, checkpoint) => total + (checkpoint.proofs?.length || 0),
      0,
    );
  }

  getVerifiedProofs(): number {
    if (!this.certification) return 0;
    return this.certification.checkpoints.reduce(
      (total, checkpoint) =>
        total + (checkpoint.proofs?.filter((p) => p.verified).length || 0),
      0,
    );
  }

  getVerificationRate(): number {
    const total = this.getTotalProofs();
    const verified = this.getVerifiedProofs();
    if (total === 0) return 0;
    return Math.round((verified / total) * 100);
  }

  getCheckpointImage(checkpointId: string): string | null {
    return this.checkpointImages.get(checkpointId) || null;
  }

  getImageUrl(photoUrl: string): string {
    if (photoUrl.startsWith('local://')) {
      const parts = photoUrl.split('://')[1];
      const imageData = this.certificationService.getImage(parts);
      return imageData || 'assets/images/placeholder.jpg';
    }
    return photoUrl;
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

  getProofCount(type: string): number {
    if (!this.certification) return 0;
    let count = 0;
    this.certification.checkpoints.forEach((checkpoint) => {
      if (checkpoint.proofs) {
        count += checkpoint.proofs.filter((p) => p.type === type).length;
      }
    });
    return count;
  }

  calculateTimeElapsed(checkpoint: CertificationCheckpoint): string {
    if (!checkpoint.completedAt) return 'N/A';
    const now = new Date();
    const completedAt = new Date(checkpoint.completedAt);
    const diffMs = now.getTime() - completedAt.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Aujourd'hui";
    if (diffDays === 1) return 'Hier';
    if (diffDays < 7) return `Il y a ${diffDays} jours`;
    if (diffDays < 30) return `Il y a ${Math.floor(diffDays / 7)} semaines`;
    return `Il y a ${Math.floor(diffDays / 30)} mois`;
  }

  getTimelineStatus(checkpoint: CertificationCheckpoint): string {
    if (checkpoint.completed) return 'completed';
    if (checkpoint.order === this.certification?.currentCheckpointIndex) return 'current';
    return 'upcoming';
  }

  getTimelineIcon(status: string): string {
    switch (status) {
      case 'completed': return '✅';
      case 'current': return '🎯';
      default: return '⏳';
    }
  }

  // ========== MÉTHODES BLOCKCHAIN ==========

  hasBlockchainProofs(): boolean {
    if (!this.certification) return false;
    return this.certification.checkpoints.some(
      cp => cp.completed && cp.blockchainTransactionId
    );
  }

  hasBlockchainData(): boolean {
    return this.hasBlockchainProofs();
  }

  getBlockchainStatusText(): string {
    if (!this.certification) return 'Non disponible';

    const total = this.certification.checkpoints.filter(cp => cp.completed).length;
    const withBlockchain = this.certification.checkpoints.filter(cp =>
      cp.completed && cp.blockchainTransactionId
    ).length;

    if (total === 0) return 'Aucun checkpoint';
    if (withBlockchain === total) return '100% Certifié';
    if (withBlockchain > 0) return `${Math.round((withBlockchain / total) * 100)}% Certifié`;
    return 'Non certifié';
  }

  getBlockchainTransactionCount(): number {
    if (!this.certification) return 0;
    return this.certification.checkpoints.filter(
      cp => cp.completed && cp.blockchainTransactionId
    ).length;
  }

  getBlockchainCoverage(): number {
    if (!this.certification) return 0;

    const total = this.certification.checkpoints.filter(cp => cp.completed).length;
    const withBlockchain = this.certification.checkpoints.filter(cp =>
      cp.completed && cp.blockchainTransactionId
    ).length;

    return total > 0 ? Math.round((withBlockchain / total) * 100) : 0;
  }

  formatTransactionId(transactionId: string): string {
    if (!transactionId) return '';
    if (transactionId.length <= 12) return transactionId;
    return transactionId.substring(0, 8) + '...' + transactionId.substring(transactionId.length - 4);
  }

  viewBlockchainProof(checkpoint: CertificationCheckpoint): void {
    if (checkpoint.blockchainTransactionId) {
      const explorerUrl = `https://blockchain-explorer.com/tx/${checkpoint.blockchainTransactionId}`;
      window.open(explorerUrl, '_blank');
    } else {
      this.showNotification('info', 'Ce checkpoint n\'a pas encore été enregistré sur blockchain');
    }
  }

  verifyTransaction(checkpoint: CertificationCheckpoint): void {
    if (checkpoint.blockchainTransactionId) {
      const verifyUrl = `https://blockchain-explorer.com/verify/${checkpoint.blockchainTransactionId}`;
      window.open(verifyUrl, '_blank');
    } else {
      this.showNotification('info', 'Aucune transaction blockchain à vérifier');
    }
  }

  // ========== MÉTHODES DE VÉRIFICATION ==========

  getVerificationStatusText(): string {
    if (!this.certification) return '';

    switch (this.certification.verificationStatus) {
      case 'auto_verified':
        return 'Auto-vérifié';
      case 'manually_verified':
        return 'Vérifié';
      default:
        return 'En attente';
    }
  }

  getVerificationUrl(): string {
    if (!this.certification) return '';
    return `${window.location.origin}/verify/${this.certification.id}`;
  }

  generateQRCodeData(): string {
    if (!this.certification) return '';
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
      this.getVerificationUrl()
    )}`;
  }

  copyVerificationLink(): void {
    const link = this.getVerificationUrl();
    navigator.clipboard.writeText(link).then(() => {
      this.showNotification('success', 'Lien copié dans le presse-papier');
    });
  }

  copyPublicVerificationLink(): void {
    this.copyVerificationLink();
  }

  shareVerification(): void {
    if (!this.certification) return;

    const shareData = {
      title: `Certification ${this.certification.productName}`,
      text: `Vérifiez la traçabilité de ${this.certification.productName}`,
      url: this.getVerificationUrl()
    };

    if (navigator.share) {
      navigator.share(shareData);
    } else {
      this.copyVerificationLink();
    }
  }

  shareProductVerification(): void {
    this.shareVerification();
  }

  downloadCertificate(): void {
    if (!this.certification) return;

    const certData = `
      ==================================
      CERTIFICAT DE TRACABILITÉ
      ==================================

      Produit: ${this.certification.productName}
      Type: ${this.certification.productType}
      Producteur: ${this.certification.producerName}

      Score de certification: ${this.certification.validationScore}%
      Statut: ${this.getVerificationStatusText()}
      Couverture blockchain: ${this.getBlockchainCoverage()}%

      ${this.certification.checkpoints
        .filter(cp => cp.completed)
        .map(cp => `✓ ${cp.title} - ${cp.verificationScore}% ${cp.blockchainTransactionId ? '⛓️' : ''}`)
        .join('\n')}

      Date: ${new Date().toLocaleDateString()}
      ID: ${this.certification.id}
      URL: ${this.getVerificationUrl()}
    `;

    const blob = new Blob([certData], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `certificat-${this.certification.id}.txt`;
    a.click();
    window.URL.revokeObjectURL(url);

    this.showNotification('success', 'Certificat téléchargé');
  }

  downloadBlockchainReport(): void {
    if (!this.certification) return;

    const report = {
      certificationId: this.certification.id,
      productName: this.certification.productName,
      producerName: this.certification.producerName,
      verificationUrl: this.getVerificationUrl(),
      blockchainTransactions: this.certification.checkpoints
        .filter(cp => cp.completed && cp.blockchainTransactionId)
        .map(cp => ({
          checkpoint: cp.title,
          dayOffset: cp.dayOffset,
          completedAt: cp.completedAt?.toISOString(),
          transactionId: cp.blockchainTransactionId,
          score: cp.verificationScore
        })),
      summary: {
        totalCheckpoints: this.certification.totalCheckpoints,
        completedCheckpoints: this.certification.completedCheckpoints,
        blockchainCertified: this.getBlockchainTransactionCount(),
        coveragePercentage: this.getBlockchainCoverage()
      },
      generatedAt: new Date().toISOString()
    };

    const dataStr = JSON.stringify(report, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const fileName = `blockchain-report-${this.certification.id}.json`;

    const link = document.createElement('a');
    link.setAttribute('href', dataUri);
    link.setAttribute('download', fileName);
    link.click();

    this.showNotification('success', 'Rapport blockchain téléchargé');
  }

  downloadVerificationPackage(): void {
    if (!this.certification) return;

    // Créer un zip contenant tous les documents
    this.showNotification('info', 'Préparation du package de vérification...');

    // Pour l'instant, télécharger juste le certificat
    this.downloadCertificate();

    // Note: Pour un vrai package ZIP, vous auriez besoin d'une bibliothèque comme JSZip
    // this.downloadAllVerificationDocuments();
  }

  // ========== MÉTHODES DES MODALS ==========

  openVerificationModal(): void {
    this.showVerificationModal = true;
  }

  closeVerificationModal(): void {
    this.showVerificationModal = false;
  }

  showQRCodeModal(): void {
    this.openVerificationModal();
  }

  showCompletionModalManually(): void {
    if (this.certification?.status === 'completed') {
      this.showCompletionModal = true;
    } else {
      this.showNotification('info', 'La certification doit d\'abord être terminée');
    }
  }

  closeCompletionModal(): void {
    this.showCompletionModal = false;
  }

  openPublishFromCompletion(): void {
    this.closeCompletionModal();
    setTimeout(() => {
      this.openPublishModal();
    }, 300);
  }

  viewCheckpointProofs(checkpoint: CertificationCheckpoint): void {
    if (checkpoint.proofs && checkpoint.proofs.length > 0) {
      this.selectedProofs = checkpoint.proofs;
      this.selectedCheckpointForProofs = checkpoint;
      this.showProofsModal = true;
    } else {
      this.showNotification('info', `Aucune preuve disponible pour ${checkpoint.title}`);
    }
  }

  closeProofsModal(): void {
    this.showProofsModal = false;
    this.selectedProofs = [];
    this.selectedCheckpointForProofs = null;
  }

  viewCheckpointImage(checkpointId: string): void {
    const image = this.getCheckpointImage(checkpointId);
    if (image) {
      this.selectedImage = image;
      this.showImageModal = true;
    } else {
      this.showNotification('info', 'Aucune image disponible pour ce checkpoint');
    }
  }

  closeImageModal(): void {
    this.showImageModal = false;
    this.selectedImage = null;
  }

  // ========== MÉTHODES DE PUBLICATION ==========

  openPublishModal() {
    if (!this.certification) return;

    this.publishPrice = this.certification.finalProduct?.price || 0;
    this.publishQuantity = this.certification.finalProduct?.quantity || 0;
    this.publishUnit = this.certification.finalProduct?.unit || 'kg';
    this.publishDescription = this.certification.finalProduct?.description || '';

    this.selectedCheckpoints = {};
    this.certification.checkpoints.forEach((checkpoint) => {
      if (checkpoint.completed) {
        this.selectedCheckpoints[checkpoint.id] = {
          selected: true,
          includePhotos: true,
          includeMeasurements: true,
          includeNotes: true,
        };
      }
    });

    this.showPublishModal = true;
  }

  closePublishModal() {
    this.showPublishModal = false;
    this.selectedCheckpoints = {};
  }

  toggleCheckpointSelection(checkpointId: string) {
    if (this.selectedCheckpoints[checkpointId]) {
      this.selectedCheckpoints[checkpointId].selected = !this.selectedCheckpoints[checkpointId].selected;
    }
  }

  hasSelectedCheckpoints(): boolean {
    return Object.values(this.selectedCheckpoints).some((cp: any) => cp.selected);
  }

  async publishProduct() {
    if (!this.certification || !this.hasSelectedCheckpoints()) {
      return;
    }

    this.isProcessing = true;

    try {
      const { certification, product } = await this.certificationService.publishCertificationAsProduct(
        this.certification.id,
        {
          price: this.publishPrice,
          quantity: this.publishQuantity,
          unit: this.publishUnit,
          description: this.publishDescription,
          minOrderQuantity: 1,
          storageConditions: 'À température ambiante',
        }
      );

      this.showNotification('success', 'Produit publié avec succès !');
      this.closePublishModal();
      await this.loadCertification(this.certification.id);
    } catch (error: any) {
      console.error('Erreur publication:', error);
      this.showNotification('error', error.message || 'Erreur lors de la publication');
    } finally {
      this.isProcessing = false;
    }
  }

  // ========== MÉTHODES D'ACTION ==========

  async cancelCertification() {
    if (!this.certification || !confirm('Voulez-vous vraiment annuler cette certification ? Cette action est irréversible.')) {
      return;
    }

    try {
      this.isProcessing = true;
      await this.certificationService.cancelCertification(this.certification.id);
      this.showNotification('success', 'Certification annulée avec succès');
      this.router.navigate(['/producer/certifications']);
    } catch (error: any) {
      console.error('Erreur annulation:', error);
      this.showNotification('error', error.message || "Erreur lors de l'annulation");
    } finally {
      this.isProcessing = false;
    }
  }

  viewProduct() {
    if (this.certification?.finalProduct) {
      this.router.navigate([`/product/${this.certification.finalProduct.id}`]);
    }
  }

  editProduct() {
    if (this.certification?.finalProduct) {
      this.openPublishModal();
    }
  }

  async simulateCheckpointCompletion() {
    if (!this.certification) return;

    try {
      this.isProcessing = true;
      const nextCheckpoint = this.getNextCheckpoint();
      if (nextCheckpoint) {
        await this.certificationService.simulateCheckpointCompletion(
          this.certification.id,
          nextCheckpoint.order,
        );
        this.showNotification(
          'success',
          `Checkpoint "${nextCheckpoint.title}" simulé avec succès`,
        );
        await this.loadCertification(this.certification.id);
      }
    } catch (error: any) {
      console.error('Erreur simulation:', error);
      this.showNotification('error', error.message || 'Erreur lors de la simulation');
    } finally {
      this.isProcessing = false;
    }
  }

  getNextCheckpoint(): CertificationCheckpoint | undefined {
    if (!this.certification) return undefined;
    return this.certification.checkpoints.find(
      (cp) => !cp.completed && cp.order === this.certification!.currentCheckpointIndex,
    );
  }

  exportData() {
    if (!this.certification) return;

    const data = {
      certification: this.certification,
      exportDate: new Date().toISOString(),
      exportType: 'full',
    };

    const dataStr = JSON.stringify(data, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const exportFileDefaultName = `certification-${this.certification.id}-${new Date().toISOString().split('T')[0]}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();

    this.showNotification('success', 'Données exportées avec succès');
  }

  goBack() {
    this.router.navigate(['/producer/certifications']);
  }

  toggleFilter(filter: 'all' | 'completed' | 'pending'): void {
    this.checkpointFilter = filter;
  }

  getFilteredCheckpoints(): CertificationCheckpoint[] {
    if (!this.certification) return [];

    switch (this.checkpointFilter) {
      case 'completed':
        return this.certification.checkpoints.filter(cp => cp.completed);
      case 'pending':
        return this.certification.checkpoints.filter(cp => !cp.completed);
      default:
        return this.certification.checkpoints;
    }
  }

  // ========== NOTIFICATIONS ==========

  private showNotification(type: 'success' | 'error' | 'info' | 'warning', message: string) {
    const notification = document.createElement('div');
    const icons = {
      success: '✅',
      error: '❌',
      info: 'ℹ️',
      warning: '⚠️',
    };
    const colors = {
      success: '#4CAF50',
      error: '#F44336',
      info: '#2196F3',
      warning: '#FF9800',
    };

    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <span style="font-size: 20px;">${icons[type]}</span>
        <span>${message}</span>
      </div>
    `;

    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${colors[type]};
      color: white;
      padding: 15px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 9999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      animation: slideIn 0.3s ease forwards;
      max-width: 400px;
    `;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(notification);

    setTimeout(() => {
      if (document.body.contains(notification)) {
        notification.style.animation = 'slideOut 0.3s ease forwards';
        setTimeout(() => {
          if (document.body.contains(notification)) {
            document.body.removeChild(notification);
          }
          if (document.head.contains(style)) {
            document.head.removeChild(style);
          }
        }, 300);
      }
    }, 5000);
  }
}

// certification-detail.component.ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CertificationService } from 'src/app/services/certification.service';
import {
  Certification,
  CertificationCheckpoint,
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
      case 'draft':
        return 'badge-draft';
      case 'active':
        return 'badge-active';
      case 'completed':
        return 'badge-completed';
      case 'verified':
        return 'badge-verified';
      case 'cancelled':
        return 'badge-cancelled';
      case 'expired':
        return 'badge-expired';
      default:
        return 'badge-draft';
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
    return Math.round(
      (cert.completedCheckpoints / cert.totalCheckpoints) * 100,
    );
  }

  getCheckpointDate(dayOffset: number): Date {
    if (!this.certification) return new Date();
    return new Date(
      this.certification.startDate.getTime() + dayOffset * 24 * 60 * 60 * 1000,
    );
  }

  // Méthodes pour les preuves
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
    alert(
      `Preuves pour ${checkpoint.title}: ${checkpoint.proofs?.length || 0} preuves`,
    );
  }

  async refresh() {
    if (!this.certification) return;
    await this.loadCertification(this.certification.id);
  }

  async cancelCertification() {
    if (
      !this.certification ||
      !confirm('Voulez-vous vraiment annuler cette certification ?')
    ) {
      return;
    }

    try {
      console.log('Annulation de la certification:', this.certification.id);
      this.errorMessage = '';
      this.router.navigate(['/producer/certifications']);
    } catch (error: any) {
      this.errorMessage = error.message || "Erreur lors de l'annulation";
    }
  }

  viewProduct() {
    if (this.certification?.finalProduct) {
      this.router.navigate([
        `/producer/products/${this.certification.finalProduct.id}`,
      ]);
    }
  }

  editProduct() {
    alert('Édition du produit à implémenter');
  }

  createProduct() {
    alert('Création de produit à implémenter');
  }

  viewQRCode() {
    if (this.certification) {
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
        window.location.origin + '/verify/' + this.certification.id,
      )}`;
      window.open(qrUrl, '_blank');
    }
  }

  viewCertificate() {
    if (this.certification) {
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

// components/producer/certifications-list/certifications-list.component.ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import {
  CertificationService,
  Certification,
} from '../../../../services/certification.service';
import { AuthService } from '../../../../services/auth.service';
import { FirebaseService } from '../../../../services/firebase.service';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-certifications-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, DatePipe],
  templateUrl: './certifications-list.component.html',
  styleUrls: ['./certifications-list.component.css'],
})
export class CertificationsListComponent implements OnInit {
  private certificationService = inject(CertificationService);
  private authService = inject(AuthService);
  private firebaseService = inject(FirebaseService);
  private router = inject(Router);

  certifications: Certification[] = [];
  filteredCertifications: Certification[] = [];
  selectedStatus = 'all';
  isLoading = true;

  ngOnInit() {
    this.loadCertifications();
  }

  // certifications-list.component.ts - loadCertifications
  async loadCertifications() {
    this.isLoading = true;
    try {
      const user = this.authService.getCurrentUser();
      if (!user) return;

      const producerId = user.uid;

      // 1. Récupérer UNIQUEMENT les certifications existantes
      this.certifications =
        await this.certificationService.getProducerCertifications(producerId);

      console.log('📋 Certifications récupérées:', this.certifications.length);

      // 2. Récupérer les produits avec certificationInProgress = true
      const allProducts =
        await this.firebaseService.getProducerProducts(producerId);

      // Filtrer seulement les produits EN certification
      const productsInCertification = allProducts.filter(
        (product) =>
          // Soit le produit a certificationInProgress = true
          product.certificationInProgress === true ||
          // Soit le produit a un statut 'certification'
          product.status === 'certification' ||
          // Soit le produit a un objet certification
          (product.certification && product.certification.id),
      );

      console.log(
        '🔄 Produits en certification trouvés:',
        productsInCertification.length,
      );

      // 3. Pour chaque produit en certification, vérifier si une certification existe
      for (const product of productsInCertification) {
        const existingCert = this.certifications.find(
          (c) => c.productId === product.id,
        );

        // Si pas de certification existante, créer un objet temporaire UNIQUEMENT si vraiment en certification
        if (!existingCert) {
          // Vérifier que le produit est bien en certification (pas juste un produit normal)
          const isInCertificationMode =
            product.status === 'certification' ||
            product.certificationInProgress === true ||
            (product.certification &&
              product.certification.type === 'in_progress');

          if (isInCertificationMode) {
            console.log(
              '➕ Ajout certification temporaire pour:',
              product.name,
            );

            this.certifications.push({
              id: `temp_${product.id}`,
              productId: product.id!,
              productName: product.name,
              producerId: producerId,
              producerName: product.producerName,
              durationDays: 30,
              certificationType: 'standard',
              startDate: new Date(
                product.certificationStartDate || product.createdAt,
              ),
              estimatedEndDate: this.calculateEstimatedEndDate(product),
              status: this.getCertificationStatus(product),
              currentStep: 0,
              progress: this.calculateProgress(product),
              checkpoints: [],
              totalCheckpoints: 0,
              completedCheckpoints: 0,
              verificationScore: 0,
              blockchainVerified: false,
              blockchainTransactions: [],
              productData: product,
              createdAt: new Date(product.createdAt),
              updatedAt: new Date(product.updatedAt),
              auditLogs: [],
              isPendingCertification: true,
            } as any);
          }
        }
      }

      console.log('✅ Total certifications:', this.certifications.length);
      this.filterCertifications();
    } catch (error) {
      console.error('Erreur chargement certifications:', error);
    } finally {
      this.isLoading = false;
    }
  }

  // Ajoutez ces méthodes utilitaires
  private calculateEstimatedEndDate(product: any): Date {
    if (product.certification && product.certification.estimatedEndDate) {
      return new Date(product.certification.estimatedEndDate);
    }

    // Par défaut, 30 jours après le début
    const startDate = product.certificationStartDate
      ? new Date(product.certificationStartDate)
      : new Date(product.createdAt);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 30);
    return endDate;
  }

  private getCertificationStatus(product: any): string {
    if (product.certification) {
      switch (product.certification.status) {
        case 'active':
          return 'active';
        case 'completed':
          return 'completed';
        case 'cancelled':
          return 'cancelled';
        default:
          return 'draft';
      }
    }

    // Par défaut
    if (
      product.status === 'certification' ||
      product.certificationInProgress === true
    ) {
      return 'active';
    }

    return 'draft';
  }

  private calculateProgress(product: any): number {
    if (product.certification && product.certification.progress !== undefined) {
      return product.certification.progress;
    }
    return 0;
  }

filterCertifications() {
  if (this.selectedStatus === 'all') {
    // Afficher toutes les certifications
    this.filteredCertifications = this.certifications;
  } else {
    this.filteredCertifications = this.certifications.filter(
      (cert) => cert.status === this.selectedStatus
    );
  }

  console.log('🔍 Certifications filtrées:', this.filteredCertifications.length);
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

  getNextCheckpointDay(cert: Certification): number {
    if (!cert.checkpoints || cert.status !== 'active') return 0;
    const nextCheckpoint = cert.checkpoints.find((cp) => !cp.completed);
    return nextCheckpoint?.daysFromStart || 0;
  }

  getDaysRemaining(cert: Certification): number {
    if (!cert.estimatedEndDate) return 0;
    const today = new Date();
    const endDate = new Date(cert.estimatedEndDate);
    const diffTime = endDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  getProgressColor(progress: number): string {
    if (progress >= 80) return '#10b981';
    if (progress >= 50) return '#f59e0b';
    return '#ef4444';
  }

  getCertificationTypeText(type: string): string {
    const types: { [key: string]: string } = {
      standard: 'Standard',
      premium: 'Premium',
      organic: 'Bio',
      fairtrade: 'Commerce Équitable',
      sustainable: 'Durable',
    };
    return types[type] || type;
  }

  // Méthodes pour les statistiques
  getActiveCount(): number {
    return this.certifications.filter((cert) => cert.status === 'active')
      .length;
  }

  getCompletedCount(): number {
    return this.certifications.filter((cert) => cert.status === 'completed')
      .length;
  }

  getAverageProgress(): number {
    if (this.certifications.length === 0) return 0;
    const total = this.certifications.reduce(
      (sum, cert) => sum + cert.progress,
      0,
    );
    return Math.round(total / this.certifications.length);
  }

  resetFilters(): void {
    this.selectedStatus = 'all';
    this.filterCertifications();
  }

  continueCertification(event: Event, certId: string | undefined): void {
    event.stopPropagation();
    if (certId) {
      this.router.navigate(['/producer/certification', certId]);
    }
  }

  startCertification(event: Event, certId: string | undefined): void {
    event.stopPropagation();
    if (certId) {
      // Implémentez la logique pour démarrer la certification
      console.log('Démarrer certification:', certId);
      // Exemple:
      // this.certificationService.startCertification(certId).then(() => {
      //   this.loadCertifications();
      // });
    }
  }

  editCertification(event: Event, certId: string | undefined): void {
    event.stopPropagation();
    if (certId) {
      // Implémentez la logique pour éditer la certification
      console.log('Éditer certification:', certId);
      // Exemple:
      // this.router.navigate(['/producer/certification/edit', certId]);
    }
  }
}

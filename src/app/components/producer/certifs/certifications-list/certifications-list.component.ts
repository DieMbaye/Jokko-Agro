// components/producer/certifications-list/certifications-list.component.ts
import { Component, OnInit, inject, HostListener } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import {
  CertificationService,
  Certification,
} from '../../../../services/certification.service';
import { AuthService } from '../../../../services/auth.service';
import { FirebaseService } from '../../../../services/firebase.service';
import { FormsModule } from '@angular/forms';

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
  selectedType = 'all';
  isLoading = true;

  // Responsive properties
  isMobileView = false;
  isTabletView = false;
  currentBreakpoint = 'desktop';
  showMobileFilters = false;
  activeTab = 'all'; // For mobile tab navigation

  ngOnInit() {
    this.checkScreenSize();
    this.loadCertifications();
  }

  @HostListener('window:resize', ['$event'])
  onResize(event: any) {
    this.checkScreenSize();
  }

  checkScreenSize() {
    const width = window.innerWidth;
    this.isMobileView = width <= 768;
    this.isTabletView = width > 768 && width <= 1024;

    if (width <= 768) {
      this.currentBreakpoint = 'mobile';
    } else if (width <= 1024) {
      this.currentBreakpoint = 'tablet';
    } else {
      this.currentBreakpoint = 'desktop';
    }
  }

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
          product.certificationInProgress === true ||
          product.status === 'certification' ||
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

        if (!existingCert) {
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
              certificationType: product.certification?.type || 'standard',
              startDate: new Date(
                product.certificationStartDate || product.createdAt,
              ),
              estimatedEndDate: this.calculateEstimatedEndDate(product),
              status: this.getCertificationStatus(product),
              currentStep: 0,
              progress: this.calculateProgress(product),
              checkpoints: product.certification?.checkpoints || [],
              totalCheckpoints: product.certification?.totalCheckpoints || 5,
              completedCheckpoints: product.certification?.completedCheckpoints || 0,
              verificationScore: product.certification?.score || 0,
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

  private calculateEstimatedEndDate(product: any): Date {
    if (product.certification && product.certification.estimatedEndDate) {
      return new Date(product.certification.estimatedEndDate);
    }

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
    let filtered = this.certifications;

    // Filter by status
    if (this.selectedStatus !== 'all') {
      filtered = filtered.filter(
        (cert) => cert.status === this.selectedStatus
      );
    }

    // Filter by type
    if (this.selectedType !== 'all') {
      filtered = filtered.filter(
        (cert) => cert.certificationType === this.selectedType
      );
    }

    // Mobile tab filtering
    if (this.isMobileView && this.activeTab !== 'all') {
      filtered = filtered.filter(
        (cert) => cert.status === this.activeTab
      );
    }

    this.filteredCertifications = filtered;
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

  getDraftCount(): number {
    return this.certifications.filter((cert) => cert.status === 'draft')
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
    this.selectedType = 'all';
    this.activeTab = 'all';
    this.filterCertifications();
  }

  toggleMobileFilters(): void {
    this.showMobileFilters = !this.showMobileFilters;
  }

  setActiveTab(tab: string): void {
    this.activeTab = tab;
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
      console.log('Démarrer certification:', certId);
    }
  }

  editCertification(event: Event, certId: string | undefined): void {
    event.stopPropagation();
    if (certId) {
      console.log('Éditer certification:', certId);
    }
  }

  viewCertificationDetails(certId: string | undefined): void {
    if (certId) {
      this.router.navigate(['/producer/certification', certId]);
    }
  }

  getCertificationIcon(type: string): string {
    const icons: { [key: string]: string } = {
      standard: '📋',
      premium: '⭐',
      organic: '🌱',
      fairtrade: '🤝',
      sustainable: '♻️',
    };
    return icons[type] || '📋';
  }

  getStatusIcon(status: string): string {
    const icons: { [key: string]: string } = {
      draft: '📝',
      active: '⚡',
      completed: '✅',
      verified: '🔒',
      expired: '⏰',
      cancelled: '❌',
    };
    return icons[status] || '📋';
  }
}

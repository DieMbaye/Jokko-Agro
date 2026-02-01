import { Component, OnInit, inject, ElementRef, ViewChild } from '@angular/core';
import { CommonModule, TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/services/auth.service';
import { CertificationService } from 'src/app/services/certification.service';
import { Certification, CertificationStats, CertificationTemplate } from 'src/app/interfaces/certification.interfaces';

@Component({
  selector: 'app-certifications',
  standalone: true,
  imports: [CommonModule, FormsModule, TitleCasePipe],
  templateUrl: './certifications.html',
  styleUrls: ['./certifications.css'],
})
export class CertificationsComponent implements OnInit {
  private authService = inject(AuthService);
  private certificationService = inject(CertificationService);
  private router = inject(Router);

  // Données
  certifications: Certification[] = [];
  filteredCertifications: Certification[] = [];
  templates: CertificationTemplate[] = [];
  stats: CertificationStats | null = null;

  // Filtres
  filterStatus = 'all';
  filterProductType = 'all'; // Ajouté
  searchQuery = '';

  // États
  isLoading = false;
  showNewCertModal = false;
  showDeleteModal = false; // Ajouté
  selectedTemplateId = '';
  productName = '';
  initialPhoto: File | null = null;
  photoPreview: string | null = null; // Ajouté
  certificationToDelete: Certification | null = null; // Ajouté
  activeDropdown: string | null = null;

  // Référence au fichier input
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  ngOnInit() {
    this.loadData();
  }

  async loadData() {
    this.isLoading = true;

    try {
      const user = this.authService.getCurrentUser();
      if (!user) {
        this.router.navigate(['/login']);
        return;
      }

      // Charger les certifications
      this.certifications = await this.certificationService.getProducerCertifications(user.uid);
      this.filteredCertifications = [...this.certifications];

      // Charger les templates
      this.templates = this.certificationService.getTemplates();

      // Charger les statistiques
      this.stats = await this.certificationService.getCertificationStats(user.uid);

    } catch (error) {
      console.error('Erreur chargement certifications:', error);
      this.showNotification('error', 'Erreur lors du chargement des certifications');
    } finally {
      this.isLoading = false;
    }
  }

  // Filtrer les certifications
  filterCertifications() {
    let filtered = [...this.certifications];

    // Filtre par statut
    if (this.filterStatus !== 'all') {
      filtered = filtered.filter((c) => c.status === this.filterStatus);
    }

    // Filtre par type de produit
    if (this.filterProductType !== 'all') {
      filtered = filtered.filter(
        (c) => c.productType === this.filterProductType
      );
    }

    // Filtre par recherche
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.productName.toLowerCase().includes(query) ||
          c.productType.toLowerCase().includes(query) ||
          c.productCategory.toLowerCase().includes(query) ||
          c.producerName.toLowerCase().includes(query)
      );
    }

    this.filteredCertifications = filtered;
  }

  // Navigation
  navigateToCertification(certId: string) {
    this.router.navigate([`/producer/certification/${certId}`]);
  }

  // Gestion des menus déroulants
  toggleActions(event: Event, certId: string) {
    event.stopPropagation();

    if (this.activeDropdown === certId) {
      this.activeDropdown = null;
    } else {
      this.activeDropdown = certId;
    }
  }

  isDropdownOpen(certId: string): boolean {
    return this.activeDropdown === certId;
  }

  // Actions sur les certifications
  duplicateCertification(cert: Certification) {
    this.showNotification('info', 'Fonctionnalité de duplication à venir');
  }

  viewPublishedProduct(cert: Certification) {
    if (cert.finalProduct?.id) {
      this.router.navigate([`/product/${cert.finalProduct.id}`]);
    }
  }

  // Modal suppression
  openDeleteModal(cert: Certification) {
    this.certificationToDelete = cert;
    this.showDeleteModal = true;
  }

  closeDeleteModal() {
    this.showDeleteModal = false;
    this.certificationToDelete = null;
  }

  async confirmDelete() {
    if (!this.certificationToDelete) return;

    try {
      await this.certificationService.cancelCertification(this.certificationToDelete.id);
      this.showNotification('success', `Certification "${this.certificationToDelete.productName}" annulée`);
      this.closeDeleteModal();
      await this.loadData();
    } catch (error: any) {
      this.showNotification('error', error.message || 'Erreur lors de l\'annulation');
    }
  }

  // Bouton pour continuer un checkpoint actif
  continueCertification(cert: Certification) {
    if (cert.status === 'active' && cert.currentCheckpointIndex < cert.checkpoints.length) {
      const nextCheckpoint = cert.checkpoints[cert.currentCheckpointIndex];
      if (nextCheckpoint) {
        this.router.navigate([`/producer/certification/${cert.id}/checkpoint/${nextCheckpoint.id}`]);
      }
    }
  }

  // Publier une certification
  publishCertification(cert: Certification) {
    this.router.navigate([`/producer/certification/${cert.id}`, { tab: 'product' }]);
  }

  // Modale nouvelle certification
  openNewCertModal() {
    this.showNewCertModal = true;
    this.selectedTemplateId = '';
    this.productName = '';
    this.initialPhoto = null;
    this.photoPreview = null;
  }

  closeNewCertModal() {
    this.showNewCertModal = false;
  }

  // Démarrer certification
  async startCertification() {
    if (!this.selectedTemplateId || !this.productName || !this.initialPhoto) {
      this.showNotification('error', 'Veuillez remplir tous les champs requis');
      return;
    }

    this.isLoading = true;

    try {
      const certification = await this.certificationService.startCertification({
        templateId: this.selectedTemplateId,
        productName: this.productName,
        description: '',
        initialPhoto: this.initialPhoto,
      });

      this.closeNewCertModal();
      await this.loadData();

      this.showNotification('success', `Certification "${certification.productName}" démarrée!`);

      // Rediriger vers la nouvelle certification
      setTimeout(() => {
        this.navigateToCertification(certification.id);
      }, 1500);
    } catch (error: any) {
      this.showNotification('error', error.message || 'Erreur lors du démarrage');
    } finally {
      this.isLoading = false;
    }
  }

  // Gestion des fichiers
  triggerFileInput() {
    this.fileInput.nativeElement.click();
  }

  onPhotoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];

      if (!this.validateImageFile(file)) {
        return;
      }

      this.initialPhoto = file;

      const reader = new FileReader();
      reader.onload = () => {
        this.photoPreview = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  }

  private validateImageFile(file: File): boolean {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const maxSize = 5 * 1024 * 1024; // 5MB

    if (!validTypes.includes(file.type)) {
      this.showNotification('error', 'Format non supporté. Utilisez JPG, PNG ou WebP.');
      return false;
    }

    if (file.size > maxSize) {
      this.showNotification('error', 'Fichier trop volumineux (max 5MB).');
      return false;
    }

    return true;
  }

  // Méthodes utilitaires
  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'draft': return 'badge-draft';
      case 'active': return 'badge-active';
      case 'completed': return 'badge-completed';
      case 'verified': return 'badge-verified';
      case 'cancelled': return 'badge-cancelled';
      case 'expired': return 'badge-expired';
      default: return 'badge-default';
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

  getProductIcon(productType: string): string {
    return this.certificationService.getProductIcon(productType);
  }

  getDaysRemaining(cert: Certification): number {
    if (!cert.expectedHarvestDate) return 0;
    const now = new Date();
    const diffTime = cert.expectedHarvestDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  }

  getNextCheckpoint(cert: Certification): any {
    if (!cert || !cert.checkpoints || cert.status !== 'active') return null;
    return cert.checkpoints.find(cp =>
      !cp.completed && cp.order === cert.currentCheckpointIndex
    ) || cert.checkpoints.find(cp => !cp.completed);
  }

  // Notifications
  private showNotification(type: 'success' | 'error' | 'info', message: string) {
    const notification = document.createElement('div');
    const colors = {
      success: '#4CAF50',
      error: '#F44336',
      info: '#2196F3'
    };
    const icons = {
      success: '✅',
      error: '❌',
      info: 'ℹ️'
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

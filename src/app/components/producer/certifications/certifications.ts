import { Component, OnInit, inject, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router'; // Ajoutez RouterLink et Router
import { AuthService } from 'src/app/services/auth.service';
import { CertificationService } from 'src/app/services/certification.service';
import { Certification, CertificationTemplate, CertificationStats } from 'src/app/services/certification.interfaces';

@Component({
  selector: 'app-certifications',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink], // Ajoutez RouterLink ici
  templateUrl: './certifications.html',
  styleUrls: ['./certifications.css']
})
export class CertificationsComponent implements OnInit {
  private authService = inject(AuthService);
  private certificationService = inject(CertificationService);
  private router = inject(Router); // Injectez Router

  // Onglets
  activeTab: 'dashboard' | 'new' | 'ongoing' | 'completed' | 'templates' = 'dashboard';

  // Données
  certifications: Certification[] = [];
  ongoingCertifications: Certification[] = [];
  completedCertifications: Certification[] = [];
  templates: CertificationTemplate[] = [];
  stats: CertificationStats | null = null;

  // Filtres
  filterStatus = 'all';
  filterProductType = 'all';
  searchQuery = '';

  // Nouvelle certification
  selectedTemplateId = '';
  productName = '';
  initialPhoto: File | null = null;
  photoPreview: string | null = null;
  useCurrentLocation = true;
  customLocation = '';

  // État
  isLoading = false;
  isStartingCertification = false;
  showNewCertModal = false;

  // Référence au fichier input
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  ngOnInit() {
    this.loadData();
  }

  async loadData() {
    this.isLoading = true;

    try {
      const user = this.authService.getCurrentUser();
      if (!user) return;

      this.certifications = await this.certificationService.getProducerCertifications(user.uid);
      this.templates = this.certificationService.getTemplates();

      this.filterCertifications();
      this.stats = await this.certificationService.getCertificationStats(user.uid);

    } catch (error) {
      console.error('Erreur chargement certifications:', error);
    } finally {
      this.isLoading = false;
    }
  }

  filterCertifications() {
    let filtered = [...this.certifications];

    // Filtre par statut
    if (this.filterStatus !== 'all') {
      filtered = filtered.filter(c => c.status === this.filterStatus);
    }

    // Filtre par type de produit
    if (this.filterProductType !== 'all') {
      filtered = filtered.filter(c => c.productType === this.filterProductType);
    }

    // Filtre par recherche
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(c =>
        c.productName.toLowerCase().includes(query) ||
        c.productType.toLowerCase().includes(query)
      );
    }

    // Séparation par statut
    this.ongoingCertifications = filtered.filter(c =>
      ['draft', 'active'].includes(c.status)
    );

    this.completedCertifications = filtered.filter(c =>
      ['completed', 'verified', 'cancelled', 'expired'].includes(c.status)
    );
  }

  // Nouvelle certification
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

  // Méthode pour déclencher le sélecteur de fichiers
  triggerFileInput() {
    this.fileInput.nativeElement.click();
  }

  onPhotoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.initialPhoto = input.files[0];

      // Aperçu
      const reader = new FileReader();
      reader.onload = () => {
        this.photoPreview = reader.result as string;
      };
      reader.readAsDataURL(this.initialPhoto);
    }
  }

  async startCertification() {
    if (!this.selectedTemplateId || !this.productName || !this.initialPhoto) {
      alert('Veuillez remplir tous les champs requis');
      return;
    }

    this.isStartingCertification = true;

    try {
      await this.certificationService.startCertification({
        templateId: this.selectedTemplateId,
        productName: this.productName,
        initialPhoto: this.initialPhoto
      });

      this.closeNewCertModal();
      await this.loadData();
      this.activeTab = 'ongoing';

    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      this.isStartingCertification = false;
    }
  }

  // Méthode utilitaire pour calculer la date d'un checkpoint
  getCheckpointDate(cert: Certification, checkpointDayOffset: number): Date {
    return new Date(cert.startDate.getTime() + checkpointDayOffset * 24 * 60 * 60 * 1000);
  }

  // Utilitaires d'affichage
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
      expired: 'Expiré'
    };
    return texts[status] || status;
  }

  getProgressPercentage(cert: Certification): number {
    return Math.round((cert.completedCheckpoints / cert.totalCheckpoints) * 100);
  }

  getNextCheckpoint(cert: Certification) {
    return cert.checkpoints.find(cp => !cp.completed);
  }

  getDaysRemaining(cert: Certification): number {
    const now = new Date();
    const harvestDate = cert.expectedHarvestDate;
    const diff = harvestDate.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  getProductIcon(productType: string): string {
    return this.certificationService.getProductIcon(productType);
  }

  navigateToCertification(id: string) {
    this.router.navigate([`/producer/certification/${id}`]);
  }

  async duplicateCertification(cert: Certification) {
    if (confirm(`Dupliquer la certification "${cert.productName}" ?`)) {
      // Logique de duplication
      console.log('Duplication:', cert.id);
    }
  }

  async cancelCertification(cert: Certification) {
    if (confirm(`Annuler la certification "${cert.productName}" ? Cette action est irréversible.`)) {
      // Logique d'annulation
      console.log('Annulation:', cert.id);
      await this.loadData();
    }
  }

  // Gestion des templates
  getTemplateById(id: string): CertificationTemplate | undefined {
    return this.templates.find(t => t.id === id);
  }

  viewTemplateDetails(template: CertificationTemplate) {
    alert(`Template: ${template.name}\nDurée: ${template.durationDays} jours\nPoints: ${template.checkpoints.length}`);
  }
}

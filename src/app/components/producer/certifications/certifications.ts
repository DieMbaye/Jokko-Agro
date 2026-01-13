import { Component, OnInit, inject, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { AuthService } from 'src/app/services/auth.service';
import { CertificationService } from 'src/app/services/certification.service';
import { Certification, CertificationTemplate, CertificationStats } from 'src/app/services/certification.interfaces';

@Component({
  selector: 'app-certifications',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './certifications.html',
  styleUrls: ['./certifications.css']
})
export class CertificationsComponent implements OnInit {
  private authService = inject(AuthService);
  private certificationService = inject(CertificationService);
  private router = inject(Router);

  // Onglets
  activeTab: 'dashboard' | 'ongoing' | 'completed' | 'templates' = 'dashboard';

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

      // Charger les certifications
      this.certifications = await this.certificationService.getProducerCertifications(user.uid);

      // Débogage : afficher les certifications chargées
      console.log('=== CERTIFICATIONS CHARGÉES ===');
      console.log('Total:', this.certifications.length);
      this.certifications.forEach((cert, index) => {
        console.log(`${index + 1}. ${cert.productName} - ${cert.status} - Score: ${cert.validationScore}%`);
      });

      // Charger les templates
      this.templates = this.certificationService.getTemplates();
      console.log('Templates disponibles:', this.templates.length);

      // Filtrer les certifications
      this.filterCertifications();

      // Charger les statistiques
      this.stats = await this.certificationService.getCertificationStats(user.uid);
      console.log('Statistiques:', this.stats);

    } catch (error) {
      console.error('Erreur chargement certifications:', error);
      this.showErrorMessage('Erreur lors du chargement des certifications');
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
        c.productType.toLowerCase().includes(query) ||
        c.productCategory.toLowerCase().includes(query)
      );
    }

    // Séparation par statut
    this.ongoingCertifications = filtered.filter(c =>
      ['draft', 'active'].includes(c.status)
    );

    this.completedCertifications = filtered.filter(c =>
      ['completed', 'verified', 'cancelled', 'expired'].includes(c.status)
    );

    console.log('Certifications filtrées:', {
      total: filtered.length,
      enCours: this.ongoingCertifications.length,
      terminées: this.completedCertifications.length
    });
  }

  // Nouvelle certification
  openNewCertModal() {
    this.showNewCertModal = true;
    this.selectedTemplateId = '';
    this.productName = '';
    this.initialPhoto = null;
    this.photoPreview = null;
    this.useCurrentLocation = true;
    this.customLocation = '';
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
      const file = input.files[0];

      // Valider le fichier
      if (!this.validateImageFile(file)) {
        return;
      }

      this.initialPhoto = file;

      // Aperçu
      const reader = new FileReader();
      reader.onload = () => {
        this.photoPreview = reader.result as string;
      };
      reader.readAsDataURL(this.initialPhoto);
    }
  }

  private validateImageFile(file: File): boolean {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const maxSize = 5 * 1024 * 1024; // 5MB

    if (!validTypes.includes(file.type)) {
      alert('Format non supporté. Utilisez JPG, PNG ou WebP.');
      return false;
    }

    if (file.size > maxSize) {
      alert('Fichier trop volumineux (max 5MB).');
      return false;
    }

    return true;
  }

  async startCertification() {
    if (!this.selectedTemplateId || !this.productName || !this.initialPhoto) {
      alert('Veuillez remplir tous les champs requis');
      return;
    }

    this.isStartingCertification = true;

    try {
      console.log('Démarrage certification...', {
        templateId: this.selectedTemplateId,
        productName: this.productName,
        hasPhoto: !!this.initialPhoto
      });

      const certification = await this.certificationService.startCertification({
        templateId: this.selectedTemplateId,
        productName: this.productName,
        initialPhoto: this.initialPhoto,
        location: this.useCurrentLocation ? undefined : { lat: 14.716677, lng: -17.467686 },
        notes: this.customLocation || undefined
      });

      console.log('Certification démarrée avec succès:', certification.id);

      this.closeNewCertModal();
      await this.loadData();
      this.activeTab = 'ongoing';

      this.showSuccessMessage(`Certification "${certification.productName}" démarrée avec succès!`);

    } catch (error: any) {
      console.error('Erreur démarrage certification:', error);
      this.showErrorMessage(error.message || 'Erreur lors du démarrage de la certification');
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
    if (cert.totalCheckpoints === 0) return 0;
    return Math.round((cert.completedCheckpoints / cert.totalCheckpoints) * 100);
  }

  getNextCheckpoint(cert: Certification) {
    return cert.checkpoints.find(cp => !cp.completed);
  }

  getDaysRemaining(cert: Certification): number {
    const now = new Date();
    const harvestDate = cert.expectedHarvestDate;
    const diff = harvestDate.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return Math.max(0, days); // Ne pas retourner de jours négatifs
  }

  getProductIcon(productType: string): string {
    return this.certificationService.getProductIcon(productType);
  }

  navigateToCertification(id: string) {
    this.router.navigate([`/producer/certification/${id}`]);
  }

  async duplicateCertification(cert: Certification) {
    if (confirm(`Dupliquer la certification "${cert.productName}" ?`)) {
      try {
        // Créer une nouvelle certification basée sur l'existante
        const newCert = await this.certificationService.startCertification({
          templateId: this.getTemplateIdFromProductType(cert.productType),
          productName: `${cert.productName} (Copie)`,
          initialPhoto: await this.getInitialPhotoFromCertification(cert),
          location: {
            lat: cert.location.lat,
            lng: cert.location.lng
          }
        });

        this.showSuccessMessage(`Certification dupliquée avec succès!`);
        await this.loadData();
      } catch (error) {
        console.error('Erreur duplication:', error);
        this.showErrorMessage('Erreur lors de la duplication');
      }
    }
  }

  private async getInitialPhotoFromCertification(cert: Certification): Promise<File> {
    // Récupérer l'image initiale depuis le stockage local
    const imageData = this.certificationService.getImage(`${cert.id}_initial`);
    if (imageData) {
      // Convertir base64 en File
      const blob = this.base64ToBlob(imageData, 'image/jpeg');
      return new File([blob], 'initial.jpg', { type: 'image/jpeg' });
    }

    // Fallback : créer une image factice
    return this.createDummyImage();
  }

  private base64ToBlob(base64: string, contentType: string): Blob {
    const byteCharacters = atob(base64.split(',')[1]);
    const byteNumbers = new Array(byteCharacters.length);

    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }

    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: contentType });
  }

  private createDummyImage(): File {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.fillStyle = '#4CAF50';
      ctx.fillRect(0, 0, 400, 300);
      ctx.fillStyle = 'white';
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Image initiale', 200, 100);
      ctx.font = '16px Arial';
      ctx.fillText('Certification copiée', 200, 150);
    }

    return new File([canvas.toDataURL('image/jpeg')], 'dummy.jpg', { type: 'image/jpeg' });
  }

  private getTemplateIdFromProductType(productType: string): string {
    const template = this.templates.find(t => t.productType === productType);
    return template?.id || 'tomato_60'; // Fallback
  }

  async cancelCertification(cert: Certification) {
    if (confirm(`Annuler la certification "${cert.productName}" ? Cette action est irréversible.`)) {
      try {
        // TODO: Implémenter la logique d'annulation dans le service
        console.log('Annulation:', cert.id);
        this.showSuccessMessage(`Certification "${cert.productName}" annulée`);
        await this.loadData();
      } catch (error) {
        console.error('Erreur annulation:', error);
        this.showErrorMessage('Erreur lors de l\'annulation');
      }
    }
  }

  async simulateCheckpointCompletion(cert: Certification, checkpointIndex: number) {
    if (confirm(`Simuler la complétion du checkpoint ${checkpointIndex + 1} ?`)) {
      try {
        await this.certificationService.simulateCheckpointCompletion(cert.id, checkpointIndex);
        this.showSuccessMessage(`Checkpoint simulé avec succès!`);
        await this.loadData();
      } catch (error) {
        console.error('Erreur simulation:', error);
        this.showErrorMessage('Erreur lors de la simulation');
      }
    }
  }

  // Gestion des templates
  getTemplateById(id: string): CertificationTemplate | undefined {
    return this.templates.find(t => t.id === id);
  }

  viewTemplateDetails(template: CertificationTemplate) {
    const details = `
📋 ${template.name}
${template.description}

📅 Durée: ${template.durationDays} jours
📊 Points de contrôle: ${template.checkpoints.length}
🏷️ Badges: ${template.badges.join(', ')}

Points de contrôle:
${template.checkpoints.map((cp, i) =>
  `  ${i + 1}. J+${cp.dayOffset}: ${cp.title}
     Preuves requises: ${cp.requiredProofs.map(p =>
       p === 'photo' ? '📸 Photo' :
       p === 'gps' ? '📍 GPS' :
       p === 'measurement' ? '📏 Mesure' : '📝 Note'
     ).join(', ')}`
).join('\n')}
    `;

    alert(details);
  }

  // Méthodes de notification
  private showSuccessMessage(message: string) {
    this.showNotification('success', message);
  }

  private showErrorMessage(message: string) {
    this.showNotification('error', message);
  }

  private showNotification(type: 'success' | 'error' | 'info', message: string) {
    const notification = document.createElement('div');
    const backgroundColor = type === 'success' ? '#4CAF50' :
                           type === 'error' ? '#F44336' : '#2196F3';
    const icon = type === 'success' ? '✅' :
                 type === 'error' ? '❌' : 'ℹ️';

    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <span style="font-size: 20px;">${icon}</span>
        <span>${message}</span>
      </div>
    `;

    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${backgroundColor};
      color: white;
      padding: 15px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 9999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      animation: slideIn 0.3s ease forwards;
      max-width: 400px;
    `;

    // Ajouter les animations CSS
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

    // Auto-remove après 5 secondes
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

  // Méthode de débogage
  debugCertifications() {
    console.group('=== DÉBOGAGE CERTIFICATIONS ===');
    console.log('Total certifications:', this.certifications.length);

    this.certifications.forEach((cert, index) => {
      console.group(`Certification ${index + 1}: ${cert.productName}`);
      console.log('ID:', cert.id);
      console.log('Statut:', cert.status);
      console.log('Score:', cert.validationScore);
      console.log('Checkpoints:', `${cert.completedCheckpoints}/${cert.totalCheckpoints}`);
      console.log('Date création:', cert.createdAt);
      console.log('Date fin estimée:', cert.expectedHarvestDate);

      // Vérifier les images
      const initialImage = this.certificationService.getImage(`${cert.id}_initial`);
      console.log('Image initiale:', initialImage ? '✓ Disponible' : '✗ Non disponible');

      console.groupEnd();
    });

    console.groupEnd();
  }

  // Méthode pour rafraîchir les données
  async refreshData() {
    this.isLoading = true;
    try {
      await this.loadData();
      this.showSuccessMessage('Données rafraîchies avec succès');
    } catch (error) {
      console.error('Erreur rafraîchissement:', error);
      this.showErrorMessage('Erreur lors du rafraîchissement');
    } finally {
      this.isLoading = false;
    }
  }

  // Méthode pour exporter les données
  exportCertifications() {
    const data = {
      certifications: this.certifications,
      stats: this.stats,
      exportDate: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `certifications-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    window.URL.revokeObjectURL(url);

    this.showSuccessMessage('Certifications exportées avec succès');
  }

  // Méthode pour vérifier si un checkpoint peut être complété
  canCompleteCheckpoint(checkpoint: any, cert: Certification): boolean {
    return !checkpoint.completed &&
           checkpoint.order === cert.currentCheckpointIndex;
  }

  // Méthode pour obtenir la prochaine date de checkpoint
  getNextCheckpointDate(cert: Certification): string {
    const nextCheckpoint = this.getNextCheckpoint(cert);
    if (nextCheckpoint) {
      const date = this.getCheckpointDate(cert, nextCheckpoint.dayOffset);
      return date.toLocaleDateString('fr-FR');
    }
    return 'Aucun';
  }

  // Méthode pour formater les dates
  formatDate(date: Date): string {
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  // Méthode pour formater les dates avec heure
  formatDateTime(date: Date): string {
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}

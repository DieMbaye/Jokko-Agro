// components/producer/certification-start/certification-start.component.ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import {
  CertificationService,
  CertificationTemplate,
} from '../../../../services/certification.service';
import { FirebaseService } from '../../../../services/firebase.service';
import { AuthService } from '../../../../services/auth.service';

interface ProductFormData {
  name: string;
  category: string;
  description: string;
  price: number;
  quantity: number;
  unit: string;
  location: string;
  harvestDate?: string;
  storageConditions?: string;
  contactPhone: string;
  minOrderQuantity: number;
  isOrganic: boolean;
  certifications: string[];
}

interface CertificationOption {
  id: string;
  name: string;
  icon: string;
}

// ⚠️ AJOUT: Type pour les clés d'engagement
type CommitmentKey =
  | 'photoConsent'
  | 'locationConsent'
  | 'timeCommitment'
  | 'blockchainConsent'
  | 'publishConsent';

interface CommitmentAgreements {
  photoConsent: boolean;
  locationConsent: boolean;
  timeCommitment: boolean;
  blockchainConsent: boolean;
  publishConsent: boolean;
}

// Interface pour la liste des engagements avec typage strict
interface CommitmentItem {
  id: CommitmentKey; // ⚠️ Utilisation du type spécifique
  label: string;
  description: string;
  icon: string;
}

@Component({
  selector: 'app-certification-start',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './certification-start.component.html',
  styleUrls: ['./certification-start.component.css'],
})
export class CertificationStartComponent implements OnInit {
  private certificationService = inject(CertificationService);
  private firebaseService = inject(FirebaseService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  currentStep = 1;
  certificationTemplates: CertificationTemplate[] = [];

  selectedTemplateId: string | null = null;
  selectedTemplate: CertificationTemplate | null = null;

  productForm: ProductFormData = {
    name: '',
    category: '',
    description: '',
    price: 1500,
    quantity: 100,
    unit: 'kg',
    location: '',
    harvestDate: new Date().toISOString().split('T')[0],
    storageConditions: 'Conserver au frais et au sec',
    contactPhone: '',
    minOrderQuantity: 1,
    isOrganic: false,
    certifications: [],
  };

  availableCertifications: CertificationOption[] = [
    { id: 'organic', name: 'Bio', icon: '🌱' },
    { id: 'local', name: 'Local', icon: '📍' },
    { id: 'fairtrade', name: 'Équitable', icon: '🤝' },
    { id: 'seasonal', name: 'Saison', icon: '🌞' },
  ];

  // Engagements
  agreements: CommitmentAgreements = {
    photoConsent: false,
    locationConsent: false,
    timeCommitment: false,
    blockchainConsent: false,
    publishConsent: false,
  };

  // ⚠️ CORRECTION: Typage strict des engagements
  commitmentsList: CommitmentItem[] = [
    {
      id: 'photoConsent',
      label: 'Authenticité des photos',
      description:
        "Je m'engage à prendre des photos réelles et authentiques à chaque checkpoint",
      icon: '📸',
    },
    {
      id: 'locationConsent',
      label: 'Partage de localisation',
      description:
        "J'accepte de partager ma localisation GPS pour chaque checkpoint",
      icon: '📍',
    },
    {
      id: 'timeCommitment',
      label: 'Respect du calendrier',
      description:
        "Je m'engage à respecter rigoureusement le calendrier des checkpoints",
      icon: '⏰',
    },
    {
      id: 'blockchainConsent',
      label: 'Enregistrement blockchain',
      description:
        "J'accepte l'enregistrement des preuves sur la blockchain Ethereum",
      icon: '⛓️',
    },
    {
      id: 'publishConsent',
      label: 'Publication automatique',
      description:
        "J'accepte que le produit soit publié automatiquement après certification",
      icon: '🚀',
    },
  ];

  isLoading = false;
  allAgreementsAccepted = false;

  // ⚠️ AJOUT: Pour utiliser Object.values dans le template
  Object = Object;

  ngOnInit() {
    this.loadUserData();
    this.certificationTemplates =
      this.certificationService.getAvailableTemplates();
    // Vérifier l'état initial
    this.allAgreementsAccepted = this.areAllAgreementsAccepted();
  }

  loadUserData() {
    const user = this.authService.getUserData();
    if (user) {
      this.productForm.contactPhone = user.phone || '';
      this.productForm.location = user.location || 'Dakar, Sénégal';
    }
  }

  toggleCertification(certId: string) {
    const index = this.productForm.certifications.indexOf(certId);
    if (index === -1) {
      this.productForm.certifications.push(certId);
    } else {
      this.productForm.certifications.splice(index, 1);
    }
  }

  selectTemplate(template: CertificationTemplate) {
    this.selectedTemplateId = template.id;
    this.selectedTemplate = template;
  }

  canProceedToNextStep(): boolean {
    switch (this.currentStep) {
      case 1:
        return this.isProductFormValid();
      case 2:
        return !!this.selectedTemplateId;
      default:
        return true;
    }
  }

  isProductFormValid(): boolean {
    return (
      !!this.productForm.name?.trim() &&
      !!this.productForm.category &&
      !!this.productForm.description?.trim() &&
      !!this.productForm.location?.trim() &&
      this.productForm.price > 0 &&
      this.productForm.quantity > 0
    );
  }

  goToNextStep() {
    if (this.canProceedToNextStep()) {
      this.currentStep++;
    }
  }

  goToPreviousStep() {
    if (this.currentStep > 1) {
      this.currentStep--;
    }
  }

  canStartCertification(): boolean {
    return (
      this.isProductFormValid() &&
      !!this.selectedTemplateId &&
      Object.values(this.agreements).every((agreement) => agreement === true)
    );
  }

  /**
   * ✅ BOUTON "ACCEPTER TOUT"
   */
  toggleAllAgreements() {
    const newValue = !this.areAllAgreementsAccepted();

    // Mettre à jour chaque engagement individuellement
    this.agreements.photoConsent = newValue;
    this.agreements.locationConsent = newValue;
    this.agreements.timeCommitment = newValue;
    this.agreements.blockchainConsent = newValue;
    this.agreements.publishConsent = newValue;

    this.allAgreementsAccepted = newValue;

    if (newValue) {
      this.showNotification(
        'success',
        '✅ Tous les engagements ont été acceptés',
      );
    }
  }

  /**
   * ✅ Vérifie si tous les engagements sont acceptés
   */
  areAllAgreementsAccepted(): boolean {
    return Object.values(this.agreements).every((value) => value === true);
  }

  /**
   * ✅ Met à jour l'état global quand on coche/décoche individuellement
   */
  onAgreementChange() {
    this.allAgreementsAccepted = this.areAllAgreementsAccepted();
  }

  /**
   * ⚠️ AJOUT: Méthode pour accéder en toute sécurité aux valeurs des engagements
   */
  getAgreementValue(key: CommitmentKey): boolean {
    return this.agreements[key];
  }

  /**
   * ⚠️ AJOUT: Méthode pour mettre à jour en toute sécurité les valeurs des engagements
   */
  setAgreementValue(key: CommitmentKey, value: boolean): void {
    this.agreements[key] = value;
    this.onAgreementChange();
  }

  async startCertificationProcess() {
    if (!this.selectedTemplateId || !this.isProductFormValid()) return;

    this.isLoading = true;
    try {
      // 1. Créer le produit avec statut "certification"
      const productResult = await this.createProductForCertification();

      console.log('Résultat création produit:', productResult);

      if (!productResult.success || !productResult.productId) {
        throw new Error(productResult.error || 'Erreur création produit');
      }

      // 2. Démarrer la certification avec le produit créé
      const certResult =
        await this.certificationService.startCertificationWithProduct(
          productResult.productId,
          this.selectedTemplateId,
          this.productForm,
        );

      if (certResult.success && certResult.certificationId) {
        this.showNotification(
          'success',
          '✨ Certification démarrée avec succès !',
        );

        // Rediriger vers la page de suivi de certification
        setTimeout(() => {
          this.router.navigate(
            ['/producer/certification', certResult.certificationId],
            {
              queryParams: {
                newProduct: true,
                productId: productResult.productId,
              },
            },
          );
        }, 800);
      } else {
        throw new Error(certResult.error || 'Erreur démarrage certification');
      }
    } catch (error: any) {
      console.error('Erreur complète:', error);
      this.showErrorNotification(
        error.message ||
          'Une erreur est survenue lors du démarrage de la certification',
      );
    } finally {
      this.isLoading = false;
    }
  }

  private async createProductForCertification(): Promise<{
    success: boolean;
    productId?: string;
    error?: string;
  }> {
    try {
      const user = this.authService.getCurrentUser();
      const userData = this.authService.getUserData();

      if (!user || !userData) {
        return { success: false, error: 'Utilisateur non connecté' };
      }

      const productData = {
        name: this.productForm.name,
        category: this.productForm.category,
        description: this.productForm.description,
        price: this.productForm.price,
        quantity: this.productForm.quantity,
        unit: this.productForm.unit,
        certifications: this.productForm.certifications || [],
        isOrganic: this.productForm.isOrganic || false,
        location: this.productForm.location,
        contactPhone: this.productForm.contactPhone || userData.phone || '',
        minOrderQuantity: this.productForm.minOrderQuantity || 1,
        producerId: user.uid,
        producerName: userData.fullName || 'Producteur',
        producerPhone: userData.phone || '',
        harvestDate: this.productForm.harvestDate || null,
        storageConditions: this.productForm.storageConditions || '',
        status: 'certification',
        isActive: false,
        images: [],
        certificationInProgress: true,
        certificationStartDate: new Date().toISOString(),
        views: 0,
        sales: 0,
        rating: 0,
        totalRating: 0,
        ratingCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      console.log('Données produit à créer:', productData);

      const result = await this.firebaseService.createProductForCertification({
        name: productData.name,
        category: productData.category,
        description: productData.description,
        price: productData.price,
        quantity: productData.quantity,
        unit: productData.unit,
        producerId: user.uid,
        producerName: userData.fullName || 'Producteur',
        location: this.productForm.location,
        contactPhone: this.productForm.contactPhone || userData.phone || '',
      });

      console.log('Résultat création produit:', result);

      if (result.success) {
        console.log('Produit créé avec ID:', result.productId);
      }

      return result;
    } catch (error: any) {
      console.error('Erreur détaillée création produit:', error);
      return {
        success: false,
        error: error.message || 'Erreur lors de la création du produit',
      };
    }
  }

  /**
   * Notification succès
   */
  private showNotification(
    type: 'success' | 'error' | 'info',
    message: string,
  ) {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;

    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';

    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <span style="font-size: 22px;">${icon}</span>
        <span style="font-weight: 500;">${message}</span>
      </div>
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.remove();
    }, 5000);
  }

  /**
   * Notification erreur
   */
  private showErrorNotification(message: string) {
    const notification = document.createElement('div');
    notification.className = 'notification notification-error';
    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <span style="font-size: 22px;">⚠️</span>
        <span style="font-weight: 500;">${message}</span>
      </div>
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.remove();
    }, 5000);
  }

  getCategoryName(categoryId: string): string {
    const categories: { [key: string]: string } = {
      vegetables: '🥦 Légumes',
      fruits: '🍎 Fruits',
      cereals: '🌾 Céréales',
      tubers: '🥔 Tubercules',
      legumes: '🥜 Légumineuses',
      spices: '🌶️ Épices',
      dairy: '🥛 Produits laitiers',
      poultry: '🐔 Volaille',
    };
    return categories[categoryId] || categoryId;
  }

  getCertificationsNames(certIds: string[]): string {
    const certNames: { [key: string]: string } = {
      organic: '🌱 Bio',
      local: '📍 Local',
      fairtrade: '🤝 Équitable',
      seasonal: '🌞 Saison',
    };
    return certIds.map((id) => certNames[id] || id).join(', ');
  }

  formatDate(dateString: string | undefined): string {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return dateString;
    }
  }

  getTemplateIcon(type: string): string {
    const icons: { [key: string]: string } = {
      standard: '✓',
      premium: '⭐',
      organic: '🌱',
      express: '⚡',
    };
    return icons[type] || '📋';
  }

  // À AJOUTER dans la classe CertificationStartComponent

  /**
   * ✅ Compte le nombre d'engagements acceptés
   */
  getAcceptedAgreementsCount(): number {
    return Object.values(this.agreements).filter((value) => value === true)
      .length;
  }

  /**
   * ✅ Retourne le nombre total d'engagements
   */
  getTotalAgreementsCount(): number {
    return this.commitmentsList.length;
  }


  goBack() {
    this.router.navigate(['/producer/dashboard']);
  }
}

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

  agreements = {
    photoConsent: false,
    locationConsent: false,
    timeCommitment: false,
    blockchainConsent: false,
    publishConsent: false,
  };

  isLoading = false;

  ngOnInit() {
    this.loadUserData();
    this.certificationTemplates =
      this.certificationService.getAvailableTemplates();
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
      !!this.productForm.name &&
      !!this.productForm.category &&
      !!this.productForm.description &&
      !!this.productForm.location &&
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
      Object.values(this.agreements).every((agreement) => agreement)
    );
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
        // Rediriger vers la page de suivi de certification
        this.router.navigate(
          ['/producer/certification', certResult.certificationId],
          {
            queryParams: {
              newProduct: true,
              productId: productResult.productId,
            },
          },
        );
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

  private showErrorNotification(message: string) {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 1rem 1.5rem;
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      color: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 9999;
      animation: slideInRight 0.3s ease;
      max-width: 400px;
    `;
    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 20px;">⚠️</span>
        <span>${message}</span>
      </div>
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.remove();
    }, 5000);
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

        // Vérifier la création du produit
        let product = null;
        for (let i = 0; i < 5; i++) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          product = await this.firebaseService.getProductById(
            result.productId!,
          );

          if (product) {
            console.log('✅ Produit récupéré après tentative', i + 1);
            break;
          }
        }

        if (!product) {
          console.error('❌ Impossible de récupérer le produit après création');
          return {
            success: true,
            productId: result.productId,
            error: 'Produit créé mais récupération différée',
          };
        }
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

  private showNotification(
    type: 'success' | 'error' | 'info',
    message: string,
  ) {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.remove();
    }, 5000);
  }

  getCategoryName(categoryId: string): string {
    const categories: { [key: string]: string } = {
      vegetables: 'Légumes',
      fruits: 'Fruits',
      cereals: 'Céréales',
      tubers: 'Tubercules',
      legumes: 'Légumineuses',
      spices: 'Épices',
      dairy: 'Produits laitiers',
      poultry: 'Volaille',
    };
    return categories[categoryId] || categoryId;
  }

  getCertificationsNames(certIds: string[]): string {
    const certNames: { [key: string]: string } = {
      organic: 'Bio',
      local: 'Local',
      fairtrade: 'Équitable',
      seasonal: 'Saison',
    };
    return certIds.map((id) => certNames[id] || id).join(', ');
  }

  formatDate(dateString: string | undefined): string {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('fr-FR');
    } catch {
      return dateString;
    }
  }

  getTemplateIcon(type: string): string {
    const icons: { [key: string]: string } = {
      standard: '✓',
      premium: '⭐',
      organic: '🌱',
    };
    return icons[type] || '📋';
  }

  goBack() {
    this.router.navigate(['/producer/dashboard']);
  }
}

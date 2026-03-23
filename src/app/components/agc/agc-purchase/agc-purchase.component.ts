import { Component, EventEmitter, Output, inject, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AGCService } from '../../../services/agc.service';
import { AuthService } from '../../../services/auth.service';
import { Subscription } from 'rxjs';

interface BankInfo {
  wave: {
    phone: string;
    name: string;
    instructions: string;
  };
  orange_money: {
    phone: string;
    name: string;
    instructions: string;
  };
  free_money: {
    phone: string;
    name: string;
    instructions: string;
  };
  card: {
    supportedCards: string[];
    instructions: string;
  };
}

interface PurchaseHistory {
  id: string;
  amount: number;
  fiatAmount: number;
  date: Date;
  status: 'completed' | 'pending' | 'failed';
  paymentMethod: string;
}

@Component({
  selector: 'app-agc-purchase',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './agc-purchase.component.html',
  styleUrls: ['./agc-purchase.component.css'],
})
export class AGCPurchaseComponent implements OnInit, OnDestroy {
  private agcService = inject(AGCService);
  private authService = inject(AuthService);
  @Input() visible = false;
  @Output() close = new EventEmitter<void>();
  @Output() purchased = new EventEmitter<void>();

  // Formulaire
  fiatAmount: number = 1000;
  agcAmount: number = 10;
  selectedMethod: string = 'wave';
  isProcessing = false;
  errorMessage = '';
  successMessage = '';

  // Données utilisateur
  currentBalance: number | null = null;
  userPhone: string = '';
  userName: string = '';

  // Statistiques
  totalPurchased: number = 0;
  purchaseCount: number = 0;
  recentPurchases: PurchaseHistory[] = [];

  // Loading states
  isLoadingBalance = true;
  isLoadingHistory = true;

  // Subscriptions
  private balanceSub: Subscription | undefined;
  private userSub: Subscription | undefined;

  // Informations bancaires
  bankInfo: BankInfo = {
    wave: {
      phone: '+221 78 123 45 67',
      name: 'AGC SAS',
      instructions: 'Effectuez le paiement via Wave, puis cliquez sur "J\'ai payé"'
    },
    orange_money: {
      phone: '+221 78 123 45 68',
      name: 'AGC SAS',
      instructions: 'Effectuez le paiement via Orange Money, puis cliquez sur "J\'ai payé"'
    },
    free_money: {
      phone: '+221 78 123 45 69',
      name: 'AGC SAS',
      instructions: 'Effectuez le paiement via Free Money, puis cliquez sur "J\'ai payé"'
    },
    card: {
      supportedCards: ['Visa', 'Mastercard', 'American Express'],
      instructions: 'Entrez vos informations de carte bancaire sécurisées'
    }
  };

  // Onglet actif (info bancaire ou historique)
  activeTab: 'purchase' | 'history' | 'info' = 'purchase';

  paymentMethods = [
    {
      id: 'wave',
      name: 'Wave',
      icon: '/assets/images/wave-money-logo.png',
      description: 'Paiement mobile instantané'
    },
    {
      id: 'orange_money',
      name: 'Orange Money',
      icon: '/assets/images/orange-logo.png',
      description: 'Paiement mobile Orange'
    },
    {
      id: 'free_money',
      name: 'Free Money',
      icon: '/assets/images/free-money.jpeg',
      description: 'Paiement mobile Free'
    },
    {
      id: 'card',
      name: 'Carte bancaire',
      icon: '/assets/images/card_agc.png',
      description: 'Visa, Mastercard'
    },
  ];

  // Pour la carte bancaire
  cardInfo = {
    number: '',
    expiry: '',
    cvv: '',
    name: ''
  };

  get canPurchase(): boolean {
    return this.fiatAmount >= 100 && !!this.selectedMethod;
  }

  get totalSpentInFCFA(): number {
    return this.totalPurchased * 100;
  }

  // ==================== GESTION DES ERREURS D'IMAGE ====================
  
  /**
   * Gère les erreurs de chargement d'image et remplace par une image par défaut
   */
  handleImageError(event: Event, fallbackImage: string): void {
    const imgElement = event.target as HTMLImageElement;
    if (imgElement) {
      // Vérifier si l'image a déjà été remplacée pour éviter une boucle infinie
      if (!imgElement.src.includes('default-payment')) {
        imgElement.src = '/assets/images/default-payment.jpeg';
      }
    }
  }

  // ==================== MÉTHODES HELPER POUR LES INFOS BANCAIRES ====================
  
  getSelectedMethodPhone(): string {
    switch (this.selectedMethod) {
      case 'wave': return this.bankInfo.wave.phone;
      case 'orange_money': return this.bankInfo.orange_money.phone;
      case 'free_money': return this.bankInfo.free_money.phone;
      default: return '';
    }
  }

  getSelectedMethodName(): string {
    switch (this.selectedMethod) {
      case 'wave': return this.bankInfo.wave.name;
      case 'orange_money': return this.bankInfo.orange_money.name;
      case 'free_money': return this.bankInfo.free_money.name;
      default: return '';
    }
  }

  getSelectedMethodInstructions(): string {
    switch (this.selectedMethod) {
      case 'wave': return this.bankInfo.wave.instructions;
      case 'orange_money': return this.bankInfo.orange_money.instructions;
      case 'free_money': return this.bankInfo.free_money.instructions;
      default: return '';
    }
  }

  getBankPhone(methodId: string): string {
    switch (methodId) {
      case 'wave': return this.bankInfo.wave.phone;
      case 'orange_money': return this.bankInfo.orange_money.phone;
      case 'free_money': return this.bankInfo.free_money.phone;
      default: return '';
    }
  }

  getBankName(methodId: string): string {
    switch (methodId) {
      case 'wave': return this.bankInfo.wave.name;
      case 'orange_money': return this.bankInfo.orange_money.name;
      case 'free_money': return this.bankInfo.free_money.name;
      default: return '';
    }
  }

  getBankInstructions(methodId: string): string {
    switch (methodId) {
      case 'wave': return this.bankInfo.wave.instructions;
      case 'orange_money': return this.bankInfo.orange_money.instructions;
      case 'free_money': return this.bankInfo.free_money.instructions;
      default: return '';
    }
  }

  getSupportedCards(): string {
    return this.bankInfo.card.supportedCards.join(', ');
  }

  getCardInstructions(): string {
    return this.bankInfo.card.instructions;
  }

  async copyToClipboard(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      // Optionnel: afficher une notification de succès
      console.log('Copié dans le presse-papier');
      // Vous pouvez ajouter un petit message toast ici
    } catch (err) {
      console.error('Erreur de copie:', err);
    }
  }

  ngOnInit() {
    // Charger le solde actuel
    this.balanceSub = this.agcService.balance$.subscribe((balance) => {
      this.currentBalance = balance;
      this.isLoadingBalance = false;
    });

    // Charger les infos utilisateur
    const user = this.authService.getUserData();
    if (user) {
      this.userName = user.fullName || user.email || 'Utilisateur';
      this.userPhone = user.phone || '';
    }

    // Charger l'historique des achats
    this.loadPurchaseHistory();
  }

  ngOnDestroy() {
    if (this.balanceSub) {
      this.balanceSub.unsubscribe();
    }
  }

  private async loadPurchaseHistory() {
    this.isLoadingHistory = true;
    try {
      const user = this.authService.getUserData();
      if (user && user.uid) {
        const history = await this.agcService.getTransactionHistory(user.uid, 10);
        
        // Filtrer uniquement les achats
        const purchases = history
          .filter(t => t.type === 'purchase')
          .map(t => ({
            id: t.id!,
            amount: t.amount,
            fiatAmount: t.amount * 100,
            date: t.createdAt,
            status: t.status as 'completed' | 'pending' | 'failed',
            paymentMethod: t.metadata?.paymentMethod || 'unknown'
          }));

        this.recentPurchases = purchases.slice(0, 5);
        
        // Calculer les statistiques
        this.totalPurchased = purchases.reduce((sum, p) => sum + p.amount, 0);
        this.purchaseCount = purchases.length;
      }
    } catch (error) {
      console.error('Erreur chargement historique:', error);
    } finally {
      this.isLoadingHistory = false;
    }
  }

  private resetForm(): void {
    this.fiatAmount = 1000;
    this.selectedMethod = 'wave';
    this.errorMessage = '';
    this.successMessage = '';
    this.isProcessing = false;
    this.cardInfo = {
      number: '',
      expiry: '',
      cvv: '',
      name: ''
    };
  }

  calculateAGC(): void {
    if (this.fiatAmount && this.fiatAmount >= 100) {
      this.agcAmount = this.agcService.convertFiatToAGC(this.fiatAmount);
    } else {
      this.agcAmount = 0;
    }
  }

  setQuickAmount(amount: number): void {
    this.fiatAmount = amount;
    this.calculateAGC();
  }

  async purchaseAGC(): Promise<void> {
    const user = this.authService.getUserData();
    if (!user) {
      this.errorMessage = 'Vous devez être connecté';
      return;
    }

    // Validation carte bancaire si nécessaire
    if (this.selectedMethod === 'card') {
      if (!this.cardInfo.number || !this.cardInfo.expiry || !this.cardInfo.cvv) {
        this.errorMessage = 'Veuillez remplir toutes les informations de carte';
        return;
      }
      if (this.cardInfo.number.replace(/\s/g, '').length < 16) {
        this.errorMessage = 'Numéro de carte invalide';
        return;
      }
    }

    this.isProcessing = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      const result = await this.agcService.purchaseAGC(
        user.uid,
        this.fiatAmount,
        this.selectedMethod as any,
      );

      if (result.success) {
        this.successMessage = `✅ Achat de ${result.agcAmount} AGC effectué avec succès !`;
        
        // Mettre à jour le solde
        await this.agcService.loadUserBalance(user.uid);
        
        // Recharger l'historique
        await this.loadPurchaseHistory();
        
        // Émettre l'événement purchased
        this.purchased.emit();

        // Réinitialiser le formulaire
        setTimeout(() => {
          this.resetForm();
        }, 2000);

        // Fermer le modal après 3 secondes
        setTimeout(() => {
          this.closeModalManually();
        }, 3000);
      } else {
        this.errorMessage = result.error || "Erreur lors de l'achat";
      }
    } catch (error: any) {
      this.errorMessage = error.message || "Erreur lors de l'achat";
    } finally {
      this.isProcessing = false;
    }
  }

  closeModal(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('agc-purchase-modal')) {
      this.closeModalManually();
    }
  }

  closeModalManually(): void {
    this.resetForm();
    this.close.emit();
  }

  formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'completed': return 'status-completed';
      case 'pending': return 'status-pending';
      case 'failed': return 'status-failed';
      default: return '';
    }
  }

  getStatusText(status: string): string {
    switch (status) {
      case 'completed': return '✅ Complété';
      case 'pending': return '⏳ En attente';
      case 'failed': return '❌ Échoué';
      default: return status;
    }
  }

  formatCardNumber(event: any): void {
    let value = event.target.value.replace(/\s/g, '');
    if (value.length > 16) value = value.slice(0, 16);
    value = value.replace(/(\d{4})/g, '$1 ').trim();
    this.cardInfo.number = value;
  }

  formatExpiry(event: any): void {
    let value = event.target.value.replace(/\//g, '');
    if (value.length > 4) value = value.slice(0, 4);
    if (value.length >= 2) {
      value = value.slice(0, 2) + '/' + value.slice(2);
    }
    this.cardInfo.expiry = value;
  }

  refreshBalance(): void {
    const user = this.authService.getUserData();
    if (user && user.uid) {
      this.isLoadingBalance = true;
      this.agcService.loadUserBalance(user.uid).finally(() => {
        this.isLoadingBalance = false;
      });
    }
  }
}
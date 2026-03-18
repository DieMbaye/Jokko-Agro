import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  serverTimestamp,
  Timestamp,
} from '@angular/fire/firestore';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { SalesService } from '../../../services/sales.service';
import { NotificationService } from '../../../services/notification.service';

import {
  CartService,
  CartItem,
  DeliveryOption,
  PaymentMethod,
  HybridPaymentInfo,
} from '../../../services/cart.service';
import { interval, Subscription } from 'rxjs';
import { AGCService } from 'src/app/services/agc.service';
import { AGCPurchaseComponent } from '../../agc/agc-purchase/agc-purchase.component';
import { Sale } from 'src/app/interfaces/data.interfaces';

interface EnhancedCartItem extends CartItem {
  originalPrice?: number;
  discount?: number;
  bulkDiscount?: number;
  category?: string;
  producerRating?: number;
  local?: boolean;
  seasonal?: boolean;
  carbonFootprint?: number;
  waterSaved?: number;
  imageUrl?: string;
  stock?: number;
  isOrganic?: boolean;
}

interface SavedCart {
  items: EnhancedCartItem[];
  savedAt: Date;
  total: number;
}

interface DeliveryAddress {
  street: string;
  city: string;
  zipCode?: string;
  phone: string;
  email?: string;
  instructions: string;
  location?: {
    lat: number;
    lng: number;
  };
}

interface InstallmentOption {
  months: number;
  monthlyPayment: number;
  total: number;
  interestRate: number;
}
interface AGCPaymentState {
  enabled: boolean;
  amount: number;
  fiatAmount: number;
  agcAmount: number;
  balance: number;
  hasEnough: boolean;
  missingAGC: number;
  canProceed: boolean;
  warning: string | null;
  error: string | null;
  partialPayment: boolean;
}

interface Notification {
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  id: number;
  removing?: boolean;
}

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AGCPurchaseComponent],
  templateUrl: './cart.html',
  styleUrls: ['./cart.css'],
})
export class CartComponent implements OnInit, OnDestroy {
  private agcService = inject(AGCService);
  private firestore = inject(Firestore); // ← AJOUTER CETTE LIGNE

  agcBalance: number = 0;
  agcPaymentInfo: HybridPaymentInfo | null = null;
  useAGCPayment: boolean = true; // Activer par défaut
  showAGCPurchaseModal = false;
  agcError: string = '';
  onImageError($event: ErrorEvent, arg1: string) {
    throw new Error('Method not implemented.');
  }
  cartItems: EnhancedCartItem[] = [];
  deliveryOptions: DeliveryOption[] = [];
  paymentMethods: PaymentMethod[] = [];
  pickupPoints: any[] = [];
  availableCoupons: any[] = [];
  noteSuggestions: string[] = [
    'Bio, bien mûr',
    'Le plus frais possible',
    'Emballage écologique',
    'Pour cadeau',
  ];

  notifications: Notification[] = [];
  notificationId = 0;

  // Sélections
  selectedDeliveryOption = '';
  selectedPaymentMethod = '';
  selectedPickupPoint = '';
  selectedInstallmentOption?: InstallmentOption;

  // États
  isLoading = false;
  isCheckingOut = false;
  showShareModal = false;
  showDeliveryDetails = false;
  showAvailableCoupons = false;
  saveAddress = false;
  useInstallments = false;
  sortBy: 'name' | 'price' | 'quantity' = 'name';
  sortAscending = true;

  // Coupons
  couponCode = '';
  appliedCoupon: {
    code: string;
    discount: number;
    type: 'percentage' | 'fixed';
    description?: string;
    expiry?: string;
  } | null = null;

  // Données de livraison
  deliveryAddress: DeliveryAddress = {
    street: '',
    city: 'Dakar',
    zipCode: '',
    phone: '',
    email: '',
    instructions: '',
    location: undefined,
  };

  addressErrors: any = {};

  // Sauvegarde
  savedCart?: SavedCart;
  agcState: AGCPaymentState = {
    enabled: true,
    amount: 0,
    fiatAmount: 0,
    agcAmount: 0,
    balance: 0,
    hasEnough: false,
    missingAGC: 0,
    canProceed: false,
    warning: null,
    error: null,
    partialPayment: false,
  };

  // Options de paiement avancées
  paymentOptions = {
    allowPartialAGC: true,
    forceAGCPayment: false,
    showAGCOptions: true,
  };

  // Historique des tentatives
  private paymentAttempts: Array<{
    timestamp: Date;
    success: boolean;
    error?: string;
  }> = [];
  // Abonnements
  private cartSubscription?: Subscription;
  private priceUpdateSubscription?: Subscription;

  constructor(
    private authService: AuthService,
    public cartService: CartService,
    private salesService: SalesService,
    private router: Router,
    private notificationService: NotificationService, // ✅ AJOUT
  ) {}

  async ngOnInit() {
    this.loadCartItems();
    this.loadDeliveryOptions();
    this.loadPaymentMethods();
    this.loadPickupPoints();
    this.loadAvailableCoupons();
    this.loadUserData();
    this.loadSavedCart();

    // Surveiller les changements de prix
    this.startPriceMonitoring();
    this.checkItemAvailability();

    // Charger les données AGC
    await this.loadAGCData();

    // ✅ AJOUTER CETTE LIGNE pour utiliser la nouvelle logique
    await this.updateAGCState();

    // Surveiller les changements de solde
    this.agcService.balance$.subscribe((balance: number) => {
      this.agcBalance = balance;
      this.updateAGCPaymentInfo();
      this.updateAGCState(); // ← Ajouter aussi ici
    });
  }

  ngOnDestroy() {
    this.cartSubscription?.unsubscribe();
    this.priceUpdateSubscription?.unsubscribe();
  }

  loadCartItems() {
    this.cartItems = this.cartService.getCartItems().map((item) => ({
      ...item,
      originalPrice: item.price * 1.1, // Exemple: 10% de réduction
      discount: 10,
      category: this.getCategoryFromProduct(item.name),
      producerRating: Math.random() * 2 + 3, // Note entre 3 et 5
      local: Math.random() > 0.3,
      seasonal: Math.random() > 0.5,
      carbonFootprint: Math.random() * 10,
      waterSaved: Math.random() * 100,
      imageUrl: item.image || 'assets/image.png',
      bulkDiscount: item.quantity >= 5 ? 5 : 0, // 5% de réduction pour 5+ articles
    }));
  }

  loadDeliveryOptions() {
    this.deliveryOptions = this.cartService
      .getDeliveryOptions()
      .map((option) => ({
        ...option,
        recommended: option.id === 'delivery_2',
        fastest: option.id === 'delivery_2',
        cheapest: option.id === 'delivery_1',
        availableSlots: Math.floor(Math.random() * 10) + 1,
        features:
          option.id === 'delivery_2'
            ? [
                'Livraison prioritaire',
                'Suivi en temps réel',
                'Contact chauffeur',
              ]
            : ['Suivi standard', 'Livraison éco-responsable'],
      }));
  }

  loadPaymentMethods() {
    this.paymentMethods = this.cartService
      .getPaymentMethods()
      .map((method) => ({
        ...method,
        recommended: method.id === 'wave',
        promo: method.id === 'orange_money' ? '2% cashback' : undefined,
      }));
  }

  loadPickupPoints() {
    this.pickupPoints = [
      {
        id: 'pickup_1',
        name: 'Point Jokko Agro Centre',
        address: 'Rue 10, Dakar',
        hours: '8h-20h',
      },
      {
        id: 'pickup_2',
        name: 'Boutique Almadies',
        address: 'Almadies, Dakar',
        hours: '9h-19h',
      },
      {
        id: 'pickup_3',
        name: 'Marketplace Sacré-Cœur',
        address: 'Sacré-Cœur, Dakar',
        hours: '7h-21h',
      },
    ];
  }

  loadAvailableCoupons() {
    this.availableCoupons = [
      {
        code: 'JOKKO10',
        discount: 10,
        type: 'percentage',
        description: '10% sur tout le panier',
        expiry: '30/06/2024',
      },
      {
        code: 'BIENVENUE',
        discount: 2000,
        type: 'fixed',
        description: '2000 FCFA de réduction',
        expiry: '31/12/2024',
      },
      {
        code: 'LOCAL2024',
        discount: 15,
        type: 'percentage',
        description: '15% sur les produits locaux',
        expiry: '15/08/2024',
      },
      {
        code: 'ECOLO',
        discount: 500,
        type: 'fixed',
        description: '500 FCFA pour commande éco-responsable',
        expiry: '30/09/2024',
      },
    ];
  }

  loadUserData() {
    const userData = this.authService.getUserData();
    if (userData) {
      this.deliveryAddress.phone = userData.phone || '';
      this.deliveryAddress.email = userData.email || '';
      this.deliveryAddress.street = userData.address?.street || '';
      this.deliveryAddress.city = userData.address?.city || 'Dakar';
      this.deliveryAddress.zipCode = userData.address?.zipCode || '';
    }
  }

  loadSavedCart() {
    const saved = localStorage.getItem('jokko_agro_saved_cart');
    if (saved) {
      this.savedCart = JSON.parse(saved);
    }
  }

  // Tri et filtrage
  getSortedItems(): EnhancedCartItem[] {
    return [...this.cartItems].sort((a, b) => {
      let comparison = 0;

      switch (this.sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'price':
          comparison = this.calculateItemPrice(a) - this.calculateItemPrice(b);
          break;
        case 'quantity':
          comparison = a.quantity - b.quantity;
          break;
      }

      return this.sortAscending ? comparison : -comparison;
    });
  }
  isImageUrl(value: string | undefined): boolean {
    if (!value) return false;

    return (
      value.startsWith('http') ||
      value.startsWith('assets/') ||
      value.endsWith('.png') ||
      value.endsWith('.jpg') ||
      value.endsWith('.jpeg') ||
      value.endsWith('.webp')
    );
  }

  toggleSort() {
    if (this.sortBy === 'name') {
      this.sortBy = 'price';
    } else if (this.sortBy === 'price') {
      this.sortBy = 'quantity';
    } else {
      this.sortBy = 'name';
    }
    this.sortAscending = !this.sortAscending;
  }

  getUnitPrice(item: EnhancedCartItem): number {
    return this.calculateItemPrice(item) / item.quantity;
  }

  calculateSavings(item: EnhancedCartItem): number {
    if (!item.originalPrice) return 0;
    return item.originalPrice * item.quantity - this.calculateItemPrice(item);
  }

  calculateTax(): number {
    return this.getTotal() * 0.18; // TVA de 18%
  }

  // Gestion des items
  updateQuantity(itemId: string, change: number) {
    const item = this.cartItems.find((i) => i.id === itemId);
    if (item) {
      const newQuantity = item.quantity + change;
      if (newQuantity >= 1 && newQuantity <= item.maxQuantity) {
        this.cartService.updateQuantity(itemId, newQuantity);
        this.loadCartItems();
        this.showSuccess(`Quantité mise à jour: ${item.name}`);
      }
    }
  }

  validateQuantity(item: EnhancedCartItem) {
    if (item.quantity < 1) item.quantity = 1;
    if (item.quantity > item.maxQuantity) {
      item.quantity = item.maxQuantity;
      this.showWarning(
        `Quantité limitée à ${item.maxQuantity} pour ${item.name}`,
      );
    }
    this.cartService.updateQuantity(item.id, item.quantity);
  }

  removeItem(itemId: string) {
    if (confirm('Êtes-vous sûr de vouloir retirer cet article du panier ?')) {
      this.cartService.removeItem(itemId);
      this.loadCartItems();
      this.showInfo('Article retiré du panier');
    }
  }

  saveItemForLater(itemId: string) {
    const item = this.cartItems.find((i) => i.id === itemId);
    if (item) {
      this.cartService.saveItemForLater(item);
      this.cartService.removeItem(itemId);
      this.loadCartItems();
      this.showSuccess('Article sauvegardé pour plus tard');
    }
  }

  toggleSelectItem(itemId: string) {
    this.cartService.toggleSelectItem(itemId);
    this.loadCartItems();
  }

  selectAllItems() {
    const allSelected = this.cartItems.every((item) => item.selected);
    this.cartService.selectAllItems(!allSelected);
    this.loadCartItems();
  }

  updateItemNotes(itemId: string, notes: string) {
    this.cartService.updateItemNotes(itemId, notes);
  }

  applyNoteSuggestion(itemId: string, suggestion: string) {
    this.cartService.updateItemNotes(itemId, suggestion);
  }

  // Coupons
  applyCoupon(code?: string) {
    const couponToApply = code || this.couponCode.trim();
    if (!couponToApply) return;

    const coupon = this.availableCoupons.find(
      (c) => c.code === couponToApply.toUpperCase(),
    );

    if (coupon) {
      this.appliedCoupon = coupon;
      this.couponCode = '';
      this.showSuccess(`Coupon ${coupon.code} appliqué !`);
    } else {
      this.showError('Code promo invalide ou expiré');
    }
  }

  removeCoupon() {
    this.appliedCoupon = null;
    this.showInfo('Coupon retiré');
  }

  shareCoupon(code: string) {
    const text = `Utilisez le code ${code} sur Jokko Agro pour une réduction !`;
    this.shareText(text);
  }

  // Livraison
  getFilteredDeliveryOptions(): DeliveryOption[] {
    return this.deliveryOptions.filter((option) => {
      // Filtrer selon le type de produits dans le panier
      const hasDeliveryItems = this.cartItems.some(
        (item) => item.selected && item.deliveryType === 'delivery',
      );

      if (option.id.includes('delivery') && !hasDeliveryItems) {
        return false;
      }

      return true;
    });
  }

  selectDeliveryOption(optionId: string) {
    this.selectedDeliveryOption = optionId;

    // Mettre à jour les options de retrait si nécessaire
    if (optionId.includes('pickup')) {
      this.loadPickupPoints();
    }
  }

  selectPickupPoint(pointId: string) {
    this.selectedPickupPoint = pointId;
  }

  getEstimatedDeliveryTime(): string {
    if (!this.selectedDeliveryOption) return 'Non estimé';

    const option = this.deliveryOptions.find(
      (o) => o.id === this.selectedDeliveryOption,
    );
    return option ? option.time : 'Non estimé';
  }

  getDeliveryBreakdown() {
    const breakdown = [];
    const option = this.deliveryOptions.find(
      (o) => o.id === this.selectedDeliveryOption,
    );

    if (option) {
      breakdown.push({ name: option.name, fee: option.price });
    }

    this.cartItems
      .filter(
        (item) =>
          item.selected &&
          item.deliveryType === 'delivery' &&
          item.deliveryFee > 0,
      )
      .forEach((item) => {
        breakdown.push({
          name: `Livraison ${item.name}`,
          fee: item.deliveryFee,
        });
      });

    return breakdown;
  }

  // Paiement
  getFilteredPaymentMethods(): PaymentMethod[] {
    return this.paymentMethods.filter((method) => {
      // Filtrer selon le montant total
      const total = this.getTotal();

      if (method.minAmount && total < method.minAmount) {
        return false;
      }

      if (method.maxAmount && total > method.maxAmount) {
        return false;
      }

      return true;
    });
  }

  showInstallmentOptions(): boolean {
    const total = this.getTotal();
    return total >= 50000; // À partir de 50,000 FCFA
  }

  getInstallmentOptions(): InstallmentOption[] {
    const total = this.getTotal();

    return [
      {
        months: 3,
        monthlyPayment: Math.round(total / 3),
        total: total,
        interestRate: 0,
      },
      {
        months: 6,
        monthlyPayment: Math.round((total * 1.05) / 6),
        total: total * 1.05,
        interestRate: 5,
      },
      {
        months: 12,
        monthlyPayment: Math.round((total * 1.1) / 12),
        total: total * 1.1,
        interestRate: 10,
      },
    ];
  }

  selectInstallmentOption(option: InstallmentOption) {
    this.selectedInstallmentOption = option;
  }

  // Location (version simplifiée sans service externe)
  useCurrentLocation() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.deliveryAddress.location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };

          // Utiliser un service de géocodage simple (optionnel)
          this.geocodeLocation(
            position.coords.latitude,
            position.coords.longitude,
          );

          this.showSuccess('Position détectée avec succès');
        },
        (error) => {
          console.error('Erreur de géolocalisation:', error);
          this.showError(
            'Impossible de détecter votre position. Veuillez saisir manuellement.',
          );
        },
      );
    } else {
      this.showError(
        "La géolocalisation n'est pas supportée par votre navigateur",
      );
    }
  }

  private geocodeLocation(lat: number, lng: number) {
    // Version simplifiée sans API externe
    setTimeout(() => {
      // Simulation de géocodage
      if (lat > 14.6 && lat < 14.8 && lng > -17.5 && lng < -17.3) {
        this.deliveryAddress.street = 'Position détectée près de Dakar';
        this.deliveryAddress.city = 'Dakar';
      }
    }, 1000);
  }

  // Validation
  validateAddress(): boolean {
    this.addressErrors = {};

    if (!this.deliveryAddress.street.trim()) {
      this.addressErrors.street = 'Veuillez saisir votre adresse';
    }

    if (!this.deliveryAddress.phone.trim()) {
      this.addressErrors.phone = 'Veuillez saisir votre numéro de téléphone';
    } else if (!this.isValidPhone(this.deliveryAddress.phone)) {
      this.addressErrors.phone = 'Numéro de téléphone invalide';
    }

    return Object.keys(this.addressErrors).length === 0;
  }

  isValidPhone(phone: string): boolean {
    const phoneRegex = /^(?:(?:\+|00)221|0)\s*[1-9](?:[\s.-]*\d{2}){4}$/;
    return phoneRegex.test(phone);
  }

  /**
   * Mise à jour complète de l'état AGC
   */
  private async updateAGCState(): Promise<void> {
    try {
      const total = this.getTotal();

      // 10% du total en AGC
      const agcAmount = Math.floor((total * 0.1) / 100); // 10% en AGC
      const agcEquivalent = agcAmount * 100;
      const fiatAmount = total - agcEquivalent; // 90% en FCFA

      const user = this.authService.getUserData();

      if (!user) {
        this.agcState.error = 'Utilisateur non connecté';
        return;
      }

      // Recharger le solde en temps réel
      this.agcBalance = await this.agcService.getBalance(user.uid);

      const hasEnough = this.agcBalance >= agcAmount;
      const missingAGC = !hasEnough ? agcAmount - this.agcBalance : 0;

      // Calculer les montants effectifs
      let actualAgcToUse = agcAmount;
      let actualFiatToPay = fiatAmount;
      let warning = null;
      let canProceed = true;

      if (!hasEnough && this.paymentOptions.allowPartialAGC) {
        // Paiement partiel
        actualAgcToUse = this.agcBalance;
        actualFiatToPay = total - this.agcBalance * 100;
        warning = `⚠️ Paiement partiel: ${actualAgcToUse} AGC (${actualAgcToUse * 100} FCFA) + ${(total - actualAgcToUse * 100).toLocaleString()} FCFA`;
        canProceed = this.agcBalance > 0;
      } else if (!hasEnough) {
        warning = `⚠️ Solde insuffisant: besoin de ${agcAmount} AGC (${agcEquivalent.toLocaleString()} FCFA)`;
        canProceed = false;
      }

      // Mettre à jour agcState
      this.agcState = {
        enabled: this.useAGCPayment,
        amount: total,
        fiatAmount: actualFiatToPay,
        agcAmount: actualAgcToUse,
        balance: this.agcBalance,
        hasEnough,
        missingAGC,
        canProceed,
        warning,
        error: null,
        partialPayment:
          !hasEnough &&
          this.paymentOptions.allowPartialAGC &&
          this.agcBalance > 0,
      };

      // Mettre à jour agcPaymentInfo pour l'interface
      this.agcPaymentInfo = {
        fiatAmount: actualFiatToPay,
        agcAmount: actualAgcToUse,
        agcBalance: this.agcBalance,
        hasEnoughAGC: hasEnough,
        agcEquivalent: actualAgcToUse * 100,
      };

      console.log('📊 État AGC mis à jour (10% AGC, 90% FCFA):', {
        total,
        agcAmount: actualAgcToUse,
        agcEquivalent: actualAgcToUse * 100,
        fiatAmount: actualFiatToPay,
        balance: this.agcBalance,
        hasEnough,
      });
    } catch (error) {
      console.error('❌ Erreur mise à jour état AGC:', error);
      this.agcState.error = 'Impossible de vérifier votre solde AGC';
    }
  }

  /**
   * Processus de checkout amélioré avec gestion avancée AGC
   */
  async proceedToCheckout(): Promise<void> {
    // Validation préliminaire
    if (!this.canCheckout()) {
      this.showError('Veuillez compléter toutes les étapes obligatoires');
      return;
    }

    if (this.isCheckingOut) {
      this.showWarning('Une commande est déjà en cours de traitement');
      return;
    }

    // Dernière vérification de l'état AGC
    await this.updateAGCState();

    if (this.useAGCPayment && !this.agcState.canProceed) {
      this.showError(
        this.agcState.warning || 'Impossible de procéder avec le paiement AGC',
      );
      return;
    }

    this.isCheckingOut = true;
    this.paymentAttempts.push({ timestamp: new Date(), success: false });

    try {
      const selectedItems = this.cartItems.filter((item) => item.selected);
      const currentUser = this.authService.getUserData();

      if (!currentUser?.uid) {
        throw new Error('Veuillez vous connecter pour commander');
      }

      // Générer un numéro de commande unique
      const orderNumber = `CMD-${Date.now().toString().slice(-8)}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

      console.log(`🚀 Début checkout - Commande #${orderNumber}`);

      // ÉTAPE 1: Paiement hybride (si activé) - AVEC SÉQUESTRE
      let agcLockId: string | undefined;

      if (this.useAGCPayment && this.agcState.agcAmount > 0) {
        // Vérifier que l'acheteur a assez d'AGC
        const hasEnough = await this.agcService.hasEnoughBalance(
          currentUser.uid,
          this.agcState.agcAmount,
        );

        if (!hasEnough) {
          throw new Error(
            `Solde AGC insuffisant. Besoin de ${this.agcState.agcAmount} AGC`,
          );
        }

        // Bloquer les AGC (sans les transférer)
        const lockResult = await this.agcService.lockAGCBalance(
          currentUser.uid,
          this.agcState.agcAmount,
          orderNumber,
          'Commande en attente de livraison',
        );

        if (!lockResult.success) {
          throw new Error(lockResult.error || 'Erreur lors du blocage des AGC');
        }

        agcLockId = lockResult.lockId;
        console.log(
          `🔒 ${this.agcState.agcAmount} AGC bloqués pour la commande ${orderNumber}`,
        );
      }

      // ÉTAPE 2: Création des ventes (avec statut "pending")
      const salesResults = await this.createSalesFromCart(
        selectedItems,
        currentUser,
        orderNumber,
        this.useAGCPayment ? this.agcState.agcAmount : 0,
        agcLockId,
      );

      // ÉTAPE 3: Nettoyage et confirmation
      await this.finalizeOrder(
        selectedItems,
        currentUser,
        orderNumber,
        salesResults,
      );

      // Marquer la tentative comme réussie
      this.paymentAttempts[this.paymentAttempts.length - 1].success = true;

      this.showSuccess('✅ Commande enregistrée avec succès !');
    } catch (error: any) {
      console.error('❌ Erreur checkout:', error);
      this.showError(
        error.message || 'Une erreur est survenue lors de la commande',
      );
    } finally {
      this.isCheckingOut = false;
    }
  }

  /**
   * Créer les ventes à partir du panier
   */
  // components/cart/cart.ts - Remplacer createSalesFromCart

  private async createSalesFromCart(
    selectedItems: EnhancedCartItem[],
    user: any,
    orderNumber: string,
    totalAgcAmount: number = 0,
    agcLockId?: string,
  ): Promise<any[]> {
    const salesResults = [];
    const errors = [];

    // ✅ Utiliser le résumé du panier pour avoir des montants cohérents
    const cartSummary = this.cartService.getCartSummary(
      this.selectedPaymentMethod,
    );

    // Calculer la répartition des AGC sur le total APRÈS toutes réductions
    const totalAfterAllDiscounts = cartSummary.finalTotal;

    for (const item of selectedItems) {
      try {
        if (!item.producerId) {
          console.warn(`⚠️ Producteur non identifié pour ${item.name}`);
          continue;
        }

        const deliveryType = this.selectedDeliveryOption.includes('pickup')
          ? ('pickup' as const)
          : ('delivery' as const);

        // ✅ Calculer le prix de l'article APRÈS toutes réductions
        const itemPriceAfterProductDiscounts =
          this.cartService.calculateItemFinalPrice(item);

        // Calculer la part proportionnelle du coupon pour cet article
        const subtotalAfterProductDiscounts =
          this.cartService.getSubtotalAfterProductDiscounts();
        const itemProportion =
          itemPriceAfterProductDiscounts / subtotalAfterProductDiscounts;
        const itemCouponDiscount = cartSummary.couponDiscount * itemProportion;

        // Prix final de l'article (après réductions produit + coupon)
        const itemFinalPrice =
          itemPriceAfterProductDiscounts - itemCouponDiscount;

        // Calculer la part d'AGC pour ce produit
        const itemAgcAmount =
          totalAgcAmount > 0 && totalAfterAllDiscounts > 0
            ? Math.floor(
                (itemFinalPrice / totalAfterAllDiscounts) * totalAgcAmount,
              )
            : 0;
        const itemAgcValue = itemAgcAmount * 100;

        // Collecter les réductions appliquées
        const appliedDiscounts = [];

        // Réductions produit
        if (item.appliedPromotions) {
          appliedDiscounts.push(...item.appliedPromotions);
        }

        // Réduction coupon
        if (itemCouponDiscount > 0 && this.appliedCoupon) {
          appliedDiscounts.push({
            type: 'coupon' as const,
            code: this.appliedCoupon.code,
            description: `Coupon ${this.appliedCoupon.code}`,
            amount: itemCouponDiscount,
            percentage:
              this.appliedCoupon.type === 'percentage'
                ? this.appliedCoupon.discount
                : undefined,
          });
        }

        // Dans cart.ts, méthode createSalesFromCart, ligne vers 950-970

        const saleData = {
          buyerId: user.uid,
          buyerName: user.fullName || 'Client',
          buyerPhone: this.deliveryAddress.phone,
          buyerLocation: this.deliveryAddress.city,
          producerId: item.producerId,
          producerName: item.producer,
          producerPhone: item.producerPhone || '',
          productId: item.productId || item.id,
          productName: item.name,
          productCategory: item.category || 'Divers',
          quantity: item.quantity,
          unitPrice: item.price,
          discountedUnitPrice: item.discountedPrice || item.price,
          totalAmount: itemFinalPrice,
          deliveryFee: this.getItemDeliveryFee(item),
          status: 'pending' as const,
          paymentMethod: this.selectedPaymentMethod as Sale['paymentMethod'],
          paymentStatus: itemAgcAmount > 0 ? 'partial' : 'pending',
          deliveryType: deliveryType,
          // ✅ CORRECTION ICI : Vérifier que deliveryAddress n'est pas undefined
          deliveryAddress:
            deliveryType === 'delivery' && this.deliveryAddress?.street
              ? this.deliveryAddress.street
              : null, // Utiliser null au lieu de undefined
          notes: item.notes || '',
          orderNumber: orderNumber,
          orderDate: Timestamp.now(), // Si vous avez accès à Timestamp
          appliedDiscounts:
            appliedDiscounts.length > 0 ? appliedDiscounts : null, // null au lieu de undefined
          metadata: {
            originalTotal: item.price * item.quantity,
            finalTotal: itemFinalPrice,
            couponCode: this.appliedCoupon?.code || null,
            couponDiscount: itemCouponDiscount || 0,
            platformFee: 0,
            tax: 0,
          },
          agcUsed: itemAgcAmount || 0,
          agcValue: itemAgcValue || 0,
          agcStatus: itemAgcAmount > 0 ? 'locked' : 'none',
          agcLockId: itemAgcAmount > 0 && agcLockId ? agcLockId : null, // null au lieu de undefined
          agcTransactionRef: orderNumber,
        };

        // ✅ NETTOYER LES UNDEFINED AVANT ENVOI
        const cleanData = JSON.parse(JSON.stringify(saleData));

        const result = await this.salesService.createSale(cleanData);

        if (result.success) {
          salesResults.push({
            item,
            success: true,
            saleId: result.saleId,
            agcAmount: itemAgcAmount,
            finalPrice: itemFinalPrice,
          });
        } else {
          errors.push({ item, error: result.error });
        }
      } catch (itemError) {
        console.error(`❌ Erreur pour ${item.name}:`, itemError);
        errors.push({ item, error: itemError });
      }
    }

    // Log des erreurs si nécessaire
    if (errors.length > 0) {
      console.warn(
        `⚠️ ${errors.length} article(s) n'ont pas pu être commandés`,
      );
      if (errors.length === selectedItems.length) {
        throw new Error("Aucune vente n'a pu être enregistrée");
      }
    }

    return salesResults;
  }

  /**
   * Nettoie un objet pour Firestore en remplaçant undefined par null
   */
  private cleanForFirestore(obj: any): any {
    if (obj === undefined || obj === null) {
      return null;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.cleanForFirestore(item));
    }

    if (typeof obj === 'object') {
      const cleaned: any = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          // Ignorer les propriétés undefined
          if (obj[key] !== undefined) {
            cleaned[key] = this.cleanForFirestore(obj[key]);
          }
        }
      }
      return cleaned;
    }

    return obj;
  }
  /**
   * Générer un numéro de commande unique
   */
  generateOrderNumber(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    return `CMD-${year}${month}${day}-${random}`;
  }

  private async finalizeOrder(
    selectedItems: EnhancedCartItem[],
    user: any,
    orderNumber: string,
    salesResults: any[],
  ): Promise<void> {
    // Vider le panier des articles commandés avec succès
    salesResults.forEach((result) => {
      if (result.success) {
        this.cartService.removeItem(result.item.id);
      }
    });

    this.loadCartItems();

    // Sauvegarder la commande
    const orderData = {
      orderNumber,
      total: this.getTotal(),
      itemsCount: selectedItems.length,
      successfulItems: salesResults.length,
      orderDate: new Date(),
      agcUsed: this.useAGCPayment ? this.agcState.agcAmount : 0,
      agcValue: this.useAGCPayment ? this.agcState.agcAmount * 100 : 0,
      agcStatus: this.useAGCPayment ? 'locked' : 'none',
      fiatPaid: this.useAGCPayment ? this.agcState.fiatAmount : this.getTotal(),
      items: selectedItems.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        success: salesResults.some((r) => r.item.id === item.id && r.success),
      })),
      paymentMethod: this.selectedPaymentMethod,
      deliveryMethod: this.selectedDeliveryOption,
    };

    this.saveRecentOrder(orderData);

    // Notifications
    await Promise.all([
      this.notificationService.createNotification({
        userId: user.uid,
        type: 'order',
        title: 'Commande enregistrée',
        message: `Votre commande ${orderNumber} est en cours de traitement.${this.useAGCPayment ? ` (${this.agcState.agcAmount} AGC bloqués en attente de livraison)` : ''}`,
        link: '/buyer/tracking',
      }),
      // Notification au producteur pour les items réussis
      ...salesResults.map((result) =>
        this.notificationService.createNotification({
          userId: result.item.producerId,
          type: 'order',
          title: 'Nouvelle vente',
          message: `${result.item.name} (x${result.item.quantity}) a été commandé`,
          link: '/producer/tracking',
        }),
      ),
    ]);

    // Afficher la confirmation
    this.showOrderConfirmationModal(
      orderNumber,
      this.getTotal(),
      salesResults.length,
    );

    // Log pour analytics
    await this.logOrderSuccess(orderData);
  }
  /**
   * Tentative de rollback en cas d'erreur critique
   */
  private async attemptRollback(error: any): Promise<void> {
    console.log('🔄 Tentative de rollback...');

    // Log l'erreur pour analyse
    await this.logCheckoutError(error);

    // Si le paiement AGC a été effectué mais pas les ventes, rembourser
    if (error.agcPaid && !error.salesCreated) {
      // Logique de remboursement
      console.log('💰 Remboursement AGC nécessaire');
      // await this.agcService.refundAGC(...)
    }
  }

  /**
   * Logging pour debugging
   */
  private async logSalesErrors(
    errors: any[],
    orderNumber: string,
  ): Promise<void> {
    console.error('📝 Erreurs de création de ventes:', errors);

    try {
      await addDoc(collection(this.firestore, 'checkout_errors'), {
        orderNumber,
        errors,
        timestamp: serverTimestamp(),
        userAgent: navigator.userAgent,
      });
    } catch (logError) {
      console.error('Erreur logging:', logError);
    }
  }

  private async logCheckoutError(error: any): Promise<void> {
    try {
      await addDoc(collection(this.firestore, 'checkout_errors'), {
        error: error.message,
        stack: error.stack,
        timestamp: serverTimestamp(),
        userAgent: navigator.userAgent,
      });
    } catch (logError) {
      console.error('Erreur logging:', logError);
    }
  }

  private async logOrderSuccess(orderData: any): Promise<void> {
    try {
      await addDoc(collection(this.firestore, 'checkout_success'), {
        ...orderData,
        timestamp: serverTimestamp(),
      });
    } catch (logError) {
      console.error('Erreur logging succès:', logError);
    }
  }

  /**
   * Validation avancée avant checkout
   */
  canCheckout(): boolean {
    const hasItems = this.getSelectedItemsCount() > 0;
    const hasDelivery = !!this.selectedDeliveryOption;
    const hasPayment = !!this.selectedPaymentMethod;

    // Validation adresse si livraison
    const addressValid =
      !this.selectedDeliveryOption.includes('delivery') ||
      (!!this.deliveryAddress.street &&
        !!this.deliveryAddress.city &&
        !!this.deliveryAddress.phone);

    // Validation AGC si activé
    const agcValid = !this.useAGCPayment || this.agcState.canProceed;

    return hasItems && hasDelivery && hasPayment && addressValid && agcValid;
  }

  /**
   * Actions rapides pour l'utilisateur
   */
  async quickBuyAGC(): Promise<void> {
    const missing = this.agcState.missingAGC;
    if (missing > 0) {
      const amount = missing * 100; // Montant en FCFA
      this.showInfo(
        `Achat recommandé: ${missing} AGC (${amount.toLocaleString()} FCFA)`,
      );
      this.openAGCPurchase();
    }
  }

  /**
   * Statistiques d'utilisation AGC
   */
  getAGCStats(): {
    totalUsed: number;
    totalSaved: number;
    monthlyAverage: number;
  } {
    // À implémenter avec les données réelles
    return {
      totalUsed: 150, // Exemple
      totalSaved: 15000, // Économies en FCFA
      monthlyAverage: 25,
    };
  }
  private async simulatePayment() {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        // Simulation d'une vérification de solde
        const success = Math.random() > 0.1; // 90% de succès
        if (success) {
          resolve(true);
        } else {
          reject(new Error('Paiement refusé'));
        }
      }, 2000);
    });
  }

  private createOrderData() {
    const selectedItems = this.cartItems.filter((item) => item.selected);
    const deliveryOption = this.deliveryOptions.find(
      (o) => o.id === this.selectedDeliveryOption,
    );
    const paymentMethod = this.paymentMethods.find(
      (m) => m.id === this.selectedPaymentMethod,
    );

    return {
      items: selectedItems.map((item) => ({
        id: item.id,
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        price: item.price,
        total: this.calculateItemPrice(item),
        notes: item.notes,
        producer: item.producer,
        producerId: item.producer, // Ajoutez ceci
      })),
      summary: {
        subtotal: this.getSubtotal(),
        savings: this.getTotalSavings(),
        delivery: this.getDeliveryFee(),
        payment: this.getPaymentFee(),
        couponDiscount: this.getCouponDiscount(),
        tax: this.calculateTax(),
        total: this.getTotal(),
      },
      delivery: {
        option: deliveryOption,
        address: this.deliveryAddress,
        pickupPoint: this.selectedPickupPoint
          ? this.pickupPoints.find((p) => p.id === this.selectedPickupPoint)
          : null,
      },
      payment: {
        method: paymentMethod,
        installment: this.selectedInstallmentOption,
        fee: this.getPaymentFee(),
      },
      coupon: this.appliedCoupon,
      orderDate: new Date(),
      orderNumber: 'CMD-' + Date.now().toString().slice(-8),
      status: 'pending',
      trackingNumber:
        'TRK' + Math.random().toString(36).substr(2, 9).toUpperCase(),
    };
  }

  private async saveOrder(orderData: any) {
    try {
      const orders = JSON.parse(
        localStorage.getItem('jokko_agro_orders') || '[]',
      );
      orders.push(orderData);
      localStorage.setItem('jokko_agro_orders', JSON.stringify(orders));

      // Simulation d'envoi au backend
      await this.sendOrderToBackend(orderData);

      this.showSuccess('Commande enregistrée avec succès');
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      throw error;
    }
  }

  private async sendOrderToBackend(orderData: any) {
    // Simulation d'envoi au backend
    return new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Sauvegarde et restauration
  saveCartForLater() {
    const savedCart: SavedCart = {
      items: this.cartItems,
      savedAt: new Date(),
      total: this.getSubtotal(),
    };

    localStorage.setItem('jokko_agro_saved_cart', JSON.stringify(savedCart));
    this.savedCart = savedCart;
    this.showSuccess('Panier sauvegardé pour plus tard');
  }

  restoreSavedItem(itemId: string) {
    if (!this.savedCart) return;

    const item = this.savedCart.items.find((i) => i.id === itemId);
    if (item) {
      this.cartService.addToCart(item, item.quantity);
      this.loadCartItems();
      this.showSuccess('Article restauré');
    }
  }

  restoreAllSavedItems() {
    if (!this.savedCart) return;

    this.savedCart.items.forEach((item) => {
      this.cartService.addToCart(item, item.quantity);
    });

    this.loadCartItems();
    localStorage.removeItem('jokko_agro_saved_cart');
    this.savedCart = undefined;
    this.showSuccess('Panier restauré');
  }

  clearCart() {
    if (confirm('Vider tout le panier ?')) {
      this.cartService.clearCart();
      this.loadCartItems();
      this.showInfo('Panier vidé');
    }
  }

  // Partage (version simplifiée sans service externe)
  shareCart() {
    this.showShareModal = true;
  }

  closeShareModal() {
    this.showShareModal = false;
  }

  shareViaWhatsApp() {
    const itemsText = this.cartItems
      .map((item) => `${item.name} - ${item.quantity}${item.unit}`)
      .join('%0A');

    const message = `Mon panier Jokko Agro:%0A${itemsText}%0A%0ATotal: ${this.formatPrice(
      this.getTotal(),
    )}`;
    const whatsappUrl = `https://wa.me/?text=${message}`;

    window.open(whatsappUrl, '_blank');
    this.closeShareModal();
  }

  shareViaEmail() {
    const subject = 'Mon panier Jokko Agro';
    const body = `Voici mon panier:%0A%0A${this.cartItems
      .map(
        (item) =>
          `• ${item.name} - ${item.quantity}${item.unit} - ${this.formatPrice(
            item.price * item.quantity,
          )}`,
      )
      .join('%0A')}%0A%0ATotal: ${this.formatPrice(this.getTotal())}`;

    window.location.href = `mailto:?subject=${encodeURIComponent(
      subject,
    )}&body=${body}`;
    this.closeShareModal();
  }

  copyCartLink() {
    const cartData = {
      items: this.cartItems.map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
      })),
      total: this.getTotal(),
    };

    const encodedData = btoa(JSON.stringify(cartData));
    const link = `${window.location.origin}/cart/share/${encodedData}`;

    navigator.clipboard
      .writeText(link)
      .then(() => {
        this.showSuccess('Lien copié dans le presse-papier');
        this.closeShareModal();
      })
      .catch((err) => {
        console.error('Erreur lors de la copie:', err);
        this.showError('Erreur lors de la copie');
      });
  }

  private shareText(text: string) {
    if (navigator.share) {
      navigator
        .share({
          title: 'Jokko Agro',
          text: text,
          url: window.location.href,
        })
        .catch((err) => {
          console.error('Erreur lors du partage:', err);
        });
    } else {
      // Fallback pour les navigateurs qui ne supportent pas l'API Share
      this.copyToClipboard(text);
      this.showSuccess('Texte copié dans le presse-papier');
    }
  }

  private copyToClipboard(text: string) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
  }

  // Autres fonctionnalités
  requestQuote() {
    const quoteData = this.createOrderData();
    this.router.navigate(['/buyer/request-quote'], {
      state: { quote: quoteData },
    });
  }

  saveOrderAsDraft() {
    const orderData = this.createOrderData();
    orderData.status = 'draft';

    const drafts = JSON.parse(
      localStorage.getItem('jokko_agro_drafts') || '[]',
    );
    drafts.push(orderData);
    localStorage.setItem('jokko_agro_drafts', JSON.stringify(drafts));

    this.showSuccess('Commande enregistrée comme brouillon');
  }

  getLoyaltyPoints(): number {
    const total = this.getTotal();
    return Math.floor(total / 1000) * 10; // 10 points par 1000 FCFA
  }

  // Impact environnemental
  calculateCarbonSavings(): number {
    return parseFloat(
      this.cartItems
        .filter((item) => item.selected && item.local)
        .reduce((total, item) => total + (item.carbonFootprint || 0), 0)
        .toFixed(2),
    );
  }

  calculateWaterSaved(): number {
    return parseFloat(
      this.cartItems
        .filter((item) => item.selected && item.isOrganic)
        .reduce((total, item) => total + (item.waterSaved || 0), 0)
        .toFixed(2),
    );
  }

  countLocalProducers(): number {
    const producers = new Set(
      this.cartItems
        .filter((item) => item.selected && item.local)
        .map((item) => item.producer),
    );
    return producers.size;
  }

  // Système de notifications
  showSuccess(message: string) {
    this.addNotification(message, 'success');
  }

  showError(message: string) {
    this.addNotification(message, 'error');
  }

  showInfo(message: string) {
    this.addNotification(message, 'info');
  }

  showWarning(message: string) {
    this.addNotification(message, 'warning');
  }

  private addNotification(
    message: string,
    type: 'success' | 'error' | 'info' | 'warning',
  ) {
    const id = ++this.notificationId;
    this.notifications.push({ message, type, id });

    // Auto-remove notification after 5 seconds
    setTimeout(() => {
      this.removeNotification(id);
    }, 5000);
  }

  removeNotification(id: number) {
    const notification = this.notifications.find((n) => n.id === id);
    if (notification) {
      notification.removing = true;
      setTimeout(() => {
        this.notifications = this.notifications.filter((n) => n.id !== id);
      }, 300);
    }
  }

  // Utilitaires
  formatPrice(price: number): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'XOF',
    }).format(price);
  }

  getDefaultDeliveryOption(): string {
    const hasDeliveryItems = this.cartItems.some(
      (item) => item.deliveryType === 'delivery',
    );
    return hasDeliveryItems ? 'delivery_1' : 'pickup_1';
  }

  getDefaultPaymentMethod(): string {
    return 'wave'; // Wave est le plus populaire au Sénégal
  }

  getCategoryFromProduct(name: string): string {
    const categories: { [key: string]: string } = {
      tomate: 'Légumes',
      oignon: 'Légumes',
      pomme: 'Fruits',
      orange: 'Fruits',
      riz: 'Céréales',
      mil: 'Céréales',
      maïs: 'Céréales',
      poulet: 'Viandes',
      poisson: 'Poissons',
      lait: 'Produits laitiers',
      œuf: 'Produits frais',
    };

    const lowerName = name.toLowerCase();
    for (const [key, value] of Object.entries(categories)) {
      if (lowerName.includes(key)) {
        return value;
      }
    }

    return 'Autres';
  }

  getSelectedItemsCount(): number {
    return this.cartItems.filter((item) => item.selected).length;
  }

  areAllItemsSelected(): boolean {
    if (!this.cartItems || this.cartItems.length === 0) return false;
    return this.cartItems.every((item) => item.selected);
  }

  getItemDeliveryFee(item: EnhancedCartItem): number {
    if (
      item.deliveryType === 'delivery' &&
      this.selectedDeliveryOption.includes('delivery')
    ) {
      return item.deliveryFee;
    }
    return 0;
  }

  getCheckoutProgress(): number {
    let progress = 25; // Panier

    if (this.getSelectedItemsCount() > 0) progress += 25;
    if (this.selectedDeliveryOption) progress += 25;
    if (this.selectedPaymentMethod) progress += 25;

    return progress;
  }

  // Monitoring en temps réel
  private startPriceMonitoring() {
    this.priceUpdateSubscription = interval(30000) // Toutes les 30 secondes
      .subscribe(() => {
        this.checkForPriceChanges();
      });
  }

  private checkForPriceChanges() {
    // Simulation de vérification des prix
    const hasPriceChange = Math.random() < 0.1; // 10% de chance

    if (hasPriceChange) {
      this.showInfo(
        'Les prix ont été mis à jour. Veuillez vérifier votre panier.',
      );
      this.loadCartItems();
    }
  }

  private checkItemAvailability() {
    // Simulation de vérification de disponibilité
    const unavailableItems = this.cartItems.filter(
      (item) => Math.random() < 0.05,
    ); // 5% de chance

    if (unavailableItems.length > 0) {
      this.showWarning(
        `${unavailableItems.length} article(s) pourrait(ent) ne plus être disponible(s)`,
      );
    }
  }

  // Navigation
  continueShopping() {
    this.router.navigate(['/buyer/market']);
  }

  showVerificationInfo() {
    this.router.navigate(['/buyer/verification-info']);
  }

  handleImageError(event: any) {
    event.target.src = 'assets/image.png';
  }

  // Commande vocale
  handleVoiceCommand(command: string) {
    const lowerCommand = command.toLowerCase();

    if (lowerCommand.includes('commander') || lowerCommand.includes('payer')) {
      this.proceedToCheckout();
    } else if (lowerCommand.includes('tout sélectionner')) {
      this.selectAllItems();
    } else if (
      lowerCommand.includes('continuer') ||
      lowerCommand.includes('shopping')
    ) {
      this.continueShopping();
    } else if (lowerCommand.includes('vider')) {
      this.clearCart();
    } else if (lowerCommand.includes('sauvegarder')) {
      this.saveCartForLater();
    } else if (lowerCommand.includes('partager')) {
      this.shareCart();
    }
  }

  // Dans la classe CartComponent, ajoutez ces méthodes :

  // Vérifier si l'utilisateur a des commandes récentes
  hasRecentOrders(): boolean {
    const orders = localStorage.getItem('jokko_agro_recent_orders');
    if (!orders) return false;

    try {
      const ordersData = JSON.parse(orders);
      const twentyFourHoursAgo = new Date().getTime() - 24 * 60 * 60 * 1000;

      return ordersData.some((order: any) => {
        const orderDate = new Date(
          order.orderDate || order.createdAt,
        ).getTime();
        return orderDate > twentyFourHoursAgo;
      });
    } catch (error) {
      return false;
    }
  }

  // Aller à la page des commandes
  goToOrders() {
    const user = this.authService.getUserData();
    if (!user) {
      this.showError('Veuillez vous connecter pour voir vos commandes');
      return;
    }

    // Rediriger selon le rôle
    if (user.role === 'buyer') {
      this.router.navigate(['/buyer/tracking']);
    } else if (user.role === 'producer') {
      this.router.navigate(['/producer/tracking']);
    } else {
      this.router.navigate(['/select-role']);
    }
  }

  // Sauvegarder la commande récente dans localStorage
  private saveRecentOrder(orderData: any) {
    try {
      let recentOrders = JSON.parse(
        localStorage.getItem('jokko_agro_recent_orders') || '[]',
      );

      // Garder seulement les 5 commandes les plus récentes
      recentOrders.unshift(orderData);
      if (recentOrders.length > 5) {
        recentOrders = recentOrders.slice(0, 5);
      }

      localStorage.setItem(
        'jokko_agro_recent_orders',
        JSON.stringify(recentOrders),
      );
    } catch (error) {
      console.error('Erreur sauvegarde commande récente:', error);
    }
  }

  // Propriétés pour le modal de confirmation
  showOrderConfirmation = false;
  orderConfirmationData?: {
    orderNumber: string;
    total: number;
    itemsCount: number;
    estimatedDelivery?: string;
    isFirstOrder?: boolean;
  };

  // Méthodes pour gérer le modal de confirmation
  private showOrderConfirmationModal(
    orderNumber: string,
    total: number,
    itemsCount: number,
  ) {
    const userData = this.authService.getUserData();

    this.orderConfirmationData = {
      orderNumber: orderNumber,
      total: total,
      itemsCount: itemsCount,
      estimatedDelivery: this.getEstimatedDeliveryTime(),
      isFirstOrder: !localStorage.getItem('jokko_agro_first_order_completed'),
    };

    // Marquer que l'utilisateur a déjà passé une commande
    localStorage.setItem('jokko_agro_first_order_completed', 'true');

    this.showOrderConfirmation = true;
  }

  closeOrderConfirmation() {
    this.showOrderConfirmation = false;
    this.orderConfirmationData = undefined;
  }

  /**
   * Charger les données AGC
   */
  public async loadAGCData(): Promise<void> {
    const user = this.authService.getUserData();
    if (user) {
      this.agcBalance = await this.agcService.getBalance(user.uid);
      this.updateAGCPaymentInfo();
    }
  }

  /**
   * Mettre à jour les informations de paiement hybride
   */
  private updateAGCPaymentInfo(): void {
    if (!this.useAGCPayment) {
      this.agcPaymentInfo = null;
      return;
    }

    // Utiliser les valeurs déjà calculées par agcState
    this.agcPaymentInfo = {
      fiatAmount: this.agcState.fiatAmount,
      agcAmount: this.agcState.agcAmount,
      agcBalance: this.agcBalance,
      hasEnoughAGC: this.agcState.hasEnough,
      agcEquivalent: this.agcState.agcAmount * 100,
    };
  }

  /**
   * Basculer l'utilisation des AGC
   */
  toggleAGCPayment(): void {
    this.useAGCPayment = !this.useAGCPayment;
    this.updateAGCPaymentInfo();
  }

  /**
   * Obtenir le montant final après application des AGC
   */
  getFinalAmount(): number {
    if (!this.useAGCPayment || !this.agcPaymentInfo) {
      return this.getTotal();
    }

    if (this.agcPaymentInfo.hasEnoughAGC) {
      return this.agcPaymentInfo.fiatAmount;
    } else {
      // Si pas assez d'AGC, payer en FCFA la partie non couverte
      const missingAGC = this.agcPaymentInfo.agcAmount - this.agcBalance;
      const missingFiat = missingAGC * 100;
      return this.agcPaymentInfo.fiatAmount + missingFiat;
    }
  }

  /**
   * Obtenir le montant à payer en AGC
   */
  getAGCToPay(): number {
    if (!this.useAGCPayment || !this.agcPaymentInfo) return 0;

    if (this.agcPaymentInfo.hasEnoughAGC) {
      return this.agcPaymentInfo.agcAmount;
    } else {
      return this.agcBalance;
    }
  }

  /**
   * Obtenir le montant à payer en FCFA
   */
  getFiatToPay(): number {
    if (!this.useAGCPayment) return this.getTotal();
    return this.getFinalAmount();
  }

  /**
   * Obtenir le message d'état AGC
   */
  getAGCStatusMessage(): string {
    if (!this.useAGCPayment) return '';

    const info = this.agcPaymentInfo;
    if (!info) return '';

    if (info.hasEnoughAGC) {
      return `✅ Vous paierez ${info.agcAmount} AGC (${info.agcEquivalent.toLocaleString()} FCFA) + ${info.fiatAmount.toLocaleString()} FCFA`;
    } else {
      const missing = info.agcAmount - info.agcBalance;
      return `⚠️ Solde AGC insuffisant. Vous paierez ${info.agcBalance} AGC + ${(info.fiatAmount + missing * 100).toLocaleString()} FCFA`;
    }
  }

  /**
   * Ouvrir le modal d'achat d'AGC
   */
  openAGCPurchase(): void {
    console.log("🪙 Ouverture du modal d'achat AGC");
    this.showAGCPurchaseModal = true;

    // Optionnel : recharger les données AGC
    this.loadAGCData().catch((error) => {
      console.error('Erreur chargement données AGC:', error);
    });
  }
  /**
   * Obtenir le pourcentage AGC pour l'affichage
   */
  getAGCPourcentage(): number {
    return 10; // Fixe à 10%
  }

  /**
   * Obtenir une explication du calcul AGC
   */
  getAGCExplanation(): string {
    const total = this.getTotal();
    const agcAmount = Math.floor((total * 0.1) / 100);
    const agcValue = agcAmount * 100;

    return `${agcAmount} AGC (${this.formatPrice(agcValue)}) soit 10% du total ${this.formatPrice(total)}`;
  }

  // components/cart/cart.ts - Remplacer les méthodes de calcul

  // Supprimer les méthodes redondantes et utiliser uniquement cartService

  getSubtotal(): number {
    return this.cartService.getOriginalSubtotal();
  }

  getSubtotalAfterDiscounts(): number {
    return this.cartService.getSubtotalAfterProductDiscounts();
  }

  getTotalSavings(): number {
    const summary = this.cartService.getCartSummary(this.selectedPaymentMethod);
    return summary.totalSavings;
  }

  getDeliveryFee(): number {
    // Utiliser le service ou calculer localement
    const summary = this.cartService.getCartSummary(this.selectedPaymentMethod);
    return summary.deliveryFee;
  }

  getPaymentFee(): number {
    if (!this.selectedPaymentMethod) return 0;
    const summary = this.cartService.getCartSummary(this.selectedPaymentMethod);
    return summary.paymentFee;
  }

  getCouponDiscount(): number {
    const summary = this.cartService.getCartSummary(this.selectedPaymentMethod);
    return summary.couponDiscount;
  }

  /**
   * ✅ MÉTHODE PRINCIPALE - LE TOTAL À PAYER
   */
  getTotal(): number {
    // Utiliser le service comme source unique de vérité
    const summary = this.cartService.getCartSummary(this.selectedPaymentMethod);
    return summary.finalTotal;
  }

  /**
   * Calculer le prix d'un article individuel (pour affichage)
   */
  calculateItemPrice(item: EnhancedCartItem): number {
    return this.cartService.calculateItemFinalPrice(item);
  }
}

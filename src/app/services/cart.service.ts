// services/cart.service.ts

import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';

// services/cart.service.ts

export interface CartItem {
  id: string;
  productId: string;
  name: string;
  producer: string;
  producerId: string;
  producerName: string;
  producerPhone?: string;
  price: number;
  discountedPrice?: number;
  discountAmount?: number;
  discountPercentage?: number;
  unit: string;
  quantity: number;
  maxQuantity: number;
  image: string;
  certified: boolean;
  organic: boolean;
  deliveryType: 'pickup' | 'delivery';
  deliveryFee: number;
  notes?: string;
  selected: boolean;
  category?: string;
  location?: string;
  minOrderQuantity?: number;
  stock?: number;
  agcEligible?: boolean;

  // ✅ CORRECTION: Type unifié pour les promotions
  appliedPromotions?: Array<{
    type: 'bulk' | 'coupon' | 'seasonal' | 'certified';
    description: string;
    amount: number;
    percentage?: number;
  }>;
}

export interface AppliedCoupon {
  code: string;
  discount: number;
  type: 'percentage' | 'fixed';
  description?: string;
  expiry?: string;
  minAmount?: number;
}

export interface CartSummary {
  subtotal: number;
  subtotalAfterDiscounts: number;
  totalSavings: number;
  deliveryFee: number;
  paymentFee: number;
  couponDiscount: number;
  finalTotal: number;
  discountBreakdown: Array<{
    type: string;
    description: string;
    amount: number;
  }>;
}

export interface DeliveryOption {
  id: string;
  name: string;
  type: 'pickup' | 'delivery';
  price: number;
  time: string;
  description: string;
  minAmount?: number;
  maxAmount?: number;
  // Propriétés optionnelles pour l'UI
  recommended?: boolean;
  fastest?: boolean;
  cheapest?: boolean;
  availableSlots?: number;
  features?: string[];
}

export interface PaymentMethod {
  id: string;
  name: string;
  icon: string;
  description: string;
  fee: number;
  minAmount?: number;
  maxAmount?: number;
  // Propriétés optionnelles pour l'UI
  recommended?: boolean;
  promo?: string;
}

export interface HybridPaymentInfo {
  fiatAmount: number;
  agcAmount: number;
  agcBalance: number;
  hasEnoughAGC: boolean;
  agcEquivalent: number;
}

@Injectable({
  providedIn: 'root',
})
export class CartService {
  private cartItems: CartItem[] = [];
  private readonly CART_STORAGE_KEY = 'jokko_agro_cart';

  // Observable pour les mises à jour du panier
  private cartSubject = new BehaviorSubject<CartItem[]>([]);
  cart$: Observable<CartItem[]> = this.cartSubject.asObservable();

  // Coupon appliqué
  private appliedCoupon: AppliedCoupon | null = null;
  private couponSubject = new BehaviorSubject<AppliedCoupon | null>(null);
  coupon$ = this.couponSubject.asObservable();

  constructor(private router: Router) {
    this.loadCartFromStorage();
  }

  // ==================== GESTION DU PANIER ====================

  private loadCartFromStorage(): void {
    const storedCart = localStorage.getItem(this.CART_STORAGE_KEY);
    if (storedCart) {
      try {
        this.cartItems = JSON.parse(storedCart);
        this.cartSubject.next([...this.cartItems]);
      } catch (error) {
        console.error('Erreur chargement panier:', error);
        this.cartItems = [];
      }
    }
  }

  private saveCartToStorage(): void {
    localStorage.setItem(this.CART_STORAGE_KEY, JSON.stringify(this.cartItems));
    this.cartSubject.next([...this.cartItems]);
  }

  // ==================== AJOUT AU PANIER AVEC RÉDUCTIONS ====================

  addToCart(product: any, quantity: number = 1): void {
    const cartItemId = `cart_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Vérifier si le produit existe déjà
    const existingItemIndex = this.cartItems.findIndex(
      (item) => item.productId === product.id,
    );

    // Calculer le prix après réduction (exemple: 10% si certifié)
    let discountedPrice = product.price;
    let discountPercentage = 0;
    let discountAmount = 0;
    const appliedPromotions = [];

    // ✅ RÉDUCTION POUR PRODUITS CERTIFIÉS (exemple)
    if (product.certified) {
      discountPercentage = 10;
      discountAmount = product.price * 0.1;
      discountedPrice = product.price - discountAmount;
      appliedPromotions.push({
        type: 'certified' as const,
        description: 'Produit certifié -10%',
        amount: discountAmount,
        percentage: 10,
      });
    }

    // ✅ RÉDUCTION POUR ACHAT EN GROS
    if (quantity >= 5) {
      const bulkDiscount = product.price * 0.05 * quantity;
      appliedPromotions.push({
        type: 'bulk' as const,
        description: 'Achat en gros (5+) -5%',
        amount: bulkDiscount,
        percentage: 5,
      });
      // Appliquer après les autres réductions
      discountedPrice = discountedPrice * 0.95;
    }

    if (existingItemIndex !== -1) {
      // Mettre à jour la quantité
      const existingItem = this.cartItems[existingItemIndex];
      const newQuantity = existingItem.quantity + quantity;

      if (newQuantity <= existingItem.maxQuantity) {
        existingItem.quantity = newQuantity;
        // Recalculer les réductions basées sur la quantité
        this.recalculateItemDiscounts(existingItem);
      }
    } else {
      // Créer un nouvel item AVEC les infos de réduction
      const cartItem: CartItem = {
        id: cartItemId,
        productId: product.id || '',
        name: product.name,
        producer: product.producerName || product.producer || 'Producteur',
        producerId: product.producerId || '',
        producerName: product.producerName || product.producer || 'Producteur',
        producerPhone: product.producerPhone || product.contactPhone || '',
        price: product.price, // Prix original
        discountedPrice: discountedPrice, // Prix après réduction
        discountAmount: discountAmount, // Montant de réduction
        discountPercentage: discountPercentage, // Pourcentage
        unit: product.unit,
        quantity: Math.max(quantity, product.minOrderQuantity || 1),
        maxQuantity: product.stock || 100,
        image: product.displayImage || product.image || '📦',
        certified: product.certified || false,
        organic: product.organic || product.isOrganic || false,
        deliveryType: 'delivery',
        deliveryFee: 0,
        selected: true,
        category: product.category,
        location: product.location,
        minOrderQuantity: product.minOrderQuantity || 1,
        stock: product.stock || product.quantity,
        agcEligible: product.certified || false,
        appliedPromotions: appliedPromotions,
      };

      this.cartItems.push(cartItem);
    }

    this.saveCartToStorage();
    this.showAddToCartNotification(product.name, quantity);
  }

  // Recalculer les réductions basées sur la quantité
  private recalculateItemDiscounts(item: CartItem): void {
    // Réinitialiser
    let currentPrice = item.price;
    item.appliedPromotions = [];

    // ✅ Réduction certification
    if (item.certified) {
      const certDiscount = item.price * 0.1;
      currentPrice = item.price - certDiscount;
      item.appliedPromotions.push({
        type: 'certified' as const,
        description: 'Produit certifié -10%',
        amount: certDiscount * item.quantity,
        percentage: 10,
      });
    }

    // ✅ Réduction quantité
    if (item.quantity >= 5) {
      const bulkDiscount = currentPrice * 0.05;
      currentPrice = currentPrice * 0.95;
      item.appliedPromotions.push({
        type: 'bulk' as const,
        description: 'Achat en gros (5+) -5%',
        amount: bulkDiscount * item.quantity,
        percentage: 5,
      });
    }

    // Mettre à jour
    item.discountedPrice = currentPrice;
    item.discountAmount = item.price - currentPrice;
    item.discountPercentage = ((item.price - currentPrice) / item.price) * 100;
  }

  // ==================== CALCULS AVANCÉS ====================

  /**
   * Obtenir le sous-total APRÈS réductions produit
   */
  getSubtotalAfterDiscounts(): number {
    return this.cartItems
      .filter((item) => item.selected)
      .reduce((total, item) => total + this.calculateItemFinalPrice(item), 0);
  }



  /**
   * Obtenir les économies totales sur les produits
   */
  getTotalProductSavings(): number {
    return this.getOriginalSubtotal() - this.getSubtotalAfterDiscounts();
  }



  // ==================== GESTION DES COUPONS ====================

  setAppliedCoupon(coupon: AppliedCoupon | null): void {
    this.appliedCoupon = coupon;
    this.couponSubject.next(coupon);
  }

  getAppliedCoupon(): AppliedCoupon | null {
    return this.appliedCoupon;
  }

  // ==================== MÉTHODES EXISTANTES ====================

  getCartItems(): CartItem[] {
    return [...this.cartItems];
  }

  updateQuantity(itemId: string, quantity: number): void {
    const item = this.cartItems.find((i) => i.id === itemId);
    if (item) {
      if (quantity >= 1 && quantity <= item.maxQuantity) {
        item.quantity = quantity;
        this.recalculateItemDiscounts(item);
        this.saveCartToStorage();
      }
    }
  }

  removeItem(itemId: string): void {
    this.cartItems = this.cartItems.filter((item) => item.id !== itemId);
    this.saveCartToStorage();
  }

  toggleSelectItem(itemId: string): void {
    const item = this.cartItems.find((i) => i.id === itemId);
    if (item) {
      item.selected = !item.selected;
      this.saveCartToStorage();
    }
  }

  selectAllItems(select: boolean = true): void {
    this.cartItems.forEach((item) => (item.selected = select));
    this.saveCartToStorage();
  }

  clearCart(): void {
    this.cartItems = [];
    this.appliedCoupon = null;
    this.couponSubject.next(null);
    this.saveCartToStorage();
  }

  getSelectedItemsCount(): number {
    return this.cartItems.filter((item) => item.selected).length;
  }

  isEmpty(): boolean {
    return this.cartItems.length === 0;
  }

  // ==================== NAVIGATION ====================

  goToCart(): void {
    this.router.navigate(['/buyer/cart']);
  }

  // ==================== NOTIFICATION ====================

  private showAddToCartNotification(
    productName: string,
    quantity: number,
  ): void {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: linear-gradient(135deg, #2d6a4f 0%, #40916c 100%);
      color: white;
      padding: 15px 20px;
      border-radius: 10px;
      box-shadow: 0 6px 20px rgba(0,0,0,0.15);
      z-index: 1000;
      animation: slideUp 0.3s ease;
      display: flex;
      align-items: center;
      gap: 15px;
      cursor: pointer;
    `;

    notification.innerHTML = `
      <div style="font-size: 28px;">🛒</div>
      <div>
        <div style="font-weight: 600; margin-bottom: 5px;">${productName}</div>
        <div style="font-size: 14px;">Ajouté au panier (${quantity} unité(s))</div>
        <div style="font-size: 12px; margin-top: 5px; opacity: 0.8;">
          👉 Cliquez pour voir le panier
        </div>
      </div>
    `;

    notification.onclick = () => {
      this.goToCart();
      document.body.removeChild(notification);
    };

    document.body.appendChild(notification);

    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 4000);
  }

  // services/cart.service.ts - À ajouter dans la classe CartService

  /**
   * Vérifier si le panier est éligible au paiement hybride
   */
  isHybridPaymentEligible(): boolean {
    return this.cartItems.some((item) => item.selected && item.certified);
  }

  /**
   * Obtenir les options de livraison
   */
  getDeliveryOptions(): DeliveryOption[] {
    return [
      {
        id: 'pickup_1',
        name: 'Retrait sur place',
        type: 'pickup',
        price: 0,
        time: '24/7',
        description: 'Retirez votre commande directement chez le producteur',
      },
      {
        id: 'delivery_1',
        name: 'Livraison standard',
        type: 'delivery',
        price: 1000,
        time: '24-48h',
        description: 'Livraison à domicile dans toute la ville',
      },
      {
        id: 'delivery_2',
        name: 'Livraison express',
        type: 'delivery',
        price: 2000,
        time: '2-4h',
        description: 'Livraison rapide pour les commandes urgentes',
      },
    ];
  }

  /**
   * Obtenir les méthodes de paiement
   */
  getPaymentMethods(): PaymentMethod[] {
    return [
      {
        id: 'wave',
        name: 'Wave',
        icon: '🌊',
        description: 'Paiement mobile instantané',
        fee: 0,
      },
      {
        id: 'orange_money',
        name: 'Orange Money',
        icon: '🟠',
        description: 'Paiement par Orange Money',
        fee: 50,
      },
      {
        id: 'free_money',
        name: 'Free Money',
        icon: '🟡',
        description: 'Paiement par Free Money',
        fee: 50,
      },
      {
        id: 'cash',
        name: 'Paiement à la livraison',
        icon: '💵',
        description: 'Paiement en espèces à la livraison',
        fee: 0,
      },
    ];
  }

  /**
   * Mettre à jour les notes d'un article
   */
  updateItemNotes(itemId: string, notes: string): void {
    const item = this.cartItems.find((i) => i.id === itemId);
    if (item) {
      item.notes = notes;
      this.saveCartToStorage();
    }
  }

  /**
   * Obtenir les articles sauvegardés
   */
  getSavedItems(): CartItem[] {
    const saved = localStorage.getItem('jokko_agro_saved_items');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (error) {
        console.error('Erreur chargement articles sauvegardés:', error);
      }
    }
    return [];
  }

  // ✅ CORRIGER LA MÉTHODE saveItemForLater
  saveItemForLater(item: CartItem): void {
    const savedItems = this.getSavedItems();
    // Éviter les doublons
    const exists = savedItems.some((savedItem) => savedItem.id === item.id);
    if (!exists) {
      savedItems.push(item);
      localStorage.setItem(
        'jokko_agro_saved_items',
        JSON.stringify(savedItems),
      );
    }
  }

  // services/cart.service.ts - Remplacer les méthodes de calcul

  /**
   * Calculer le prix final d'un article APRÈS toutes réductions
   */
  calculateItemFinalPrice(item: CartItem): number {
    // Commencer par le prix unitaire après réduction produit
    let unitPrice =
      item.discountedPrice !== undefined ? item.discountedPrice : item.price;

    // Appliquer les réductions basées sur la quantité (déjà incluses dans discountedPrice)
    return unitPrice * item.quantity;
  }

  /**
   * Obtenir le sous-total APRÈS réductions produit (avant coupon)
   */
  getSubtotalAfterProductDiscounts(): number {
    return this.cartItems
      .filter((item) => item.selected)
      .reduce((total, item) => total + this.calculateItemFinalPrice(item), 0);
  }

  /**
   * Obtenir le sous-total AVANT toutes réductions
   */
  getOriginalSubtotal(): number {
    return this.cartItems
      .filter((item) => item.selected)
      .reduce((total, item) => total + item.price * item.quantity, 0);
  }

  /**
   * Calculer la réduction coupon
   */
  calculateCouponDiscount(subtotalAfterDiscounts: number): number {
    if (!this.appliedCoupon) return 0;

    if (this.appliedCoupon.type === 'percentage') {
      return (subtotalAfterDiscounts * this.appliedCoupon.discount) / 100;
    } else {
      return Math.min(this.appliedCoupon.discount, subtotalAfterDiscounts);
    }
  }

  /**
   * Calculer les frais de livraison
   */
  calculateDeliveryFee(): number {
    // Logique à implémenter selon vos règles
    return 0; // Exemple
  }

  /**
   * Calculer les frais de paiement
   */
  calculatePaymentFee(paymentMethod: string): number {
    const fees: Record<string, number> = {
      wave: 0,
      orange_money: 50,
      free_money: 50,
      cash: 0,
      credit_card: Math.floor(this.getSubtotalAfterProductDiscounts() * 0.015), // 1.5%
    };
    return fees[paymentMethod] || 0;
  }

  /**
   * Obtenir le résumé COMPLET et COHÉRENT du panier
   */
  getCartSummary(paymentMethod?: string): CartSummary {
    // 1. Calculer le sous-total après réductions produit
    const subtotalAfterProductDiscounts =
      this.getSubtotalAfterProductDiscounts();

    // 2. Calculer le sous-total original (pour affichage)
    const originalSubtotal = this.getOriginalSubtotal();

    // 3. Calculer les économies sur les produits
    const productSavings = originalSubtotal - subtotalAfterProductDiscounts;

    // 4. Calculer la réduction coupon
    const couponDiscount = this.calculateCouponDiscount(
      subtotalAfterProductDiscounts,
    );

    // 5. Sous-total après toutes réductions produit + coupon
    const subtotalAfterAllDiscounts =
      subtotalAfterProductDiscounts - couponDiscount;

    // 6. Frais de livraison
    const deliveryFee = this.calculateDeliveryFee();

    // 7. Frais de paiement (si méthode fournie)
    const paymentFee = paymentMethod
      ? this.calculatePaymentFee(paymentMethod)
      : 0;

    // 8. Total final
    const finalTotal = subtotalAfterAllDiscounts + deliveryFee + paymentFee;

    // 9. Détail des réductions pour affichage
    const discountBreakdown = [];

    // Réductions produits
    this.cartItems
      .filter((item) => item.selected && item.appliedPromotions?.length)
      .forEach((item) => {
        item.appliedPromotions!.forEach((promo) => {
          discountBreakdown.push({
            type: promo.type,
            description: `${item.name}: ${promo.description}`,
            amount: promo.amount,
          });
        });
      });

    // Réduction coupon
    if (couponDiscount > 0 && this.appliedCoupon) {
      discountBreakdown.push({
        type: 'coupon',
        description: `Coupon ${this.appliedCoupon.code}`,
        amount: couponDiscount,
      });
    }

    return {
      subtotal: originalSubtotal,
      subtotalAfterDiscounts: subtotalAfterAllDiscounts,
      totalSavings: productSavings + couponDiscount,
      deliveryFee,
      paymentFee,
      couponDiscount,
      finalTotal,
      discountBreakdown,
    };
  }
}

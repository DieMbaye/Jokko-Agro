// services/sales.service.ts

import { Injectable } from '@angular/core';
import { FirebaseService } from './firebase.service';
import { NotificationService } from './notification.service';
import { AGCService } from './agc.service';
import { Sale, SalesStats, SalesFilter } from '../interfaces/data.interfaces';
import { CartItem, AppliedCoupon } from './cart.service';
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  Timestamp,
  orderBy,
  getDoc,
  writeBatch,
} from 'firebase/firestore';

export interface CreateSaleInput {
  // Informations de base
  buyerId: string;
  buyerName: string;
  buyerPhone: string;
  buyerLocation: string;

  // Article
  productId: string;
  productName: string;
  productCategory: string;
  quantity: number;
  unitPrice: number; // Prix unitaire ORIGINAL
  discountedUnitPrice?: number; // Prix unitaire APRÈS réduction
  totalAmount: number; // Total APRÈS toutes réductions
  deliveryFee: number;

  // Producteur
  producerId: string;
  producerName: string;
  producerPhone: string;

  // Paiement et livraison
  paymentMethod: Sale['paymentMethod'];
  deliveryType: 'pickup' | 'delivery';
  deliveryAddress?: string;
  notes?: string;

  // INFORMATIONS DE RÉDUCTION (NOUVEAU)
  appliedDiscounts?: {
    type: 'coupon' | 'bulk' | 'promotion' | 'seasonal';
    code?: string;
    description: string;
    amount: number;
    percentage?: number;
  }[];

  // INFORMATIONS AGC
  agcUsed?: number;
  agcValue?: number;
  agcLockId?: string;

  // MÉTADONNÉES
  metadata?: {
    originalTotal?: number;
    couponCode?: string;
    couponDiscount?: number;
    bulkDiscount?: number;
    platformFee?: number;
    tax?: number;
  };
}

@Injectable({
  providedIn: 'root',
})
export class SalesService {
  constructor(
    private firebaseService: FirebaseService,
    private notificationService: NotificationService,
    private agcService: AGCService,
  ) {}

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

  /**
   * CRÉER UNE VENTE À PARTIR DU PANIER (AVEC TOUTES LES INFOS DE RÉDUCTION)
   */
  async createSaleFromCart(
    cartItems: CartItem[],
    buyerInfo: {
      id: string;
      name: string;
      phone: string;
      location: string;
    },
    paymentMethod: Sale['paymentMethod'],
    deliveryType: 'pickup' | 'delivery',
    deliveryAddress?: string,
    notes?: string,
    appliedCoupon?: AppliedCoupon | null,
    agcInfo?: { agcUsed: number; agcLockId: string },
  ): Promise<{
    success: boolean;
    salesIds: string[];
    orderNumber: string;
    error?: string;
  }> {
    const orderNumber = this.generateOrderNumber();
    const salesIds: string[] = [];
    const errors: string[] = [];

    // Utiliser un batch pour atomicité
    const batch = writeBatch(this.firebaseService.firestore);

    // Calculer le total original (avant réductions)
    const originalTotal = cartItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    // Calculer le total après réductions produit
    const totalAfterProductDiscounts = cartItems.reduce(
      (sum, item) => sum + (item.discountedPrice || item.price) * item.quantity,
      0,
    );

    // Calculer la réduction coupon
    let couponDiscount = 0;
    if (appliedCoupon) {
      if (appliedCoupon.type === 'percentage') {
        couponDiscount =
          (totalAfterProductDiscounts * appliedCoupon.discount) / 100;
      } else {
        couponDiscount = Math.min(
          appliedCoupon.discount,
          totalAfterProductDiscounts,
        );
      }
    }

    // Total final
    const deliveryFee = this.calculateDeliveryFee(cartItems, deliveryType);
    const finalTotal =
      totalAfterProductDiscounts + deliveryFee - couponDiscount;

    // Calculer la répartition des AGC
    const totalAgcValue = agcInfo?.agcUsed ? agcInfo.agcUsed * 100 : 0;
    const fiatAmount = finalTotal - totalAgcValue;

    // Créer une vente pour CHAQUE article (pour que le producteur voie chaque produit)
    for (const item of cartItems) {
      if (!item.selected) continue;

      // Calculer le prix unitaire APRÈS réduction
      const discountedUnitPrice = item.discountedPrice || item.price;
      const itemTotal = discountedUnitPrice * item.quantity;

      // Calculer la part proportionnelle des AGC pour cet article
      let itemAgcUsed = 0;
      let itemAgcValue = 0;
      if (agcInfo?.agcUsed && finalTotal > 0) {
        // Répartir proportionnellement au prix de l'article
        const proportion = itemTotal / finalTotal;
        itemAgcUsed = Math.floor(agcInfo.agcUsed * proportion);
        itemAgcValue = itemAgcUsed * 100;
      }

      // services/sales.service.ts - Dans la méthode createSaleFromCart, remplacer la partie appliedDiscounts

      // Rassembler TOUTES les réductions appliquées à cet article
      const appliedDiscounts: Array<{
        type: 'coupon' | 'bulk' | 'promotion' | 'seasonal';
        code?: string;
        description: string;
        amount: number;
        percentage?: number;
      }> = [];

      // Réduction certification/produit
      if (item.discountPercentage && item.discountPercentage > 0) {
        appliedDiscounts.push({
          type: 'promotion', // ✅ Type correct
          description: `Réduction produit: ${item.discountPercentage.toFixed(1)}%`,
          amount:
            (item.price - (item.discountedPrice || item.price)) * item.quantity,
          percentage: item.discountPercentage,
        });
      }

      // Réduction coupon (proportionnelle)
      if (couponDiscount > 0) {
        const itemCouponDiscount =
          (itemTotal / totalAfterProductDiscounts) * couponDiscount;
        appliedDiscounts.push({
          type: 'coupon', // ✅ Type correct
          code: appliedCoupon?.code,
          description: `Coupon ${appliedCoupon?.code}`,
          amount: itemCouponDiscount,
          percentage:
            appliedCoupon?.type === 'percentage'
              ? appliedCoupon.discount
              : undefined,
        });
      }
      // Préparer les données de vente COMPLÈTES
      const saleData: Omit<Sale, 'id' | 'createdAt' | 'updatedAt'> = {
        orderNumber,
        buyerId: buyerInfo.id,
        buyerName: buyerInfo.name,
        buyerPhone: buyerInfo.phone,
        buyerLocation: buyerInfo.location,
        producerId: item.producerId,
        producerName: item.producer,
        producerPhone: item.producerPhone || '',
        productId: item.productId,
        productName: item.name,
        productCategory: item.category || 'Divers',
        quantity: item.quantity,
        unitPrice: item.price, // PRIX ORIGINAL (important pour le producteur)
        discountedUnitPrice: discountedUnitPrice, // PRIX APRÈS RÉDUCTION
        totalAmount: itemTotal, // Total APRÈS réductions produit
        deliveryFee: this.getItemDeliveryFee(item, deliveryType),
        status: 'pending',
        paymentMethod,
        paymentStatus: agcInfo?.agcUsed ? 'partial' : 'pending',
        deliveryType,
        deliveryAddress,
        notes: item.notes || notes,
        orderDate: new Date(),

        // ✅ INFORMATIONS DE RÉDUCTION
        appliedDiscounts:
          appliedDiscounts.length > 0 ? appliedDiscounts : undefined,
        metadata: {
          originalTotal: item.price * item.quantity,
          finalTotal: itemTotal,
          couponCode: appliedCoupon?.code,
          couponDiscount: appliedDiscounts.find((d) => d.type === 'coupon')
            ?.amount,
          bulkDiscount: appliedDiscounts.find((d) => d.type === 'bulk')?.amount,
          platformFee: 0,
          tax: 0,
        },

        // ✅ INFORMATIONS AGC
        agcUsed: itemAgcUsed,
        agcValue: itemAgcValue,
        agcStatus: itemAgcUsed > 0 ? 'locked' : 'none',
        agcLockId: itemAgcUsed > 0 ? agcInfo?.agcLockId : undefined,
        agcTransactionRef: orderNumber,
      };

      try {
        // Créer le document dans Firestore
        const saleRef = doc(
          collection(this.firebaseService.firestore, 'sales'),
        );
        batch.set(saleRef, {
          ...saleData,
          orderDate: Timestamp.fromDate(saleData.orderDate),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        salesIds.push(saleRef.id);

        // Mettre à jour le stock du produit
        const productRef = doc(
          this.firebaseService.firestore,
          'products',
          item.productId,
        );
        batch.update(productRef, {
          quantity: (item.stock || 0) - item.quantity,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        console.error(`Erreur création vente pour ${item.name}:`, error);
        errors.push(item.name);
      }
    }

    // Exécuter le batch
    try {
      await batch.commit();
      console.log(
        `✅ ${salesIds.length} ventes créées avec succès (commande ${orderNumber})`,
      );

      // 🔔 NOTIFICATIONS POUR TOUS LES PRODUCTEURS
      const producerIds = [
        ...new Set(cartItems.map((item) => item.producerId)),
      ];
      for (const producerId of producerIds) {
        const producerItems = cartItems.filter(
          (item) => item.producerId === producerId && item.selected,
        );

        await this.notificationService.createNotification({
          userId: producerId,
          type: 'order',
          title: '🛒 Nouvelle commande reçue',
          message: `Nouvelle commande: ${producerItems.length} produit(s) - Total: ${this.formatPrice(
            producerItems.reduce(
              (sum, item) =>
                sum + (item.discountedPrice || item.price) * item.quantity,
              0,
            ),
          )}`,
          link: '/producer/tracking',
        });
      }

      // 🔔 NOTIFICATION POUR L'ACHETEUR
      await this.notificationService.createNotification({
        userId: buyerInfo.id,
        type: 'order',
        title: '✅ Commande enregistrée',
        message: `Votre commande ${orderNumber} a été enregistrée avec succès`,
        link: '/buyer/tracking',
      });

      return {
        success: true,
        salesIds,
        orderNumber,
        error:
          errors.length > 0 ? `Erreurs sur: ${errors.join(', ')}` : undefined,
      };
    } catch (error: any) {
      console.error('❌ Erreur création ventes:', error);
      return {
        success: false,
        salesIds: [],
        orderNumber,
        error: error.message || 'Erreur lors de la création des ventes',
      };
    }
  }

  /**
   * Calculer les frais de livraison pour un article
   */
  private getItemDeliveryFee(
    item: CartItem,
    deliveryType: 'pickup' | 'delivery',
  ): number {
    if (deliveryType === 'pickup') return 0;
    return item.deliveryFee || 500; // Exemple: 500 FCFA par défaut
  }

  /**
   * Calculer les frais de livraison totaux
   */
  private calculateDeliveryFee(
    items: CartItem[],
    deliveryType: 'pickup' | 'delivery',
  ): number {
    if (deliveryType === 'pickup') return 0;

    return items
      .filter((item) => item.selected)
      .reduce(
        (total, item) => total + this.getItemDeliveryFee(item, deliveryType),
        0,
      );
  }

  /**
   * RÉCUPÉRER LES VENTES POUR UN PRODUCTEUR
   */
  async getSales(producerId: string, filter?: SalesFilter): Promise<Sale[]> {
    try {
      let constraints: any[] = [
        where('producerId', '==', producerId),
        orderBy('orderDate', 'desc'),
      ];

      // Filtre par période
      if (filter?.period && filter.period !== 'all') {
        const dateRange = this.getDateRange(
          filter.period,
          filter.startDate,
          filter.endDate,
        );
        if (dateRange.start) {
          constraints.push(
            where('orderDate', '>=', Timestamp.fromDate(dateRange.start)),
          );
        }
        if (dateRange.end) {
          constraints.push(
            where('orderDate', '<=', Timestamp.fromDate(dateRange.end)),
          );
        }
      }

      // Filtre par statut
      if (filter?.status && filter.status !== 'all') {
        constraints.push(where('status', '==', filter.status));
      }

      const q = query(
        collection(this.firebaseService.firestore, 'sales'),
        ...constraints,
      );
      const querySnapshot = await getDocs(q);

      const sales: Sale[] = [];
      querySnapshot.forEach((doc) => {
        sales.push(this.mapFirestoreDataToSale(doc.id, doc.data()));
      });

      // Filtrage local par recherche
      if (filter?.searchQuery) {
        const searchLower = filter.searchQuery.toLowerCase();
        return sales.filter(
          (sale) =>
            sale.orderNumber.toLowerCase().includes(searchLower) ||
            sale.productName.toLowerCase().includes(searchLower) ||
            sale.buyerName.toLowerCase().includes(searchLower),
        );
      }

      return sales;
    } catch (error) {
      console.error('Erreur récupération ventes:', error);
      return [];
    }
  }

  /**
   * RÉCUPÉRER LES COMMANDES POUR UN ACHETEUR
   */
  async getBuyerOrders(buyerId: string): Promise<Sale[]> {
    try {
      const q = query(
        collection(this.firebaseService.firestore, 'sales'),
        where('buyerId', '==', buyerId),
        orderBy('orderDate', 'desc'),
      );

      const querySnapshot = await getDocs(q);
      const orders: Sale[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // ✅ UTILISER LA MÊME MÉTHODE DE CONVERSION
        orders.push(this.mapFirestoreDataToSale(doc.id, data));
      });

      return orders;
    } catch (error) {
      console.error('Erreur chargement commandes acheteur:', error);
      return [];
    }
  }

  /**
   * METTRE À JOUR LE STATUT D'UNE VENTE
   */
  async updateSaleStatus(
    saleId: string,
    status: Sale['status'],
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const saleRef = doc(this.firebaseService.firestore, 'sales', saleId);
      const saleSnap = await getDoc(saleRef);

      if (!saleSnap.exists()) {
        return { success: false, error: 'Commande introuvable' };
      }

      const saleData = saleSnap.data() as any;

      const updateData: any = {
        status,
        updatedAt: serverTimestamp(),
      };

      // Dates spécifiques
      if (status === 'delivered') {
        updateData.deliveryDate = serverTimestamp();

        // 🔓 LIBÉRER LES AGC
        if (saleData.agcUsed && saleData.agcUsed > 0 && saleData.agcLockId) {
          const releaseResult = await this.agcService.releaseAGCLock(
            saleData.agcLockId,
            saleData.producerId,
          );

          if (releaseResult.success) {
            updateData.agcStatus = 'released';
            updateData.agcReleasedAt = serverTimestamp();
            console.log(`✅ AGC libérés pour commande ${saleData.orderNumber}`);
          }
        }
      }

      if (status === 'cancelled') {
        // 🔙 REMBOURSER LES AGC
        if (saleData.agcUsed && saleData.agcUsed > 0 && saleData.agcLockId) {
          const cancelResult = await this.agcService.cancelAGCLock(
            saleData.agcLockId,
            'system',
            'Commande annulée via updateSaleStatus',
          );
          if (cancelResult.success) {
            updateData.agcStatus = 'cancelled';
            updateData.agcCancelledAt = serverTimestamp();
          }
        }

        // Restaurer le stock
        const productRef = doc(
          this.firebaseService.firestore,
          'products',
          saleData.productId,
        );
        await updateDoc(productRef, {
          quantity: (saleData.productQuantity || 0) + saleData.quantity,
          updatedAt: serverTimestamp(),
        });
      }

      if (status === 'completed') {
        updateData.completionDate = serverTimestamp();
      }

      await updateDoc(saleRef, updateData);

      // 🔔 NOTIFICATION POUR L'ACHETEUR
      await this.notificationService.createNotification({
        userId: saleData.buyerId,
        type: 'order',
        title: this.getNotificationTitle(status),
        message: this.getOrderStatusMessage(status, saleData.orderNumber),
        link: '/buyer/tracking',
      });

      return { success: true };
    } catch (error: any) {
      console.error('Erreur mise à jour statut:', error);
      return {
        success: false,
        error: error.message || 'Erreur lors de la mise à jour',
      };
    }
  }

  private getNotificationTitle(status: Sale['status']): string {
    const titles: Record<Sale['status'], string> = {
      pending: '⏳ Commande en attente',
      confirmed: '✅ Commande confirmée',
      shipped: '🚚 Commande expédiée',
      delivered: '📦 Commande livrée',
      completed: '⭐ Commande terminée',
      cancelled: '❌ Commande annulée',
      refunded: '💸 Commande remboursée',
    };
    return titles[status] || 'Mise à jour commande';
  }

  private getOrderStatusMessage(
    status: Sale['status'],
    orderNumber: string,
  ): string {
    const messages: Record<Sale['status'], string> = {
      pending: `Votre commande ${orderNumber} est en attente de confirmation`,
      confirmed: `✅ Votre commande ${orderNumber} a été confirmée`,
      shipped: `🚚 Votre commande ${orderNumber} est en cours de livraison`,
      delivered: `📦 Votre commande ${orderNumber} a été livrée`,
      completed: `⭐ Commande ${orderNumber} terminée. Merci !`,
      cancelled: `❌ Votre commande ${orderNumber} a été annulée`,
      refunded: `💸 Votre commande ${orderNumber} a été remboursée`,
    };
    return messages[status] || `Mise à jour commande ${orderNumber}`;
  }

  /**
   * ANNULER UNE COMMANDE PAR L'ACHETEUR
   */
  async cancelOrderByBuyer(
    saleId: string,
    orderData: Sale,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Vérifier que la commande peut être annulée
      if (orderData.status !== 'pending' && orderData.status !== 'confirmed') {
        return {
          success: false,
          error: 'Cette commande ne peut plus être annulée',
        };
      }

      const saleRef = doc(this.firebaseService.firestore, 'sales', saleId);

      const updateData: any = {
        status: 'cancelled',
        paymentStatus: 'refunded',
        cancelledAt: serverTimestamp(),
        cancelledBy: 'buyer',
        updatedAt: serverTimestamp(),
      };

      // 🔙 REMBOURSER LES AGC
      if (orderData.agcUsed && orderData.agcUsed > 0 && orderData.agcLockId) {
        const cancelResult = await this.agcService.cancelAGCLock(
          orderData.agcLockId,
          orderData.buyerId,
          'Commande annulée par l\'acheteur',
        );
        if (cancelResult.success) {
          updateData.agcStatus = 'cancelled';
          updateData.agcCancelledAt = serverTimestamp();
        }
      }

      await updateDoc(saleRef, updateData);

      // Restaurer le stock
      await this.updateProductStock(
        orderData.productId,
        orderData.quantity,
        'increment',
      );

      // 🔔 NOTIFICATION POUR LE PRODUCTEUR
      await this.notificationService.createNotification({
        userId: orderData.producerId,
        type: 'order',
        title: '❌ Commande annulée',
        message: `Commande ${orderData.orderNumber} annulée par ${orderData.buyerName}`,
        link: '/producer/tracking',
      });

      return { success: true };
    } catch (error: any) {
      console.error('Erreur annulation commande:', error);
      return {
        success: false,
        error: error.message || "Erreur lors de l'annulation",
      };
    }
  }

  /**
   * CALCULER LES STATISTIQUES DE VENTES (AVEC PRISE EN COMPTE DES RÉDUCTIONS)
   */
  async getSalesStats(
    producerId: string,
    filter?: SalesFilter,
  ): Promise<SalesStats> {
    try {
      const sales = await this.getSales(producerId, filter);

      if (sales.length === 0) {
        return this.getDefaultStats();
      }

      // Ventes complétées
      const completedSales = sales.filter((s) => s.status === 'completed');

      // 🔥 REVENU TOTAL = SOMME DES totalAmount (APRÈS RÉDUCTIONS)
      const totalRevenue = completedSales.reduce(
        (sum, sale) => sum + sale.totalAmount,
        0,
      );

      // Calculer le montant total DES RÉDUCTIONS
      const totalDiscounts = sales.reduce((sum, sale) => {
        let saleDiscounts = 0;

        // Réductions produit
        if (sale.appliedDiscounts) {
          saleDiscounts += sale.appliedDiscounts.reduce(
            (s, d) => s + d.amount,
            0,
          );
        }

        // Réduction coupon dans metadata
        if (sale.metadata?.couponDiscount) {
          saleDiscounts += sale.metadata.couponDiscount;
        }

        return sum + saleDiscounts;
      }, 0);

      // Statistiques par statut
      const byStatus = {
        pending: sales.filter((s) => s.status === 'pending').length,
        confirmed: sales.filter((s) => s.status === 'confirmed').length,
        shipped: sales.filter((s) => s.status === 'shipped').length,
        delivered: sales.filter((s) => s.status === 'delivered').length,
        completed: sales.filter((s) => s.status === 'completed').length,
        cancelled: sales.filter((s) => s.status === 'cancelled').length,
        refunded: sales.filter((s) => s.status === 'refunded').length,
      };

      // Statistiques AGC
      const agcStats = {
        totalAgcUsed: sales.reduce((sum, s) => sum + (s.agcUsed || 0), 0),
        totalAgcValue: sales.reduce((sum, s) => sum + (s.agcValue || 0), 0),
        agcLocked: sales.filter((s) => s.agcStatus === 'locked').length,
        agcReleased: sales.filter((s) => s.agcStatus === 'released').length,
        agcCancelled: sales.filter((s) => s.agcStatus === 'cancelled').length,
      };

      // Top produits (basé sur revenu APRÈS réductions)
      const productMap = new Map<
        string,
        { productName: string; salesCount: number; revenue: number }
      >();
      completedSales.forEach((sale) => {
        const existing = productMap.get(sale.productId) || {
          productName: sale.productName,
          salesCount: 0,
          revenue: 0,
        };
        existing.salesCount += sale.quantity;
        existing.revenue += sale.totalAmount;
        productMap.set(sale.productId, existing);
      });

      const topProducts = Array.from(productMap.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      return {
        totalRevenue,
        totalSales: completedSales.length,
        averageOrderValue:
          completedSales.length > 0 ? totalRevenue / completedSales.length : 0,
        completionRate:
          sales.length > 0 ? (completedSales.length / sales.length) * 100 : 0,
        averageRating: this.calculateAverageRating(sales),
        pendingOrders: byStatus.pending,
        activeOrders: byStatus.pending + byStatus.confirmed + byStatus.shipped,
        cancelledOrders: byStatus.cancelled,
        monthlyRevenue: this.calculateMonthlyRevenue(completedSales),
        topProducts,
        topBuyers: this.calculateTopBuyers(completedSales),
        byStatus,
        byPaymentMethod: this.calculateByPaymentMethod(sales),
        byDeliveryType: this.calculateByDeliveryType(sales),
        weeklyTrend: this.calculateTrend(sales, 7),
        monthlyTrend: this.calculateTrend(sales, 30),
        predictedRevenue: this.predictRevenue(
          totalRevenue,
          this.calculateTrend(sales, 30),
        ),
        bestSellingDay: this.getBestSellingDay(sales),
        peakHour: this.getPeakHour(sales),

        // ✅ AJOUT DES STATISTIQUES DE RÉDUCTION
        totalDiscounts,
        agcStats,
      } as unknown as SalesStats;
    } catch (error) {
      console.error('Erreur calcul statistiques:', error);
      return this.getDefaultStats();
    }
  }

  // ==================== MÉTHODES UTILITAIRES ====================

  // services/sales.service.ts - Remplacer la méthode mapFirestoreDataToSale

  private mapFirestoreDataToSale(id: string, data: any): Sale {
    // Fonction utilitaire pour convertir n'importe quelle date en Date JavaScript
    const convertToDate = (value: any): Date => {
      if (!value) return new Date();

      // Si c'est un Timestamp Firestore (avec toDate)
      if (value && typeof value.toDate === 'function') {
        return value.toDate();
      }

      // Si c'est déjà un objet Date
      if (value instanceof Date) {
        return value;
      }

      // Si c'est un nombre (timestamp Unix en millisecondes)
      if (typeof value === 'number') {
        return new Date(value);
      }

      // Si c'est une chaîne ISO
      if (typeof value === 'string') {
        const date = new Date(value);
        return isNaN(date.getTime()) ? new Date() : date;
      }

      // Si c'est un objet avec seconds (format Firestore brut)
      if (value && typeof value === 'object' && 'seconds' in value) {
        return new Date(value.seconds * 1000);
      }

      // Par défaut
      return new Date();
    };

    return {
      id,
      orderNumber: data['orderNumber'] || '',
      buyerId: data['buyerId'] || '',
      buyerName: data['buyerName'] || '',
      buyerPhone: data['buyerPhone'] || '',
      buyerLocation: data['buyerLocation'] || '',
      producerId: data['producerId'] || '',
      producerName: data['producerName'] || '',
      producerPhone: data['producerPhone'] || '',
      productId: data['productId'] || '',
      productName: data['productName'] || '',
      productCategory: data['productCategory'] || '',
      quantity: data['quantity'] || 0,
      unitPrice: data['unitPrice'] || 0,
      discountedUnitPrice: data['discountedUnitPrice'],
      totalAmount: data['totalAmount'] || 0,
      deliveryFee: data['deliveryFee'] || 0,
      status: data['status'] || 'pending',
      paymentMethod: data['paymentMethod'] || 'cash',
      paymentStatus: data['paymentStatus'] || 'pending',
      deliveryType: data['deliveryType'] || 'delivery',
      deliveryAddress: data['deliveryAddress'],
      notes: data['notes'],
      rating: data['rating'],
      review: data['review'],

      // ✅ UTILISER LA FONCTION DE CONVERSION POUR TOUTES LES DATES
      orderDate: convertToDate(data['orderDate']),
      deliveryDate: data['deliveryDate']
        ? convertToDate(data['deliveryDate'])
        : undefined,
      completionDate: data['completionDate']
        ? convertToDate(data['completionDate'])
        : undefined,
      createdAt: data['createdAt']
        ? convertToDate(data['createdAt'])
        : new Date(),
      updatedAt: data['updatedAt']
        ? convertToDate(data['updatedAt'])
        : new Date(),

      appliedDiscounts: data['appliedDiscounts'],
      metadata: data['metadata'],
      agcUsed: data['agcUsed'],
      agcValue: data['agcValue'],
      agcStatus: data['agcStatus'],
      agcLockId: data['agcLockId'],
      agcTransactionRef: data['agcTransactionRef'],
      agcReleasedAt: data['agcReleasedAt']
        ? convertToDate(data['agcReleasedAt'])
        : undefined,
      agcCancelledAt: data['agcCancelledAt']
        ? convertToDate(data['agcCancelledAt'])
        : undefined,
    };
  }

  private getDateRange(
    period: string,
    startDate?: Date,
    endDate?: Date,
  ): { start: Date | null; end: Date | null } {
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);

    switch (period) {
      case 'today':
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case 'week':
        start.setDate(now.getDate() - 7);
        break;
      case 'month':
        start.setMonth(now.getMonth() - 1);
        break;
      case 'quarter':
        start.setMonth(now.getMonth() - 3);
        break;
      case 'year':
        start.setFullYear(now.getFullYear() - 1);
        break;
      case 'custom':
        return { start: startDate || null, end: endDate || null };
      default:
        return { start: null, end: null };
    }

    return { start, end: period === 'today' ? end : now };
  }

  private calculateMonthlyRevenue(
    sales: Sale[],
  ): { month: string; revenue: number; sales: number }[] {
    const monthlyData: { [key: string]: { revenue: number; sales: number } } =
      {};

    sales.forEach((sale) => {
      const monthKey = sale.orderDate.toLocaleDateString('fr-FR', {
        month: 'short',
        year: 'numeric',
      });

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { revenue: 0, sales: 0 };
      }

      monthlyData[monthKey].revenue += sale.totalAmount;
      monthlyData[monthKey].sales += 1;
    });

    return Object.entries(monthlyData)
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => {
        const [aMonth, aYear] = a.month.split(' ');
        const [bMonth, bYear] = b.month.split(' ');
        return (
          new Date(`${aMonth} 1, ${aYear}`).getTime() -
          new Date(`${bMonth} 1, ${bYear}`).getTime()
        );
      })
      .slice(-12);
  }

  private calculateTopBuyers(sales: Sale[]) {
    const buyerMap = new Map<
      string,
      { buyerName: string; purchaseCount: number; totalSpent: number }
    >();

    sales.forEach((sale) => {
      const existing = buyerMap.get(sale.buyerId) || {
        buyerName: sale.buyerName,
        purchaseCount: 0,
        totalSpent: 0,
      };
      existing.purchaseCount += 1;
      existing.totalSpent += sale.totalAmount;
      buyerMap.set(sale.buyerId, existing);
    });

    return Array.from(buyerMap.values())
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 10);
  }

  private calculateAverageRating(sales: Sale[]): number {
    const ratedSales = sales.filter((s) => s.rating);
    if (ratedSales.length === 0) return 0;
    return (
      ratedSales.reduce((sum, s) => sum + (s.rating || 0), 0) /
      ratedSales.length
    );
  }

  private calculateByPaymentMethod(sales: Sale[]) {
    return {
      wave: sales.filter((s) => s.paymentMethod === 'wave').length,
      orange_money: sales.filter((s) => s.paymentMethod === 'orange_money')
        .length,
      free_money: sales.filter((s) => s.paymentMethod === 'free_money').length,
      cash: sales.filter((s) => s.paymentMethod === 'cash').length,
      credit_card: sales.filter((s) => s.paymentMethod === 'credit_card')
        .length,
      mobile_money: sales.filter((s) => s.paymentMethod === 'mobile_money')
        .length,
    };
  }

  private calculateByDeliveryType(sales: Sale[]) {
    return {
      pickup: sales.filter((s) => s.deliveryType === 'pickup').length,
      delivery: sales.filter((s) => s.deliveryType === 'delivery').length,
    };
  }

  private calculateTrend(sales: Sale[], days: number): number {
    if (sales.length < 2) return 0;

    const now = new Date();
    const pastDate = new Date(now);
    pastDate.setDate(now.getDate() - days);

    const recentSales = sales.filter((s) => s.orderDate >= pastDate);
    const olderSales = sales.filter((s) => s.orderDate < pastDate);

    if (olderSales.length === 0) return recentSales.length > 0 ? 100 : 0;

    const recentRevenue = recentSales.reduce(
      (sum, s) => sum + s.totalAmount,
      0,
    );
    const olderRevenue = olderSales.reduce((sum, s) => sum + s.totalAmount, 0);

    if (olderRevenue === 0) return recentRevenue > 0 ? 100 : 0;

    return ((recentRevenue - olderRevenue) / olderRevenue) * 100;
  }

  private predictRevenue(currentRevenue: number, trend: number): number {
    return currentRevenue * (1 + trend / 100);
  }

  private getBestSellingDay(sales: Sale[]): string {
    if (sales.length === 0) return 'N/A';

    const dayRevenue: { [key: string]: number } = {};

    sales.forEach((sale) => {
      const day = sale.orderDate.toLocaleDateString('fr-FR', {
        weekday: 'short',
      });
      dayRevenue[day] = (dayRevenue[day] || 0) + sale.totalAmount;
    });

    const bestDay = Object.entries(dayRevenue).reduce((a, b) =>
      a[1] > b[1] ? a : b,
    );
    return bestDay[0];
  }

  private getPeakHour(sales: Sale[]): string {
    if (sales.length === 0) return 'N/A';

    const hourCounts: { [hour: string]: number } = {};

    sales.forEach((sale) => {
      const hour = sale.orderDate.getHours();
      hourCounts[`${hour}h`] = (hourCounts[`${hour}h`] || 0) + 1;
    });

    const peakHour = Object.entries(hourCounts).reduce((a, b) =>
      a[1] > b[1] ? a : b,
    );
    return peakHour[0];
  }

  private async updateProductStock(
    productId: string,
    quantity: number,
    operation: 'increment' | 'decrement',
  ): Promise<void> {
    try {
      const productRef = doc(
        this.firebaseService.firestore,
        'products',
        productId,
      );
      const productSnap = await getDoc(productRef);

      if (productSnap.exists()) {
        const productData = productSnap.data();
        const currentStock = productData['quantity'] || 0;
        const newStock =
          operation === 'decrement'
            ? Math.max(0, currentStock - quantity)
            : currentStock + quantity;

        await updateDoc(productRef, {
          quantity: newStock,
          status: newStock === 0 ? 'sold_out' : 'available',
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      console.error('Erreur mise à jour stock:', error);
    }
  }
  // services/sales.service.ts - Ajouter cette méthode dans la classe SalesService

  /**
   * Créer une vente individuelle
   */
  // services/sales.service.ts - Modifier la méthode createSale

  async createSale(
    saleData: any,
  ): Promise<{ success: boolean; saleId?: string; error?: string }> {
    try {
      // ✅ CORRECTION : Gérer correctement la date
      let orderDate: Timestamp;

      if (saleData.orderDate instanceof Date) {
        // Si c'est déjà un objet Date
        orderDate = Timestamp.fromDate(saleData.orderDate);
      } else if (
        saleData.orderDate &&
        typeof saleData.orderDate === 'object' &&
        saleData.orderDate.toDate
      ) {
        // Si c'est déjà un Timestamp Firestore
        orderDate = saleData.orderDate;
      } else if (saleData.orderDate && typeof saleData.orderDate === 'string') {
        // Si c'est une chaîne ISO
        orderDate = Timestamp.fromDate(new Date(saleData.orderDate));
      } else {
        // Par défaut, utiliser la date actuelle
        orderDate = Timestamp.now();
      }

      const saleToCreate = {
        ...saleData,
        orderDate: orderDate,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      // ✅ Nettoyer les undefined avant envoi
      const cleanData = JSON.parse(JSON.stringify(saleToCreate));

      const docRef = await addDoc(
        collection(this.firebaseService.firestore, 'sales'),
        cleanData,
      );

      // 🔔 Notification au producteur
      await this.notificationService.createNotification({
        userId: saleData.producerId,
        type: 'order',
        title: '🛒 Nouvelle commande reçue',
        message: `Nouvelle commande pour ${saleData.productName} (${saleData.quantity})`,
        link: '/producer/tracking',
      });

      // Mettre à jour le stock
      await this.updateProductStock(
        saleData.productId,
        saleData.quantity,
        'decrement',
      );

      return {
        success: true,
        saleId: docRef.id,
      };
    } catch (error: any) {
      console.error('Erreur création vente:', error);
      return {
        success: false,
        error: error.message || 'Erreur lors de la création de la vente',
      };
    }
  }

  // Ajouter cette méthode utilitaire dans sales.service.ts
  private sanitizeForFirestore(data: any): any {
    if (data === null || data === undefined) {
      return null;
    }

    if (data instanceof Date) {
      return Timestamp.fromDate(data);
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.sanitizeForFirestore(item));
    }

    if (typeof data === 'object') {
      const sanitized: any = {};
      for (const key in data) {
        if (
          Object.prototype.hasOwnProperty.call(data, key) &&
          data[key] !== undefined
        ) {
          sanitized[key] = this.sanitizeForFirestore(data[key]);
        }
      }
      return sanitized;
    }

    return data;
  }
  private getDefaultStats(): SalesStats {
    return {
      totalRevenue: 0,
      totalSales: 0,
      averageOrderValue: 0,
      completionRate: 0,
      averageRating: 0,
      pendingOrders: 0,
      activeOrders: 0,
      cancelledOrders: 0,
      monthlyRevenue: [],
      topProducts: [],
      topBuyers: [],
      byStatus: {
        pending: 0,
        confirmed: 0,
        shipped: 0,
        delivered: 0,
        completed: 0,
        cancelled: 0,
        refunded: 0,
      },
      byPaymentMethod: {
        wave: 0,
        orange_money: 0,
        free_money: 0,
        cash: 0,
        credit_card: 0,
        mobile_money: 0,
      },
      byDeliveryType: {
        pickup: 0,
        delivery: 0,
      },
      weeklyTrend: 0,
      monthlyTrend: 0,
      predictedRevenue: 0,
      bestSellingDay: 'N/A',
      peakHour: 'N/A',

      // ✅ AJOUT DES PROPRIÉTÉS MANQUANTES
      totalDiscounts: 0,
      agcStats: {
        totalAgcUsed: 0,
        totalAgcValue: 0,
        agcLocked: 0,
        agcReleased: 0,
        agcCancelled: 0,
      },
    };
  }

  // ==================== MÉTHODES DE FORMATAGE ====================

  getStatusText(status: Sale['status']): string {
    const statusMap: Record<Sale['status'], string> = {
      pending: 'En attente',
      confirmed: 'Confirmé',
      shipped: 'Expédié',
      delivered: 'Livré',
      completed: 'Terminé',
      cancelled: 'Annulé',
      refunded: 'Remboursé',
    };
    return statusMap[status] || status;
  }

  getPaymentMethodText(method: Sale['paymentMethod']): string {
    const methodMap: Record<Sale['paymentMethod'], string> = {
      wave: 'Wave',
      orange_money: 'Orange Money',
      free_money: 'Free Money',
      cash: 'Espèces',
      credit_card: 'Carte bancaire',
      mobile_money: 'Mobile Money',
    };
    return methodMap[method] || method;
  }

  getDeliveryTypeText(type: Sale['deliveryType']): string {
    return type === 'pickup' ? 'À retirer' : 'Livraison';
  }

  formatPrice(price: number): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'XOF',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  }

  formatNumber(num: number): string {
    return new Intl.NumberFormat('fr-FR').format(num);
  }

  formatDate(date: Date): string {
    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  }

  // services/sales.service.ts - À ajouter dans la classe SalesService

  /**
   * Obtenir les acheteurs d'un producteur
   */
  async getBuyersForProducer(producerId: string): Promise<string[]> {
    try {
      const sales = await this.getSales(producerId);
      const buyerIds = sales.map((sale) => sale.buyerId);
      return [...new Set(buyerIds)]; // Supprimer les doublons
    } catch (error) {
      console.error('Erreur récupération acheteurs:', error);
      return [];
    }
  }

  /**
   * Exporter les ventes en CSV
   */
  async exportSalesToCSV(
    producerId: string,
    filter?: SalesFilter,
  ): Promise<string> {
    try {
      const sales = await this.getSales(producerId, filter);

      const headers = [
        'Numéro commande',
        'Date',
        'Produit',
        'Catégorie',
        'Quantité',
        'Prix unitaire',
        'Prix après réduction',
        'Total',
        'Client',
        'Téléphone',
        'Statut',
        'Paiement',
        'Livraison',
        'AGC utilisés',
        'Valeur AGC',
      ].join(',');

      const rows = sales.map((sale) =>
        [
          sale.orderNumber,
          this.formatDate(sale.orderDate),
          sale.productName,
          sale.productCategory,
          sale.quantity,
          sale.unitPrice,
          sale.discountedUnitPrice || sale.unitPrice,
          sale.totalAmount,
          sale.buyerName,
          sale.buyerPhone,
          this.getStatusText(sale.status),
          this.getPaymentMethodText(sale.paymentMethod),
          this.getDeliveryTypeText(sale.deliveryType),
          sale.agcUsed || 0,
          sale.agcValue || 0,
        ].join(','),
      );

      return [headers, ...rows].join('\n');
    } catch (error) {
      console.error('Erreur export CSV:', error);
      return '';
    }
  }
}

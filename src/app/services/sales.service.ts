import { Injectable } from '@angular/core';
import { FirebaseService } from './firebase.service';
import { Sale, SalesStats, SalesFilter } from './data.interfaces';
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  Timestamp,
  getCountFromServer,
  sum,
  QueryConstraint,
  startAt,
  endAt,
  limit,
  getDoc,
} from 'firebase/firestore';
import { NotificationService } from './notification.service';

@Injectable({
  providedIn: 'root',
})
export class SalesService {
constructor(
  private firebaseService: FirebaseService,
  private notificationService: NotificationService
) {}

  // Générer un numéro de commande unique
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

  // Créer une nouvelle vente
  async createSale(
    saleData: Omit<Sale, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<{ success: boolean; saleId?: string; error?: string }> {
    try {
      const orderNumber = saleData.orderNumber || this.generateOrderNumber();

      const saleToCreate: any = {
        orderNumber,
        buyerId: saleData.buyerId,
        buyerName: saleData.buyerName || 'Client',
        buyerPhone: saleData.buyerPhone || '',
        buyerLocation: saleData.buyerLocation || 'Dakar',
        producerId: saleData.producerId,
        producerName: saleData.producerName || 'Producteur',
        producerPhone: saleData.producerPhone || '',
        productId: saleData.productId,
        productName: saleData.productName,
        productCategory: saleData.productCategory || 'Divers',
        quantity: saleData.quantity,
        unitPrice: saleData.unitPrice,
        totalAmount: saleData.totalAmount,
        deliveryFee: saleData.deliveryFee || 0,
        status: saleData.status || 'pending',
        paymentMethod: saleData.paymentMethod || 'cash',
        paymentStatus: saleData.paymentStatus || 'pending',
        deliveryType: saleData.deliveryType || 'delivery',
        notes: saleData.notes || '',
        orderDate: saleData.orderDate || Timestamp.now(),
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      if (saleData.deliveryAddress) {
        saleToCreate.deliveryAddress = saleData.deliveryAddress;
      }

     const docRef = await addDoc(
  collection(this.firebaseService.firestore, 'sales'),
  saleToCreate
);

// 🔔 NOTIFICATION PRODUCTEUR (NOUVELLE COMMANDE)
await this.notificationService.createNotification({
  userId: saleData.producerId,
  title: '🛒 Nouvelle commande reçue',
  message: `Nouvelle commande pour ${saleData.productName} (${saleData.quantity})`,
  type: 'order'
});

// Mettre à jour le stock
await this.updateProductStock(
  saleData.productId,
  saleData.quantity,
  'decrement'
);

return {
  success: true,
  saleId: docRef.id,
};


      // Mettre à jour le stock
      await this.updateProductStock(
        saleData.productId,
        saleData.quantity,
        'decrement'
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

  // Mettre à jour le stock
  private async updateProductStock(
    productId: string,
    quantity: number,
    operation: 'increment' | 'decrement'
  ): Promise<void> {
    try {
      const productRef = doc(this.firebaseService.firestore, 'products', productId);
      const productSnap = await getDoc(productRef);

      if (productSnap.exists()) {
        const productData = productSnap.data();
        const currentStock = productData['quantity'] || 0;
        const newStock = operation === 'decrement'
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

  // Récupérer les ventes avec filtres
  async getSales(
    producerId: string,
    filter?: SalesFilter
  ): Promise<Sale[]> {
    try {
      let constraints: QueryConstraint[] = [
        where('producerId', '==', producerId)
      ];

      // Filtre par période
      if (filter?.period && filter.period !== 'all') {
        const dateRange = this.getDateRange(filter.period, filter.startDate, filter.endDate);
        if (dateRange.start) {
          constraints.push(where('orderDate', '>=', Timestamp.fromDate(dateRange.start)));
        }
        if (dateRange.end) {
          constraints.push(where('orderDate', '<=', Timestamp.fromDate(dateRange.end)));
        }
      }

      // Filtre par statut
      if (filter?.status && filter.status !== 'all') {
        constraints.push(where('status', '==', filter.status));
      }

      // Filtre par méthode de paiement
      if (filter?.paymentMethod && filter.paymentMethod !== 'all') {
        constraints.push(where('paymentMethod', '==', filter.paymentMethod));
      }

      // Filtre par type de livraison
      if (filter?.deliveryType && filter.deliveryType !== 'all') {
        constraints.push(where('deliveryType', '==', filter.deliveryType));
      }

      // Trier par date
      constraints.push(orderBy('orderDate', 'desc'));

      const q = query(collection(this.firebaseService.firestore, 'sales'), ...constraints);
      const querySnapshot = await getDocs(q);

      const sales: Sale[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        sales.push(this.mapFirestoreDataToSale(doc.id, data));
      });

      // Filtrage local par recherche si fourni
      let filteredSales = sales;
      if (filter?.searchQuery) {
        const searchLower = filter.searchQuery.toLowerCase();
        filteredSales = sales.filter(sale =>
          sale.orderNumber.toLowerCase().includes(searchLower) ||
          sale.productName.toLowerCase().includes(searchLower) ||
          sale.buyerName.toLowerCase().includes(searchLower) ||
          sale.buyerPhone.includes(searchLower)
        );
      }

      return filteredSales;
    } catch (error) {
      console.error('Erreur récupération ventes:', error);
      return [];
    }
  }

  // Calculer les statistiques
  async getSalesStats(
    producerId: string,
    filter?: SalesFilter
  ): Promise<SalesStats> {
    try {
      const sales = await this.getSales(producerId, filter);

      if (sales.length === 0) {
        return this.getDefaultStats();
      }

      // Ventes complétées
      const completedSales = sales.filter(s => s.status === 'completed');
      const pendingSales = sales.filter(s => s.status === 'pending');
      const cancelledSales = sales.filter(s => s.status === 'cancelled');

      // Statistiques de base
      const totalRevenue = completedSales.reduce((sum, sale) => sum + sale.totalAmount, 0);
      const totalSales = completedSales.length;
      const averageOrderValue = totalSales > 0 ? totalRevenue / totalSales : 0;
      const completionRate = sales.length > 0 ? (completedSales.length / sales.length) * 100 : 0;

      // Note moyenne
      const ratedSales = completedSales.filter(s => s.rating);
      const averageRating = ratedSales.length > 0
        ? ratedSales.reduce((sum, sale) => sum + (sale.rating || 0), 0) / ratedSales.length
        : 0;

      // Statistiques par statut
      const byStatus = {
        pending: sales.filter(s => s.status === 'pending').length,
        confirmed: sales.filter(s => s.status === 'confirmed').length,
        shipped: sales.filter(s => s.status === 'shipped').length,
        delivered: sales.filter(s => s.status === 'delivered').length,
        completed: sales.filter(s => s.status === 'completed').length,
        cancelled: sales.filter(s => s.status === 'cancelled').length,
        refunded: sales.filter(s => s.status === 'refunded').length,
      };

      // Statistiques par méthode de paiement
      const byPaymentMethod = {
        wave: sales.filter(s => s.paymentMethod === 'wave').length,
        orange_money: sales.filter(s => s.paymentMethod === 'orange_money').length,
        free_money: sales.filter(s => s.paymentMethod === 'free_money').length,
        cash: sales.filter(s => s.paymentMethod === 'cash').length,
        credit_card: sales.filter(s => s.paymentMethod === 'credit_card').length,
        mobile_money: sales.filter(s => s.paymentMethod === 'mobile_money').length,
      };

      // Statistiques par type de livraison
      const byDeliveryType = {
        pickup: sales.filter(s => s.deliveryType === 'pickup').length,
        delivery: sales.filter(s => s.deliveryType === 'delivery').length,
      };

      // Revenus mensuels
      const monthlyRevenue = this.calculateMonthlyRevenue(completedSales);

      // Top produits
      const topProducts = this.calculateTopProducts(completedSales);

      // Top acheteurs
      const topBuyers = this.calculateTopBuyers(completedSales);

      // Statistiques journalières
      const dailyStats = this.calculateDailyStats(completedSales);

      // Tendances
      const weeklyTrend = this.calculateTrend(sales, 7);
      const monthlyTrend = this.calculateTrend(sales, 30);

      return {
        totalRevenue,
        totalSales,
        averageOrderValue,
        completionRate,
        averageRating,
        pendingOrders: byStatus.pending,
        activeOrders: byStatus.pending + byStatus.confirmed + byStatus.shipped,
        cancelledOrders: byStatus.cancelled,
        monthlyRevenue,
        topProducts,
        topBuyers,
        byStatus,
        byPaymentMethod,
        byDeliveryType,
        dailyStats,
        weeklyTrend,
        monthlyTrend,
        predictedRevenue: this.predictRevenue(totalRevenue, monthlyTrend),
        bestSellingDay: this.getBestSellingDay(dailyStats),
        peakHour: this.getPeakHour(sales),
      };
    } catch (error) {
      console.error('Erreur calcul statistiques:', error);
      return this.getDefaultStats();
    }
  }

  // Mettre à jour le statut d'une vente
  async updateSaleStatus(
  saleId: string,
  status: Sale['status']
): Promise<{ success: boolean; error?: string }> {
  try {
    const saleRef = doc(this.firebaseService.firestore, 'sales', saleId);

    // 1️⃣ récupérer la vente AVANT modification
    const saleSnap = await getDoc(saleRef);
    if (!saleSnap.exists()) {
      return { success: false, error: 'Commande introuvable' };
    }

    const saleData: any = saleSnap.data();

    // 2️⃣ mise à jour du statut
    const updateData: any = {
      status,
      updatedAt: serverTimestamp(),
    };

    if (status === 'completed') {
      updateData.completionDate = serverTimestamp();
    }
    if (status === 'shipped') {
      updateData.deliveryDate = serverTimestamp();
    }

    await updateDoc(saleRef, updateData);

    // 3️⃣ notification pour le BUYER 🔔
    await this.notificationService.createNotification({
      userId: saleData.buyerId,
      title: '📦 Statut de commande mis à jour',
      message: this.getOrderStatusMessage(status, saleData.orderNumber),
      type: 'order',
      link: '/buyer/purchases'
    });

    // 4️⃣ restaurer le stock si annulée
    if (status === 'cancelled') {
      await this.updateProductStock(
        saleData.productId,
        saleData.quantity,
        'increment'
      );
    }

    return { success: true };
  } catch (error: any) {
    console.error('Erreur mise à jour statut:', error);
    return {
      success: false,
      error: error.message || 'Erreur lors de la mise à jour',
    };
  }
}
private getOrderStatusMessage(
  status: Sale['status'],
  orderNumber: string
): string {
  switch (status) {
    case 'confirmed':
      return `✅ Votre commande ${orderNumber} a été confirmée par le producteur.`;
    case 'shipped':
      return `🚚 Votre commande ${orderNumber} est en cours de livraison.`;
    case 'delivered':
      return `📦 Votre commande ${orderNumber} a été livrée.`;
    case 'completed':
      return `⭐ Commande ${orderNumber} terminée. Merci pour votre confiance !`;
    case 'cancelled':
      return `❌ Votre commande ${orderNumber} a été annulée.`;
    default:
      return `📋 Mise à jour de votre commande ${orderNumber}.`;
  }
}


  // Exporter en CSV
  async exportSalesToCSV(
    producerId: string,
    filter?: SalesFilter
  ): Promise<string> {
    try {
      const sales = await this.getSales(producerId, filter);

      const headers = [
        'Numéro de commande',
        'Date',
        'Produit',
        'Catégorie',
        'Quantité',
        'Prix unitaire',
        'Montant total',
        'Frais livraison',
        'Client',
        'Téléphone',
        'Localisation',
        'Méthode de paiement',
        'Statut',
        'Type de livraison',
        'Note',
        'Avis',
        'Date livraison',
      ];

      const rows = sales.map((sale) => [
        sale.orderNumber,
        sale.orderDate.toLocaleDateString('fr-FR'),
        sale.productName,
        sale.productCategory,
        sale.quantity.toString(),
        sale.unitPrice.toLocaleString('fr-FR'),
        sale.totalAmount.toLocaleString('fr-FR'),
        sale.deliveryFee.toLocaleString('fr-FR'),
        sale.buyerName,
        sale.buyerPhone,
        sale.buyerLocation,
        this.getPaymentMethodText(sale.paymentMethod),
        this.getStatusText(sale.status),
        this.getDeliveryTypeText(sale.deliveryType),
        sale.rating?.toString() || '',
        sale.review || '',
        sale.deliveryDate?.toLocaleDateString('fr-FR') || '',
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
      ].join('\n');

      return csvContent;
    } catch (error) {
      console.error('Erreur export CSV:', error);
      return '';
    }
  }

  // Méthodes utilitaires privées
  private mapFirestoreDataToSale(id: string, data: any): Sale {
    return {
      id,
      orderNumber: data['orderNumber'],
      buyerId: data['buyerId'],
      buyerName: data['buyerName'],
      buyerPhone: data['buyerPhone'],
      buyerLocation: data['buyerLocation'],
      producerId: data['producerId'],
      producerName: data['producerName'],
      producerPhone: data['producerPhone'],
      productId: data['productId'],
      productName: data['productName'],
      productCategory: data['productCategory'],
      quantity: data['quantity'],
      unitPrice: data['unitPrice'],
      totalAmount: data['totalAmount'],
      deliveryFee: data['deliveryFee'] || 0,
      status: data['status'],
      paymentMethod: data['paymentMethod'],
      paymentStatus: data['paymentStatus'],
      deliveryType: data['deliveryType'],
      deliveryAddress: data['deliveryAddress'],
      notes: data['notes'],
      rating: data['rating'],
      review: data['review'],
      orderDate: data['orderDate']?.toDate() || new Date(),
      deliveryDate: data['deliveryDate']?.toDate(),
      completionDate: data['completionDate']?.toDate(),
      createdAt: data['createdAt']?.toDate() || new Date(),
      updatedAt: data['updatedAt']?.toDate() || new Date(),
      metadata: data['metadata'],
    };
  }

  private getDateRange(
    period: string,
    startDate?: Date,
    endDate?: Date
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
        return {
          start: startDate || null,
          end: endDate || null,
        };
      default:
        return { start: null, end: null };
    }

    return { start, end: period === 'today' ? end : now };
  }

  private calculateMonthlyRevenue(
    sales: Sale[]
  ): { month: string; revenue: number; sales: number }[] {
    const monthlyData: { [key: string]: { revenue: number; sales: number } } = {};

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
      .slice(-12); // Derniers 12 mois
  }

  private calculateTopProducts(sales: Sale[]) {
    const productMap: {
      [key: string]: {
        productId: string;
        productName: string;
        salesCount: number;
        revenue: number;
      };
    } = {};

    sales.forEach((sale) => {
      if (!productMap[sale.productId]) {
        productMap[sale.productId] = {
          productId: sale.productId,
          productName: sale.productName,
          salesCount: 0,
          revenue: 0,
        };
      }

      productMap[sale.productId].salesCount += 1;
      productMap[sale.productId].revenue += sale.totalAmount;
    });

    return Object.values(productMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }

  private calculateTopBuyers(sales: Sale[]) {
    const buyerMap: {
      [key: string]: {
        buyerId: string;
        buyerName: string;
        purchaseCount: number;
        totalSpent: number;
      };
    } = {};

    sales.forEach((sale) => {
      if (!buyerMap[sale.buyerId]) {
        buyerMap[sale.buyerId] = {
          buyerId: sale.buyerId,
          buyerName: sale.buyerName,
          purchaseCount: 0,
          totalSpent: 0,
        };
      }

      buyerMap[sale.buyerId].purchaseCount += 1;
      buyerMap[sale.buyerId].totalSpent += sale.totalAmount;
    });

    return Object.values(buyerMap)
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 10);
  }

  private calculateDailyStats(sales: Sale[]) {
    const dailyData: { [key: string]: { revenue: number; orders: number } } = {};

    sales.forEach((sale) => {
      const dateKey = sale.orderDate.toLocaleDateString('fr-FR', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      });

      if (!dailyData[dateKey]) {
        dailyData[dateKey] = { revenue: 0, orders: 0 };
      }

      dailyData[dateKey].revenue += sale.totalAmount;
      dailyData[dateKey].orders += 1;
    });

    return Object.entries(dailyData)
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-7); // Derniers 7 jours
  }

  private calculateTrend(sales: Sale[], days: number): number {
    if (sales.length < 2) return 0;

    const now = new Date();
    const pastDate = new Date(now);
    pastDate.setDate(now.getDate() - days);

    const recentSales = sales.filter(s => s.orderDate >= pastDate);
    const olderSales = sales.filter(s => s.orderDate < pastDate);

    if (olderSales.length === 0) return 100; // 100% d'augmentation si pas de ventes précédentes

    const recentRevenue = recentSales.reduce((sum, s) => sum + s.totalAmount, 0);
    const olderRevenue = olderSales.reduce((sum, s) => sum + s.totalAmount, 0);

    if (olderRevenue === 0) return recentRevenue > 0 ? 100 : 0;

    return ((recentRevenue - olderRevenue) / olderRevenue) * 100;
  }

  private predictRevenue(currentRevenue: number, trend: number): number {
    return currentRevenue * (1 + trend / 100);
  }

  private getBestSellingDay(dailyStats?: { date: string; revenue: number; orders: number }[]): string {
    if (!dailyStats || dailyStats.length === 0) return 'N/A';

    const bestDay = dailyStats.reduce((prev, current) =>
      prev.revenue > current.revenue ? prev : current
    );

    return bestDay.date;
  }

  private getPeakHour(sales: Sale[]): string {
    if (sales.length === 0) return 'N/A';

    const hourCounts: { [hour: string]: number } = {};

    sales.forEach(sale => {
      const hour = sale.orderDate.getHours();
      const hourKey = `${hour}h`;
      hourCounts[hourKey] = (hourCounts[hourKey] || 0) + 1;
    });

    const peakHour = Object.entries(hourCounts).reduce((a, b) =>
      a[1] > b[1] ? a : b
    );

    return peakHour[0];
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
    };
  }

  // Méthodes de conversion pour l'affichage
  getStatusText(status: Sale['status']): string {
    const statusMap: { [key in Sale['status']]: string } = {
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
    const methodMap: { [key in Sale['paymentMethod']]: string } = {
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

    // ==================== POUR L'ACHETEUR ====================

// Obtenir les commandes d'un acheteur
async getBuyerOrders(buyerId: string): Promise<Sale[]> {
  try {
    const q = query(
      collection(this.firebaseService.firestore, 'sales'),
      where('buyerId', '==', buyerId),
      orderBy('orderDate', 'desc')
    );

    const querySnapshot = await getDocs(q);
    const orders: Sale[] = [];

    querySnapshot.forEach(doc => {
      orders.push(this.mapFirestoreDataToSale(doc.id, doc.data()));
    });

    return orders;
  } catch (error) {
    console.error('Erreur chargement commandes acheteur:', error);
    return [];
  }
}
// ==================== ACHETEURS D'UN PRODUCTEUR ====================
// Utilisé pour notifier les acheteurs lorsqu’un producteur ajoute un produit
async getBuyersForProducer(producerId: string): Promise<string[]> {
  try {
    const q = query(
      collection(this.firebaseService.firestore, 'sales'),
      where('producerId', '==', producerId)
    );

    const snapshot = await getDocs(q);

    // Récupérer tous les buyerId
    const buyerIds = snapshot.docs
      .map(doc => doc.data()['buyerId'])
      .filter(Boolean);

    // Supprimer les doublons
    return Array.from(new Set(buyerIds));
  } catch (error) {
    console.error('Erreur récupération acheteurs du producteur:', error);
    return [];
  }
}


}

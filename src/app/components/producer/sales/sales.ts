import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ViewEncapsulation } from '@angular/core';

import { FirebaseService } from '../../../services/firebase.service';
import { SalesService } from '../../../services/sales.service';
import {
  Sale,
  SalesStats,
  SalesFilter,
  StatCard,
} from '../../../interfaces/data.interfaces';

@Component({
  selector: 'app-sales',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './sales.html',
  styleUrls: ['./sales.css'],
  encapsulation: ViewEncapsulation.None,
})
export class SalesComponent implements OnInit, OnDestroy {
  // Données
  sales: Sale[] = [];
  filteredSales: Sale[] = [];
  stats: SalesStats | null = null;
  statCards: StatCard[] = [];
  isLoading = false;
  isExporting = false;

  // Filtres
  filter: SalesFilter = {
    period: 'month',
    status: 'all',
    paymentMethod: 'all',
    deliveryType: 'all',
    searchQuery: '',
  };

  // Options de filtres
  periods = [
    { id: 'today', name: "Aujourd'hui" },
    { id: 'week', name: 'Cette semaine' },
    { id: 'month', name: 'Ce mois' },
    { id: 'quarter', name: 'Ce trimestre' },
    { id: 'year', name: 'Cette année' },
    { id: 'all', name: 'Toutes' },
  ];

  statuses = [
    { id: 'all', name: 'Tous les statuts' },
    { id: 'pending', name: 'En attente' },
    { id: 'confirmed', name: 'Confirmé' },
    { id: 'shipped', name: 'Expédié' },
    { id: 'delivered', name: 'Livré' },
    { id: 'completed', name: 'Terminé' },
    { id: 'cancelled', name: 'Annulé' },
    { id: 'refunded', name: 'Remboursé' },
  ];

  paymentMethods = [
    { id: 'all', name: 'Tous les paiements' },
    { id: 'wave', name: 'Wave' },
    { id: 'orange_money', name: 'Orange Money' },
    { id: 'free_money', name: 'Free Money' },
    { id: 'cash', name: 'Espèces' },
    { id: 'credit_card', name: 'Carte bancaire' },
    { id: 'mobile_money', name: 'Mobile Money' },
  ];

  deliveryTypes = [
    { id: 'all', name: 'Tous les types' },
    { id: 'pickup', name: 'À retirer' },
    { id: 'delivery', name: 'Livraison' },
  ];

  // Pagination
  currentPage = 1;
  itemsPerPage = 10;
  totalPages = 0;

  // Abonnements
  private subscriptions = new Subscription();

  constructor(
    private firebaseService: FirebaseService,
    private salesService: SalesService,
  ) {}

  async ngOnInit() {
    await this.loadData();
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }

  // Charger toutes les données
  async loadData() {
    this.isLoading = true;

    try {
      const currentUser = this.firebaseService.userData;
      if (!currentUser || currentUser.role !== 'producer') {
        this.showNotification('Connectez-vous en tant que producteur', 'error');
        return;
      }

      // Convertir les valeurs 'all' en undefined pour le service
      const serviceFilter = this.prepareServiceFilter(this.filter);

      // Charger les ventes
      this.sales = await this.salesService.getSales(
        currentUser.uid,
        serviceFilter,
      );
      this.filteredSales = [...this.sales];

      // Charger les statistiques
      await this.loadStats();

      // Calculer la pagination
      this.calculatePagination();
    } catch (error) {
      console.error('Erreur chargement données:', error);
      this.showNotification('Erreur de chargement', 'error');
    } finally {
      this.isLoading = false;
    }
  }

  // Préparer le filtre pour le service (convertir 'all' en undefined)
  private prepareServiceFilter(filter: SalesFilter): SalesFilter {
    const serviceFilter: SalesFilter = {
      period: filter.period,
      searchQuery: filter.searchQuery,
    };

    // Convertir 'all' en undefined pour le service
    if (filter.status && filter.status !== 'all') {
      serviceFilter.status = filter.status;
    }

    if (filter.paymentMethod && filter.paymentMethod !== 'all') {
      serviceFilter.paymentMethod = filter.paymentMethod;
    }

    if (filter.deliveryType && filter.deliveryType !== 'all') {
      serviceFilter.deliveryType = filter.deliveryType;
    }

    return serviceFilter;
  }

  // Charger les statistiques
  async loadStats() {
    try {
      const currentUser = this.firebaseService.userData;
      if (!currentUser) return;

      const serviceFilter = this.prepareServiceFilter(this.filter);
      this.stats = await this.salesService.getSalesStats(
        currentUser.uid,
        serviceFilter,
      );
      this.updateStatCards();
    } catch (error) {
      console.error('Erreur chargement statistiques:', error);
    }
  }

  // Mettre à jour les cartes de statistiques
  updateStatCards() {
    if (!this.stats) return;

    // Vérifier si monthlyTrend est défini
    const monthlyTrend = this.stats.monthlyTrend ?? 0;

    this.statCards = [
      {
        id: 'revenue',
        label: 'Revenu total',
        value: this.stats.totalRevenue,
        change: monthlyTrend,
        trend: monthlyTrend >= 0 ? 'up' : 'down',
        icon: '💰',
        color: '#4CAF50',
        prefix: '',
        suffix: ' FCFA',
        format: 'currency',
      },
      {
        id: 'orders',
        label: 'Commandes',
        value: this.filteredSales.length,
        change: 15,
        trend: 'up',
        icon: '📦',
        color: '#2196F3',
        format: 'number',
      },
      {
        id: 'average',
        label: 'Panier moyen',
        value: this.stats.averageOrderValue,
        change: 5,
        trend: 'up',
        icon: '🛒',
        color: '#FF9800',
        prefix: '',
        suffix: ' FCFA',
        format: 'currency',
      },
      {
        id: 'rating',
        label: 'Note moyenne',
        value: this.stats.averageRating,
        change: 0.3,
        trend: 'up',
        icon: '⭐',
        color: '#FFC107',
        suffix: '/5',
        format: 'rating',
      },
      {
        id: 'completion',
        label: 'Taux de complétion',
        value: this.stats.completionRate,
        change: -2,
        trend: 'down',
        icon: '✅',
        color: '#9C27B0',
        suffix: '%',
        format: 'percentage',
      },
      {
        id: 'active',
        label: 'Clients actifs',
        value: this.stats.topBuyers.length,
        change: 10,
        trend: 'up',
        icon: '👥',
        color: '#E91E63',
        format: 'number',
      },
    ];
  }

  // Appliquer les filtres
  applyFilters() {
    // Filtrer localement
    let filtered = [...this.sales];

    // Filtre par recherche
    if (this.filter.searchQuery) {
      const searchLower = this.filter.searchQuery.toLowerCase();
      filtered = filtered.filter(
        (sale) =>
          sale.orderNumber.toLowerCase().includes(searchLower) ||
          sale.productName.toLowerCase().includes(searchLower) ||
          sale.buyerName.toLowerCase().includes(searchLower) ||
          (sale.buyerPhone &&
            sale.buyerPhone.includes(this.filter.searchQuery || '')),
      );
    }

    // Filtre par statut
    if (this.filter.status && this.filter.status !== 'all') {
      filtered = filtered.filter((sale) => sale.status === this.filter.status);
    }

    // Filtre par méthode de paiement
    if (this.filter.paymentMethod && this.filter.paymentMethod !== 'all') {
      filtered = filtered.filter(
        (sale) => sale.paymentMethod === this.filter.paymentMethod,
      );
    }

    // Filtre par type de livraison
    if (this.filter.deliveryType && this.filter.deliveryType !== 'all') {
      filtered = filtered.filter(
        (sale) => sale.deliveryType === this.filter.deliveryType,
      );
    }

    this.filteredSales = filtered;
    this.currentPage = 1;
    this.calculatePagination();

    // Recharger les statistiques si période changée
    if (this.filter.period) {
      this.loadStats();
    }
  }

  // Effacer tous les filtres
  clearFilters() {
    this.filter = {
      period: 'month',
      status: 'all',
      paymentMethod: 'all',
      deliveryType: 'all',
      searchQuery: '',
    };
    this.applyFilters();
  }

  // Mettre à jour le statut d'une vente
  async updateSaleStatus(saleId: string, newStatus: string) {
    if (!newStatus) return;

    try {
      const result = await this.salesService.updateSaleStatus(
        saleId,
        newStatus as any,
      );

      if (result.success) {
        await this.loadData();
        this.showNotification(`Statut mis à jour avec succès`);
      } else {
        this.showNotification(`Erreur: ${result.error}`, 'error');
      }
    } catch (error) {
      console.error('Erreur mise à jour statut:', error);
      this.showNotification('Erreur lors de la mise à jour', 'error');
    }
  }

  // Exporter les ventes
  async exportSales() {
    if (this.isExporting) return;

    this.isExporting = true;

    try {
      const currentUser = this.firebaseService.userData;
      if (!currentUser) return;

      const serviceFilter = this.prepareServiceFilter(this.filter);
      const csvContent = await this.salesService.exportSalesToCSV(
        currentUser.uid,
        serviceFilter,
      );

      if (csvContent) {
        // Créer et télécharger le fichier
        const blob = new Blob([csvContent], {
          type: 'text/csv;charset=utf-8;',
        });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        link.setAttribute('href', url);
        link.setAttribute(
          'download',
          `ventes_${new Date().toISOString().split('T')[0]}.csv`,
        );
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        this.showNotification('Export CSV réussi!');
      }
    } catch (error) {
      console.error('Erreur export:', error);
      this.showNotification("Erreur lors de l'export", 'error');
    } finally {
      this.isExporting = false;
    }
  }

  // Voir les détails d'une vente
  viewSaleDetails(sale: Sale) {
    const details = `
      <div class="sale-details-modal">
        <h3>📋 Détails de la commande</h3>

        <div class="detail-section">
          <h4>🛒 Commande</h4>
          <p><strong>Numéro:</strong> ${sale.orderNumber}</p>
          <p><strong>Date:</strong> ${this.formatDate(sale.orderDate)}</p>
          <p><strong>Statut:</strong> <span class="status-badge ${this.getStatusClass(
            sale.status,
          )}">${this.getStatusText(sale.status)}</span></p>
        </div>

        <div class="detail-section">
          <h4>👤 Client</h4>
          <p><strong>Nom:</strong> ${sale.buyerName}</p>
          <p><strong>Téléphone:</strong> ${sale.buyerPhone || 'Non fourni'}</p>
          <p><strong>Localisation:</strong> ${sale.buyerLocation}</p>
          ${
            sale.deliveryAddress
              ? `<p><strong>Adresse de livraison:</strong> ${sale.deliveryAddress}</p>`
              : ''
          }
        </div>

        <div class="detail-section">
          <h4>📦 Produit</h4>
          <p><strong>Nom:</strong> ${sale.productName}</p>
          <p><strong>Catégorie:</strong> ${sale.productCategory}</p>
          <p><strong>Quantité:</strong> ${sale.quantity} ${this.getProductUnit(
            sale,
          )}</p>
          <p><strong>Prix unitaire:</strong> ${this.formatPrice(
            sale.unitPrice,
          )}/${this.getProductUnit(sale)}</p>
        </div>

        <div class="detail-section">
          <h4>💰 Montants</h4>
          <p><strong>Sous-total:</strong> ${this.formatPrice(
            sale.totalAmount - (sale.deliveryFee || 0),
          )}</p>
          ${
            sale.deliveryFee
              ? `<p><strong>Frais de livraison:</strong> ${this.formatPrice(
                  sale.deliveryFee,
                )}</p>`
              : ''
          }
          <p><strong class="total">Total:</strong> ${this.formatPrice(
            sale.totalAmount,
          )}</p>
        </div>

        <div class="detail-section">
          <h4>📊 Informations</h4>
          <p><strong>Méthode de paiement:</strong> ${this.getPaymentMethodText(
            sale.paymentMethod,
          )}</p>
          <p><strong>Statut paiement:</strong> ${
            sale.paymentStatus || 'Non spécifié'
          }</p>
          <p><strong>Type de livraison:</strong> ${this.getDeliveryTypeText(
            sale.deliveryType,
          )}</p>
          ${
            sale.deliveryDate
              ? `<p><strong>Date de livraison:</strong> ${this.formatDate(
                  sale.deliveryDate,
                )}</p>`
              : ''
          }
          ${
            sale.completionDate
              ? `<p><strong>Date de complétion:</strong> ${this.formatDate(
                  sale.completionDate,
                )}</p>`
              : ''
          }
        </div>

        ${
          sale.notes
            ? `
        <div class="detail-section">
          <h4>📝 Notes</h4>
          <p>${sale.notes}</p>
        </div>
        `
            : ''
        }

        ${
          sale.rating
            ? `
        <div class="detail-section">
          <h4>⭐ Évaluation</h4>
          <div class="rating-display">
            <div class="stars">${this.getStarRating(sale.rating)}</div>
            <p><strong>Note:</strong> ${sale.rating}/5</p>
            ${
              sale.review
                ? `<p><strong>Avis:</strong> "${sale.review}"</p>`
                : ''
            }
          </div>
        </div>
        `
            : ''
        }
      </div>
    `;

    this.showModal('Détails de la commande', details);
  }

  // Méthodes utilitaires
  getStatusText(status: Sale['status']): string {
    return this.salesService.getStatusText(status);
  }

  getStatusClass(status: Sale['status']): string {
    switch (status) {
      case 'completed':
        return 'status-completed';
      case 'confirmed':
        return 'status-confirmed';
      case 'pending':
        return 'status-pending';
      case 'shipped':
        return 'status-shipped';
      case 'delivered':
        return 'status-delivered';
      case 'cancelled':
        return 'status-cancelled';
      case 'refunded':
        return 'status-refunded';
      default:
        return 'status-pending';
    }
  }

  getPaymentMethodText(method: Sale['paymentMethod']): string {
    return this.salesService.getPaymentMethodText(method);
  }

  getDeliveryTypeText(type: Sale['deliveryType']): string {
    return this.salesService.getDeliveryTypeText(type);
  }

  formatPrice(price: number): string {
    return this.salesService.formatPrice(price);
  }

  formatDate(date: Date): string {
    return this.salesService.formatDate(date);
  }

  getProductUnit(sale: Sale): string {
    const category = sale.productCategory?.toLowerCase() || '';
    if (
      category.includes('légume') ||
      category.includes('fruit') ||
      category.includes('volaille')
    ) {
      return 'kg';
    } else if (category.includes('œuf')) {
      return 'unité';
    } else if (category.includes('lait')) {
      return 'L';
    } else {
      return 'unité';
    }
  }

  getStarRating(rating: number): string {
    let stars = '';
    for (let i = 1; i <= 5; i++) {
      stars += i <= rating ? '★' : '☆';
    }
    return stars;
  }

  // Pagination
  calculatePagination() {
    this.totalPages = Math.ceil(this.filteredSales.length / this.itemsPerPage);
    if (this.currentPage > this.totalPages && this.totalPages > 0) {
      this.currentPage = this.totalPages;
    }
  }

  get paginatedSales() {
    const start = (this.currentPage - 1) * this.itemsPerPage;
    const end = start + this.itemsPerPage;
    return this.filteredSales.slice(start, end);
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
    }
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
    }
  }

  goToPage(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }

  getPageNumbers(): number[] {
    const totalPages = this.totalPages;
    const currentPage = this.currentPage;
    const delta = 2;
    const range = [];
    const rangeWithDots = [];
    let l;

    for (let i = 1; i <= totalPages; i++) {
      if (
        i === 1 ||
        i === totalPages ||
        (i >= currentPage - delta && i <= currentPage + delta)
      ) {
        range.push(i);
      }
    }

    for (let i of range) {
      if (l) {
        if (i - l === 2) {
          rangeWithDots.push(l + 1);
        } else if (i - l !== 1) {
          rangeWithDots.push(-1); // -1 pour les points de suspension
        }
      }
      rangeWithDots.push(i);
      l = i;
    }

    return rangeWithDots.filter((page) => page !== -1) as number[];
  }

  // Méthodes d'affichage
  getMostUsedPaymentMethod(): string {
    if (!this.stats || this.filteredSales.length === 0) return 'N/A';

    const methods = this.stats.byPaymentMethod || {};
    const entries = Object.entries(methods);
    if (entries.length === 0) return 'N/A';

    const mostUsed = entries.reduce((a, b) => (a[1] > b[1] ? a : b));
    return this.getPaymentMethodText(mostUsed[0] as any);
  }

  getMaxRevenue(): number {
    if (!this.stats?.monthlyRevenue || this.stats.monthlyRevenue.length === 0)
      return 1;
    return Math.max(...this.stats.monthlyRevenue.map((m) => m.revenue));
  }

  // Notifications
  private showNotification(
    message: string,
    type: 'success' | 'error' | 'info' = 'success',
  ) {
    const toast = document.createElement('div');
    toast.className = `notification toast-${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${
        type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'
      }</span>
      <span class="toast-message">${message}</span>
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode === document.body) {
        document.body.removeChild(toast);
      }
    }, 3000);
  }

  private showModal(title: string, content: string) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-container">
        <div class="modal-header">
          <h2>${title}</h2>
          <button class="modal-close">×</button>
        </div>
        <div class="modal-content">
          ${content}
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Fermer le modal
    modal.querySelector('.modal-close')?.addEventListener('click', () => {
      document.body.removeChild(modal);
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    });
  }

  // Formatage des valeurs
  formatStatValue(card: StatCard): string {
    let formattedValue = '';

    if (card.format === 'currency') {
      formattedValue = this.formatPrice(card.value);
    } else if (card.format === 'percentage') {
      formattedValue = card.value.toFixed(1) + '%';
    } else if (card.format === 'rating') {
      formattedValue = card.value.toFixed(1) + '/5';
    } else {
      formattedValue = this.salesService.formatNumber(card.value);
    }

    return (card.prefix || '') + formattedValue + (card.suffix || '');
  }
  get totalFilteredSales(): number {
    return this.filteredSales.reduce((sum, s) => sum + s.totalAmount, 0);
  }

  // Méthodes utilitaires pour le template
  abs(value: number): number {
    return Math.abs(value);
  }

  getMonthlyTrend(): number {
    return this.stats?.monthlyTrend ?? 0;
  }

  isPositiveTrend(): boolean {
    return this.getMonthlyTrend() > 0;
  }

  isNegativeTrend(): boolean {
    return this.getMonthlyTrend() < 0;
  }

  formatTrend(trend: number | undefined): string {
    if (trend === undefined) return '0.0%';
    const prefix = trend > 0 ? '+' : '';
    return `${prefix}${trend.toFixed(1)}%`;
  }
}

import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { FirebaseService } from '../../../services/firebase.service';
import { SalesService } from '../../../services/sales.service';
import { Product } from '../../../interfaces/data.interfaces';

interface DashboardStat {
  label: string;
  value: number;
  icon: string;
  color: string;
  link?: string;
  trend?: number;
  change?: number;
}

interface RecentSale {
  id: string;
  product: string;
  buyer: string;
  date: string;
  amount: number;
  status: 'completed' | 'pending' | 'cancelled';
}

interface Notification {
  id: number;
  title: string;
  message: string;
  time: string;
  read: boolean;
  type?: 'sale' | 'stock' | 'certification' | 'review' | 'system';
}

@Component({
  selector: 'app-producer-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './producer-dashboard.html',
  styleUrls: ['./producer-dashboard.css'],
})
export class ProducerDashboardComponent implements OnInit, OnDestroy {
  userData: any;
  stats: DashboardStat[] = [];
  recentSales: RecentSale[] = [];
  notifications: Notification[] = [];

  // Données réelles
  totalProducts: number = 0;
  monthlySales: number = 0;
  totalRevenue: number = 0;
  averageRating: number = 0;
  totalCertifications: number = 0;
  unreadMessages: number = 0;
  showNotifications = false;

  // Objectifs
  monthlyGoal: number = 10; // Objectif mensuel en produits
  currentSales: number = 0;
  salesPerformance: number = 0; // +15%, -5%, etc.

  isLoading: boolean = true;
  private subscriptions: Subscription = new Subscription();

  constructor(
    private authService: AuthService,
    private firebaseService: FirebaseService,
    private salesService: SalesService,
  ) {}

  async ngOnInit() {
    this.userData = this.authService.getUserData();
    await this.loadDashboardData();
    await this.loadNotifications();
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }

  toggleNotifications() {
    this.showNotifications = !this.showNotifications;
  }
  async loadDashboardData() {
    this.isLoading = true;

    try {
      const currentUser = this.firebaseService.userData;
      if (!currentUser || currentUser.role !== 'producer') {
        console.error('Utilisateur non producteur');
        this.loadStaticData();
        return;
      }

      // 1. Charger les produits
      const products = await this.firebaseService.getProducerProducts(
        currentUser.uid,
      );
      this.totalProducts = products.length;
      this.currentSales = products.reduce((sum, p) => sum + (p.sales || 0), 0);

      // 2. Charger les ventes récentes et statistiques
      await this.loadSalesData(currentUser.uid);

      // 3. Calculer le revenu total
      this.totalRevenue = await this.calculateTotalRevenue(currentUser.uid);

      // 4. Calculer la note moyenne
      this.averageRating = await this.calculateAverageRating(currentUser.uid);

      // 5. Compter les certifications
      this.totalCertifications = this.countCertifications(products);

      // 6. Compter les messages non lus
      this.unreadMessages = await this.countUnreadMessages(currentUser.uid);

      // 7. Calculer la performance
      this.salesPerformance = await this.calculateSalesPerformance(
        currentUser.uid,
      );

      // 8. Mettre à jour les cartes de statistiques
      this.updateStatsCards();

      // 9. Charger les ventes récentes
      await this.loadRecentSales(currentUser.uid);
    } catch (error) {
      console.error('Erreur chargement dashboard:', error);
      this.loadStaticData();
    } finally {
      this.isLoading = false;
    }
  }

  private async loadSalesData(producerId: string) {
    try {
      // Récupérer les ventes du mois en cours
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59,
      );

      const sales = await this.salesService.getSales(producerId, {
        period: 'custom',
        startDate: startOfMonth,
        endDate: endOfMonth,
        status: 'completed',
      });

      this.monthlySales = sales.length;

      // Mettre à jour les ventes récentes pour l'affichage
      this.recentSales = sales.slice(0, 5).map((sale) => ({
        id: sale.orderNumber,
        product: sale.productName,
        buyer: sale.buyerName,
        date: sale.orderDate.toLocaleDateString('fr-FR'),
        amount: sale.totalAmount,
        status: 'completed' as const,
      }));
    } catch (error) {
      console.error('Erreur chargement ventes:', error);
      this.monthlySales = 0;
    }
  }

  private async calculateTotalRevenue(producerId: string): Promise<number> {
    try {
      // Récupérer toutes les ventes complétées
      const sales = await this.salesService.getSales(producerId, {
        period: 'all',
        status: 'completed',
      });

      return sales.reduce((sum, sale) => sum + sale.totalAmount, 0);
    } catch (error) {
      console.error('Erreur calcul revenu:', error);
      return 0;
    }
  }

  private async calculateAverageRating(producerId: string): Promise<number> {
    try {
      const sales = await this.salesService.getSales(producerId, {
        period: 'all',
        status: 'completed',
      });

      const ratedSales = sales.filter((sale) => sale.rating && sale.rating > 0);
      if (ratedSales.length === 0) return 0;

      const totalRating = ratedSales.reduce(
        (sum, sale) => sum + (sale.rating || 0),
        0,
      );
      return totalRating / ratedSales.length;
    } catch (error) {
      console.error('Erreur calcul note moyenne:', error);
      return 0;
    }
  }

  private countCertifications(products: Product[]): number {
    let certCount = 0;

    products.forEach((product) => {
      // Compter les certifications du produit
      if (product.certifications && product.certifications.length > 0) {
        certCount += product.certifications.length;
      }

      // Ajouter la certification principale si elle existe
      if (product.certification) {
        certCount += 1;
      }

      // Ajouter si bio
      if (product.isOrganic) {
        certCount += 1;
      }
    });

    return certCount;
  }

  private async countUnreadMessages(producerId: string): Promise<number> {
    try {
      // Note: Vous devrez implémenter cette méthode dans votre service de messages
      // Pour l'instant, retournez une valeur statique
      return 3; // À remplacer par l'appel réel
    } catch (error) {
      console.error('Erreur comptage messages:', error);
      return 0;
    }
  }

  private async calculateSalesPerformance(producerId: string): Promise<number> {
    try {
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      // Ventes du mois en cours
      const currentMonthStart = new Date(currentYear, currentMonth, 1);
      const currentMonthEnd = new Date(
        currentYear,
        currentMonth + 1,
        0,
        23,
        59,
        59,
      );

      const currentMonthSales = await this.salesService.getSales(producerId, {
        period: 'custom',
        startDate: currentMonthStart,
        endDate: currentMonthEnd,
        status: 'completed',
      });

      const currentRevenue = currentMonthSales.reduce(
        (sum, sale) => sum + sale.totalAmount,
        0,
      );

      // Ventes du mois précédent
      const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;

      const prevMonthStart = new Date(prevYear, prevMonth, 1);
      const prevMonthEnd = new Date(prevYear, prevMonth + 1, 0, 23, 59, 59);

      const prevMonthSales = await this.salesService.getSales(producerId, {
        period: 'custom',
        startDate: prevMonthStart,
        endDate: prevMonthEnd,
        status: 'completed',
      });

      const prevRevenue = prevMonthSales.reduce(
        (sum, sale) => sum + sale.totalAmount,
        0,
      );

      if (prevRevenue === 0) return currentRevenue > 0 ? 100 : 0;

      return ((currentRevenue - prevRevenue) / prevRevenue) * 100;
    } catch (error) {
      console.error('Erreur calcul performance:', error);
      return 15; // Valeur par défaut
    }
  }

  private updateStatsCards() {
    this.stats = [
      {
        label: 'Produits en vente',
        value: this.totalProducts,
        icon: '📦',
        color: '#4CAF50',
        link: '/producer/products',
        trend: 0,
        change: 0,
      },
      {
        label: 'Ventes du mois',
        value: this.monthlySales,
        icon: '💰',
        color: '#2196F3',
        link: '/producer/sales',
        trend:
          this.salesPerformance > 0 ? 1 : this.salesPerformance < 0 ? -1 : 0,
        change: Math.abs(this.salesPerformance),
      },
      {
        label: 'Revenus total',
        value: this.totalRevenue,
        icon: '💳',
        color: '#FF9800',
        trend: 0,
        change: 0,
      },
      {
        label: 'Note moyenne',
        value: this.averageRating,
        icon: '⭐',
        color: '#FFC107',
        trend: 0,
        change: 0,
      },
      {
        label: 'Certifications',
        value: this.totalCertifications,
        icon: '🔒',
        color: '#9C27B0',
        link: '/producer/certifications',
        trend: 0,
        change: 0,
      },
      {
        label: 'Messages non lus',
        value: this.unreadMessages,
        icon: '✉️',
        color: '#E91E63',
        link: '/producer/messages',
        trend: 0,
        change: 0,
      },
    ];
  }

  private async loadRecentSales(producerId: string) {
    try {
      const sales = await this.salesService.getSales(producerId, {
        period: 'month',
        status: 'all',
      });

      // Prendre les 5 ventes les plus récentes
      const recent = sales.slice(0, 5);

      this.recentSales = recent.map((sale) => ({
        id: sale.orderNumber,
        product: sale.productName,
        buyer: sale.buyerName,
        date: sale.orderDate.toLocaleDateString('fr-FR'),
        amount: sale.totalAmount,
        status: this.mapSaleStatus(sale.status),
      }));
    } catch (error) {
      console.error('Erreur chargement ventes récentes:', error);
      this.loadStaticRecentSales();
    }
  }

  private mapSaleStatus(status: string): 'completed' | 'pending' | 'cancelled' {
    switch (status) {
      case 'completed':
      case 'delivered':
        return 'completed';
      case 'cancelled':
      case 'refunded':
        return 'cancelled';
      default:
        return 'pending';
    }
  }

  private async loadNotifications() {
    try {
      const currentUser = this.firebaseService.userData;
      if (!currentUser) return;

      // Notifications réelles (vous devrez implémenter un service de notifications)
      // Pour l'instant, chargeons des notifications basées sur les ventes récentes

      this.notifications = [
        {
          id: 1,
          title: 'Nouvelle commande',
          message: `Vous avez reçu ${this.monthlySales} nouvelle(s) commande(s) ce mois`,
          time: "Aujourd'hui",
          read: false,
          type: 'sale',
        },
        {
          id: 2,
          title: 'Stock faible',
          message: 'Certains produits sont bientôt en rupture de stock',
          time: 'Hier',
          read: true,
          type: 'stock',
        },
        {
          id: 3,
          title: 'Avis client',
          message: `Note moyenne: ${this.averageRating.toFixed(1)}/5`,
          time: 'Il y a 2 jours',
          read: true,
          type: 'review',
        },
      ];

      // Ajouter des notifications basées sur les données réelles
      if (this.monthlySales > 0) {
        this.notifications.unshift({
          id: 4,
          title: 'Objectif mensuel',
          message: `Progression: ${this.currentSales}/${this.monthlyGoal} produits vendus`,
          time: 'Mise à jour',
          read: false,
          type: 'system',
        });
      }
    } catch (error) {
      console.error('Erreur chargement notifications:', error);
      this.loadStaticNotifications();
    }
  }

  // Fallback data
  private loadStaticData() {
    this.totalProducts = 12;
    this.monthlySales = 8;
    this.totalRevenue = 125000;
    this.averageRating = 4.5;
    this.totalCertifications = 5;
    this.unreadMessages = 3;
    this.salesPerformance = 15;
    this.currentSales = 8;

    this.updateStatsCards();
    this.loadStaticRecentSales();
    this.loadStaticNotifications();
  }

  private loadStaticRecentSales() {
    this.recentSales = [
      {
        id: '001',
        product: 'Tomates Bio',
        buyer: 'Alioune Diop',
        date: '2024-01-15',
        amount: 15000,
        status: 'completed',
      },
      {
        id: '002',
        product: 'Oignons',
        buyer: 'Fatou Ndiaye',
        date: '2024-01-14',
        amount: 8000,
        status: 'completed',
      },
      {
        id: '003',
        product: 'Carottes',
        buyer: 'Moussa Fall',
        date: '2024-01-13',
        amount: 12000,
        status: 'pending',
      },
      {
        id: '004',
        product: 'Pommes de terre',
        buyer: 'Aminata Sow',
        date: '2024-01-12',
        amount: 10000,
        status: 'completed',
      },
      {
        id: '005',
        product: 'Aubergines',
        buyer: 'Ibrahima Diallo',
        date: '2024-01-11',
        amount: 7000,
        status: 'cancelled',
      },
    ];
  }

  private loadStaticNotifications() {
    this.notifications = [
      {
        id: 1,
        title: 'Nouvelle commande',
        message: 'Vous avez reçu une commande de Tomates',
        time: 'Il y a 2h',
        read: false,
      },
      {
        id: 2,
        title: 'Certification approuvée',
        message: 'Votre certification "Tomates Bio" a été approuvée',
        time: 'Il y a 1 jour',
        read: true,
      },
      {
        id: 3,
        title: 'Avis reçu',
        message: 'Alioune Diop a donné 5 étoiles à vos Tomates',
        time: 'Il y a 2 jours',
        read: true,
      },
      {
        id: 4,
        title: 'Rappel de stock',
        message: 'Votre stock de Carottes est faible',
        time: 'Il y a 3 jours',
        read: false,
      },
    ];
  }

  // Méthodes existantes
  markAsRead(notificationId: number) {
    const notification = this.notifications.find(
      (n) => n.id === notificationId,
    );
    if (notification) {
      notification.read = true;
    }
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'completed':
        return '#4CAF50';
      case 'pending':
        return '#FF9800';
      case 'cancelled':
        return '#F44336';
      default:
        return '#9E9E9E';
    }
  }

  getUnreadCount(): number {
    return this.notifications.filter((n) => !n.read).length;
  }

  markAllAsRead() {
    this.notifications.forEach((n) => (n.read = true));
  }

  // Calcul du pourcentage de progression des objectifs
  getGoalPercentage(): number {
    return (this.currentSales / this.monthlyGoal) * 100;
  }

  // Formatage de la performance
  getPerformanceText(): string {
    if (this.salesPerformance > 0) {
      return `+${this.salesPerformance.toFixed(1)}%`;
    } else if (this.salesPerformance < 0) {
      return `${this.salesPerformance.toFixed(1)}%`;
    } else {
      return 'Stable';
    }
  }

  getPerformanceClass(): string {
    if (this.salesPerformance > 0) return 'trend up';
    if (this.salesPerformance < 0) return 'trend down';
    return 'trend neutral';
  }

  // Gestion des commandes vocales (existant)
  handleVoiceCommand(command: string) {
    const lowerCommand = command.toLowerCase();

    if (lowerCommand.includes('ajouter') || lowerCommand.includes('yokk')) {
      window.location.href = '/producer/add-product';
    } else if (
      lowerCommand.includes('produits') ||
      lowerCommand.includes('féetël')
    ) {
      window.location.href = '/producer/products';
    } else if (
      lowerCommand.includes('ventes') ||
      lowerCommand.includes('vente')
    ) {
      window.location.href = '/producer/sales';
    } else if (
      lowerCommand.includes('certifier') ||
      lowerCommand.includes('certification')
    ) {
      window.location.href = '/producer/certifications';
    }
  }

  // Méthode pour rafraîchir les données
  async refreshData() {
    await this.loadDashboardData();
    await this.loadNotifications();
  }
}

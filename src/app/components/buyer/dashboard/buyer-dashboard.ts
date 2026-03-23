import {
  Component,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { FirebaseService } from '../../../services/firebase.service';
import { Product } from '../../../interfaces/data.interfaces';
import { ChatbotVoiceComponent } from '../../chatbot/chatbot-voice.component';
import {
  NotificationService,
  AppNotification,
} from '../../../services/notification.service';
import { Subscription } from 'rxjs';
import { AGCBalanceWidgetComponent } from '../../agc/agc-balance-widget/agc-balance-widget.component';
import { AGCPurchaseComponent } from '../../agc/agc-purchase/agc-purchase.component';
import { AGCService } from '../../../services/agc.service';

interface DashboardStat {
  label: string;
  value: number | string;
  icon: string;
  color: string;
  link?: string;
}

interface RecentPurchase {
  ratingValue: number;
  id: string;
  product: string;
  producer: string;
  date: string;
  amount: number;
  status: 'delivered' | 'shipping' | 'pending';
  certified: boolean;
  rated?: boolean;
  tempRating?: number;
  productId?: string;
  producerId?: string;
}

interface RecommendedProduct {
  id: string;
  name: string;
  producer: string;
  price: number;
  rating: number;
  image: string;
  certified: boolean;
  category?: string;
  unit?: string;
  stock?: number;
}

@Component({
  selector: 'app-buyer-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, ChatbotVoiceComponent, AGCBalanceWidgetComponent, AGCPurchaseComponent],
  templateUrl: './buyer-dashboard.html',
  styleUrls: ['./buyer-dashboard.css'],
})
export class BuyerDashboardComponent implements OnInit, OnDestroy {
  userData: any;
  stats: DashboardStat[] = [];
  recentPurchases: RecentPurchase[] = [];
  recommendedProducts: RecommendedProduct[] = [];

  categories = [
    { name: 'Légumes', icon: '🥦', count: 0 },
    { name: 'Fruits', icon: '🍎', count: 0 },
    { name: 'Céréales', icon: '🌾', count: 0 },
    { name: 'Épicerie', icon: '🛒', count: 0 },
  ];

  isDashboardLoading = true;
  searchTerm = '';

  // 🔔 Notifications
  notifications: AppNotification[] = [];
  unreadCount = 0;
  showNotifications = false;
  private notifSub: Subscription | undefined;

  // 💰 AGC
  agcBalance: number = 0;
  showAGCPurchaseModal = false;
  private agcSub: Subscription | undefined;

  // Données dynamiques
  allProducts: Product[] = [];
  allProducers: any[] = [];
  isLoadingProducts = false;
  allPurchases: RecentPurchase[] = [];

  // Données utilisateur
  userName = '';
  userInitials = '';

  constructor(
    private authService: AuthService,
    private firebaseService: FirebaseService,
    private notificationService: NotificationService,
    private agcService: AGCService,
  ) {}

  async ngOnInit() {
    this.userData = this.authService.getUserData();
    this.userName = this.userData?.fullName || 'Utilisateur';
    this.userInitials = this.getInitials(this.userName);

    // Écouter les notifications
    this.notifSub = this.notificationService
      .listenUserNotifications()
      .subscribe((notifs) => {
        this.notifications = notifs;
        this.unreadCount = notifs.filter((n) => !n.read).length;
      });

    // Écouter le solde AGC
    this.agcSub = this.agcService.balance$.subscribe((balance) => {
      this.agcBalance = balance;
    });

    await this.loadDashboardData();
  }

  ngOnDestroy() {
    if (this.notifSub) {
      this.notifSub.unsubscribe();
    }
    if (this.agcSub) {
      this.agcSub.unsubscribe();
    }
  }

  toggleNotifications() {
    this.showNotifications = !this.showNotifications;
  }

  async openNotification(notification: any) {
    if (!notification.read && notification.id) {
      await this.notificationService.markAsRead(notification.id);
    }
    this.showNotifications = false;
  }

  // ==================== AGC ====================
  openAGCPurchase() {
    this.showAGCPurchaseModal = true;
  }

  closeAGCPurchaseModal() {
    this.showAGCPurchaseModal = false;
  }

  onAGCPurchased() {
    // Rafraîchir le solde après achat
    this.agcService.refreshBalance();
  }

  // ==================== DASHBOARD ====================
  async loadDashboardData() {
    try {
      await Promise.all([
        this.loadRealProducts(),
        this.loadProducers(),
        this.loadRecentPurchases(),
      ]);

      this.updateRecommendedProducts();
      this.computeStats();
    } catch (error) {
      console.error('Erreur chargement dashboard:', error);
    } finally {
      this.isDashboardLoading = false;
    }
  }

  async loadRecentPurchases() {
    const purchases = await this.firebaseService.getBuyerSales();
    const ratings = await this.firebaseService.getMyRatings();

    this.allPurchases = purchases.map((p) => {
      const rating = ratings.find((r) => r.productId === p.productId);
      return {
        ...p,
        rated: !!rating,
        ratingValue: rating?.stars || 0,
      };
    });

    this.recentPurchases = this.allPurchases.slice(0, 5);
  }

  private computeStats() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const purchasesThisMonth = this.allPurchases.filter((p) => {
      const d = new Date(p.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    const totalSpent = this.allPurchases.reduce(
      (sum, p) => sum + (p.amount || 0),
      0,
    );

    const certifiedCount = this.allPurchases.filter((p) => p.certified).length;

    this.stats = [
      {
        label: 'Achats ce mois',
        value: purchasesThisMonth.length,
        icon: '🛍️',
        color: '#2196F3',
        link: '/buyer/purchases',
      },
      {
        label: 'Dépenses totales',
        value: totalSpent.toLocaleString() + ' FCFA',
        icon: '💰',
        color: '#4CAF50',
      },
      {
        label: 'Certifications vérifiées',
        value: certifiedCount,
        icon: '✅',
        color: '#FF9800',
      },
      {
        label: 'Vendeurs favoris',
        value: 0,
        icon: '❤️',
        color: '#E91E63',
      },
    ];
  }

  async loadRealProducts() {
    this.isLoadingProducts = true;

    try {
      const products = await this.firebaseService.getAllAvailableProducts();

      this.allProducts = products.map((p) => ({
        ...p,
        rating: p.rating ?? 0,
        certifications: p.certifications ?? [],
        images: p.images ?? [],
        badges: p.badges ?? [],
      }));

      this.updateCategoryCounts();
    } catch (e) {
      console.error('Erreur produits Firestore', e);
      this.allProducts = [];
    } finally {
      this.isLoadingProducts = false;
    }
  }

  selectRating(purchase: any, stars: number) {
    purchase.tempRating = stars;
  }

  async confirmRating(purchase: any) {
    if (!purchase.tempRating) return;

    await this.firebaseService.submitRating({
      productId: purchase.productId,
      producerId: purchase.producerId,
      stars: purchase.tempRating,
      buyerId: '',
    });

    purchase.ratingValue = purchase.tempRating;
    purchase.rated = true;
    purchase.tempRating = null;
  }

  async loadProducers() {
    try {
      if (this.firebaseService.getProducers) {
        this.allProducers = await this.firebaseService.getProducers();
        console.log(`👨‍🌾 ${this.allProducers.length} producteurs chargés`);
      } else {
        this.extractProducersFromProducts();
      }
    } catch (error) {
      console.error('Erreur chargement producteurs:', error);
      this.extractProducersFromProducts();
    }
  }

  private extractProducersFromProducts() {
    const producers = new Set<string>();
    this.allProducts.forEach((product) => {
      if (product.producerName) {
        producers.add(product.producerName);
      }
    });

    this.allProducers = Array.from(producers).map((name) => ({
      name: name,
      productCount: this.allProducts.filter((p) => p.producerName === name)
        .length,
    }));

    console.log(
      `👨‍🌾 ${this.allProducers.length} producteurs extraits des produits`,
    );
  }

  private updateCategoryCounts() {
    this.categories.forEach((cat) => (cat.count = 0));

    this.allProducts.forEach((product) => {
      const category = product.category?.toLowerCase();

      if (category) {
        if (category.includes('fruit')) {
          this.categories.find((c) => c.name === 'Fruits')!.count++;
        } else if (
          category.includes('légume') ||
          category.includes('vegetable')
        ) {
          this.categories.find((c) => c.name === 'Légumes')!.count++;
        } else if (
          category.includes('céréale') ||
          category.includes('cereal')
        ) {
          this.categories.find((c) => c.name === 'Céréales')!.count++;
        } else {
          this.categories.find((c) => c.name === 'Épicerie')!.count++;
        }
      }
    });
  }

  private updateRecommendedProducts() {
    this.recommendedProducts = this.allProducts.slice(0, 4).map((p) => ({
      id: p.id!,
      name: p.name,
      producer: p.producerName,
      price: p.price,
      rating: p.rating ?? 0,
      image: this.getProductEmoji(p.name),
      certified: (p.certifications?.length ?? 0) > 0,
      category: p.category,
      unit: p.unit,
      stock: p.quantity,
    }));
  }

  // ==================== UTILITAIRES ====================
  getProductEmoji(productName: string): string {
    const lowerName = productName.toLowerCase();

    if (lowerName.includes('mangue')) return '🥭';
    if (lowerName.includes('tomate')) return '🍅';
    if (lowerName.includes('carotte')) return '🥕';
    if (lowerName.includes('orange')) return '🍊';
    if (lowerName.includes('pastèque')) return '🍉';
    if (lowerName.includes('banane')) return '🍌';
    if (lowerName.includes('oignon')) return '🧅';
    if (lowerName.includes('riz')) return '🌾';
    if (lowerName.includes('maïs')) return '🌽';
    if (lowerName.includes('niébé')) return '🥜';

    return '🌱';
  }

  formatPrice(price: number): string {
    return price.toLocaleString() + ' FCFA';
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'delivered':
        return '#4CAF50';
      case 'shipping':
        return '#2196F3';
      case 'pending':
        return '#FF9800';
      default:
        return '#9E9E9E';
    }
  }

  getStatusText(status: string): string {
    switch (status) {
      case 'delivered':
        return 'Livré';
      case 'shipping':
        return 'En cours';
      case 'pending':
        return 'En attente';
      default:
        return status;
    }
  }

  async ratePurchase(purchase: any, stars: number) {
    await this.firebaseService.submitRating({
      productId: purchase.productId ?? '',
      producerId: purchase.producerId ?? '',
      stars,
      buyerId: '',
    });

    purchase.rated = true;
    purchase.ratingValue = stars;
  }

  async rate(purchase: RecentPurchase, stars: number) {
    if (purchase.status !== 'delivered') return;
    if (purchase.rated) return;

    const user = this.authService.getUserData();

    if (!user || !user.uid) {
      alert('Utilisateur non connecté');
      return;
    }

    await this.firebaseService.submitRating({
      productId: purchase.productId!,
      producerId: purchase.producerId!,
      stars,
      buyerId: user.uid,
    });

    purchase.rated = true;
    purchase.ratingValue = stars;
  }

  starsArray(): number[] {
    return [1, 2, 3, 4, 5];
  }

  async enrichProductsWithRatings() {
    for (const product of this.allProducts) {
      if (!product.id) continue;

      const avgRating = await this.firebaseService.getAverageRatingForProduct(
        product.id,
      );

      product.rating = avgRating ?? 0;
    }
  }

  // ==================== RECHERCHE ====================
  onSearch() {
    console.log('Recherche:', this.searchTerm);
  }

  private getInitials(name: string): string {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
}
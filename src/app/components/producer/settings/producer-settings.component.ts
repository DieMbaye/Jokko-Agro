import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Auth, user, signOut } from '@angular/fire/auth';
import {
  Firestore,
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
  doc,
} from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-producer-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './producer-settings.component.html',
  styleUrls: ['./producer-settings.component.css']
})
export class ProducerSettingsComponent implements OnInit {
  activeSection: 'overview' | 'profile' | 'farm' | 'banking' | 'security' | 'products' | 'certifications' = 'overview';
  loading = true;
  saving = false;
  saveSuccess = false;

  // Données du producteur
  producerData: any = {
    fullName: 'Jean Dupont Agriculteur',
    email: '',
    phone: '+33 6 12 34 56 78',
    farmName: 'Ferme Bio du Soleil',
    farmAddress: '123 Route des Champs',
    farmCity: 'Lyon',
    farmPostalCode: '69000',
    farmSize: 25, // hectares
    farmType: 'agriculture-bio',
    farmDescription: 'Producteur bio spécialisé en légumes de saison',
    avatar: '👨‍🌾',
    joinDate: '2023-03-15',
    verified: true,
    subscription: 'premium'
  };

  // Informations bancaires
  bankingInfo = {
    bankName: 'Banque Agricole',
    accountHolder: 'Jean Dupont',
    iban: 'FR76 3000 4000 0100 1234 5678 900',
    bic: 'AGRIFRPP'
  };

  // Paramètres de sécurité
  security = {
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    twoFactorEnabled: true
  };

  // Statistiques producteur
  stats = {
    totalProducts: 12,
    activeProducts: 8,
    totalSales: 156,
    monthlyRevenue: 4850,
    averageRating: 4.7,
    pendingOrders: 3,
    completedCertifications: 2
  };

  // Produits récents
  recentProducts: any[] = [];

  // Certifications
  certifications: any[] = [];

  // Notifications
  notifications: any[] = [];
  unreadCount = 0;

  // Historique d'activité
  activityHistory: any[] = [];

  // Types d'exploitation
  farmTypes = [
    { id: 'agriculture-bio', label: 'Agriculture Biologique' },
    { id: 'permaculture', label: 'Permaculture' },
    { id: 'elevage-bio', label: 'Élevage Bio' },
    { id: 'maraichage', label: 'Maraîchage' },
    { id: 'viticulture', label: 'Viticulture' },
    { id: 'arboriculture', label: 'Arboriculture' }
  ];

  constructor(
    private auth: Auth,
    private firestore: Firestore,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadProducerData();
  }

  get hasLowStock(): boolean {
  return this.recentProducts?.some(p => p.stock > 0 && p.stock <= 5);
}

get hasOutOfStock(): boolean {
  return this.recentProducts?.some(p => p.stock === 0);
}

get allStockOk(): boolean {
  return (
    this.recentProducts?.length > 0 &&
    this.recentProducts.every(p => p.stock > 10)
  );
}

get lowStockCount(): number {
  return this.recentProducts.filter(p => p.stock > 0 && p.stock <= 5).length;
}

get outOfStockCount(): number {
  return this.recentProducts.filter(p => p.stock === 0).length;
}

  async loadProducerData(): Promise<void> {
  user(this.auth).subscribe(u => {
    if (!u) return;

    const userRef = doc(this.firestore, 'users', u.uid);

    onSnapshot(userRef, snap => {
      if (!snap.exists()) return;

      const data = snap.data();

      this.producerData = {
        fullName: data['fullName'],
        email: data['email'],
        phone: data['phone'] || '',
        farmName: data['farmName'] || '',
        farmAddress: data['farmAddress'] || '',
        farmCity: data['farmCity'] || '',
        farmPostalCode: data['farmPostalCode'] || '',
        farmSize: data['farmSize'] || 0,
        farmType: data['farmType'] || '',
        farmDescription: data['farmDescription'] || '',
        avatar: data['avatar'] || '👨‍🌾',
        joinDate: data['createdAt']?.toDate(),
        verified: data['verified'] || false,
        subscription: data['subscription'] || 'basic'
      };

      this.loadProducts(u.uid);
      this.loadNotifications(u.uid);

      this.loading = false;
    });
  });
}
loadNotifications(userId: string) {
  const q = query(
    collection(this.firestore, 'notifications'),
    where('userId', '==', userId)
  );

  onSnapshot(q, snap => {
    this.notifications = snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      time: d.data()['createdAt']?.toDate().toLocaleString()
    }));

    this.unreadCount = this.notifications.filter(n => !n.read).length;
  });
}


loadProducts(producerId: string) {
  const q = query(
    collection(this.firestore, 'products'),
    where('producerId', '==', producerId)
  );

  onSnapshot(q, snap => {
    this.recentProducts = snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));

    // 🔢 stats dynamiques
    this.stats.totalProducts = this.recentProducts.length;
    this.stats.activeProducts = this.recentProducts.filter(p => p.stock > 0).length;
  });
}

  async saveProfile(): Promise<void> {
    this.saving = true;
    setTimeout(() => {
      this.saving = false;
      this.saveSuccess = true;
      setTimeout(() => this.saveSuccess = false, 3000);
    }, 1500);
  }

  async saveFarmInfo(): Promise<void> {
    this.saving = true;
    setTimeout(() => {
      this.saving = false;
      this.saveSuccess = true;
      setTimeout(() => this.saveSuccess = false, 3000);
    }, 1500);
  }

  async updateBankingInfo(): Promise<void> {
    this.saving = true;
    setTimeout(() => {
      this.saving = false;
      this.saveSuccess = true;
      setTimeout(() => this.saveSuccess = false, 3000);
    }, 1500);
  }

  async updateSecurity(): Promise<void> {
    if (this.security.newPassword !== this.security.confirmPassword) {
      alert('Les mots de passe ne correspondent pas');
      return;
    }

    this.saving = true;
    setTimeout(() => {
      this.saving = false;
      this.saveSuccess = true;
      this.security = {
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
        twoFactorEnabled: this.security.twoFactorEnabled
      };
      setTimeout(() => this.saveSuccess = false, 3000);
    }, 1500);
  }

  markAsRead(notification: any): void {
    notification.read = true;
    this.unreadCount = this.notifications.filter(n => !n.read).length;
  }

  markAllAsRead(): void {
    this.notifications.forEach(n => n.read = true);
    this.unreadCount = 0;
  }

  deleteNotification(id: string): void {
    this.notifications = this.notifications.filter(n => n.id !== id);
    this.unreadCount = this.notifications.filter(n => !n.read).length;
  }

  navigateTo(route: string): void {
    this.router.navigate([route]);
  }

  async logout(): Promise<void> {
    try {
      await signOut(this.auth);
      this.router.navigate(['/login']);
    } catch (error) {
      console.error('Erreur de déconnexion:', error);
    }
  }

  exportData(): void {
    alert('Vos données de producteur seront exportées par email');
  }

  deleteAccount(): void {
    if (confirm('Êtes-vous sûr de vouloir supprimer votre compte producteur ? Cette action est irréversible.')) {
      alert('La suppression du compte a été demandée');
    }
  }

  updateSubscription(plan: string): void {
    this.producerData.subscription = plan;
    alert(`Abonnement mis à jour vers le plan ${plan}`);
  }
}
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Auth, user, signOut } from '@angular/fire/auth';
import { ThemeService, ThemeMode } from '../../services/theme.service';
import { LanguageService, AppLanguage } from '../../services/language.service';
import { SalesService } from '../../services/sales.service';


import {
  Firestore,
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
  doc
} from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-buyer-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './buyer-settings.component.html',
  styleUrls: ['./buyer-settings.component.css']
})
export class BuyerSettingsComponent implements OnInit {
  activeSection: 'overview' | 'profile' | 'security' | 'notifications' | 'preferences' = 'overview';
  loading = true;
  saving = false;
  saveSuccess = false;
  

  // Données utilisateur
  userData: any = {
    fullName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    postalCode: '',
    avatar: '👤'
  };

  // Paramètres de sécurité
  security = {
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    twoFactorEnabled: false
  };

 preferences: {
  emailNotifications: boolean;
  pushNotifications: boolean;
  smsNotifications: boolean;
  newsletter: boolean;
  language: AppLanguage;
  theme: ThemeMode;
} = {
  emailNotifications: true,
  pushNotifications: true,
  smsNotifications: false,
  newsletter: true,
  language: 'fr',
  theme: 'light'
};

  // Statistiques
  stats = {
    totalOrders: 0,
    pendingOrders: 0,
    completedOrders: 0,
    favoriteProducts: 0
  };

  // Commandes récentes
  recentOrders: any[] = [];

  // Notifications
  notifications: any[] = [];
  unreadCount = 0;

  // Historique d'activité
  activityHistory: any[] = [];

 constructor(
  private auth: Auth,
  private firestore: Firestore,
  private router: Router,
  private salesService: SalesService, // 👈 AJOUT

  private themeService: ThemeService,
  private languageService: LanguageService
) {}


  ngOnInit(): void {
    this.loadUserData();
  }
async loadOrders(userId: string) {
  const orders = await this.salesService.getBuyerOrders(userId);

  // Stats
  this.stats.totalOrders = orders.length;
  this.stats.pendingOrders = orders.filter(o => o.status === 'pending').length;
  this.stats.completedOrders = orders.filter(o => o.status === 'completed').length;

  // Commandes récentes (5 max)
  this.recentOrders = orders.slice(0, 5).map(o => ({
    id: o.orderNumber,
    product: o.productName,
    date: o.orderDate.toLocaleDateString('fr-FR'),
    amount: o.totalAmount,
    status: o.status
  }));
}

 async loadUserData(): Promise<void> {
  user(this.auth).subscribe(u => {
    if (!u) return;

    const userRef = doc(this.firestore, 'users', u.uid);

    onSnapshot(userRef, snap => {
      if (!snap.exists()) return;
     this.loadOrders(u.uid);

      const data = snap.data();

      this.userData = {
        fullName: data['fullName'],
        email: data['email'],
        phone: data['phone'] || '',
        address: data['address'] || '',
        city: data['city'] || '',
        postalCode: data['postalCode'] || '',
        avatar: data['avatar'] || '👤',
        joinDate: data['createdAt']?.toDate(),
        verified: data['verified'] || false,

      };

      // Préférences
      if (data['preferences']) {
        this.preferences = { ...this.preferences, ...data['preferences'] };
      }

      this.loading = false;
    });
  });
}


 async saveProfile(): Promise<void> {
  this.saving = true;

  const u = this.auth.currentUser;
  if (!u) return;

  const userRef = doc(this.firestore, 'users', u.uid);

  await updateDoc(userRef, {
    fullName: this.userData.fullName,
    phone: this.userData.phone,
    address: this.userData.address,
    city: this.userData.city,
    postalCode: this.userData.postalCode
  });

  this.saving = false;
  this.saveSuccess = true;
  setTimeout(() => (this.saveSuccess = false), 3000);
}


  async updateSecurity(): Promise<void> {
    if (this.security.newPassword !== this.security.confirmPassword) {
      alert('Les mots de passe ne correspondent pas');
      return;
    }

    this.saving = true;
    // Simuler la mise à jour
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



async savePreferences(): Promise<void> {
  this.saving = true;

  const u = this.auth.currentUser;
  if (!u) return;

  await updateDoc(doc(this.firestore, 'users', u.uid), {
    preferences: this.preferences
  });

  // ✅ appliquer immédiatement
  this.themeService.applyTheme(this.preferences.theme);
  this.languageService.setLanguage(this.preferences.language);

  this.saving = false;
  this.saveSuccess = true;
  setTimeout(() => (this.saveSuccess = false), 3000);
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

  goToOrders(): void {
    this.router.navigate(['/buyer/tracking']);
  }

  goToFavorites(): void {
    this.router.navigate(['/buyer/favorites']);
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
    // Simuler l'export des données
    alert('Vos données seront exportées par email');
  }

  deleteAccount(): void {
    if (confirm('Êtes-vous sûr de vouloir supprimer votre compte ? Cette action est irréversible.')) {
      alert('La suppression du compte a été demandée');
    }
  }
}
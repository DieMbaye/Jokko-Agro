import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Auth, user, signOut } from '@angular/fire/auth';
import { ThemeService, ThemeMode } from '../../../services/theme.service';
import { LanguageService, AppLanguage } from '../../../services/language.service';
import { SalesService } from '../../../services/sales.service';
import {
  Firestore,
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
  doc,
  getDocs,
  addDoc
} from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-buyer-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './buyer-settings.component.html',
  styleUrls: ['./buyer-settings.component.css'],
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
    avatar: '👤',
    joinDate: new Date(),
    verified: false
  };

  // Paramètres de sécurité
  security = {
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    twoFactorEnabled: false
  };

  preferences = {
    emailNotifications: true,
    pushNotifications: true,
    smsNotifications: false,
    newsletter: true,
    language: 'fr' as AppLanguage,
    theme: 'light' as ThemeMode
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
    private salesService: SalesService,
    private themeService: ThemeService,
    private languageService: LanguageService
  ) {}

  ngOnInit(): void {
    this.loadUserData();
  }

  async loadUserData(): Promise<void> {
    user(this.auth).subscribe(async (u) => {
      if (!u) return;

      const userRef = doc(this.firestore, 'users', u.uid);

      onSnapshot(userRef, async (snap) => {
        if (!snap.exists()) return;

        const data = snap.data();

        this.userData = {
          fullName: data['fullName'] || '',
          email: data['email'] || '',
          phone: data['phone'] || '',
          address: data['address'] || '',
          city: data['city'] || '',
          postalCode: data['postalCode'] || '',
          avatar: data['avatar'] || '👤',
          joinDate: data['createdAt']?.toDate() || new Date(),
          verified: data['verified'] || false
        };

        // Charger les commandes
        await this.loadOrders(u.uid);

        // Charger les notifications
        this.loadNotifications(u.uid);

        // Charger l'historique d'activité
        this.loadActivityHistory(u.uid);

        // Charger les préférences
        if (data['preferences']) {
          this.preferences = { ...this.preferences, ...data['preferences'] };
        }

        this.loading = false;
      });
    });
  }

  async loadOrders(userId: string) {
    const orders = await this.salesService.getBuyerOrders(userId);

    // Stats
    this.stats.totalOrders = orders.length;
    this.stats.pendingOrders = orders.filter((o) => o.status === 'pending').length;
    this.stats.completedOrders = orders.filter((o) => o.status === 'completed').length;

    // Commandes récentes (5 max)
    this.recentOrders = orders.slice(0, 5).map((o) => ({
      id: o.orderNumber || o.id,
      product: o.productName || 'Produit',
      date: o.orderDate?.toLocaleDateString('fr-FR') || new Date().toLocaleDateString('fr-FR'),
      amount: o.totalAmount || 0,
      status: o.status || 'pending'
    }));
  }

  loadNotifications(userId: string) {
    const q = query(
      collection(this.firestore, 'notifications'),
      where('userId', '==', userId),
      where('read', '==', false)
    );

    onSnapshot(q, (snap) => {
      this.notifications = snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        time: this.formatTime(d.data()['createdAt']?.toDate()),
        read: d.data()['read'] || false,
        type: d.data()['type'] || 'general'
      }));
      this.unreadCount = this.notifications.length;
    });
  }

  loadActivityHistory(userId: string) {
    const q = query(
      collection(this.firestore, 'activity'),
      where('userId', '==', userId)
    );

    onSnapshot(q, (snap) => {
      this.activityHistory = snap.docs.map(d => ({
        action: d.data()['action'] || 'Activité',
        time: this.formatTime(d.data()['timestamp']?.toDate()),
        ip: d.data()['ip'] || 'N/A'
      })).slice(0, 5);
    });
  }

  formatTime(date: Date): string {
    if (!date) return '';

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) {
      return `Il y a ${diffMins} min`;
    } else if (diffHours < 24) {
      return `Il y a ${diffHours} h`;
    } else if (diffDays < 7) {
      return `Il y a ${diffDays} jour${diffDays > 1 ? 's' : ''}`;
    } else {
      return date.toLocaleDateString('fr-FR');
    }
  }

  async saveProfile(): Promise<void> {
    this.saving = true;
    try {
      const user = await this.auth.currentUser;
      if (!user) return;

      const userRef = doc(this.firestore, 'users', user.uid);
      await updateDoc(userRef, {
        fullName: this.userData.fullName,
        phone: this.userData.phone,
        address: this.userData.address,
        city: this.userData.city,
        postalCode: this.userData.postalCode,
        updatedAt: new Date()
      });

      this.saveSuccess = true;
      setTimeout(() => this.saveSuccess = false, 3000);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde du profil:', error);
      alert('Erreur lors de la sauvegarde');
    } finally {
      this.saving = false;
    }
  }

  async updateSecurity(): Promise<void> {
    if (this.security.newPassword !== this.security.confirmPassword) {
      alert('Les mots de passe ne correspondent pas');
      return;
    }

    this.saving = true;
    try {
      const user = await this.auth.currentUser;
      if (!user) return;

      // Mettre à jour le mot de passe via Firebase Auth
      // Note: Nécessite une re-authentification pour updatePassword
      // Cette partie devrait être implémentée avec une logique de re-authentification

      // Mettre à jour les préférences 2FA
      const userRef = doc(this.firestore, 'users', user.uid);
      await updateDoc(userRef, {
        twoFactorEnabled: this.security.twoFactorEnabled,
        updatedAt: new Date()
      });

      this.saveSuccess = true;
      this.security = {
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
        twoFactorEnabled: this.security.twoFactorEnabled
      };
      setTimeout(() => this.saveSuccess = false, 3000);
    } catch (error) {
      console.error('Erreur lors de la mise à jour de la sécurité:', error);
      alert('Erreur lors de la mise à jour');
    } finally {
      this.saving = false;
    }
  }

  async savePreferences(): Promise<void> {
    this.saving = true;
    try {
      const user = await this.auth.currentUser;
      if (!user) return;

      const userRef = doc(this.firestore, 'users', user.uid);
      await updateDoc(userRef, {
        preferences: this.preferences,
        updatedAt: new Date()
      });

      // Appliquer immédiatement
      this.themeService.applyTheme(this.preferences.theme);
      this.languageService.setLanguage(this.preferences.language);

      this.saveSuccess = true;
      setTimeout(() => this.saveSuccess = false, 3000);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde des préférences:', error);
      alert('Erreur lors de la sauvegarde');
    } finally {
      this.saving = false;
    }
  }

  markAllAsRead(): void {
    try {
      this.notifications.forEach(async notification => {
        const notifRef = doc(this.firestore, 'notifications', notification.id);
        await updateDoc(notifRef, { read: true });
      });

      this.notifications.forEach(n => n.read = true);
      this.unreadCount = 0;
    } catch (error) {
      console.error('Erreur lors du marquage des notifications:', error);
    }
  }

  deleteNotification(id: string): void {
    try {
      const notifRef = doc(this.firestore, 'notifications', id);
      // Note: Vous pourriez vouloir soft delete plutôt que hard delete
      this.notifications = this.notifications.filter(n => n.id !== id);
      this.unreadCount = this.notifications.filter(n => !n.read).length;
    } catch (error) {
      console.error('Erreur lors de la suppression de la notification:', error);
    }
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
      alert('Erreur lors de la déconnexion');
    }
  }

  exportData(): void {
    const data = {
      userData: this.userData,
      orders: this.recentOrders,
      preferences: this.preferences,
      exportDate: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `export-acheteur-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  deleteAccount(): void {
    if (confirm('Êtes-vous sûr de vouloir supprimer votre compte ? Cette action est irréversible.')) {
      alert('Cette fonctionnalité est en cours de développement');
    }
  }
}

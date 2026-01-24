import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Auth, user, signOut, updatePassword } from '@angular/fire/auth';
import {
  Firestore,
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
  doc,
  getDocs,
  addDoc,
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
  activeSection: 'overview' | 'profile' | 'farm' | 'banking' | 'security' = 'overview';
  loading = true;
  saving = false;
  saveSuccess = false;

  // Données du producteur
  producerData: any = {
    fullName: '',
    email: '',
    phone: '',
    farmName: '',
    farmAddress: '',
    farmCity: '',
    farmPostalCode: '',
    farmSize: 0,
    farmType: '',
    farmDescription: '',
    avatar: '👨‍🌾',
    joinDate: new Date(),
    verified: false,
    subscription: 'basic'
  };

  // Informations bancaires
  bankingInfo = {
    bankName: '',
    accountHolder: '',
    iban: '',
    bic: ''
  };

  // Paramètres de sécurité
  security = {
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    twoFactorEnabled: false
  };

  // Produits récents
  recentProducts: any[] = [];

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
          fullName: data['fullName'] || '',
          email: data['email'] || '',
          phone: data['phone'] || '',
          farmName: data['farmName'] || '',
          farmAddress: data['farmAddress'] || '',
          farmCity: data['farmCity'] || '',
          farmPostalCode: data['farmPostalCode'] || '',
          farmSize: data['farmSize'] || 0,
          farmType: data['farmType'] || '',
          farmDescription: data['farmDescription'] || '',
          avatar: data['avatar'] || '👨‍🌾',
          joinDate: data['createdAt']?.toDate() || new Date(),
          verified: data['verified'] || false,
          subscription: data['subscription'] || 'basic'
        };

        // Charger les produits
        this.loadProducts(u.uid);

        // Charger les notifications
        this.loadNotifications(u.uid);

        // Charger les informations bancaires
        this.loadBankingInfo(u.uid);

        // Charger l'historique d'activité
        this.loadActivityHistory(u.uid);

        this.loading = false;
      });
    });
  }

  loadProducts(producerId: string) {
    const q = query(
      collection(this.firestore, 'products'),
      where('producerId', '==', producerId),
      where('active', '==', true)
    );

    onSnapshot(q, snap => {
      this.recentProducts = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      })).slice(0, 4); // Limiter à 4 produits
    });
  }

  loadNotifications(userId: string) {
    const q = query(
      collection(this.firestore, 'notifications'),
      where('userId', '==', userId),
      where('read', '==', false)
    );

    onSnapshot(q, snap => {
      this.notifications = snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        time: this.formatTime(d.data()['createdAt']?.toDate())
      }));
      this.unreadCount = this.notifications.length;
    });
  }

  loadBankingInfo(userId: string) {
    const q = query(
      collection(this.firestore, 'banking'),
      where('userId', '==', userId)
    );

    onSnapshot(q, snap => {
      if (!snap.empty) {
        const data = snap.docs[0].data();
        this.bankingInfo = {
          bankName: data['bankName'] || '',
          accountHolder: data['accountHolder'] || '',
          iban: data['iban'] || '',
          bic: data['bic'] || ''
        };
      }
    });
  }

  loadActivityHistory(userId: string) {
    const q = query(
      collection(this.firestore, 'activity'),
      where('userId', '==', userId)
    );

    onSnapshot(q, snap => {
      this.activityHistory = snap.docs.map(d => ({
        action: d.data()['action'] || '',
        time: this.formatTime(d.data()['timestamp']?.toDate()),
        details: d.data()['details'] || ''
      })).slice(0, 5); // Limiter à 5 activités
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
        fullName: this.producerData.fullName,
        phone: this.producerData.phone,
        farmDescription: this.producerData.farmDescription,
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

  async saveFarmInfo(): Promise<void> {
    this.saving = true;
    try {
      const user = await this.auth.currentUser;
      if (!user) return;

      const userRef = doc(this.firestore, 'users', user.uid);
      await updateDoc(userRef, {
        farmName: this.producerData.farmName,
        farmType: this.producerData.farmType,
        farmSize: this.producerData.farmSize,
        farmAddress: this.producerData.farmAddress,
        farmCity: this.producerData.farmCity,
        farmPostalCode: this.producerData.farmPostalCode,
        updatedAt: new Date()
      });

      this.saveSuccess = true;
      setTimeout(() => this.saveSuccess = false, 3000);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde de l\'exploitation:', error);
      alert('Erreur lors de la sauvegarde');
    } finally {
      this.saving = false;
    }
  }

  async updateBankingInfo(): Promise<void> {
    this.saving = true;
    try {
      const user = await this.auth.currentUser;
      if (!user) return;

      const bankingQuery = query(
        collection(this.firestore, 'banking'),
        where('userId', '==', user.uid)
      );

      const snapshot = await getDocs(bankingQuery);

      if (!snapshot.empty) {
        // Mettre à jour l'existant
        const docRef = doc(this.firestore, 'banking', snapshot.docs[0].id);
        await updateDoc(docRef, this.bankingInfo);
      } else {
        // Créer un nouveau document
        await addDoc(collection(this.firestore, 'banking'), {
          ...this.bankingInfo,
          userId: user.uid,
          createdAt: new Date()
        });
      }

      this.saveSuccess = true;
      setTimeout(() => this.saveSuccess = false, 3000);
    } catch (error) {
      console.error('Erreur lors de la mise à jour des informations bancaires:', error);
      alert('Erreur lors de la mise à jour');
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
      await updatePassword(user, this.security.newPassword);

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

  navigateTo(route: string): void {
    this.router.navigate([route]);
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
      producerData: this.producerData,
      bankingInfo: this.bankingInfo,
      recentProducts: this.recentProducts,
      exportDate: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `export-producteur-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  deleteAccount(): void {
    if (confirm('Êtes-vous sûr de vouloir supprimer votre compte producteur ? Cette action est irréversible.')) {
      alert('Cette fonctionnalité est en cours de développement');
    }
  }
}


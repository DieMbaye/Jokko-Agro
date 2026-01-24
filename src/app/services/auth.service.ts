import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FirebaseService, FirebaseUserData } from './firebase.service';
import { UserData } from '../interfaces/data.interfaces';
import { getAuth } from 'firebase/auth';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  updateUserData(userData: FirebaseUserData) {
    throw new Error('Method not implemented.');
  }
  private firebaseService = inject(FirebaseService);
  private router = inject(Router);

  constructor() {
    // Vérifier l'état de chargement au démarrage
    this.firebaseService.isLoading = false;
  }

  async register(userData: any) {
    const result = await this.firebaseService.register(userData);

    if (result.success) {
      this.router.navigate(['/select-role']);
    }

    return result;
  }

  async login(email: string, password: string) {
    const result = await this.firebaseService.login(email, password);

    if (result.success) {
      // Attendre que les données utilisateur soient chargées
      await this.waitForUserData();

      const role = this.firebaseService.getUserRole();
      if (role === 'producer') {
        this.router.navigate(['/producer/dashboard']);
      } else if (role === 'buyer') {
        this.router.navigate(['/buyer/dashboard']);
      } else {
        this.router.navigate(['/select-role']);
      }
    }

    return result;
  }

  async logout() {
    try {
      // Nettoyer le cache avant de déconnecter
      this.firebaseService.clearCache();

      await this.firebaseService.logout();
      this.router.navigate(['/login']);
    } catch (error) {
      // Rediriger quand même vers login en cas d'erreur
      this.router.navigate(['/login']);
    }
  }

  // Dans auth.service.ts
  // Modifiez la méthode isAuthenticated :
  isAuthenticated(): boolean {
    // ✅ Attendre que l'initialisation soit complète
    if (this.firebaseService.isLoading) {
      return false;
    }

    const firebaseUser = this.firebaseService.getCurrentAuthUser();
    const hasUserData = !!this.firebaseService.userData;

    // ✅ Vérifier la cohérence entre Firebase et userData
    if (firebaseUser && !hasUserData) {
      console.warn('⚠️ Firebase user existe mais userData est null');
      return false;
    }

    // ✅ L'utilisateur est authentifié s'il existe dans Firebase ET qu'on a ses données
    return !!firebaseUser && hasUserData;
  }
  getUserRole(): 'producer' | 'buyer' | null {
    return this.firebaseService.getUserRole();
  }

  getCurrentUser() {
    return this.firebaseService.currentUser;
  }

  getUserData() {
    return this.firebaseService.userData;
  }

  async updateUserRole(role: 'producer' | 'buyer') {
    const user = this.firebaseService.currentUser;
    if (!user) throw new Error('Aucun utilisateur connecté');

    await this.firebaseService.updateUserRole(user.uid, role);
  }

  isInitializing(): boolean {
    return this.firebaseService.isLoading;
  }

  // Attendre que les données utilisateur soient chargées
  private async waitForUserData(): Promise<void> {
    return new Promise((resolve) => {
      const checkData = () => {
        if (this.firebaseService.userData !== null) {
          resolve();
        } else {
          setTimeout(checkData, 100);
        }
      };
      checkData();
    });
  }
  isLoading = true;
}

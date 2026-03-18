import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FirebaseService, FirebaseUserData } from './firebase.service';
import { UserKeysService } from 'src/secure/services/user-keys.service';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private firebaseService = inject(FirebaseService);
  private router = inject(Router);
  private userKeysService = inject(UserKeysService); // ✅ AJOUT

  updateUserData(userData: FirebaseUserData) {
    throw new Error('Method not implemented.');
  }

  async register(userData: any) {
    const result = await this.firebaseService.register(userData);

    if (result.success) {
      // ✅ Générer les clés ECDSA après inscription
      const user = this.getUserData();
      if (user) {
        await this.userKeysService.generateAndSaveUserKeys(user.uid);
      }
      this.router.navigate(['/select-role']);
    }

    return result;
  }

  async login(email: string, password: string) {
    const result = await this.firebaseService.login(email, password);

    if (result.success) {
      await this.waitForUserData();

      const user = this.getUserData(); // ✅ Récupérer l'utilisateur

      // ✅ Générer les clés ECDSA si elles n'existent pas
      if (user) {
        const publicKey = await this.userKeysService.getPublicKey(user.uid);
        if (!publicKey) {
          // Première connexion : générer les clés
          await this.userKeysService.generateAndSaveUserKeys(user.uid);
        } else {
          // ✅ CORRECTION: Utiliser getPrivateKey au lieu de restorePrivateKey
          // La clé privée est automatiquement chargée en session par le service
          console.log('🔑 Clés existantes trouvées pour', user.email);
        }
      }

      const role = this.getUserRole();
      await new Promise(resolve => setTimeout(resolve, 300));

      if (role === 'producer') {
        await this.router.navigate(['/producer/dashboard']);
      } else if (role === 'buyer') {
        await this.router.navigate(['/buyer/dashboard']);
      } else {
        await this.router.navigate(['/select-role']);
      }
    }

    return result;
  }

  async logout() {
    try {
      // ✅ Nettoyer les clés de la session
      const user = this.getUserData();
      if (user) {
        sessionStorage.removeItem(`private_key_${user.uid}`);
      }

      this.firebaseService.clearCache();
      await this.firebaseService.logout();
      await this.router.navigate(['/login']);
    } catch (error) {
      await this.router.navigate(['/login']);
    }
  }

  isAuthenticated(): boolean {
    const firebaseUser = this.firebaseService.getCurrentAuthUser();
    const hasUserData = !!this.firebaseService.userData;
    return !!(firebaseUser && hasUserData);
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

  checkAuthConsistency(): boolean {
    const firebaseUser = this.firebaseService.getCurrentAuthUser();
    const authUser = this.firebaseService.authInstance.currentUser;
    const hasUserData = !!this.firebaseService.userData;

    const isConsistent =
      (!firebaseUser && !authUser && !hasUserData) ||
      (firebaseUser && authUser && firebaseUser.uid === authUser.uid && hasUserData);

    if (!isConsistent) {
      this.tryRecoverAuthState();
    }

    return isConsistent || false;
  }

  private async waitForUserData(): Promise<void> {
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 50;

      const checkData = () => {
        attempts++;
        const hasUserData = !!this.firebaseService.userData;

        if (hasUserData || attempts >= maxAttempts) {
          resolve();
        } else {
          setTimeout(checkData, 100);
        }
      };

      checkData();
    });
  }

  private async tryRecoverAuthState(): Promise<void> {
    const authUser = this.firebaseService.authInstance.currentUser;
    if (authUser) {
      await this.firebaseService.loadUserData(authUser.uid);

      // ✅ Après récupération, on vérifie les clés
      const user = this.getUserData();
      if (user) {
        const publicKey = await this.userKeysService.getPublicKey(user.uid);
        if (publicKey) {
          console.log('🔑 Clés restaurées pour', user.email);
        }
      }
    } else {
      this.firebaseService.userData = null;
      localStorage.removeItem('userData');
    }
  }
}

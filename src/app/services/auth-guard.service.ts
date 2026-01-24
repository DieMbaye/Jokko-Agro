// auth-guard.service.ts
import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';
import { FirebaseService } from './firebase.service';

/**
 * 🔐 Guard général avec attente de l'initialisation Firebase
 */
export const authGuard: CanActivateFn = async (route, state) => {
  const authService = inject(AuthService);
  const firebaseService = inject(FirebaseService);
  const router = inject(Router);

  const targetUrl = state.url;


  // ✅ Attendre que Firebase soit COMPLÈTEMENT initialisé
  await waitForFirebaseInitialization(firebaseService);

  // 🔥 CRITIQUE : Vérifier l'état actuel
  const isAuthenticated = authService.isAuthenticated();
  const userRole = authService.getUserRole();



  // ✅ Utilisateur connecté MAIS sur page publique
  if (isAuthenticated && ['/', '/login', '/register', '/select-role'].includes(targetUrl)) {

    if (userRole === 'producer') {
      router.navigate(['/producer/dashboard']);
      return false;
    } else if (userRole === 'buyer') {
      router.navigate(['/buyer/dashboard']);
      return false;
    } else {
      router.navigate(['/select-role']);
      return false;
    }
  }

  // ❌ Utilisateur NON connecté mais essaie d'accéder à une page privée
  if (!isAuthenticated && !['/', '/login', '/register', '/select-role'].includes(targetUrl)) {
    router.navigate(['/login']);
    return false;
  }

  return true;
};

/**
 * 👨‍🌾 Guard PRODUCTEUR
 */
export const producerGuard: CanActivateFn = async (route, state) => {
  const authService = inject(AuthService);
  const firebaseService = inject(FirebaseService);
  const router = inject(Router);


  // ✅ Attendre que Firebase soit COMPLÈTEMENT initialisé
  await waitForFirebaseInitialization(firebaseService);

  // Vérifier l'authentification
  if (!authService.isAuthenticated()) {
    router.navigate(['/login']);
    return false;
  }

  // Vérifier le rôle
  const userRole = authService.getUserRole();
  if (userRole !== 'producer') {
    router.navigate(['/buyer/dashboard']);
    return false;
  }

  return true;
};

/**
 * 🛒 Guard ACHETEUR
 */
export const buyerGuard: CanActivateFn = async (route, state) => {
  const authService = inject(AuthService);
  const firebaseService = inject(FirebaseService);
  const router = inject(Router);


  // ✅ Attendre que Firebase soit COMPLÈTEMENT initialisé
  await waitForFirebaseInitialization(firebaseService);

  // Vérifier l'authentification
  if (!authService.isAuthenticated()) {
    router.navigate(['/login']);
    return false;
  }

  // Vérifier le rôle
  const userRole = authService.getUserRole();
  if (userRole !== 'buyer') {
    router.navigate(['/producer/dashboard']);
    return false;
  }

  return true;
};

/**
 * ⏱️ Fonction utilitaire pour attendre l'initialisation Firebase
 */
function waitForFirebaseInitialization(firebaseService: FirebaseService): Promise<void> {
  return new Promise((resolve) => {
    let attempts = 0;
    const maxAttempts = 150; // 15 secondes max

    const check = () => {
      attempts++;

      const isLoading = firebaseService.isLoading;
      const firebaseUser = firebaseService.getCurrentAuthUser();
      const hasUserData = !!firebaseService.userData;


      // ✅ Conditions d'arrêt IMPROVÉES :
      // 1. Firebase a terminé le chargement ET a un état définitif
      // 2. OU timeout max atteint
      const isFullyInitialized = !isLoading && (firebaseUser !== undefined);

      if (isFullyInitialized || attempts >= maxAttempts) {
        resolve();
      } else {
        setTimeout(check, 100);
      }
    };

    check();
  });
}

/**
 * 🔄 Guard pour la sélection de rôle (utilisateur connecté sans rôle)
 */
export const roleSelectionGuard: CanActivateFn = async (route, state) => {
  const authService = inject(AuthService);
  const firebaseService = inject(FirebaseService);
  const router = inject(Router);


  // ✅ Attendre que Firebase soit initialisé
  await waitForFirebaseInitialization(firebaseService);

  // Vérifier l'authentification
  if (!authService.isAuthenticated()) {
    router.navigate(['/login']);
    return false;
  }

  // Vérifier si l'utilisateur a déjà un rôle
  const userRole = authService.getUserRole();
  if (userRole === 'producer') {
    router.navigate(['/producer/dashboard']);
    return false;
  } else if (userRole === 'buyer') {
    router.navigate(['/buyer/dashboard']);
    return false;
  }

  return true;
};

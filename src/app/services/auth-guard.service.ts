import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';

// auth-guard.service.ts
export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const currentUrl = state.url;

  // ✅ AJOUT: Exclure /test-blockchain de la vérification d'authentification
  if (currentUrl === '/test-blockchain' || currentUrl.startsWith('/test-blockchain/')) {
    return true; // Laisser passer sans vérification
  }

  // Si Firebase est en cours de chargement, attendre
  if (authService.isInitializing()) {
    return false;
  }

  if (!authService.isAuthenticated()) {
    // Si sur une page publique, laisser passer
    const publicRoutes = ['/login', '/register', '/', '/select-role', '/test'];
    if (
      publicRoutes.some(
        (route) => currentUrl === route || currentUrl.startsWith(route + '/'),
      )
    ) {
      return true;
    }
    // Sinon rediriger vers login
    router.navigate(['/login']);
    return false;
  }

  // Si authentifié sur page publique, rediriger vers dashboard approprié
  const publicRoutes = ['/login', '/register', '/', '/select-role', '/test'];
  const isOnPublicRoute = publicRoutes.some(
    (route) => currentUrl === route || currentUrl.startsWith(route + '/'),
  );

  if (isOnPublicRoute) {
    const role = authService.getUserRole();
    if (role === 'producer') {
      router.navigate(['/producer/dashboard']);
    } else if (role === 'buyer') {
      router.navigate(['/buyer/dashboard']);
    } else {
      router.navigate(['/select-role']);
    }
    return false;
  }

  return true;
};

// auth-guard.service.ts
export const producerGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    router.navigate(['/login']);
    return false;
  }

  if (authService.getUserRole() !== 'producer') {
    // Rediriger vers la page d'erreur d'accès
    router.navigate(['/access-denied'], {
      state: {
        attemptedUrl: state.url,
        requiredRole: 'producteur',
        currentRole: authService.getUserRole(),
      },
    });
    return false;
  }

  return true;
};

export const buyerGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    router.navigate(['/login']);
    return false;
  }

  if (authService.getUserRole() !== 'buyer') {
    router.navigate(['/access-denied'], {
      state: {
        attemptedUrl: state.url,
        requiredRole: 'acheteur',
        currentRole: authService.getUserRole(),
      },
    });
    return false;
  }

  return true;
};

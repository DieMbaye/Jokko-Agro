import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * 🔐 Guard général (authentification)
 */
export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const targetUrl = state.url; // ✅ TOUJOURS utiliser state.url

  // ❌ Utilisateur NON connecté
  if (!authService.isAuthenticated()) {
    if (!['/', '/login', '/register'].includes(targetUrl)) {
      router.navigate(['/login']);
      return false;
    }
    return true;
  }

  // ✅ Utilisateur connecté MAIS sur page publique
  if (['/', '/login', '/register'].includes(targetUrl)) {
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

/**
 * 👨‍🌾 Guard PRODUCTEUR
 */
export const producerGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    router.navigate(['/login']);
    return false;
  }

  if (authService.getUserRole() !== 'producer') {
    router.navigate(['/buyer/dashboard']);
    return false;
  }

  return true;
};

/**
 * 🛒 Guard ACHETEUR
 */
export const buyerGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    router.navigate(['/login']);
    return false;
  }

  if (authService.getUserRole() !== 'buyer') {
    router.navigate(['/producer/dashboard']);
    return false;
  }

  return true;
};

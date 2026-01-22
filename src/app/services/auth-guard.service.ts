import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const currentUrl = router.url;



  // À ce stade, Firebase devrait être initialisé
  if (!authService.isAuthenticated()) {
    if (!['/login', '/register', '/'].includes(currentUrl)) {
      router.navigate(['/login']);
      return false;
    }
    return true;
  }

  // Si authentifié et sur login/register, rediriger
  if (['/login', '/register', '/'].includes(currentUrl)) {
    const role = authService.getUserRole();
    if (role === 'producer') {
      router.navigate(['/producer/dashboard']);
      return false;
    } else if (role === 'buyer') {
      router.navigate(['/buyer/dashboard']);
      return false;
    } else {
      router.navigate(['/select-role']);
      return false;
    }
  }

  return true;
};

export const producerGuard: CanActivateFn = () => {
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

export const buyerGuard: CanActivateFn = () => {
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
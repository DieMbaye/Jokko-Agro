// app.routes.ts
import { Routes } from '@angular/router';
import {
  authGuard,
  producerGuard,
  buyerGuard,
} from './services/auth-guard.service';

export const routes: Routes = [
  // Routes publiques
  {
    path: '',
    loadComponent: () =>
      import('./components/home-page/home-page').then(
        (m) => m.HomePageComponent,
      ),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./components/auth/login/login').then((m) => m.LoginComponent),
    canActivate: [authGuard],
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./components/auth/register/register').then(
        (m) => m.RegisterComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'test',
    loadComponent: () =>
      import('./components/test/ledger-test.component').then(
        (m) => m.LedgerTestComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'test-signature',
    loadComponent: () =>
      import('./components/test/signature-test.component').then(
        (m) => m.SignatureTestComponent,
      ),
    canActivate: [authGuard],
  },
  // Routes protégées - Sélection de rôle
  {
    path: 'select-role',
    loadComponent: () =>
      import('./components/role-selection/role-selection').then(
        (m) => m.RoleSelectionComponent,
      ),
    canActivate: [authGuard],
  },

  // ==================== ROUTES PRODUCTEUR ====================
  {
    path: 'producer/dashboard',
    loadComponent: () =>
      import('./components/producer/dashboard/producer-dashboard').then(
        (m) => m.ProducerDashboardComponent,
      ),
    canActivate: [producerGuard],
  },
    {
    path: 'producer/test-signature',
    loadComponent: () =>
      import('./components/test/signature-test.component').then(
        (m) => m.SignatureTestComponent,
      ),
    canActivate: [producerGuard],
  },
  {
    path: 'producer/test',
    loadComponent: () =>
      import('./components/test/ledger-test.component').then(
        (m) => m.LedgerTestComponent,
      ),
    canActivate: [producerGuard],
  },
  {
    path: 'producer/add-product',
    loadComponent: () =>
      import('./components/producer/add-product/add-product').then(
        (m) => m.AddProductComponent,
      ),
    canActivate: [producerGuard],
  },
  {
    path: 'producer/products',
    loadComponent: () =>
      import('./components/producer/products/products').then(
        (m) => m.ProductsComponent,
      ),
    canActivate: [producerGuard],
  },
  {
    path: 'producer/sales',
    loadComponent: () =>
      import('./components/producer/sales/sales').then((m) => m.SalesComponent),
    canActivate: [producerGuard],
  },
  {
    path: 'producer/messages',
    loadComponent: () =>
      import('./components/messages/messages').then((m) => m.MessagesComponent),
    canActivate: [producerGuard],
  },
  {
    path: 'producer/reputation',
    loadComponent: () =>
      import('./components/producer/reputation/reputation').then(
        (m) => m.ReputationComponent,
      ),
    canActivate: [producerGuard],
  },
  {
    path: 'producer/tracking',
    loadComponent: () =>
      import('./components/orders/order-tracking').then(
        (m) => m.OrderTrackingComponent,
      ),
    canActivate: [producerGuard],
  },

  {
    path: 'producer/settings',
    loadComponent: () =>
      import('./components/producer/settings/producer-settings.component').then(
        (m) => m.ProducerSettingsComponent,
      ),
    canActivate: [producerGuard],
  },
  {
    path: 'producer/certification/start',
    loadComponent: () =>
      import('./components/producer/certifs/certification-start/certification-start.component').then(
        (m) => m.CertificationStartComponent,
      ),
    canActivate: [producerGuard],
  },
  {
    path: 'producer/certification/:id',
    loadComponent: () =>
      import('./components/producer/certifs/certification-track/certification-track.component').then(
        (m) => m.CertificationTrackComponent,
      ),
    canActivate: [producerGuard],
  },
  {
    path: 'producer/certifications',
    loadComponent: () =>
      import('./components/producer/certifs/certifications-list/certifications-list.component').then(
        (m) => m.CertificationsListComponent,
      ),
    canActivate: [producerGuard],
  },

  // ==================== ROUTES PUBLIQUES ====================
  {
    path: 'verify/:id',
    loadComponent: () =>
      import('./components/verif/certification-verify/certification-verify.component').then(
        (m) => m.CertificationVerifyComponent,
      ),
  },

  // ==================== ROUTES ACHETEUR ====================
  {
    path: 'buyer/dashboard',
    loadComponent: () =>
      import('./components/buyer/dashboard/buyer-dashboard').then(
        (m) => m.BuyerDashboardComponent,
      ),
    canActivate: [buyerGuard],
  },
  {
    path: 'buyer/test',
    loadComponent: () =>
      import('./components/test/ledger-test.component').then(
        (m) => m.LedgerTestComponent,
      ),
    canActivate: [buyerGuard],
  },
  {
    path: 'buyer/test-signature',
    loadComponent: () =>
      import('./components/test/signature-test.component').then(
        (m) => m.SignatureTestComponent,
      ),
    canActivate: [buyerGuard],
  },

  {
    path: 'buyer/market',
    loadComponent: () =>
      import('./components/buyer/market/market').then((m) => m.MarketComponent),
    canActivate: [buyerGuard],
  },
  {
    path: 'buyer/scan',
    loadComponent: () =>
      import('./components/buyer/scan/scan').then((m) => m.ScanComponent),
    canActivate: [buyerGuard],
  },
  {
    path: 'buyer/cart',
    loadComponent: () =>
      import('./components/buyer/cart/cart').then((m) => m.CartComponent),
    canActivate: [buyerGuard],
  },
  {
    path: 'buyer/messages',
    loadComponent: () =>
      import('./components/messages/messages').then((m) => m.MessagesComponent),
    canActivate: [buyerGuard],
  },
  {
    path: 'buyer/tracking',
    loadComponent: () =>
      import('./components/orders/order-tracking').then(
        (m) => m.OrderTrackingComponent,
      ),
    canActivate: [buyerGuard],
  },
  {
    path: 'buyer/purchases',
    loadComponent: () =>
      import('./components/buyer/buyer-purchases/buyer-purchases.component').then(
        (m) => m.BuyerPurchasesComponent,
      ),
    canActivate: [buyerGuard],
  },
  {
    path: 'buyer/settings',
    loadComponent: () =>
      import('./components/buyer/settings/buyer-settings.component').then(
        (m) => m.BuyerSettingsComponent,
      ),
    canActivate: [buyerGuard],
  },
  {
    path: 'access-denied',
    loadComponent: () =>
      import('./components/access-denied/access-denied.component').then(
        (m) => m.AccessDeniedComponent,
      ),
  },

  { path: '**', redirectTo: '' },
];

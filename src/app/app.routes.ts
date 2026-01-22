// app.routes.ts
import { Routes } from '@angular/router';
import {
  authGuard,
  producerGuard,
  buyerGuard,
} from './services/auth-guard.service';
import { BuyerPurchasesComponent } from './buyer/buyer-purchases/buyer-purchases.component';
import { BuyerSettingsComponent } from './buyer/settings/buyer-settings.component';

export const routes: Routes = [
  // Routes publiques
  {
    path: '',
    loadComponent: () =>
      import('./components/home-page/home-page').then(
        (m) => m.HomePageComponent
      ),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./components/auth/login/login').then((m) => m.LoginComponent),
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./components/auth/register/register').then(
        (m) => m.RegisterComponent
      ),
  },

  // Routes protégées - Sélection de rôle
  {
    path: 'select-role',
    loadComponent: () =>
      import('./components/role-selection/role-selection').then(
        (m) => m.RoleSelectionComponent
      ),
    canActivate: [authGuard],
  },

  // ==================== ROUTES PRODUCTEUR ====================
  {
    path: 'producer/dashboard',
    loadComponent: () =>
      import('./components/producer/dashboard/producer-dashboard').then(
        (m) => m.ProducerDashboardComponent
      ),
    canActivate: [producerGuard],
  },
  {
    path: 'producer/add-product',
    loadComponent: () =>
      import('./components/producer/add-product/add-product').then(
        (m) => m.AddProductComponent
      ),
    canActivate: [producerGuard],
  },
  {
    path: 'producer/products',
    loadComponent: () =>
      import('./components/producer/products/products').then(
        (m) => m.ProductsComponent
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
        (m) => m.ReputationComponent
      ),
    canActivate: [producerGuard],
  },
  {
    path: 'producer/tracking',
    loadComponent: () =>
      import('./components/orders/order-tracking').then(
        (m) => m.OrderTrackingComponent
      ),
    canActivate: [producerGuard],
  },
  {
    path: 'producer/certifications',
    loadComponent: () =>
      import('./components/producer/certifications/certifications').then(
        (m) => m.CertificationsComponent
      ),
    canActivate: [producerGuard],
  },
  {
    path: 'producer/certification/:id',
    loadComponent: () =>
      import('./components/producer/certifications/certification-detail').then(
        (m) => m.CertificationDetailComponent
      ),
    canActivate: [producerGuard],
  },
  {
    path: 'producer/certification/:id/checkpoint/:checkpointId',
    loadComponent: () =>
      import('./components/producer/certifications/complete-checkpoint').then(
        (m) => m.CompleteCheckpointComponent
      ),
    canActivate: [producerGuard],
  },
  {
    path: 'verify/:id',
    loadComponent: () =>
      import('./components/producer/certifications/verification').then(
        (m) => m.VerificationComponent
      ),
  },

  // ==================== ROUTES ACHETEUR ====================
  {
    path: 'buyer/dashboard',
    loadComponent: () =>
      import('./components/buyer/dashboard/buyer-dashboard').then(
        (m) => m.BuyerDashboardComponent
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

  // Dans app.routes.ts, ajoutez cette route :
  {
    path: 'buyer/tracking',
    loadComponent: () =>
      import('./components/orders/order-tracking').then(
        (m) => m.OrderTrackingComponent
      ),
    canActivate: [buyerGuard],
  },
 {
  path: 'buyer/purchases',
  component: BuyerPurchasesComponent,
  canActivate: [authGuard]
}
,

 {
  path: 'buyer/settings',
  component: BuyerSettingsComponent,
  canActivate: [buyerGuard]
}
,






  { path: '**', redirectTo: '' },
];

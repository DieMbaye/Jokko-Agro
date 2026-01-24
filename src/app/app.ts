import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { SidebarComponent, SidebarConfig } from './shared/sidebar/sidebar';
import { VoiceAssistantComponent } from './components/voice-assistant/voice-assistant';
import { AuthService } from './services/auth.service';
import { filter } from 'rxjs/operators';
import { FirebaseService } from './services/firebase.service';
import { ThemeService } from './services/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    SidebarComponent,
    VoiceAssistantComponent,
  ],
  templateUrl: './app.html',
  styleUrls: ['./app.css'],
  encapsulation: ViewEncapsulation.None,
})
export class App implements OnInit {
  showSidebar = false;
  showVoiceAssistant = false;
  isCollapsed = false;
  sidebarConfig: SidebarConfig | null = null;
  isLoading = true;

  private noSidebarRoutes = ['/', '/login', '/register'];
  private noVoiceAssistantRoutes = ['/login', '/register'];

  constructor(
    private router: Router,
    private authService: AuthService,
    private firebaseService: FirebaseService,
    private themeService: ThemeService, // 👈 AJOUT ICI
  ) {
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(async (event: any) => {
        await this.updateUIState(event.url);
      });
  }

  // Dans app.ts - ngOnInit
  async ngOnInit() {
    this.themeService.initTheme();

    // ✅ Attendre l'initialisation de Firebase
    await this.waitForFirebaseInitialization();

    // ✅ Maintenant vérifier l'état
    this.updateUIState(this.router.url);
  }

  // Modifiez waitForFirebaseInitialization :
  private async waitForFirebaseInitialization(): Promise<void> {
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 50; // 5 secondes max

      const checkInitialization = () => {
        attempts++;

        const firebaseUser = this.firebaseService.getCurrentAuthUser();
        const hasUserData = !!this.firebaseService.userData;
        const isLoading = this.firebaseService.isLoading;

        console.log(`🔄 Tentative ${attempts}:`, {
          firebaseUser: firebaseUser?.email,
          hasUserData,
          isLoading,
        });

        // ✅ Condition améliorée
        if (
          (!isLoading && firebaseUser && hasUserData) ||
          (!isLoading && !firebaseUser) ||
          attempts >= maxAttempts
        ) {
          console.log('✅ Initialisation Firebase terminée:', {
            authenticated: !!firebaseUser,
            userData: hasUserData,
            attempts,
          });

          this.isLoading = false;
          resolve();
        } else {
          setTimeout(checkInitialization, 100);
        }
      };

      checkInitialization();
    });
  }
  private updateUIState(url: string) {
    // Mettre à jour le chargement
    this.isLoading = this.firebaseService.isLoading;

    // Déterminer si on doit montrer le sidebar
    this.showSidebar = !this.noSidebarRoutes.some(
      (route) => url === route || url.startsWith(route + '/'),
    );

    // Déterminer si on doit montrer l'assistant vocal
    this.showVoiceAssistant = !this.noVoiceAssistantRoutes.some(
      (route) => url === route || url.startsWith(route + '/'),
    );

    // Configurer le sidebar si nécessaire
    if (this.showSidebar && !this.isLoading) {
      this.setupSidebarConfig();
    }
  }

  // app.ts - ajoutez cette méthode
isPublicPage(): boolean {
  const currentUrl = this.router.url;
  return this.noSidebarRoutes.some(
    (route) => currentUrl === route || currentUrl.startsWith(route + '/')
  );
}
  private setupSidebarConfig() {
    const firebaseUser = this.firebaseService.getCurrentAuthUser();

    if (!firebaseUser) {
      this.sidebarConfig = null;
      return;
    }

    const role = this.authService.getUserRole();

    if (role === 'producer') {
      this.sidebarConfig = {
        type: 'producer',
        items: [
          {
            label: 'Tableau de bord',
            icon: '📊',
            route: '/producer/dashboard',
          },
          {
            label: 'Ajouter un produit',
            icon: '➕',
            route: '/producer/add-product',
          },
          { label: 'Mes produits', icon: '📦', route: '/producer/products' },
          { label: 'Ventes', icon: '💰', route: '/producer/sales' },
          { label: 'Commandes', icon: '🛒', route: '/producer/tracking' },
          {
            label: 'Certifications',
            icon: '🔒',
            route: '/producer/certifications',
          },
          { label: 'Messages', icon: '✉️', route: '/producer/messages' },
          { label: 'Réputation', icon: '⭐', route: '/producer/reputation' },
          { label: 'Paramètres', icon: '⚙️', route: '/producer/settings' },
        ],
      };
    } else if (role === 'buyer') {
      this.sidebarConfig = {
        type: 'buyer',
        items: [
          { label: 'Tableau de bord', icon: '📊', route: '/buyer/dashboard' },
          { label: 'Marché', icon: '🛍️', route: '/buyer/market' },
          { label: 'Panier', icon: '🛒', route: '/buyer/cart' },
          { label: 'Commandes', icon: '📦', route: '/buyer/tracking' },
          { label: 'Messages', icon: '✉️', route: '/buyer/messages' },
          { label: 'Scanner QR', icon: '📱', route: '/buyer/scan' },
          { label: 'Historique', icon: '📋', route: '/buyer/purchases' },
          { label: 'Vérifications', icon: '✅', route: '/buyer/verifications' },
          { label: 'Paramètres', icon: '⚙️', route: '/buyer/settings' },
        ],
      };
    } else {
      this.sidebarConfig = null;
    }
  }

  onLogout() {
    this.authService.logout();
  }
}

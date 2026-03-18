import {
  Component,
  OnInit,
  ViewEncapsulation,
  Inject,
  PLATFORM_ID,
  inject, // AJOUTER
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import {
  RouterOutlet,
  Router,
  NavigationEnd,
  NavigationStart,
} from '@angular/router';
import { SidebarComponent, SidebarConfig } from './shared/sidebar/sidebar';
import { VoiceAssistantComponent } from './components/voice-assistant/voice-assistant';
import { AuthService } from './services/auth.service';
import { filter } from 'rxjs/operators';
import { FirebaseService } from './services/firebase.service';
import { ThemeService } from './services/theme.service';
import { BlockchainSyncService } from './services/blockchain-sync.service';
import { CertificationService } from './services/certification.service';
import { AGCInitService } from './services/agc-init.service';
import { environment } from 'src/environments/environment';

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
  // AJOUTER ces injections
  private blockchainSyncService = inject(BlockchainSyncService);
  private agcInitService = inject(AGCInitService);

  showSidebar = false;
  showVoiceAssistant = false;
  isCollapsed = false;
  sidebarConfig: SidebarConfig | null = null;
  isLoading = true;
  isCheckingAuth = true;
  loadingMessage = "Chargement de l'application...";

  private hasProcessedInitialNavigation = false;
  private noSidebarRoutes = ['/', '/login', '/register'];
  private isBrowser: boolean;
  private initialBrowserUrl: string = '/';

  constructor(
    private router: Router,
    private authService: AuthService,
    private firebaseService: FirebaseService,
    private themeService: ThemeService,

    @Inject(PLATFORM_ID) platformId: Object,
  ) {
    this.isBrowser = isPlatformBrowser(platformId);

    if (this.isBrowser) {
      const rawUrl = window.location.pathname;
      this.initialBrowserUrl =
        rawUrl.endsWith('/') && rawUrl !== '/' ? rawUrl.slice(0, -1) : rawUrl;
    }

    this.router.events
      .pipe(
        filter(
          (event): event is NavigationStart => event instanceof NavigationStart,
        ),
      )
      .subscribe(() => {});

    this.router.events
      .pipe(
        filter(
          (event): event is NavigationEnd => event instanceof NavigationEnd,
        ),
      )
      .subscribe(async (event: NavigationEnd) => {
        if (!this.isCheckingAuth) {
          await this.updateUIState(event.url);
        }
      });
  }

  async ngOnInit() {
    this.themeService.initTheme();

    await this.waitForCompleteFirebaseInitialization();

    const targetUrl = this.getInitialTargetUrl();

    if (!this.hasProcessedInitialNavigation) {
      await this.handleInitialNavigation(targetUrl);
      this.hasProcessedInitialNavigation = true;
    }

    this.finalizeInitialization();
    await this.updateUIState(this.router.url);

    // AJOUTER: Initialiser la synchronisation blockchain
    if (this.isBrowser) {
      this.initializeBlockchainSync();
    }

    // ✅ CORRIGÉ: Utiliser agcInitService injecté
    await this.agcInitService.initializeAGC();

    // Optionnel: Afficher les stats en développement
    if (!environment.production) {
      const stats = await this.agcInitService.getAGCStats();
      console.log('📊 Statistiques AGC:', stats);
    }
  }

  private initializeBlockchainSync(): void {
    // Démarrer la synchro automatique (toutes les 5 minutes)
    this.blockchainSyncService.startAutoSync(5);

    // Synchro immédiate au démarrage
    setTimeout(() => {
      this.blockchainSyncService.syncPendingTransactions();
    }, 30000); // 30 secondes après le démarrage
  } // ⚠️ AJOUTER cette accolade fermante qui manquait

  private async waitForCompleteFirebaseInitialization(): Promise<void> {
    return new Promise((resolve) => {
      const maxWaitTime = 10000;
      const startTime = Date.now();
      let lastAuthState: string | null = null;
      let sameStateCount = 0;

      const checkCompleteInitialization = () => {
        const elapsedTime = Date.now() - startTime;

        const currentAuthUser = this.firebaseService.getCurrentAuthUser();
        const currentUserData = this.firebaseService.userData;
        const currentAuthState = JSON.stringify({
          authUser: currentAuthUser?.email || null,
          userData: !!currentUserData,
          isLoading: this.firebaseService.isLoading,
        });

        if (currentAuthState === lastAuthState) {
          sameStateCount++;
        } else {
          sameStateCount = 0;
          lastAuthState = currentAuthState;
        }

        const isStable = !this.firebaseService.isLoading && sameStateCount >= 2;
        const hasAuthData = currentAuthUser && currentUserData;
        const definitelyNoAuth =
          !currentAuthUser && !currentUserData && sameStateCount >= 3;

        if (isStable && (hasAuthData || definitelyNoAuth)) {
          resolve();
        } else if (elapsedTime >= maxWaitTime) {
          resolve();
        } else {
          setTimeout(checkCompleteInitialization, 300);
        }
      };

      checkCompleteInitialization();
    });
  }

  private getInitialTargetUrl(): string {
    if (
      this.initialBrowserUrl !== '/' &&
      this.isValidAppUrl(this.initialBrowserUrl)
    ) {
      return this.initialBrowserUrl;
    }

    return this.router.url;
  }

  private isValidAppUrl(url: string): boolean {
    return (
      url === '/' ||
      url === '/login' ||
      url === '/register' ||
      url === '/test' ||
      url === '/test' ||
      url === '/select-role' ||
      url === '/test-blockchain' || // ← AJOUT ICI
      url.startsWith('/producer/') ||
      url.startsWith('/buyer/') ||
      url.startsWith('/login/') ||
      url.startsWith('/register/') ||
      url.startsWith('/test/') ||
      url.startsWith('/verify/') ||
      url.startsWith('/test-blockchain/') // ← AJOUT ICI
    );
  }

  private async handleInitialNavigation(targetUrl: string): Promise<void> {
    const firebaseUser = this.firebaseService.getCurrentAuthUser();
    const userData = this.firebaseService.userData;
    const role = this.authService.getUserRole();

    // ✅ AJOUT: Si /test-blockchain, laisser passer directement
    if (
      targetUrl === '/test-blockchain' ||
      targetUrl.startsWith('/test-blockchain/')
    ) {
      if (targetUrl !== this.router.url) {
        await this.router.navigateByUrl(targetUrl, { replaceUrl: true });
      }
      return;
    }

    // CAS A: Utilisateur NON connecté
    if (!firebaseUser || !userData) {
      const isProtectedRoute =
        targetUrl.startsWith('/producer/') ||
        targetUrl.startsWith('/buyer/') ||
        targetUrl === '/select-role';

      const isPublicRoute =
        targetUrl === '/' ||
        targetUrl === '/login' ||
        targetUrl === '/register' ||
        targetUrl === '/test' ||
        targetUrl.startsWith('/login') ||
        targetUrl.startsWith('/register') ||
        targetUrl.startsWith('/test') ||
        targetUrl.startsWith('/verify/');

      if (isProtectedRoute) {
        this.loadingMessage = 'Redirection vers la connexion...';
        await this.router.navigate(['/login'], { replaceUrl: true });
        return;
      }

      if (!isPublicRoute) {
        await this.router.navigate(['/'], { replaceUrl: true });
        return;
      }

      if (targetUrl !== this.router.url) {
        await this.router.navigateByUrl(targetUrl, { replaceUrl: true });
      }
      return;
    }

    // CAS B: Utilisateur connecté
    const isPublicRoot =
      targetUrl === '/' || targetUrl === '/login' || targetUrl === '/register' || targetUrl === '/test' ;

    const isProtectedRoute =
      targetUrl.startsWith('/producer/') ||
      targetUrl.startsWith('/buyer/') ||
      targetUrl === '/select-role';

    const isPublicRoute = targetUrl.startsWith('/verify/');

    // 1. Si sur page publique racine, rediriger vers dashboard
    if (isPublicRoot) {
      this.loadingMessage = `Bienvenue ${role === 'producer' ? 'Producteur' : 'Acheteur'}...`;

      await new Promise((resolve) => setTimeout(resolve, 300));

      if (role === 'producer') {
        await this.router.navigate(['/producer/dashboard'], {
          replaceUrl: true,
        });
      } else if (role === 'buyer') {
        await this.router.navigate(['/buyer/dashboard'], { replaceUrl: true });
      } else {
        await this.router.navigate(['/select-role'], { replaceUrl: true });
      }
      return;
    }

    // 2. Si sur route protégée, vérifier les permissions
    if (isProtectedRoute) {
      // Si mauvais rôle, rediriger vers page d'erreur
      if (
        (targetUrl.startsWith('/producer/') && role !== 'producer') ||
        (targetUrl.startsWith('/buyer/') && role !== 'buyer')
      ) {
        // Créer une route pour la page d'erreur d'accès non autorisé
        await this.router.navigate(['/access-denied'], {
          replaceUrl: true,
          state: {
            attemptedUrl: targetUrl,
            requiredRole: targetUrl.startsWith('/producer/')
              ? 'producteur'
              : 'acheteur',
            currentRole: role,
          },
        });
        return;
      }

      // Bon rôle, naviguer vers la page protégée
      if (targetUrl !== this.router.url) {
        await this.router.navigateByUrl(targetUrl, { replaceUrl: true });
      }
      return;
    }

    // 3. Si sur autre route publique (comme /verify/), laisser passer
    if (isPublicRoute) {
      if (targetUrl !== this.router.url) {
        await this.router.navigateByUrl(targetUrl, { replaceUrl: true });
      }
      return;
    }

    // 4. URL non reconnue, rediriger vers dashboard
    if (role === 'producer') {
      await this.router.navigate(['/producer/dashboard'], { replaceUrl: true });
    } else if (role === 'buyer') {
      await this.router.navigate(['/buyer/dashboard'], { replaceUrl: true });
    } else {
      await this.router.navigate(['/select-role'], { replaceUrl: true });
    }
  }

  private finalizeInitialization(): void {
    this.isCheckingAuth = false;
    this.isLoading = false;
    this.loadingMessage = 'Prêt !';
  }

  private async updateUIState(url: string) {
    this.isLoading = this.firebaseService.isLoading;

    // ✅ AJOUT: La page /test-blockchain ne doit PAS avoir la sidebar
    const shouldShowSidebar =
      !this.noSidebarRoutes.some(
        (route) => url === route || url.startsWith(route + '/'),
      ) &&
      url !== '/access-denied' &&
      url !== '/test-blockchain'; // ← AJOUT ICI

    if (this.showSidebar !== shouldShowSidebar) {
      this.showSidebar = shouldShowSidebar;
    }

    this.showVoiceAssistant = this.showSidebar;

    if (this.showSidebar && !this.isLoading) {
      this.setupSidebarConfig();
    }
  }

  isPublicPage(): boolean {
    if (this.isCheckingAuth) {
      return false;
    }

    const currentUrl = this.router.url;

    // ✅ AJOUT: /test-blockchain est aussi une page publique
    const publicRoutes = [
      ...this.noSidebarRoutes,
      '/access-denied',
      '/test-blockchain',
    ];

    return publicRoutes.some(
      (route) => currentUrl === route || currentUrl.startsWith(route + '/'),
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

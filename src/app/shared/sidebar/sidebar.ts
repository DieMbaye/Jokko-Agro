import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { CartService } from '../../services/cart.service';
import { Subscription } from 'rxjs';

export interface SidebarItem {
  label: string;
  icon: string;
  route: string;
  badge?: number;
  disabled?: boolean;
}

export interface SidebarConfig {
  type: 'producer' | 'buyer';
  items: SidebarItem[];
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrls: ['./sidebar.css']
})
export class SidebarComponent implements OnInit, OnDestroy {
  @Input() config!: SidebarConfig;
  @Input() isCollapsed = false;
  @Output() logout = new EventEmitter<void>();

  userData: any;
  cartItemCount = 0;
  private cartSubscription?: Subscription;

  // 🔥 NOUVEAU : État du chatbot
  isChatbotOpen = false;
  
  // Configurations par défaut
  producerConfig: SidebarConfig = {
    type: 'producer',
    items: [
      { label: 'Tableau de bord', icon: '📊', route: '/producer/dashboard' },
      { label: 'Ajouter un produit', icon: '➕', route: '/producer/add-product' },
      { label: 'Mes produits', icon: '📦', route: '/producer/products' },
      { label: 'Certifications', icon: '🔒', route: '/producer/certifications' },
      { label: 'Ventes', icon: '💰', route: '/producer/sales' },
      { label: 'Messages', icon: '✉️', route: '/producer/messages', badge: 3 },
      { label: 'Réputation', icon: '⭐', route: '/producer/reputation' },
      { label: 'Paramètres', icon: '⚙️', route: '/producer/settings' }
    ]
  };

  buyerConfig: SidebarConfig = {
    type: 'buyer',
    items: [
      { label: 'Tableau de bord', icon: '📊', route: '/buyer/dashboard' },
      { label: 'Marché', icon: '🛍️', route: '/buyer/market' },
      { label: 'Scanner QR', icon: '📱', route: '/buyer/scan' },
      { label: 'Panier', icon: '🛒', route: '/buyer/cart' },
      { label: 'Historique', icon: '📋', route: '/buyer/purchases' },
      { label: 'Vérifications', icon: '✅', route: '/buyer/verifications' },
      { label: 'Messages', icon: '✉️', route: '/buyer/messages', badge: 2 },
      { label: 'Favoris', icon: '❤️', route: '/buyer/favorites', badge: 5 },
      { label: 'Paramètres', icon: '⚙️', route: '/buyer/settings' },
      // 🔥 NOUVEAU : Item chatbot dans la sidebar
      { label: 'Assistant IA', icon: '🤖', route: '#', disabled: false }
    ]
  };

  constructor(
    private authService: AuthService,
    private cartService: CartService
  ) {}

  ngOnInit() {
    this.userData = this.authService.getUserData();

    // Si aucune config n'est fournie, utiliser celle par défaut selon le rôle
    if (!this.config) {
      const role = this.authService.getUserRole();
      this.config = role === 'producer' ? this.producerConfig : this.buyerConfig;
    }

    // Initialiser le compteur du panier
    this.updateCartCount();

    // Surveiller les changements dans le panier
    this.setupCartMonitoring();
  }

  ngOnDestroy() {
    if (this.cartSubscription) {
      this.cartSubscription.unsubscribe();
    }
  }

  // 🔥 NOUVEAU : Toggle chatbot
  toggleChatbot() {
    this.isChatbotOpen = !this.isChatbotOpen;
    console.log('🤖 Chatbot:', this.isChatbotOpen ? 'ouvert' : 'fermé');
    
    // Émettre un événement pour le composant parent
    if (this.isChatbotOpen) {
      this.openChatbotWindow();
    }
  }

  // 🔥 NOUVEAU : Ouvrir la fenêtre du chatbot
  private openChatbotWindow() {
    // Créer une fenêtre de chatbot simple
    const chatbotHTML = `
      <div class="chatbot-sidebar-window">
        <div class="chatbot-sidebar-header">
          <h3>🤖 Assistant d'achat</h3>
          <button onclick="this.parentElement.parentElement.remove()">×</button>
        </div>
        <div class="chatbot-sidebar-messages">
          <div class="chatbot-sidebar-message bot">
            <p>Bonjour ! Je suis votre assistant d'achat. Posez-moi vos questions sur les produits ! 😊</p>
          </div>
          <div class="chatbot-sidebar-message bot">
            <p>Exemples :<br>
            • Qui vend des mangues ?<br>
            • Producteurs actifs ?<br>
            • Comment commander ?</p>
          </div>
        </div>
        <div class="chatbot-sidebar-input">
          <input type="text" placeholder="Tapez votre question..." id="chatbot-input">
          <button onclick="sendChatbotMessage()">📤</button>
        </div>
      </div>
    `;

    // Ajouter au body si pas déjà présent
    if (!document.querySelector('.chatbot-sidebar-window')) {
      const container = document.createElement('div');
      container.innerHTML = chatbotHTML;
      document.body.appendChild(container.firstChild as Node);
      
      // Ajouter les styles
      this.addChatbotStyles();
    }
  }

  // 🔥 NOUVEAU : Ajouter les styles du chatbot
  private addChatbotStyles() {
    if (!document.querySelector('#chatbot-sidebar-styles')) {
      const style = document.createElement('style');
      style.id = 'chatbot-sidebar-styles';
      style.textContent = `
        .chatbot-sidebar-window {
          position: fixed;
          bottom: 80px;
          right: 20px;
          width: 320px;
          height: 400px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.2);
          z-index: 9999;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          animation: slideUp 0.3s ease;
        }
        
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .chatbot-sidebar-header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 15px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .chatbot-sidebar-header h3 {
          margin: 0;
          font-size: 16px;
        }
        
        .chatbot-sidebar-header button {
          background: none;
          border: none;
          color: white;
          font-size: 24px;
          cursor: pointer;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.3s;
        }
        
        .chatbot-sidebar-header button:hover {
          background: rgba(255,255,255,0.2);
        }
        
        .chatbot-sidebar-messages {
          flex: 1;
          padding: 15px;
          overflow-y: auto;
          background: #f8f9fa;
        }
        
        .chatbot-sidebar-message {
          margin-bottom: 10px;
          padding: 10px 15px;
          border-radius: 15px;
          max-width: 80%;
        }
        
        .chatbot-sidebar-message.bot {
          background: white;
          border: 1px solid #e0e0e0;
          align-self: flex-start;
          border-bottom-left-radius: 5px;
        }
        
        .chatbot-sidebar-input {
          padding: 15px;
          background: white;
          border-top: 1px solid #e0e0e0;
          display: flex;
          gap: 10px;
        }
        
        .chatbot-sidebar-input input {
          flex: 1;
          padding: 10px 15px;
          border: 1px solid #ddd;
          border-radius: 25px;
          font-size: 14px;
          outline: none;
        }
        
        .chatbot-sidebar-input button {
          background: #667eea;
          color: white;
          border: none;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          cursor: pointer;
          font-size: 18px;
        }
      `;
      document.head.appendChild(style);
    }
  }

  private setupCartMonitoring() {
    // Mettre à jour le compteur quand le panier change
    setInterval(() => {
      this.updateCartCount();
    }, 1000);

    // Mettre à jour aussi quand la fenêtre redevient active
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.updateCartCount();
      }
    });
  }

  private updateCartCount() {
    const cartItems = this.cartService.getCartItems();
    this.cartItemCount = cartItems.reduce((total, item) => total + item.quantity, 0);

    // Mettre à jour le badge du panier dans la sidebar
    this.updateCartBadge();
  }

  private updateCartBadge() {
    const cartItem = this.config.items.find(item => item.label === 'Panier' || item.route === '/buyer/cart');
    if (cartItem) {
      cartItem.badge = this.cartItemCount > 0 ? this.cartItemCount : undefined;
    }
  }

  getRoleLabel(): string {
    return this.config.type === 'producer' ? '👨‍🌾 Producteur' : '🛒 Acheteur';
  }

  getRoleColor(): string {
    return this.config.type === 'producer' ? '#2e7d32' : '#1976d2';
  }

  getInitials(): string {
    if (!this.userData?.fullName) return 'U';
    return this.userData.fullName
      .split(' ')
      .map((n: string) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  onLogout() {
    this.logout.emit();
  }

  toggleCollapse() {
    this.isCollapsed = !this.isCollapsed;
  }

  // Méthode pour obtenir le badge d'un item
  getItemBadge(item: SidebarItem): number | undefined {
    if (item.label === 'Panier' || item.route === '/buyer/cart') {
      return this.cartItemCount > 0 ? this.cartItemCount : undefined;
    }
    return item.badge;
  }

  // 🔥 NOUVEAU : Gérer le clic sur les items
  onItemClick(item: SidebarItem, event: Event) {
    if (item.label === 'Assistant IA') {
      event.preventDefault();
      this.toggleChatbot();
    }
  }
}
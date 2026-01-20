import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { FirebaseService } from '../../../services/firebase.service';
import { Product } from '../../../services/data.interfaces';
import { ChatbotService } from '../../../services/chatbot.service';

interface DashboardStat {
  label: string;
  value: number | string;
  icon: string;
  color: string;
  link?: string;
}

interface RecentPurchase {
  id: string;
  product: string;
  producer: string;
  date: string;
  amount: number;
  status: 'delivered' | 'shipping' | 'pending';
  certified: boolean;
}

interface RecommendedProduct {
  id: string;
  name: string;
  producer: string;
  price: number;
  rating: number;
  image: string;
  certified: boolean;
  category?: string;
  unit?: string;
  stock?: number;
}

interface ChatMessage {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  isLoading?: boolean;
}

@Component({
  selector: 'app-buyer-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './buyer-dashboard.html',
  styleUrls: ['./buyer-dashboard.css']
})
export class BuyerDashboardComponent implements OnInit, OnDestroy, AfterViewChecked {
  userData: any;
  stats: DashboardStat[] = [];
  recentPurchases: RecentPurchase[] = [];
  recommendedProducts: RecommendedProduct[] = [];
  categories = [
    { name: 'Légumes', icon: '🥦', count: 0 },
    { name: 'Fruits', icon: '🍎', count: 0 },
    { name: 'Céréales', icon: '🌾', count: 0 },
    { name: 'Épicerie', icon: '🛒', count: 0 }
  ];

  // Variables pour la recherche vocale
  isListening = false;
  isSpeaking = false;
  isVoiceInput = false;


  isVoiceSupported = true;
  searchTerm = '';
  voiceSearchResults: RecommendedProduct[] = [];
  lastVoiceCommand = '';
  showVoiceHelp = true;

  // Données dynamiques
  allProducts: Product[] = [];
  allProducers: any[] = [];
  isLoadingProducts = false;

  // DICTIONNAIRE WOLOF-FRANÇAIS
  private wolofToFrench: { [key: string]: string } = {
    'tomater': 'tomate',
    'manguo': 'mangue',
    'carotte': 'carotte',
    'orange': 'orange',
    'riz': 'riz',
    'oignon': 'oignon',
    'banane': 'banane',
    'citron': 'citron'
  };

  private recognition: any;
  private SpeechRecognition = (window as any).webkitSpeechRecognition ||
                              (window as any).SpeechRecognition;

  // ==================== CHATBOT INTELLIGENT ====================
  isChatbotOpen = false;
  hasUnreadMessages = false;
  chatHistory: ChatMessage[] = [];
  currentMessage = '';
  isProcessing = false;
  @ViewChild('chatMessages') chatMessages!: ElementRef<HTMLDivElement>;
  @ViewChild('chatInput') chatInput!: ElementRef<HTMLInputElement>;

  // Pour le scroll
  private shouldScroll = true;
  private scrollTimeout: any;

  // Données utilisateur
  userName = '';
  userInitials = '';

  constructor(
    private authService: AuthService,
    private firebaseService: FirebaseService,
    private chatbotService: ChatbotService
  ) {}

  async ngOnInit() {
    this.userData = this.authService.getUserData();
    this.userName = this.userData?.fullName || 'Utilisateur';
    this.userInitials = this.getInitials(this.userName);

    await this.loadDashboardData();
    this.initVoiceRecognition();
      this.initSpeechRecognition();

  }

  ngAfterViewChecked() {
    if (this.shouldScroll) {
      this.scrollChatToBottom();
    }
  }

  ngOnDestroy() {
    if (this.recognition) {
      this.recognition.stop();
    }
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
    }
  }

  // ==================== CHATBOT ====================
 toggleChatbot() {
  this.isChatbotOpen = !this.isChatbotOpen;

  if (!this.isChatbotOpen) {
    // 🔴 STOP VOIX IMMÉDIAT
    window.speechSynthesis.cancel();
    this.isSpeaking = false;
    this.isVoiceInput = false;
  }

  if (this.isChatbotOpen) {
    this.hasUnreadMessages = false;
    setTimeout(() => {
      this.chatInput?.nativeElement?.focus();
      this.scrollChatToBottom();
    }, 300);
  }
}


sendMessage() {
  if (!this.currentMessage.trim() || this.isProcessing) return;

  const question = this.currentMessage.trim();
  this.currentMessage = '';

  this.isProcessing = true;

  // ➕ Message utilisateur
  this.addMessage(question, true);

  this.processQuestion(question)
    .then((botResponse: string) => {
      this.addMessage(botResponse, false);

      // 🔊 PARLER UNIQUEMENT SI QUESTION ORALE
      if (this.isVoiceInput === true) {
        this.speak(botResponse);
      }
    })
    .catch(() => {
      const err = "❌ Une erreur est survenue.";
      this.addMessage(err, false);

      if (this.isVoiceInput === true) {
        this.speak(err);
      }
    })
    .finally(() => {
      this.isProcessing = false;

      // 🔒 RESET ABSOLU (TRÈS IMPORTANT)
      this.isVoiceInput = false;
    });
}




  askQuestion(question: string) {
    this.currentMessage = question;
    this.sendMessage();
  }

  newChat() {
    this.chatHistory = [];
    this.shouldScroll = true;
  }

  // Vérifier si le message est un remerciement
  private isThankYouMessage(message: string): boolean {
    const lowerMessage = message.toLowerCase().trim();
    const thankYouWords = [
      'merci', 'thank you', 'thanks', 'merci beaucoup',
      'je te remercie', 'cimer', 'merci bien'
    ];

    return thankYouWords.some(word => lowerMessage.includes(word));
  }

 private processThankYou(): string {
  return "🙏 De rien ! N'hésitez pas si vous avez d'autres questions.<br>" +
         "Je suis là pour vous aider à trouver les meilleurs produits !";
}


initSpeechRecognition() {
  const SpeechRecognition =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;

  if (!SpeechRecognition) {
    console.warn('Reconnaissance vocale non supportée');
    return;
  }

  this.recognition = new SpeechRecognition();
  this.recognition.lang = 'fr-FR';
  this.recognition.continuous = false;
  this.recognition.interimResults = false;

  this.recognition.onstart = () => {
    this.isListening = true;
  };

  this.recognition.onend = () => {
    this.isListening = false;
  };

  this.recognition.onerror = () => {
    this.isListening = false;
  };

  // 🔥 ICI : quand l’utilisateur parle
  this.recognition.onresult = (event: any) => {
    const transcript = event.results[0][0].transcript;

    this.currentMessage = transcript;

    // ✅ ENVOI AUTOMATIQUE
    setTimeout(() => {
      this.sendMessage();
    }, 300);
  };
}

startVoiceInput() {
  if (!this.recognition) {
    alert('⚠️ La reconnaissance vocale n’est pas supportée.');
    return;
  }

  // 🔴 Stop toute lecture en cours
  window.speechSynthesis.cancel();
  this.isSpeaking = false;

  // 🔥 MARQUER QUE LA QUESTION EST ORALE
  this.isVoiceInput = true;

  try {
    this.recognition.start();
    this.isListening = true;
  } catch (e) {
    console.error('Erreur micro', e);
    this.isListening = false;
    this.isVoiceInput = false;
  }
}


speak(text: string) {
  // 🔒 Sécurité ultime
  if (!this.isVoiceInput) return;
  if (!('speechSynthesis' in window)) return;

  // 🔴 Stop toute voix précédente
  window.speechSynthesis.cancel();

  const cleanText = this.cleanTextForSpeech(text);
  if (!cleanText) return;

  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.lang = 'fr-FR';
  utterance.rate = 0.95;

  this.isSpeaking = true;

  utterance.onend = () => {
    this.isSpeaking = false;
  };

  window.speechSynthesis.speak(utterance);
}




  private async processQuestion(question: string): Promise<string> {
  // Ajouter message de chargement
  this.addMessage('', false, true);

  try {
    // 🔥 Réponse intelligente basée sur Firestore
    const response: string =
      await this.chatbotService.getIntelligentResponse(
        question,
        this.allProducts,
        this.allProducers
      );

    // Supprimer le message "typing"
    this.removeLoadingMessage();

    // Retourner la réponse formatée
    return this.formatBotResponse(response);

  } catch (error) {
    console.error('Erreur chatbot:', error);

    this.removeLoadingMessage();

    return (
      "❌ <strong>Désolé, je rencontre une difficulté technique.</strong><br>" +
      "Veuillez réessayer dans quelques instants."
    );
  }
}


  private formatBotResponse(text: string): string {
    return text.replace(/\n/g, '<br>');
  }

  private addMessage(text: string, isUser: boolean, isLoading = false) {
    const message: ChatMessage = {
      id: Date.now().toString(),
      text: text,
      isUser: isUser,
      timestamp: new Date(),
      isLoading: isLoading
    };

    this.chatHistory.push(message);
    this.shouldScroll = true;
    this.scrollChatToBottom();
  }

  private addLoadingMessage() {
    this.addMessage("", false, true);
  }

  private removeLoadingMessage() {
    if (this.chatHistory.length > 0 && this.chatHistory[this.chatHistory.length - 1].isLoading) {
      this.chatHistory.pop();
    }
  }

  // SCROLL CORRIGÉ - Gestion améliorée
  private scrollChatToBottom() {
    if (!this.shouldScroll) return;

    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
    }

    this.scrollTimeout = setTimeout(() => {
      if (this.chatMessages?.nativeElement) {
        const container = this.chatMessages.nativeElement;

        // Utiliser scrollTo avec smooth
        container.scrollTo({
          top: container.scrollHeight,
          behavior: 'smooth'
        });

        // Forcer le scroll si smooth ne fonctionne pas
        setTimeout(() => {
          container.scrollTop = container.scrollHeight;
        }, 100);
      }

      // Réinitialiser après le scroll
      setTimeout(() => {
        this.shouldScroll = false;
      }, 200);
    }, 150);
  }

  // Détection du scroll manuel
  onChatScroll() {
    const container = this.chatMessages?.nativeElement;
    if (container) {
      // Si l'utilisateur scroll vers le haut, ne pas forcer le scroll automatique
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      this.shouldScroll = isNearBottom;
    }
  }

  private getInitials(name: string): string {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  }

  // ==================== DASHBOARD ====================
  async loadDashboardData() {
    this.stats = [
      { label: 'Achats ce mois', value: 6, icon: '🛍️', color: '#2196F3', link: '/buyer/purchases' },
      { label: 'Dépenses totales', value: '75,000', icon: '💰', color: '#4CAF50' },
      { label: 'Certifications vérifiées', value: 8, icon: '✅', color: '#FF9800', link: '/buyer/verifications' },
      { label: 'Vendeurs favoris', value: 3, icon: '❤️', color: '#E91E63', link: '/buyer/favorites' },
      { label: 'Messages', value: 5, icon: '✉️', color: '#9C27B0', link: '/buyer/messages' },
      { label: 'Panier', value: 2, icon: '🛒', color: '#FF5722', link: '/buyer/cart' }
    ];

    await this.loadRealProducts();
    await this.loadProducers();
    this.updateRecommendedProducts();

    this.recentPurchases = [
      { id: '001', product: 'Mangues Kent Bio', producer: 'Ferme Tropicale', date: '2024-01-15', amount: 15000, status: 'delivered', certified: true },
      { id: '002', product: 'Carottes Nantaises', producer: 'Jardin de Fatou', date: '2024-01-14', amount: 4500, status: 'delivered', certified: true },
      { id: '003', product: 'Poivre de Penja', producer: 'Épices du Cameroun', date: '2024-01-13', amount: 8500, status: 'shipping', certified: true },
      { id: '004', product: 'Niébé décortiqué', producer: 'Coopérative Agricole', date: '2024-01-12', amount: 6500, status: 'pending', certified: true }
    ];
  }

  async loadRealProducts() {
    this.isLoadingProducts = true;

    try {
      if (this.firebaseService.getAllAvailableProducts) {
        const products = await this.firebaseService.getAllAvailableProducts();
        this.allProducts = products;
        console.log(`✅ ${products.length} produits chargés depuis Firebase`);

        this.updateCategoryCounts();

        if (this.allProducts.length === 0) {
          this.addTestProducts();
        }
      } else {
        console.error('Méthode getAllAvailableProducts non disponible');
        this.addTestProducts();
      }
    } catch (error) {
      console.error('Erreur chargement produits:', error);
      this.addTestProducts();
    } finally {
      this.isLoadingProducts = false;
    }
  }

  async loadProducers() {
    try {
      if (this.firebaseService.getProducers) {
        this.allProducers = await this.firebaseService.getProducers();
        console.log(`👨‍🌾 ${this.allProducers.length} producteurs chargés`);
      } else {
        this.extractProducersFromProducts();
      }
    } catch (error) {
      console.error('Erreur chargement producteurs:', error);
      this.extractProducersFromProducts();
    }
  }

  private extractProducersFromProducts() {
    const producers = new Set<string>();
    this.allProducts.forEach(product => {
      if (product.producerName) {
        producers.add(product.producerName);
      }
    });

    this.allProducers = Array.from(producers).map(name => ({
      name: name,
      productCount: this.allProducts.filter(p => p.producerName === name).length
    }));

    console.log(`👨‍🌾 ${this.allProducers.length} producteurs extraits des produits`);
  }

  private addTestProducts() {
    console.log('📝 Ajout de produits de test');

    const now = new Date();

    this.allProducts = [
      {
        id: '1',
        name: 'Mangue Kent Bio',
        description: 'Mangues Kent bio, chair orange juteuse sans fibres',
        price: 1800,
        category: 'Fruits',
        producerName: 'Ferme Tropicale',
        unit: 'kg',
        quantity: 50,
        certifications: ['Bio', 'Local'],
        rating: 4.5,
        isOrganic: false,
        location: '',
        contactPhone: '',
        minOrderQuantity: 0,
        producerId: '',
        producerPhone: '',
        images: [],
        status: 'available',
        views: 0,
        sales: 0,
        isActive: false,
        createdAt: now,
        updatedAt: now,
        badges: []
      },
      {
        id: '2',
        name: 'Carotte Nantaise Fraîche',
        description: 'Carottes Nantaises cultivées dans les sols sablonneux',
        price: 1200,
        category: 'Légumes',
        producerName: 'Jardin de Fatou',
        unit: 'kg',
        quantity: 100,
        certifications: ['Bio'],
        rating: 4.2,
        isOrganic: false,
        location: '',
        contactPhone: '',
        minOrderQuantity: 0,
        producerId: '',
        producerPhone: '',
        images: [],
        status: 'available',
        views: 0,
        sales: 0,
        isActive: false,
        createdAt: now,
        updatedAt: now,
        badges: []
      },
      {
        id: '3',
        name: 'Tomates Bio',
        description: 'Tomates bio fraîches, cultivées naturellement',
        price: 1500,
        category: 'Légumes',
        producerName: 'Alioune Farms',
        unit: 'kg',
        quantity: 80,
        certifications: ['Bio'],
        rating: 4.4,
        isOrganic: false,
        location: '',
        contactPhone: '',
        minOrderQuantity: 0,
        producerId: '',
        producerPhone: '',
        images: [],
        status: 'available',
        views: 0,
        sales: 0,
        isActive: false,
        createdAt: now,
        updatedAt: now,
        badges: []
      },
      {
        id: '4',
        name: 'Orange Valencia',
        description: 'Oranges juteuses et sucrées',
        price: 1500,
        category: 'Fruits',
        producerName: 'Verger de Casamance',
        unit: 'kg',
        quantity: 75,
        certifications: ['Local'],
        rating: 4.3,
        isOrganic: false,
        location: '',
        contactPhone: '',
        minOrderQuantity: 0,
        producerId: '',
        producerPhone: '',
        images: [],
        status: 'available',
        views: 0,
        sales: 0,
        isActive: false,
        createdAt: now,
        updatedAt: now,
        badges: []
      }
    ];

    this.updateCategoryCounts();
  }

  private updateCategoryCounts() {
    this.categories.forEach(cat => cat.count = 0);

    this.allProducts.forEach(product => {
      const category = product.category?.toLowerCase();

      if (category) {
        if (category.includes('fruit')) {
          this.categories.find(c => c.name === 'Fruits')!.count++;
        } else if (category.includes('légume') || category.includes('vegetable')) {
          this.categories.find(c => c.name === 'Légumes')!.count++;
        } else if (category.includes('céréale') || category.includes('cereal')) {
          this.categories.find(c => c.name === 'Céréales')!.count++;
        } else {
          this.categories.find(c => c.name === 'Épicerie')!.count++;
        }
      }
    });
  }

  private updateRecommendedProducts() {
    if (this.allProducts.length > 0) {
      const shuffled = [...this.allProducts].sort(() => 0.5 - Math.random());
      this.recommendedProducts = shuffled.slice(0, 4).map(product => ({
        id: product.id || '',
        name: product.name,
        producer: product.producerName || 'Producteur',
        price: product.price,
        rating: product.rating || 4.0,
        image: this.getProductEmoji(product.name),
        certified: (product.certifications && product.certifications.length > 0) || false,
        category: product.category,
        unit: product.unit,
        stock: product.quantity
      }));
    } else {
      this.recommendedProducts = [];
    }
  }

  // ==================== RECHERCHE VOCALE ====================
  private initVoiceRecognition() {
    if (!this.SpeechRecognition) {
      this.isVoiceSupported = false;
      return;
    }

    this.recognition = new this.SpeechRecognition();
    this.recognition.lang = 'fr-FR';
    this.recognition.continuous = false;
    this.recognition.interimResults = false;

    this.recognition.onstart = () => {
      this.isListening = true;
    };

    this.recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript.toLowerCase();
      this.processVoiceCommand(transcript);
    };

    this.recognition.onerror = (event: any) => {
      console.error('Erreur reconnaissance vocale:', event.error);
      this.isListening = false;
    };

    this.recognition.onend = () => {
      this.isListening = false;
    };
  }

  toggleVoiceSearch() {
    if (!this.isVoiceSupported) {
      alert('Reconnaissance vocale non supportée');
      return;
    }

    if (this.isListening) {
      this.recognition.stop();
    } else {
      try {
        this.recognition.start();
      } catch (error) {
        console.error('Erreur démarrage reconnaissance:', error);
        this.isListening = false;
      }
    }
  }

  private processVoiceCommand(command: string) {
    this.lastVoiceCommand = command;

    const translatedTerm = this.translateWolofToFrench(command);
    this.searchTerm = translatedTerm;

    this.searchProductsByVoice(translatedTerm);
  }

  private translateWolofToFrench(text: string): string {
    const lowerText = text.toLowerCase().trim();

    for (const [wolof, french] of Object.entries(this.wolofToFrench)) {
      if (lowerText.includes(wolof)) {
        return french;
      }
    }

    return lowerText;
  }

  private searchProductsByVoice(searchTerm: string) {
    const searchTermLower = searchTerm.toLowerCase();

    const filtered = this.allProducts.filter(product => {
      if (product.name?.toLowerCase().includes(searchTermLower)) return true;
      if (product.description?.toLowerCase().includes(searchTermLower)) return true;
      if (product.category?.toLowerCase().includes(searchTermLower)) return true;
      return false;
    });

    this.voiceSearchResults = filtered.map(product => ({
      id: product.id || '',
      name: product.name,
      producer: product.producerName || 'Producteur',
      price: product.price,
      rating: product.rating || 4.0,
      image: this.getProductEmoji(product.name),
      certified: (product.certifications && product.certifications.length > 0) || false,
      category: product.category,
      unit: product.unit,
      stock: product.quantity
    }));
  }

  onSearch() {
    if (this.searchTerm.trim()) {
      this.searchProductsByVoice(this.searchTerm);
    }
  }

  clearVoiceResults() {
    this.voiceSearchResults = [];
    this.lastVoiceCommand = '';
    this.searchTerm = '';
  }

  // ==================== UTILITAIRES ====================
  getProductEmoji(productName: string): string {
    const lowerName = productName.toLowerCase();

    if (lowerName.includes('mangue')) return '🥭';
    if (lowerName.includes('tomate')) return '🍅';
    if (lowerName.includes('carotte')) return '🥕';
    if (lowerName.includes('orange')) return '🍊';
    if (lowerName.includes('pastèque')) return '🍉';
    if (lowerName.includes('banane')) return '🍌';
    if (lowerName.includes('oignon')) return '🧅';
    if (lowerName.includes('riz')) return '🌾';
    if (lowerName.includes('maïs')) return '🌽';
    if (lowerName.includes('niébé')) return '🥜';

    return '🌱';
  }

  formatPrice(price: number): string {
    return price.toLocaleString() + ' FCFA';
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'delivered': return '#4CAF50';
      case 'shipping': return '#2196F3';
      case 'pending': return '#FF9800';
      default: return '#9E9E9E';
    }
  }

  getStatusText(status: string): string {
    switch (status) {
      case 'delivered': return 'Livré';
      case 'shipping': return 'En cours';
      case 'pending': return 'En attente';
      default: return status;
    }
  }
private cleanTextForSpeech(text: string): string {
  return text
    // Supprimer markdown **
    .replace(/\*\*/g, '')

    // Supprimer emojis
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')

    // Supprimer HTML
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')

    // Supprimer puces
    .replace(/•/g, '')

    // 🔥 Corriger le pluriel pour la voix
    .replace(/\bproduits\b/gi, 'produit')
    .replace(/\bdisponibles\b/gi, 'disponible')
    .replace(/\bproducteurs\b/gi, 'producteur')

    // Supprimer les "(s)"
    .replace(/\(s\)/gi, '')

    // Nettoyage espaces
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

 
}

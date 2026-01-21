import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { FirebaseService } from '../../../services/firebase.service';
import { Product } from '../../../services/data.interfaces';
import { ChatbotService } from '../../../services/chatbot.service';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';


interface DashboardStat {
  label: string;
  value: number | string;
  icon: string;
  color: string;
  link?: string;}

interface RecentPurchase {
  ratingValue: number;
  id: string;
  product: string;
  producer: string;
  date: string;
  amount: number;

  status: 'delivered' | 'shipping' | 'pending';
  certified: boolean;

  // ⭐ RATING
  rated?: boolean;

  // ⭐ TEMPORAIRE (UI SEULEMENT)
  tempRating?: number;

  // 🔗 POUR FIRESTORE
  productId?: string;
  producerId?: string;
}




interface RecommendedProduct {
  id: string;
  name: string;
  producer: string;
  price: number;

  // ⭐ OBLIGATOIRE POUR LE HTML
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
    private chatbotService: ChatbotService,
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
  // =======================
  // 1️⃣ STATISTIQUES (peuvent être améliorées plus tard)
  // =======================
  this.stats = [
    { label: 'Achats ce mois', value: 6, icon: '🛍️', color: '#2196F3', link: '/buyer/purchases' },
    { label: 'Dépenses totales', value: '75,000', icon: '💰', color: '#4CAF50' },
    { label: 'Certifications vérifiées', value: 8, icon: '✅', color: '#FF9800', link: '/buyer/verifications' },
    { label: 'Vendeurs favoris', value: 3, icon: '❤️', color: '#E91E63', link: '/buyer/favorites' },
    { label: 'Messages', value: 5, icon: '✉️', color: '#9C27B0', link: '/buyer/messages' },
    { label: 'Panier', value: 2, icon: '🛒', color: '#FF5722', link: '/buyer/cart' }
  ];

  // =======================
  // 2️⃣ PRODUITS & PRODUCTEURS RÉELS
  // =======================
  await this.loadRealProducts();
  await this.loadProducers();
  this.updateRecommendedProducts();

  // =======================
  // 3️⃣ ACHATS RÉELS (🔥 TRÈS IMPORTANT)
  // =======================
  await this.loadRecentPurchases();
}
async loadRecentPurchases() {
  const purchases = await this.firebaseService.getBuyerSales(); 
  const ratings = await this.firebaseService.getMyRatings(); // collection ratings

  this.recentPurchases = purchases.map(p => {
    const rating = ratings.find(r => r.productId === p.productId);

    return {
      ...p,
      rated: !!rating,
      ratingValue: rating?.stars || 0
    };
  }).slice(0, 5); // 🔥 seulement 5 lignes
}






async loadRealProducts() {
  this.isLoadingProducts = true;

  try {
    const products = await this.firebaseService.getAllAvailableProducts();

    this.allProducts = products.map(p => ({
      ...p,
      rating: p.rating ?? 0,
      certifications: p.certifications ?? [],
      images: p.images ?? [],
      badges: p.badges ?? []
    }));

    this.updateCategoryCounts();
  } catch (e) {
    console.error('Erreur produits Firestore', e);
    this.allProducts = [];
  } finally {
    this.isLoadingProducts = false;
  }
}

selectRating(purchase: any, stars: number) {
  purchase.tempRating = stars;
}
async confirmRating(purchase: any) {
  if (!purchase.tempRating) return;

  await this.firebaseService.submitRating({
    productId: purchase.productId,
    producerId: purchase.producerId,
    stars: purchase.tempRating,
    buyerId: ''
  });

  purchase.ratingValue = purchase.tempRating;
  purchase.rated = true;
  purchase.tempRating = null;
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
  this.recommendedProducts = this.allProducts.slice(0, 4).map(p => ({
    id: p.id!,
    name: p.name,
    producer: p.producerName,
    price: p.price,
    rating: p.rating ?? 0,
    image: this.getProductEmoji(p.name),
    certified: p.certifications.length > 0,
    category: p.category,
    unit: p.unit,
    stock: p.quantity
  }));
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

  // ⭐ sécurisé
  rating: product.rating ?? 0,

  image: this.getProductEmoji(product.name),
  certified: product.certifications?.length > 0,
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
async ratePurchase(purchase: any, stars: number) {
  await this.firebaseService.submitRating({
    productId: purchase.productId,
    producerId: purchase.producerId,
    stars,
    buyerId: ''
  });

  purchase.rated = true;
  purchase.ratingValue = stars; // ⭐ IMPORTANT
}



async enrichProductsWithRatings() {
  for (const product of this.allProducts) {
    if (!product.id) continue;

    const avgRating =
      await this.firebaseService.getAverageRatingForProduct(product.id);

    product.rating = avgRating ?? 0;
  }
}


}
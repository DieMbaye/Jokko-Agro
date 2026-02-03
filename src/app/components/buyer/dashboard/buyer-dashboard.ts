import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  AfterViewChecked,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { FirebaseService } from '../../../services/firebase.service';
import { Product } from '../../../interfaces/data.interfaces';
import { ChatbotService } from '../../../services/chatbot.service';
import {
  NotificationService,
  AppNotification,
} from '../../../services/notification.service';
import { Subscription } from 'rxjs';

interface DashboardStat {
  label: string;
  value: number | string;
  icon: string;
  color: string;
  link?: string;
}

interface RecentPurchase {
  ratingValue: number;
  id: string;
  product: string;
  producer: string;
  date: string;
  amount: number;
  status: 'delivered' | 'shipping' | 'pending';
  certified: boolean;
  rated?: boolean;
  tempRating?: number;
  productId?: string;
  producerId?: string;
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
  styleUrls: ['./buyer-dashboard.css'],
})
export class BuyerDashboardComponent
  implements OnInit, OnDestroy, AfterViewChecked
{
  userData: any;
  stats: DashboardStat[] = [];
  recentPurchases: RecentPurchase[] = [];
  recommendedProducts: RecommendedProduct[] = [];
  chatMode: 'normal' | 'estimate' | 'compare' = 'normal';

  categories = [
    { name: 'Légumes', icon: '🥦', count: 0 },
    { name: 'Fruits', icon: '🍎', count: 0 },
    { name: 'Céréales', icon: '🌾', count: 0 },
    { name: 'Épicerie', icon: '🛒', count: 0 },
  ];

  // Variables pour la recherche vocale
  isListening = false;
  isSpeaking = false;
  isSpeechPaused = false;
  currentUtterance: SpeechSynthesisUtterance | null = null;
  isVoiceInput = false;
  isDashboardLoading = true;
  isVoiceSupported = true;
  searchTerm = '';
  voiceSearchResults: RecommendedProduct[] = [];
  lastVoiceCommand = '';
  showVoiceHelp = true;
  audioContext!: AudioContext;
  analyser!: AnalyserNode;
  microphoneStream!: MediaStream;
  dataArray!: Uint8Array;
  animationFrameId: number | null = null;
  audioLevel = 0; // 0 → 100
  waveformBars: number[] = new Array(20).fill(5);


  // 🔔 Notifications
  notifications: AppNotification[] = [];
  unreadCount = 0;
  showNotifications = false;
  private notifSub: Subscription | undefined;

  // Données dynamiques
  allProducts: Product[] = [];
  allProducers: any[] = [];
  isLoadingProducts = false;
  allPurchases: RecentPurchase[] = [];
  // 🔥 CONTEXTE DES QUESTIONS MULTI-ÉTAPES
  pendingIntent: 'estimate' | 'compare' | null = null;

  // DICTIONNAIRE WOLOF-FRANÇAIS
  private wolofToFrench: { [key: string]: string } = {
    tomater: 'tomate',
    manguo: 'mangue',
    carotte: 'carotte',
    orange: 'orange',
    riz: 'riz',
    oignon: 'oignon',
    banane: 'banane',
    citron: 'citron',
  };

  private recognition: any;
  private SpeechRecognition =
    (window as any).webkitSpeechRecognition ||
    (window as any).SpeechRecognition;

  // ==================== CHATBOT ====================
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

  // NOUVEAUX : Modales
  showPriceEstimationModal = false;
  showCompareProducersModal = false;
  priceEstimationProduct = '';
  compareProduct = '';
  availableProductSuggestions: string[] = [];
Math: any;

  constructor(
    private authService: AuthService,
    private firebaseService: FirebaseService,
    private chatbotService: ChatbotService,
    private notificationService: NotificationService,
  ) {}

  async ngOnInit() {
  // 🎤 TOUJOURS EN PREMIER
  this.initSpeechRecognition();

  this.userData = this.authService.getUserData();
  this.userName = this.userData?.fullName || 'Utilisateur';
  this.userInitials = this.getInitials(this.userName);

  this.notifSub = this.notificationService
    .listenUserNotifications()
    .subscribe((notifs) => {
      this.notifications = notifs;
      this.unreadCount = notifs.filter((n) => !n.read).length;
    });

  await this.loadDashboardData();
}

  ngAfterViewChecked() {
    if (this.shouldScroll) {
      this.scrollChatToBottom();
    }
  }
  askEstimateProduct() {
    this.pendingIntent = 'estimate';
    this.addMessage('📊 Quel produit souhaitez-vous estimer ?', false);
  }

  askCompareProducers() {
    this.pendingIntent = 'compare';
    this.addMessage(
      '🏆 Pour quel produit voulez-vous comparer les producteurs ?',
      false,
    );
  }

  ngOnDestroy() {
    if (this.recognition) {
      this.recognition.stop();
    }

    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
    }

    if (this.notifSub) {
      this.notifSub.unsubscribe();
    }
  }

  @HostListener('document:click', ['$event'])
  onClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.notifications-wrapper')) {
      this.showNotifications = false;
    }
  }

  toggleNotifications() {
    this.showNotifications = !this.showNotifications;
  }

  async openNotification(notification: any) {
    if (!notification.read && notification.id) {
      await this.notificationService.markAsRead(notification.id);
    }
    this.showNotifications = false;
  }

  // ==================== CHATBOT ====================
  toggleChatbot() {
    this.isChatbotOpen = !this.isChatbotOpen;

    if (!this.isChatbotOpen) {
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

  const userInput = this.currentMessage.trim();
  this.currentMessage = '';
  this.isProcessing = true;

  // ➕ afficher le message utilisateur
  this.addMessage(userInput, true);

  let finalQuestion = userInput;

  /* ==================================================
     🔥 GESTION DES QUESTIONS MULTI-ÉTAPES
     (EX: comparer → tomate)
  ================================================== */

  if (this.pendingIntent === 'compare') {
    finalQuestion = `comparer producteurs ${userInput}`;
    this.pendingIntent = null;
  }

  else if (this.pendingIntent === 'estimate') {
    finalQuestion = `estimation ${userInput}`;
    this.pendingIntent = null;
  }

  /* ==================================================
     🤖 APPEL DU CHATBOT
  ================================================== */

  this.processQuestion(finalQuestion)
    .then((response) => {
      // ➕ afficher la réponse du bot
      this.addMessage(response, false);

      // 🔊 lecture vocale uniquement si la question vient du micro
      if (this.isVoiceInput) {
        setTimeout(() => {
          this.speak(response);
        }, 300);
      }
    })
    .catch(() => {
      this.addMessage('❌ Une erreur est survenue.', false);
    })
    .finally(() => {
      this.isProcessing = false;
      // ⚠️ isVoiceInput est réinitialisé dans speak().onend
    });
}

async startAudioVisualization() {
  this.audioContext = new AudioContext();

  this.microphoneStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
  });

  const source = this.audioContext.createMediaStreamSource(
    this.microphoneStream,
  );

  this.analyser = this.audioContext.createAnalyser();
  this.analyser.fftSize = 256;

  const bufferLength = this.analyser.frequencyBinCount;

  // ✅ Uint8Array NON générique (compatible TS)
  this.dataArray = new Uint8Array(bufferLength);

  source.connect(this.analyser);

  this.animateAudio();
}


animateAudio() {
  if (!this.analyser || !this.dataArray) return;

  this.analyser.getByteFrequencyData(this.dataArray);

  const barsCount = this.waveformBars.length;
  const step = Math.floor(this.dataArray.length / barsCount);

  const newBars: number[] = [];

  for (let i = 0; i < barsCount; i++) {
    let sum = 0;

    for (let j = 0; j < step; j++) {
      sum += this.dataArray[i * step + j];
    }

    const avg = sum / step;

    // 🔥 amplification + clamp
    const height = Math.min(100, Math.max(5, avg * 1.8));

    newBars.push(height);
  }

  this.waveformBars = newBars;

  this.animationFrameId = requestAnimationFrame(() =>
    this.animateAudio(),
  );
}




stopAudioVisualization() {
  if (this.animationFrameId !== null) {
    cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = null;
  }

  this.audioLevel = 0;

  if (this.microphoneStream) {
    this.microphoneStream.getTracks().forEach((track) => track.stop());
  }

  if (this.audioContext) {
    this.audioContext.close();
  }
}




  askQuestion(question: string) {
    this.currentMessage = question;
    this.sendMessage();
  }

  newChat() {
    this.chatHistory = [];
    this.shouldScroll = true;
  }

  private isThankYouMessage(message: string): boolean {
    const lowerMessage = message.toLowerCase().trim();
    const thankYouWords = [
      'merci',
      'thank you',
      'thanks',
      'merci beaucoup',
      'je te remercie',
      'cimer',
      'merci bien',
    ];
    return thankYouWords.some((word) => lowerMessage.includes(word));
  }

  private processThankYou(): string {
    return (
      "🙏 De rien ! N'hésitez pas si vous avez d'autres questions.<br>" +
      'Je suis là pour vous aider à trouver les meilleurs produits !'
    );
  }

initSpeechRecognition() {
  const SpeechRecognition =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;

  if (!SpeechRecognition) {
    console.error('🎤 SpeechRecognition non supporté par ce navigateur');
    return;
  }

  this.recognition = new SpeechRecognition();

  this.recognition.lang = 'fr-FR';
  this.recognition.continuous = false;
  this.recognition.interimResults = false;

  // 🎤 MICRO DÉMARRE
  this.recognition.onstart = () => {
    console.log('🎤 Micro actif');
    this.isListening = true;
  };

  // 🛑 MICRO S’ARRÊTE
  this.recognition.onend = () => {
    console.log('🛑 Micro arrêté');
    this.isListening = false;

    // 🔴 arrêter l’animation audio (WhatsApp style)
    this.stopAudioVisualization();
  };

  // ❌ ERREUR MICRO
  this.recognition.onerror = (event: any) => {
    console.error('🎤 Erreur reconnaissance vocale:', event.error);
    this.isListening = false;

    this.stopAudioVisualization();
  };

  // 🗣️ TEXTE RECONNU
  this.recognition.onresult = (event: any) => {
    const transcript = event.results[0][0].transcript;
    console.log('🗣️ Reconnu :', transcript);

    this.currentMessage = transcript;

    // ⏱️ petit délai UX
    setTimeout(() => {
      this.sendMessage();
    }, 300);
  };
}


async startVoiceInput() {
  if (!this.recognition) return;
  if (this.isListening) return;

  // 🔥 flag micro
  this.isVoiceInput = true;

  // 🔥 DÉMARRER VISUALISATION AUDIO
  await this.startAudioVisualization();

  try {
    this.recognition.start();
    this.isListening = true;
  } catch (error) {
    this.stopAudioVisualization();
    this.isListening = false;
    this.isVoiceInput = false;
  }
}




speak(text: string) {
  if (!('speechSynthesis' in window)) return;

  // Stop toute lecture précédente
  window.speechSynthesis.cancel();

  const cleanText = this.cleanTextForSpeech(text);
  if (!cleanText) return;

  // 🔹 Découper en phrases naturelles
  const sentences = cleanText
    .split(/(?<=[.!?])\s+/)
    .filter(s => s.length > 0);

  let index = 0;
  this.isSpeaking = true;
  this.isSpeechPaused = false;

  const speakNext = () => {
    if (index >= sentences.length) {
      // ✅ FIN PROPRE
      this.isSpeaking = false;
      this.currentUtterance = null;
      return;
    }

    const utterance = new SpeechSynthesisUtterance(sentences[index]);
    utterance.lang = 'fr-FR';
    utterance.rate = 0.95;   // vitesse naturelle
    utterance.pitch = 1;     // voix normale
    utterance.volume = 1;

    this.currentUtterance = utterance;

    utterance.onend = () => {
      index++;
      // ⏸️ petite pause naturelle entre phrases
      setTimeout(() => {
        speakNext();
      }, 300);
    };

    utterance.onerror = () => {
      this.isSpeaking = false;
      this.currentUtterance = null;
    };

    window.speechSynthesis.speak(utterance);
  };

  speakNext();
}


pauseSpeech() {
  if (this.isSpeaking && !this.isSpeechPaused) {
    window.speechSynthesis.pause();
    this.isSpeechPaused = true;
  }
}

resumeSpeech() {
  if (this.isSpeaking && this.isSpeechPaused) {
    window.speechSynthesis.resume();
    this.isSpeechPaused = false;
  }
}

stopSpeech() {
  window.speechSynthesis.cancel();
  this.isSpeaking = false;
  this.isSpeechPaused = false;
  this.currentUtterance = null;
}

  private async processQuestion(question: string): Promise<string> {
    this.addMessage('', false, true);

    try {
      const response: string = await this.chatbotService.getIntelligentResponse(
        question,
        this.allProducts,
        this.allProducers,
      );

      this.removeLoadingMessage();
      return this.formatBotResponse(response);
    } catch (error) {
      console.error('Erreur chatbot:', error);
      this.removeLoadingMessage();

      return (
        '❌ <strong>Désolé, je rencontre une difficulté technique.</strong><br>' +
        'Veuillez réessayer dans quelques instants.'
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
      isLoading: isLoading,
    };

    this.chatHistory.push(message);
    this.shouldScroll = true;
    this.scrollChatToBottom();
  }

  private addLoadingMessage() {
    this.addMessage('', false, true);
  }

  private removeLoadingMessage() {
    if (
      this.chatHistory.length > 0 &&
      this.chatHistory[this.chatHistory.length - 1].isLoading
    ) {
      this.chatHistory.pop();
    }
  }

  private scrollChatToBottom() {
    if (!this.shouldScroll) return;

    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
    }

    this.scrollTimeout = setTimeout(() => {
      if (this.chatMessages?.nativeElement) {
        const container = this.chatMessages.nativeElement;

        container.scrollTo({
          top: container.scrollHeight,
          behavior: 'smooth',
        });

        setTimeout(() => {
          container.scrollTop = container.scrollHeight;
        }, 100);
      }

      setTimeout(() => {
        this.shouldScroll = false;
      }, 200);
    }, 150);
  }

  onChatScroll() {
    const container = this.chatMessages?.nativeElement;
    if (container) {
      const isNearBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight <
        100;
      this.shouldScroll = isNearBottom;
    }
  }

  private getInitials(name: string): string {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  // ==================== DASHBOARD ====================
  async loadDashboardData() {
    try {
      await Promise.all([
        this.loadRealProducts(),
        this.loadProducers(),
        this.loadRecentPurchases(),
      ]);

      this.updateRecommendedProducts();
      this.computeStats();
    } catch (error) {
      console.error('Erreur chargement dashboard:', error);
    } finally {
      this.isDashboardLoading = false;
    }
  }

  async loadRecentPurchases() {
    const purchases = await this.firebaseService.getBuyerSales();
    const ratings = await this.firebaseService.getMyRatings();

    this.allPurchases = purchases.map((p) => {
      const rating = ratings.find((r) => r.productId === p.productId);
      return {
        ...p,
        rated: !!rating,
        ratingValue: rating?.stars || 0,
      };
    });

    this.recentPurchases = this.allPurchases.slice(0, 5);
  }

  private computeStats() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const purchasesThisMonth = this.allPurchases.filter((p) => {
      const d = new Date(p.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    const totalSpent = this.allPurchases.reduce(
      (sum, p) => sum + (p.amount || 0),
      0,
    );

    const certifiedCount = this.allPurchases.filter((p) => p.certified).length;

    this.stats = [
      {
        label: 'Achats ce mois',
        value: purchasesThisMonth.length,
        icon: '🛍️',
        color: '#2196F3',
        link: '/buyer/purchases',
      },
      {
        label: 'Dépenses totales',
        value: totalSpent.toLocaleString() + ' FCFA',
        icon: '💰',
        color: '#4CAF50',
      },
      {
        label: 'Certifications vérifiées',
        value: certifiedCount,
        icon: '✅',
        color: '#FF9800',
      },
      {
        label: 'Vendeurs favoris',
        value: 0,
        icon: '❤️',
        color: '#E91E63',
      },
    ];
  }

  async loadRealProducts() {
    this.isLoadingProducts = true;

    try {
      const products = await this.firebaseService.getAllAvailableProducts();

      this.allProducts = products.map((p) => ({
        ...p,
        rating: p.rating ?? 0,
        certifications: p.certifications ?? [],
        images: p.images ?? [],
        badges: p.badges ?? [],
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
      buyerId: '',
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
    this.allProducts.forEach((product) => {
      if (product.producerName) {
        producers.add(product.producerName);
      }
    });

    this.allProducers = Array.from(producers).map((name) => ({
      name: name,
      productCount: this.allProducts.filter((p) => p.producerName === name)
        .length,
    }));

    console.log(
      `👨‍🌾 ${this.allProducers.length} producteurs extraits des produits`,
    );
  }

  private updateCategoryCounts() {
    this.categories.forEach((cat) => (cat.count = 0));

    this.allProducts.forEach((product) => {
      const category = product.category?.toLowerCase();

      if (category) {
        if (category.includes('fruit')) {
          this.categories.find((c) => c.name === 'Fruits')!.count++;
        } else if (
          category.includes('légume') ||
          category.includes('vegetable')
        ) {
          this.categories.find((c) => c.name === 'Légumes')!.count++;
        } else if (
          category.includes('céréale') ||
          category.includes('cereal')
        ) {
          this.categories.find((c) => c.name === 'Céréales')!.count++;
        } else {
          this.categories.find((c) => c.name === 'Épicerie')!.count++;
        }
      }
    });
  }

  private updateRecommendedProducts() {
    this.recommendedProducts = this.allProducts.slice(0, 4).map((p) => ({
      id: p.id!,
      name: p.name,
      producer: p.producerName,
      price: p.price,
      rating: p.rating ?? 0,
      image: this.getProductEmoji(p.name),
      certified: p.certifications.length > 0,
      category: p.category,
      unit: p.unit,
      stock: p.quantity,
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

    const filtered = this.allProducts.filter((product) => {
      if (product.name?.toLowerCase().includes(searchTermLower)) return true;
      if (product.description?.toLowerCase().includes(searchTermLower))
        return true;
      if (product.category?.toLowerCase().includes(searchTermLower))
        return true;
      return false;
    });

    this.voiceSearchResults = filtered.map((product) => ({
      id: product.id || '',
      name: product.name,
      producer: product.producerName || 'Producteur',
      price: product.price,
      rating: product.rating ?? 0,
      image: this.getProductEmoji(product.name),
      certified: product.certifications?.length > 0,
      category: product.category,
      unit: product.unit,
      stock: product.quantity,
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
      case 'delivered':
        return '#4CAF50';
      case 'shipping':
        return '#2196F3';
      case 'pending':
        return '#FF9800';
      default:
        return '#9E9E9E';
    }
  }

  getStatusText(status: string): string {
    switch (status) {
      case 'delivered':
        return 'Livré';
      case 'shipping':
        return 'En cours';
      case 'pending':
        return 'En attente';
      default:
        return status;
    }
  }

  private cleanTextForSpeech(text: string): string {
    return text
      .replace(/\*\*/g, '')
      .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]*>/g, '')
      .replace(/•/g, '')
      .replace(/\bproduits\b/gi, 'produit')
      .replace(/\bdisponibles\b/gi, 'disponible')
      .replace(/\bproducteurs\b/gi, 'producteur')
      .replace(/\(s\)/gi, '')
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async ratePurchase(purchase: any, stars: number) {
    await this.firebaseService.submitRating({
      productId: purchase.productId ?? '',
      producerId: purchase.producerId ?? '',
      stars,
      buyerId: '',
    });

    purchase.rated = true;
    purchase.ratingValue = stars;
  }

  async rate(purchase: RecentPurchase, stars: number) {
    if (purchase.status !== 'delivered') return;
    if (purchase.rated) return;

    const user = this.authService.getUserData();

    if (!user || !user.uid) {
      alert('Utilisateur non connecté');
      return;
    }

    await this.firebaseService.submitRating({
      productId: purchase.productId!,
      producerId: purchase.producerId!,
      stars,
      buyerId: user.uid,
    });

    purchase.rated = true;
    purchase.ratingValue = stars;
  }

  starsArray(): number[] {
    return [1, 2, 3, 4, 5];
  }

  async enrichProductsWithRatings() {
    for (const product of this.allProducts) {
      if (!product.id) continue;

      const avgRating = await this.firebaseService.getAverageRatingForProduct(
        product.id,
      );

      product.rating = avgRating ?? 0;
    }
  }

  // ==================== MODALES ====================
  openPriceEstimationModal() {
    this.showPriceEstimationModal = true;

    this.availableProductSuggestions = this.allProducts
      .filter((p) => p.status === 'available' && p.quantity > 0)
      .map((p) => p.name)
      .filter((value, index, self) => self.indexOf(value) === index)
      .slice(0, 10);

    setTimeout(() => {
      const input = document.querySelector(
        '.modal-product-input',
      ) as HTMLInputElement;
      if (input) input.focus();
    }, 100);
  }

  closePriceEstimationModal() {
    this.showPriceEstimationModal = false;
    this.priceEstimationProduct = '';
    this.availableProductSuggestions = [];
  }

  submitPriceEstimation() {
    if (!this.priceEstimationProduct.trim()) {
      return;
    }

    const question = `Estimation prix ${this.priceEstimationProduct}`;

    this.closePriceEstimationModal();

    setTimeout(() => {
      this.isChatbotOpen = true;
      setTimeout(() => {
        this.currentMessage = question;
        this.sendMessage();
      }, 300);
    }, 200);
  }

  selectProductSuggestion(productName: string) {
    this.priceEstimationProduct = productName;
    this.submitPriceEstimation();
  }

  openCompareProducersModal() {
    this.showCompareProducersModal = true;

    this.availableProductSuggestions = this.allProducts
      .filter((p) => p.status === 'available' && p.quantity > 0)
      .map((p) => p.name)
      .filter((value, index, self) => self.indexOf(value) === index)
      .slice(0, 10);

    setTimeout(() => {
      const input = document.querySelector(
        '.compare-product-input',
      ) as HTMLInputElement;
      if (input) input.focus();
    }, 100);
  }

  closeCompareProducersModal() {
    this.showCompareProducersModal = false;
    this.compareProduct = '';
    this.availableProductSuggestions = [];
  }

  submitCompareProducers() {
    if (!this.compareProduct.trim()) {
      return;
    }

    const question = `Comparer producteurs pour ${this.compareProduct}`;

    this.closeCompareProducersModal();

    setTimeout(() => {
      this.isChatbotOpen = true;
      setTimeout(() => {
        this.currentMessage = question;
        this.sendMessage();
      }, 300);
    }, 200);
  }

  selectCompareSuggestion(productName: string) {
    this.compareProduct = productName;
    this.submitCompareProducers();
  }
}

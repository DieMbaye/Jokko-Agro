import {
  Component,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  AfterViewInit,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatbotService } from '../../services/chatbot.service';
import { WolofVoiceService } from '../../services/wolof-voice.service';
import { Product } from '../../interfaces/data.interfaces';

interface ChatMessage {
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  isTyping?: boolean;
  voicePlayed?: boolean;
  isWelcome?: boolean;
}

interface VoiceCommand {
  text: string;
  language: 'fr' | 'wolof';
  confidence: number;
}

@Component({
  selector: 'app-chatbot-voice',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chatbot-voice.component.html',
  styleUrls: ['./chatbot-voice.component.css'],
})
export class ChatbotVoiceComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef;
  @ViewChild('audioPlayer') private audioPlayer!: ElementRef;
  @ViewChild('messageInput') private messageInput!: ElementRef<HTMLTextAreaElement>;

  // État du chatbot
  isOpen = false;
  isListening = false;
  isSpeaking = false;
  isProcessing = false;
  currentLanguage: 'fr' | 'wolof' = 'fr';
  isSpeechPaused = false;
  hasUnreadMessages = false;
  showWelcomeMessage = true;

  // Messages
  messages: ChatMessage[] = [];
  userInput = '';
  suggestions: string[] = [];

  // Reconnaissance vocale
  private recognition: any;
  private speechSynthesis = window.speechSynthesis;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private silenceTimer: any;
  private typingTimeout: any;

  // Données
  private products: Product[] = [];
  private producers: any[] = [];

  // Configuration
  private readonly VOICE_CONFIG = {
    fr: {
      lang: 'fr-FR',
      rate: 1.0,
      pitch: 1.0,
      voiceName: 'Google français',
      volume: 1.0
    },
    wolof: {
      lang: 'fr-FR',
      rate: 0.9,
      pitch: 1.1,
      voiceName: '',
      volume: 1.0
    },
  };

  // Suggestions par défaut
  private readonly DEFAULT_SUGGESTIONS = [
    'Quels produits sont disponibles ?',
    'Estimation prix tomates',
    'Comment faire une commande ?',
    'Producteurs actifs',
    'Nani prix riz ?',
    'Am na ci mango ?',
    'Comparer les mangues',
    'Meilleur producteur de riz',
  ];

  constructor(
    private chatbotService: ChatbotService,
    private wolofVoiceService: WolofVoiceService,
    private el: ElementRef,
  ) {}

  ngOnInit() {
    this.initVoiceRecognition();
    this.initWelcomeMessage();
    this.loadData();
    this.initEventListeners();
  }

  ngAfterViewInit() {
    this.scrollToBottom();
  }

  ngOnDestroy() {
    this.cleanup();
  }

  // ==================== INITIALISATION ====================

  private initVoiceRecognition() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;

      try {
        this.recognition = new SpeechRecognition();

        // Configuration avancée
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.maxAlternatives = 3;
        this.recognition.lang = this.currentLanguage === 'fr' ? 'fr-FR' : 'fr-FR';
        this.recognition.grammars = this.createSpeechGrammarList();

        // Événements améliorés
        this.recognition.onstart = () => {
          console.log('🎤 Reconnaissance vocale démarrée');
          this.isListening = true;
          this.addSystemMessage('🎤 Écoute en cours... Parlez maintenant.');
          this.startSilenceDetection();
        };

        this.recognition.onresult = (event: any) => {
          this.handleSpeechResult(event);
        };

        this.recognition.onerror = (event: any) => {
          console.error('❌ Erreur reconnaissance vocale:', event.error);
          this.isListening = false;
          this.stopSilenceDetection();

          // CORRECTION: Utiliser un index typé avec Record
          const errorMessages: Record<string, string> = {
            'no-speech': 'Aucune parole détectée. Réessayez.',
            'audio-capture': 'Microphone non accessible.',
            'not-allowed': 'Permission microphone refusée.',
            'network': 'Erreur réseau.',
            'aborted': 'Reconnaissance interrompue.',
            'service-not-allowed': 'Service non autorisé.',
          };

          this.addSystemMessage(`❌ ${errorMessages[event.error] || 'Erreur inconnue'}`);
        };

        this.recognition.onend = () => {
          console.log('🎤 Reconnaissance vocale terminée');
          this.isListening = false;
          this.stopSilenceDetection();
        };

      } catch (error) {
        console.error('❌ Impossible d\'initialiser la reconnaissance vocale:', error);
        this.addSystemMessage('❌ Reconnaissance vocale non disponible.');
      }
    } else {
      this.addSystemMessage('❌ Votre navigateur ne supporte pas la reconnaissance vocale.');
    }
  }

  private createSpeechGrammarList(): any {
    if ('SpeechGrammarList' in window) {
      const SpeechGrammarList = (window as any).SpeechGrammarList || (window as any).webkitSpeechGrammarList;
      const grammarList = new SpeechGrammarList();

      // Grammaire pour produits communs
      const grammar = `#JSGF V1.0;
        grammar produits;
        public <produit> = tomate | riz | mangue | oignon | carotte | patate | manioc | niébé | maïs | arachide;
        public <action> = prix | estimation | acheter | commander | comparer | disponible;
        public <question> = nani | am na ci | combien | quelle | quel est | comment;
      `;

      grammarList.addFromString(grammar, 1);
      return grammarList;
    }
    return null;
  }

  private handleSpeechResult(event: any) {
    const results = event.results;
    if (results.length === 0) return;

    const lastResult = results[results.length - 1];
    const transcript = lastResult[0].transcript;
    const confidence = lastResult[0].confidence;

    if (lastResult.isFinal) {
      this.stopSilenceDetection();
      this.processVoiceInput(transcript, confidence);
    } else {
      // Affichage en temps réel de la transcription
      this.userInput = transcript;
    }
  }

  private startSilenceDetection() {
    this.stopSilenceDetection();
    this.silenceTimer = setTimeout(() => {
      if (this.isListening) {
        this.stopListening();
        this.addSystemMessage('⏱️ Silence détecté, écoute arrêtée.');
      }
    }, 10000); // 10 secondes de silence max
  }

  private stopSilenceDetection() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  private initWelcomeMessage() {
    // Ajouter le message de bienvenue après un court délai
    setTimeout(() => {
      this.showWelcomeMessage = true;
    }, 300);
  }

  private initEventListeners() {
    // Gestion des clics extérieurs pour fermer le chatbot
    document.addEventListener('click', this.handleOutsideClick.bind(this));
  }

  private handleOutsideClick(event: MouseEvent) {
    const clickedInside = this.el.nativeElement.contains(event.target);
    if (!clickedInside && this.isOpen) {
      this.toggleChat();
    }
  }

  private cleanup() {
    this.stopSpeaking();
    this.stopListening();

    if (this.recognition) {
      this.recognition.abort();
    }

    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }

    document.removeEventListener('click', this.handleOutsideClick.bind(this));
  }

  // ==================== INTERFACE UTILISATEUR ====================

  toggleChat() {
    this.isOpen = !this.isOpen;

    if (this.isOpen) {
      this.hasUnreadMessages = false;
      setTimeout(() => {
        this.scrollToBottom();
        this.focusTextarea();
      }, 100);

      this.updateSuggestions();
      this.stopSpeaking();
    } else {
      this.stopListening();
    }
  }

  toggleListening() {
    if (this.isListening) {
      this.stopListening();
    } else {
      this.startListening();
    }
  }

  startListening() {
    if (!this.recognition) {
      this.addSystemMessage('❌ Reconnaissance vocale non disponible.');
      return;
    }

    if (this.isSpeaking) {
      this.stopSpeaking();
    }

    try {
      this.recognition.start();
      this.playSound('start');
    } catch (error) {
      console.error('❌ Erreur démarrage écoute:', error);
      this.addSystemMessage('❌ Impossible de démarrer l\'écoute.');
    }
  }

  stopListening() {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
      this.stopSilenceDetection();
    }
  }

  toggleLanguage() {
    const oldLanguage = this.currentLanguage;
    this.currentLanguage = this.currentLanguage === 'fr' ? 'wolof' : 'fr';

    this.addSystemMessage(
      `🌍 Langue changée: ${oldLanguage === 'fr' ? 'Français → Wolof' : 'Wolof → Français'}`
    );

    this.updateSuggestions();

    // Mettre à jour la langue de reconnaissance
    if (this.recognition) {
      this.recognition.lang = this.currentLanguage === 'fr' ? 'fr-FR' : 'fr-FR';
    }

    // Feedback sonore
    this.playSound('success');
  }

  // ==================== GESTION DES MESSAGES ====================

  private addMessage(text: string, sender: 'user' | 'bot', options: {
    isTyping?: boolean;
    autoSpeak?: boolean;
    isWelcome?: boolean;
  } = {}) {

    const message: ChatMessage = {
      text,
      sender,
      timestamp: new Date(),
      isTyping: options.isTyping || false,
      isWelcome: options.isWelcome || false,
    };

    this.messages.push(message);
    this.scrollToBottom();

    // Sauvegarder dans l'historique local
    this.saveToHistory(message);

    // Marquer comme non lu si le chatbot est fermé
    if (sender === 'bot' && !this.isOpen) {
      this.hasUnreadMessages = true;
    }

    // Parler automatiquement si demandé
    if (sender === 'bot' && options.autoSpeak && !options.isTyping) {
      setTimeout(() => this.speak(text), 300);
    }
  }

  addUserMessage(text: string) {
    this.addMessage(text, 'user');
    this.processTextInput(text);
  }

  addBotMessage(text: string, autoSpeak = false) {
    // Simuler le typing
    this.addMessage('', 'bot', { isTyping: true });

    setTimeout(() => {
      const lastMessage = this.messages[this.messages.length - 1];
      if (lastMessage && lastMessage.sender === 'bot') {
        lastMessage.isTyping = false;
        lastMessage.text = text;
      }
      this.scrollToBottom();

      if (autoSpeak) {
        this.speak(text);
      }
    }, 800 + text.length * 10); // Délai proportionnel à la longueur
  }

  addSystemMessage(text: string) {
    this.addMessage(`🔔 ${text}`, 'bot');
  }

  private scrollToBottom(smooth = true) {
    setTimeout(() => {
      if (this.messagesContainer) {
        const container = this.messagesContainer.nativeElement;
        if (smooth) {
          container.scrollTo({
            top: container.scrollHeight,
            behavior: 'smooth'
          });
        } else {
          container.scrollTop = container.scrollHeight;
        }
      }
    }, 50);
  }

  private focusTextarea() {
    if (this.messageInput) {
      setTimeout(() => {
        this.messageInput.nativeElement.focus();
      }, 100);
    }
  }

  // ==================== TRAITEMENT DES ENTRÉES ====================

  private processVoiceInput(transcript: string, confidence: number) {
    const command: VoiceCommand = {
      text: transcript,
      language: this.currentLanguage,
      confidence,
    };

    // Afficher la commande reconnue avec l'icône micro
    this.addUserMessage(`🎤 ${transcript} (${Math.round(confidence * 100)}%)`);

    // Traiter la commande
    this.processTextInput(transcript);

    // Donner un feedback sonore
    this.playSound('success');
  }

  sendTextMessage() {
    if (!this.userInput.trim()) return;

    const text = this.userInput.trim();
    this.addUserMessage(text);
    this.userInput = '';
    this.updateSuggestions();
    this.adjustTextareaHeight();
  }

onTextareaEnter(event: any) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    this.sendTextMessage();
  }
}

  onTextareaInput(event: Event) {
    this.adjustTextareaHeight();
  }

  private adjustTextareaHeight() {
    if (this.messageInput) {
      const textarea = this.messageInput.nativeElement;
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }
  }

  private async processTextInput(text: string) {
    this.isProcessing = true;

    try {
      let response: string;

      // Détecter la langue
      const isWolof = this.detectWolof(text);

      if (isWolof && this.currentLanguage === 'wolof') {
        // Traitement Wolof
        const intent = this.wolofVoiceService.detectIntent(text);
        response = await this.handleWolofIntent(intent, text);
      } else {
        // Traitement Français via chatbot service
        response = await this.chatbotService.getIntelligentResponse(
          text,
          this.products,
          this.producers,
        );
      }

      // Ajouter la réponse
      this.addBotMessage(response, true); // autoSpeak = true

    } catch (error) {
      console.error('❌ Erreur traitement:', error);
      this.addBotMessage('❌ Désolé, une erreur est survenue. Veuillez réessayer.', false);
    } finally {
      this.isProcessing = false;
    }
  }

  private detectWolof(text: string): boolean {
    const wolofIndicators = [
      'na', 'ci', 'bi', 'la', 'def', 'am', 'bëgg', 'jënd', 'nanga',
      'jërejëf', 'waaw', 'dédét', 'tey', 'mooy', 'eske', 'meun'
    ];
    const lowerText = text.toLowerCase();
    return wolofIndicators.some((indicator) => lowerText.includes(indicator));
  }

  private async handleWolofIntent(intent: any, text: string): Promise<string> {
    switch (intent) {
      case 'GREETING':
        return this.wolofVoiceService.getGreetingResponse();
      case 'AVAILABILITY':
        const product = this.wolofVoiceService.extractProduct(text);
        if (product) {
          return this.getProductAvailability(product.french);
        } else {
          return this.wolofVoiceService.getAvailabilityResponse({ product: 'produit' });
        }
      default:
        const translated = this.wolofVoiceService.translateToFrench(text);
        return await this.chatbotService.getIntelligentResponse(
          translated,
          this.products,
          this.producers
        );
    }
  }

  private getProductAvailability(product: string): string {
    const availableProducts = this.products.filter(p =>
      p.name.toLowerCase().includes(product.toLowerCase()) &&
      p.status === 'available' &&
      p.quantity > 0
    );

    const available = availableProducts.length > 0;

    return (
      this.wolofVoiceService.getAvailabilityResponse({
        product: product,
        isAvailable: available
      }) +
      (available ? ` (${availableProducts.length} option(s) disponible(s))` : ` (non disponible)`)
    );
  }

  // ==================== SYNTHÈSE VOCALE AMÉLIORÉE ====================

  speak(text: string, lang: 'fr' | 'wolof' = this.currentLanguage) {
    this.stopSpeaking();

    if (!this.speechSynthesis) {
      console.warn('⚠️ Synthèse vocale non supportée');
      return;
    }

    // Nettoyer le texte
    const cleanText = this.cleanTextForSpeech(text);

    this.currentUtterance = new SpeechSynthesisUtterance(cleanText);

    // Configuration
    const config = this.VOICE_CONFIG[lang];
    this.currentUtterance.lang = config.lang;
    this.currentUtterance.rate = config.rate;
    this.currentUtterance.pitch = config.pitch;
    this.currentUtterance.volume = config.volume;

    // Sélectionner une voix
    const voices = this.speechSynthesis.getVoices();
    let selectedVoice = voices.find(v => v.default);

    // Préférer une voix française
    const frenchVoice = voices.find(v =>
      v.lang === 'fr-FR' &&
      (v.name.includes('Google') || v.name.includes('français'))
    );

    if (frenchVoice) {
      selectedVoice = frenchVoice;
    }

    if (selectedVoice) {
      this.currentUtterance.voice = selectedVoice;
    }

    // Événements
    this.currentUtterance.onstart = () => {
      this.isSpeaking = true;
      this.isSpeechPaused = false;
      this.playSound('start');
    };

    this.currentUtterance.onend = () => {
      this.isSpeaking = false;
      this.isSpeechPaused = false;
      this.currentUtterance = null;
      this.playSound('end');
    };

    this.currentUtterance.onerror = (event) => {
      console.error('❌ Erreur synthèse vocale:', event);
      this.isSpeaking = false;
      this.isSpeechPaused = false;
      this.currentUtterance = null;
    };

    this.currentUtterance.onpause = () => {
      this.isSpeechPaused = true;
    };

    this.currentUtterance.onresume = () => {
      this.isSpeechPaused = false;
    };

    // Lancer la synthèse
    this.speechSynthesis.speak(this.currentUtterance);
  }

  private cleanTextForSpeech(text: string): string {
    return text
      .replace(/[#*_`~\[\]()]/g, '') // Supprimer la mise en forme
      .replace(/\[.*?\]/g, '') // Supprimer les liens
      .replace(/\(.*?\)/g, '') // Supprimer les parenthèses
      .replace(/\n/g, '. ') // Remplacer les sauts de ligne
      .replace(/\s+/g, ' ') // Normaliser les espaces
      .replace(/[🤖👋🌍🎤💡⚠️📊💰📦👨‍🌾🛒✅❌⭐🏅👉🔊]/g, '') // Supprimer les emojis
      .trim();
  }

  toggleSpeechPlayback() {
    if (this.isSpeaking) {
      if (this.isSpeechPaused) {
        this.resumeSpeech();
      } else {
        this.pauseSpeech();
      }
    }
  }

  pauseSpeech() {
    if (this.speechSynthesis && this.isSpeaking) {
      this.speechSynthesis.pause();
    }
  }

  resumeSpeech() {
    if (this.speechSynthesis && this.isSpeaking) {
      this.speechSynthesis.resume();
    }
  }

  stopSpeaking() {
    if (this.speechSynthesis && this.isSpeaking) {
      this.speechSynthesis.cancel();
    }
    this.isSpeaking = false;
    this.isSpeechPaused = false;
    this.currentUtterance = null;
  }

  // ==================== FONCTIONNALITÉS UTILISATEUR ====================

  playWelcomeMessage() {
    const welcomeText =
      `Bonjour ! Je suis votre assistant vocal Jokko-Agro. ` +
      `Je comprends le Français et le Wolof ! ` +
      `Vous pouvez me parler ou taper vos questions. ` +
      `Je peux vous aider avec les estimations de prix, ` +
      `les produits disponibles, la comparaison des producteurs, ` +
      `et la procédure de commande. ` +
      `Essayez par exemple : "Prix des tomates" ou "Am na ci riz ?"`;

    this.speak(welcomeText);
  }

  useSuggestion(suggestion: string) {
    this.addUserMessage(suggestion);
    this.updateSuggestions();
  }

  copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(
      () => {
        this.addSystemMessage('✅ Texte copié dans le presse-papier !');
      },
      (err) => {
        console.error('❌ Erreur lors de la copie:', err);
        this.addSystemMessage('❌ Échec de la copie');
      }
    );
  }

  clearHistory() {
    if (confirm('Voulez-vous vraiment effacer tout l\'historique de la conversation ?')) {
      localStorage.removeItem('chatbot_history');
      this.messages = [];
      this.showWelcomeMessage = true;
      this.addSystemMessage('🗑️ Historique effacé. Nouvelle conversation démarrée.');
    }
  }

  // ==================== SONS & FEEDBACK ====================

  private playSound(type: 'start' | 'end' | 'success' | 'error') {
    const audio = this.audioPlayer?.nativeElement;
    if (!audio) return;

    // Sons par défaut (peuvent être remplacés par des fichiers audio)
    const sounds: { [key: string]: string } = {
      start: 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ',
      end: 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ',
      success: 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ',
      error: 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ'
    };

    try {
      audio.src = sounds[type];
      audio.volume = 0.3;
      audio.play().catch(() => {
        // Ignorer les erreurs de lecture silencieusement
      });
    } catch (error) {
      console.log('🔇 Son non disponible:', type);
    }
  }

  // ==================== SUGGESTIONS ====================

  private updateSuggestions() {
    if (this.currentLanguage === 'fr') {
      this.suggestions = this.DEFAULT_SUGGESTIONS.slice(0, 4);
    } else {
      this.suggestions = [
        'Nani prix tomates ?',
        'Am na ci riz ?',
        'Dama bëgg jënd mango',
        'Producteur bi ci market ?',
        'Compare producteur bi',
        'Jërejëf',
      ];
    }
  }

  // ==================== HISTORIQUE ====================

  private saveToHistory(message: ChatMessage) {
    const history = JSON.parse(localStorage.getItem('chatbot_history') || '[]');
    history.push({
      text: message.text,
      sender: message.sender,
      timestamp: message.timestamp.toISOString(),
    });

    // Garder seulement les 100 derniers messages
    if (history.length > 100) {
      history.shift();
    }

    localStorage.setItem('chatbot_history', JSON.stringify(history));
  }

  // ==================== UTILITAIRES ====================

  formatMessage(text: string): string {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>')
      .replace(/•/g, '• ')
      .replace(/✅/g, '<span class="emoji">✅</span>')
      .replace(/❌/g, '<span class="emoji">❌</span>')
      .replace(/💰/g, '<span class="emoji">💰</span>')
      .replace(/📦/g, '<span class="emoji">📦</span>');
  }

  formatTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) {
      return 'À l\'instant';
    } else if (diffMins < 60) {
      return `Il y a ${diffMins} min`;
    } else {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  }

  getCurrentTime(): string {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  getUserInitial(): string {
    // Récupérer l'initiale de l'utilisateur connecté
    // À implémenter avec votre service d'authentification
    return '👤';
  }

  // ==================== DONNÉES ====================

  private async loadData() {
    try {
      // À implémenter: charger produits et producteurs depuis vos services
      // this.products = await this.dataService.getProducts();
      // this.producers = await this.dataService.getProducers();

      // Données fictives pour le développement - CORRECTION: Ajout des champs requis
      this.products = this.getMockProducts();
      this.producers = this.getMockProducers();

    } catch (error) {
      console.error('❌ Erreur chargement données:', error);
      this.addSystemMessage('⚠️ Données temporairement indisponibles.');
    }
  }

  // CORRECTION: Ajout des champs createdAt et updatedAt requis
  private getMockProducts(): Product[] {
    const now = new Date();

    return [
      {
        id: '1',
        name: 'Tomates',
        producerName: 'Ferme Bio Sénégal',
        price: 1500,
        quantity: 100,
        unit: 'kg',
        status: 'available',
        category: 'légumes',
        certifications: ['Bio'],
        rating: 4.5,
        images: [],
        location: 'Dakar',
        contactPhone: '77 123 45 67',
        producerId: 'prod1',
        producerPhone: '77 123 45 67',
        description: 'Tomates fraîches bio',
        isActive: true,
        views: 0,
        sales: 0,
        minOrderQuantity: 1,
        createdAt: now,
        updatedAt: now
      },
      {
        id: '2',
        name: 'Riz',
        producerName: 'Rizière de la Vallée',
        price: 2500,
        quantity: 50,
        unit: 'kg',
        status: 'available',
        category: 'céréales',
        certifications: ['Local'],
        rating: 4.2,
        images: [],
        location: 'Saint-Louis',
        contactPhone: '78 123 45 67',
        producerId: 'prod2',
        producerPhone: '78 123 45 67',
        description: 'Riz de qualité supérieure',
        isActive: true,
        views: 0,
        sales: 0,
        minOrderQuantity: 1,
        createdAt: now,
        updatedAt: now
      },
    ];
  }

  private getMockProducers(): any[] {
    return [
      {
        id: 'prod1',
        name: 'Ferme Bio Sénégal',
        farmName: 'Ferme Bio Sénégal',
        rating: 4.5,
        productsCount: 12,
        avatar: '',
        location: 'Dakar',
        email: 'contact@fermebio.sn',
        phone: '77 123 45 67',
        certifications: ['Bio'],
        isOrganic: true,
        isOnline: true,
        lastSeen: new Date(),
        responseRate: 98,
        averageResponseTime: 5,
        description: 'Ferme biologique certifiée',
        reviews: 45
      },
      {
        id: 'prod2',
        name: 'Rizière de la Vallée',
        farmName: 'Rizière de la Vallée',
        rating: 4.2,
        productsCount: 8,
        avatar: '',
        location: 'Saint-Louis',
        email: 'contact@rizvallee.sn',
        phone: '78 123 45 67',
        certifications: ['Local'],
        isOrganic: false,
        isOnline: true,
        lastSeen: new Date(),
        responseRate: 95,
        averageResponseTime: 10,
        description: 'Rizière traditionnelle',
        reviews: 32
      },
    ];
  }

  // ==================== GESTION DES TOUCHES ====================

  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    // Ctrl/Cmd + K pour ouvrir/fermer le chatbot
    if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
      event.preventDefault();
      this.toggleChat();
    }

    // Échap pour fermer
    if (event.key === 'Escape' && this.isOpen) {
      this.toggleChat();
    }
  }
}

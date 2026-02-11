import {
  Component,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  AfterViewInit,
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

  // État du chatbot
  isOpen = false;
  isListening = false;
  isSpeaking = false;
  isProcessing = false;
  currentLanguage: 'fr' | 'wolof' = 'fr';
  isSpeechPaused = false;

  // Messages
  messages: ChatMessage[] = [];
  userInput = '';
  suggestions: string[] = [];

  // Reconnaissance vocale
  private recognition: any;
  private speechSynthesis = window.speechSynthesis;
  private currentUtterance: SpeechSynthesisUtterance | null = null;

  // Données (à injecter depuis votre service)
  private products: Product[] = [];
  private producers: any[] = [];

  // Configuration
  private readonly VOICE_CONFIG = {
    fr: { lang: 'fr-FR', rate: 1.0, pitch: 1.0, voiceName: 'Google français' },
    wolof: { lang: 'fr-FR', rate: 0.9, pitch: 1.1, voiceName: '' }, // Utilise voix française pour Wolof
  };

  // Suggestions par défaut
  private readonly DEFAULT_SUGGESTIONS = [
    'Quels produits sont disponibles ?',
    'Estimation prix tomates',
    'Comment faire une commande ?',
    'Producteurs actifs',
    'Nani prix riz ?',
    'Am na ci mango ?',
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
  }

  ngAfterViewInit() {
    this.scrollToBottom();
  }

  ngOnDestroy() {
    this.stopListening();
    this.stopSpeaking();
    if (this.recognition) {
      this.recognition.abort();
    }
  }

  // ==================== INITIALISATION ====================

  private initVoiceRecognition() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();

      // Configuration avancée
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 3;
      this.recognition.lang = this.currentLanguage === 'fr' ? 'fr-FR' : 'fr-FR'; // Wolof utilise aussi fr-FR

      // Événements
      this.recognition.onstart = () => {
        this.isListening = true;
        this.addSystemMessage('Écoute en cours... Parlez maintenant.');
      };

      this.recognition.onresult = (event: any) => {
        const results = event.results;
        const transcript = results[0][0].transcript;
        const confidence = results[0][0].confidence;

        if (results[0].isFinal) {
          this.processVoiceInput(transcript, confidence);
        }
      };

      this.recognition.onerror = (event: any) => {
        console.error('Erreur reconnaissance vocale:', event.error);
        this.isListening = false;
        this.addSystemMessage(`Erreur: ${event.error}. Réessayez.`);
      };

      this.recognition.onend = () => {
        this.isListening = false;
      };
    } else {
      console.warn('Reconnaissance vocale non supportée');
      this.addSystemMessage(
        "⚠️ La reconnaissance vocale n'est pas supportée par votre navigateur.",
      );
    }
  }

  private initWelcomeMessage() {
    setTimeout(() => {
      this.addBotMessage(
        `👋 Bonjour ! Je suis votre assistant vocal Jokko-Agro.\n\n` +
          `🌍 **Je comprends le Français et le Wolof !**\n\n` +
          `🎤 **Parlez-moi ou tapez votre question :**\n` +
          `• Estimation de prix\n` +
          `• Produits disponibles\n` +
          `• Comparaison producteurs\n` +
          `• Procédure de commande\n\n` +
          `💡 **Essayez ces commandes vocales :**\n` +
          `"Prix tomates" • "Am na ci riz?" • "Comparer les mangues"`,
      );
      this.updateSuggestions();
    }, 500);
  }

  playWelcomeMessage() {
    const welcomeText =
      `Bonjour ! Je suis votre assistant vocal Jokko-Agro. ` +
      `Je comprends le Français et le Wolof ! ` +
      `Parlez-moi ou tapez votre question : ` +
      `Estimation de prix, produits disponibles, comparaison producteurs, ou procédure de commande. ` +
      `Essayez ces commandes vocales : Prix tomates, Am na ci riz, ou Comparer les mangues.`;

    this.speak(welcomeText);
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
      this.isSpeechPaused = true;
    }
  }

  resumeSpeech() {
    if (this.speechSynthesis && this.isSpeaking && this.isSpeechPaused) {
      this.speechSynthesis.resume();
      this.isSpeechPaused = false;
    }
  }

  stopSpeaking() {
    if (this.speechSynthesis && this.isSpeaking) {
      this.speechSynthesis.cancel();
      this.isSpeaking = false;
      this.isSpeechPaused = false;
      this.currentUtterance = null;
    }
  }

  private async loadData() {
    // À implémenter: charger produits et producteurs depuis votre service
    // this.products = await this.dataService.getProducts();
    // this.producers = await this.dataService.getProducers();
  }

  // ==================== INTERFACE UTILISATEUR ====================

  toggleChat() {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      setTimeout(() => this.scrollToBottom(), 100);
      this.updateSuggestions();
      // Arrêter toute parole en cours à l'ouverture
      this.stopSpeaking();
    }
  }

  toggleLanguage() {
    this.currentLanguage = this.currentLanguage === 'fr' ? 'wolof' : 'fr';
    this.addSystemMessage(
      `Langue changée: ${this.currentLanguage === 'fr' ? 'Français' : 'Wolof'}`,
    );
    this.updateSuggestions();

    // Mettre à jour la langue de reconnaissance
    if (this.recognition) {
      this.recognition.lang = this.currentLanguage === 'fr' ? 'fr-FR' : 'fr-FR';
    }
  }

  // ==================== GESTION DES MESSAGES ====================

  private addMessage(text: string, sender: 'user' | 'bot', isTyping = false, autoSpeak = false) {
    const message: ChatMessage = {
      text,
      sender,
      timestamp: new Date(),
      isTyping,
    };

    this.messages.push(message);
    this.scrollToBottom();

    // Sauvegarder dans l'historique local
    this.saveToHistory(message);

    // NE PAS parler automatiquement sauf si spécifié
    if (sender === 'bot' && autoSpeak) {
      setTimeout(() => {
        const lastMessage = this.messages[this.messages.length - 1];
        if (lastMessage.sender === 'bot' && lastMessage.isTyping) {
          lastMessage.isTyping = false;
        }
      }, 800);
    }
  }

  addUserMessage(text: string) {
    this.addMessage(text, 'user');
    this.processTextInput(text);
  }

  addBotMessage(text: string, autoSpeak = false) {
    this.addMessage(text, 'bot', true, autoSpeak);
  }

  addSystemMessage(text: string) {
    this.addMessage(`🔊 ${text}`, 'bot');
  }

  private scrollToBottom() {
    setTimeout(() => {
      if (this.messagesContainer) {
        const container = this.messagesContainer.nativeElement;
        container.scrollTop = container.scrollHeight;
      }
    }, 100);
  }

  // ==================== VOICE INPUT ====================

  startListening() {
    if (!this.recognition) {
      this.addSystemMessage(
        "⚠️ La reconnaissance vocale n'est pas disponible.",
      );
      return;
    }

    this.stopSpeaking();

    try {
      this.recognition.start();
    } catch (error) {
      console.error('Erreur démarrage écoute:', error);
      this.addSystemMessage("Impossible de démarrer l'écoute. Réessayez.");
    }
  }

  stopListening() {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
    }
  }

  private processVoiceInput(transcript: string, confidence: number) {
    const command: VoiceCommand = {
      text: transcript,
      language: this.currentLanguage,
      confidence,
    };

    // Afficher la commande reconnue
    this.addUserMessage(`🎤 ${transcript}`);

    // Traiter la commande
    this.processTextInput(transcript);

    // Donner un feedback sonore
    this.playSound('success');
  }

  // ==================== TEXT INPUT ====================

  sendTextMessage() {
    if (!this.userInput.trim()) return;

    this.addUserMessage(this.userInput);
    this.userInput = '';
    this.updateSuggestions();
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

      // Ajouter la réponse SANS parler automatiquement
      this.addBotMessage(response, false); // autoSpeak = false
    } catch (error) {
      console.error('Erreur traitement:', error);
      this.addBotMessage('Désolé, une erreur est survenue. Réessayez.', false);
    } finally {
      this.isProcessing = false;
    }
  }

  private detectWolof(text: string): boolean {
    const wolofIndicators = [
      'na',
      'ci',
      'bi',
      'la',
      'def',
      'am',
      'bëgg',
      'jënd',
    ];
    const lowerText = text.toLowerCase();
    return wolofIndicators.some((indicator) => lowerText.includes(indicator));
  }

private async handleWolofIntent(intent: any, text: string): Promise<string> {
  switch (intent) {
    case 'GREETING':
      return this.wolofVoiceService.getGreetingResponse();
    case 'AVAILABILITY':
      if (this.wolofVoiceService.isTomate(text)) {
        return this.getProductAvailability('tomate');
      } else if (this.wolofVoiceService.isMangue(text)) {
        return this.getProductAvailability('mangue');
      } else {
        return this.wolofVoiceService.getFallbackResponse();
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
    const available = this.products.some(
      (p) =>
        p.name.toLowerCase().includes(product) &&
        p.status === 'available' &&
        p.quantity > 0,
    );

    return (
      this.wolofVoiceService.getAvailabilityResponse(available) +
      (available ? ` (${product} disponible)` : ` (${product} non disponible)`)
    );
  }

  private translateWolofToFrench(text: string): string {
    // Traduction simple (à améliorer avec un service de traduction)
    const translations: { [key: string]: string } = {
      nani: 'quel est',
      prix: 'prix',
      'am na ci': 'y a-t-il',
      bëgg: 'veut',
      jënd: 'acheter',
      dama: 'je',
      may: 'donne',
      nan: 'est',
      la: 'le',
    };

    let translated = text.toLowerCase();
    Object.entries(translations).forEach(([wolof, french]) => {
      translated = translated.replace(new RegExp(wolof, 'g'), french);
    });

    return translated;
  }

  // ==================== TEXT TO SPEECH ====================

  speak(text: string, lang: 'fr' | 'wolof' = this.currentLanguage) {
    this.stopSpeaking();

    if (!this.speechSynthesis) {
      console.warn('Synthèse vocale non supportée');
      return;
    }

    // Nettoyer le texte (supprimer markdown, emojis)
    const cleanText = text
      .replace(/[#*_`~]/g, '')
      .replace(/\[.*?\]/g, '')
      .replace(/\(.*?\)/g, '')
      .replace(/\n/g, '. ')
      .replace(/[🤖👋🌍🎤💡⚠️📊💰📦👨‍🌾🛒✅❌⭐🏅👉🔊]/g, '');

    this.currentUtterance = new SpeechSynthesisUtterance(cleanText);

    // Configuration
    const config = this.VOICE_CONFIG[lang];
    this.currentUtterance.lang = config.lang;
    this.currentUtterance.rate = config.rate;
    this.currentUtterance.pitch = config.pitch;

    // Sélectionner une voix
    const voices = this.speechSynthesis.getVoices();
    const preferredVoice = voices.find(
      (v) =>
        v.lang === config.lang && v.name.toLowerCase().includes('français'),
    );

    if (preferredVoice) {
      this.currentUtterance.voice = preferredVoice;
    }

    // Événements
    this.currentUtterance.onstart = () => {
      this.isSpeaking = true;
    };

    this.currentUtterance.onend = () => {
      this.isSpeaking = false;
      this.isSpeechPaused = false;
      this.currentUtterance = null;
      this.playSound('end');
    };

    this.currentUtterance.onerror = (event) => {
      console.error('Erreur synthèse vocale:', event);
      this.isSpeaking = false;
      this.isSpeechPaused = false;
      this.currentUtterance = null;
    };

    // Lancer la synthèse
    this.speechSynthesis.speak(this.currentUtterance);
    this.playSound('start');
  }

  // ==================== SONS & FEEDBACK ====================

  private playSound(type: 'start' | 'end' | 'success' | 'error') {
    const audio = this.audioPlayer?.nativeElement;
    if (!audio) return;

    const sounds = {
      start: 'assets/sounds/chat-start.mp3',
      end: 'assets/sounds/chat-end.mp3',
      success: 'assets/sounds/success.mp3',
      error: 'assets/sounds/error.mp3',
    };

    // À créer ces fichiers ou utiliser des alternatives
    try {
      audio.src = sounds[type];
      audio.play().catch(() => {
        /* Ignorer les erreurs de lecture */
      });
    } catch (error) {
      console.log('Son non disponible:', type);
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
      ];
    }
  }

  useSuggestion(suggestion: string) {
    this.addUserMessage(suggestion);
    this.updateSuggestions();
  }

  // ==================== HISTORIQUE ====================

  private saveToHistory(message: ChatMessage) {
    const history = JSON.parse(localStorage.getItem('chatbot_history') || '[]');
    history.push({
      text: message.text,
      sender: message.sender,
      timestamp: message.timestamp.toISOString(),
    });

    // Garder seulement les 50 derniers messages
    if (history.length > 50) {
      history.shift();
    }

    localStorage.setItem('chatbot_history', JSON.stringify(history));
  }

  clearHistory() {
    localStorage.removeItem('chatbot_history');
    this.messages = [];
    this.initWelcomeMessage();
  }

  // ==================== FORMATAGE ====================

  formatMessage(text: string): string {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>')
      .replace(/•/g, '• ');
  }

  formatTime(date: Date): string {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}

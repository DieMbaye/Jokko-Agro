import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { FirebaseService } from '../../../services/firebase.service';
import { CartService } from '../../../services/cart.service';
import { Product } from '../../../interfaces/data.interfaces';

// Définissez l'interface MarketProduct - MISE À JOUR AVEC LA PROPRIÉTÉ BADGES
interface MarketProduct extends Omit<
  Product,
  'producerId' | 'producerPhone' | 'isActive' | 'badges'
> {
  producer: string;
  producerId: string;
  producerRating: number;
  distance: number;

  rating: number;
  reviews: number;
  stock: number;

  certified: boolean;
  organic: boolean;
  local: boolean;

  displayImage: string;

  // ✅ AJOUTER EXPLICITEMENT
  harvestDate?: string;
  expirationDate?: string;
  storageConditions?: string;

  badges?: Array<{
    id: string;
    label: string;
    icon: string;
    color: string;
  }>;
}

// Définissez l'interface Category
interface Category {
  id: string;
  name: string;
  icon: string;
  count: number;
}

@Component({
  selector: 'app-market',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './market.html',
  styleUrls: ['./market.css'],
})
export class MarketComponent implements OnInit, OnDestroy {
  allProducts: MarketProduct[] = [];
  filteredProducts: MarketProduct[] = [];
  categories: Category[] = [];

  // Filtres
  searchQuery = '';
  selectedCategory = 'all';
  selectedCertification = 'all';
  selectedSort = 'distance';
  priceRange = [0, 100000];
  maxDistance = 50;

  // État
  isLoading = true;
  viewMode: 'grid' | 'list' = 'grid';

  // RECHERCHE VOCALE
  isListening = false;
  isVoiceSupported = true;
  showVoiceHelp = true;
  lastVoiceCommand = '';

  // Dictionnaire Wolof-Français étendu
  private wolofToFrench: { [key: string]: string } = {
    // Fruits
    mango: 'mangue',
    manga: 'mangue',
    'pomme de terre': 'Pommes de terre',
    carotte: 'Carottes',
    orange: 'Oranges',
    khaal: 'Pastèque',
    dougoup: 'Mil',
    niébé: 'Niébé',
  };

  private recognition: any;
  private SpeechRecognition =
    (window as any).webkitSpeechRecognition ||
    (window as any).SpeechRecognition;

  // Certifications
  certifications = [
    { id: 'all', name: 'Toutes' },
    { id: 'certified', name: 'Certifié' },
    { id: 'organic', name: 'Bio' },
    { id: 'local', name: 'Local' },
  ];

  // Options de tri
  sortOptions = [
    { id: 'distance', name: 'Plus proche' },
    { id: 'price_low', name: 'Prix croissant' },
    { id: 'price_high', name: 'Prix décroissant' },
    { id: 'rating', name: 'Meilleures notes' },
    { id: 'newest', name: 'Plus récent' },
  ];

  constructor(
    private authService: AuthService,
    private firebaseService: FirebaseService,
    private cartService: CartService,
  ) {}

  async ngOnInit() {
    this.loadCategories();
    await this.loadProducts();
    this.initVoiceRecognition();
  }

  ngOnDestroy() {
    if (this.recognition) {
      this.recognition.stop();
    }
  }

  // INITIALISATION RECHERCHE VOCALE
  private initVoiceRecognition() {
    if (!this.SpeechRecognition) {
      console.warn('Reconnaissance vocale non supportée par ce navigateur');
      this.isVoiceSupported = false;
      return;
    }

    this.recognition = new this.SpeechRecognition();
    this.recognition.lang = 'fr-FR';
    this.recognition.continuous = false;
    this.recognition.interimResults = false;
    this.recognition.maxAlternatives = 5;

    this.recognition.onstart = () => {
      this.isListening = true;
      this.logVoiceInfo(
        '🎤 Reconnaissance vocale démarrée - DITES UN MOT WOLOF',
        'success',
      );
      console.log(
        '%c💡 ASTUCE: Dites "mango", "karot", "dio", "sangue", etc.',
        'color: #FF9800; font-style: italic;',
      );
    };

    this.recognition.onresult = (event: any) => {
      this.displayVoiceRecognitionResult(event);
    };

    this.recognition.onerror = (event: any) => {
      console.error(
        '%c❌ ERREUR reconnaissance vocale:',
        'color: #F44336; font-weight: bold;',
        event.error,
      );
      this.isListening = false;

      if (event.error === 'not-allowed') {
        alert(
          'Microphone non autorisé. Veuillez autoriser le microphone dans les paramètres de votre navigateur.',
        );
      }
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this.logVoiceInfo('⏹️ Reconnaissance vocale terminée', 'info');
    };
  }

  private displayVoiceRecognitionResult(event: any) {
    console.log('%c' + '='.repeat(70), 'color: #2196F3;');
    console.log(
      '%c🎤 RÉSULTAT DE LA RECONNAISSANCE VOCALE',
      'color: white; background: #2196F3; padding: 8px; border-radius: 4px; font-weight: bold;',
    );

    const result = event.results[0];

    // Afficher toutes les alternatives
    console.group(
      '%c📋 TOUTES LES ALTERNATIVES ENTENDUES',
      'color: #4CAF50; font-weight: bold;',
    );
    for (let i = 0; i < result.length; i++) {
      const transcript = result[i].transcript.toLowerCase();
      const confidence = Math.round(result[i].confidence * 100);

      let confidenceColor;
      if (confidence >= 80) confidenceColor = '#4CAF50';
      else if (confidence >= 60) confidenceColor = '#FF9800';
      else confidenceColor = '#F44336';

      console.log(
        `%c${i + 1}. "${transcript}" (${confidence}% de confiance)`,
        `color: ${confidenceColor}; font-weight: bold;`,
      );

      // Pour la première alternative (la plus probable), analyser en détail
      if (i === 0) {
        this.analyzeWolofRecognition(transcript, result);
      }
    }
    console.groupEnd();

    // Traiter la commande avec la première alternative (la plus probable)
    const mainTranscript = result[0].transcript.toLowerCase();
    this.processVoiceCommand(mainTranscript);

    console.log('%c' + '='.repeat(70), 'color: #2196F3;');
  }

  private analyzeWolofRecognition(transcript: string, result: any) {
    console.group(
      '%c🔍 ANALYSE DU MOT WOLOF',
      'color: #9C27B0; font-weight: bold;',
    );

    console.log(`%cMot entendu: "${transcript}"`, 'color: #2196F3;');

    // Découper en mots
    const words = transcript.split(' ');
    console.log(`Mots détectés: ${words.length} mot(s)`);

    // Rechercher chaque mot dans le dictionnaire
    const detectedWords: Array<{
      word: string;
      wolof: string;
      french: string;
    }> = [];

    words.forEach((word) => {
      const cleanWord = word.toLowerCase().trim();

      // Recherche exacte d'abord
      if (this.wolofToFrench[cleanWord]) {
        detectedWords.push({
          word: cleanWord,
          wolof: cleanWord,
          french: this.wolofToFrench[cleanWord],
        });
      } else {
        // Recherche partielle
        for (const wolofWord of Object.keys(this.wolofToFrench)) {
          if (cleanWord.includes(wolofWord) || wolofWord.includes(cleanWord)) {
            detectedWords.push({
              word: cleanWord,
              wolof: wolofWord,
              french: this.wolofToFrench[wolofWord],
            });
            break;
          }
        }
      }
    });

    if (detectedWords.length > 0) {
      console.log(
        '%c✅ MOTS WOLOF IDENTIFIÉS:',
        'color: #4CAF50; font-weight: bold;',
      );
      detectedWords.forEach((item) => {
        console.log(
          `   "${item.word}" → Wolof: "${item.wolof}" → Français: "${item.french}"`,
        );
      });
    } else {
      console.log(
        '%c❌ AUCUN MOT WOLOF IDENTIFIÉ DANS LE DICTIONNAIRE',
        'color: #F44336; font-weight: bold;',
      );

      // Recherche phonétique
      console.group('%c🔊 RECHERCHE PHONÉTIQUE', 'color: #FF9800;');
      for (const word of words) {
        const phoneticMatch = this.findPhoneticMatch(word);
        if (phoneticMatch) {
          console.log(
            `   "${word}" pourrait être "${phoneticMatch}" (${this.wolofToFrench[phoneticMatch]})`,
          );
        }
      }
      console.groupEnd();

      // Analyse de similarité
      console.group('%c📊 ANALYSE DE SIMILARITÉ', 'color: #607D8B;');
      for (const word of words) {
        if (word.length > 2) {
          // Ignorer les mots trop courts
          this.checkWordSimilarity(word);
        }
      }
      console.groupEnd();
    }

    console.groupEnd();
  }

  private findPhoneticMatch(word: string): string | null {
    const phoneticMap: { [key: string]: string[] } = {
      mang: ['mango', 'mangu', 'manga'],
      mong: ['mango', 'mangu'],
      kar: ['karot', 'karote', 'carotte'],
      tom: ['tomater', 'tomat', 'tomate'],
      dio: ['dio', 'riz'],
      sang: ['sangue', 'arachide'],
      nye: ['nyebe', 'niebe', 'niébé'],
      poi: ['poivr', 'poivron'],
      cit: ['sitron', 'citron'],
      pas: ['pastay', 'pastek', 'pastèque'],
      ban: ['banaana', 'banan', 'banane'],
      ara: ['sangue', 'arachide'],
      sal: ['salat', 'salade'],
      kom: ['kombar', 'concombre'],
      pat: ['patat', 'patate'],
      pom: ['pomdeter', 'pommedeterre'],
      biss: ['bissap', 'oseille'],
      oig: ['ognon', 'oignon', 'sablet'],
      con: ['kombar', 'concombre'],
      riz: ['dio', 'riz'],
      maïs: ['ma', 'maïs'],
      mil: ['mbaw', 'mil'],
    };

    for (const [sound, possibleWords] of Object.entries(phoneticMap)) {
      if (word.includes(sound)) {
        for (const wolofWord of possibleWords) {
          if (this.wolofToFrench[wolofWord]) {
            return wolofWord;
          }
        }
      }
    }

    return null;
  }

  private checkWordSimilarity(word: string) {
    const wolofWords = Object.keys(this.wolofToFrench);
    const similarities: Array<{
      wolof: string;
      similarity: number;
      french: string;
    }> = [];

    for (const wolofWord of wolofWords) {
      const similarity = this.calculateSimilarity(word, wolofWord);
      if (similarity > 0.4) {
        // 40% de similarité
        similarities.push({
          wolof: wolofWord,
          similarity: similarity,
          french: this.wolofToFrench[wolofWord],
        });
      }
    }

    if (similarities.length > 0) {
      console.log(`Pour "${word}":`);
      similarities
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 5)
        .forEach((item) => {
          const percent = Math.round(item.similarity * 100);
          let color;
          if (percent >= 70) color = '#4CAF50';
          else if (percent >= 50) color = '#FF9800';
          else color = '#F44336';

          console.log(
            `%c   ${percent}% → "${item.wolof}" (${item.french})`,
            `color: ${color};`,
          );
        });
    }
  }

  private calculateSimilarity(word1: string, word2: string): number {
    const longer = word1.length > word2.length ? word1 : word2;
    const shorter = word1.length > word2.length ? word2 : word1;

    if (longer.length === 0) return 1.0;

    const distance = this.levenshteinDistance(word1, word2);
    return (longer.length - distance) / longer.length;
  }

  private levenshteinDistance(a: string, b: string): number {
    const matrix = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1,
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  // TOGGLE RECHERCHE VOCALE
  toggleVoiceSearch() {
    if (!this.isVoiceSupported) {
      console.error(
        '%c❌ Reconnaissance vocale non supportée',
        'color: #F44336; font-weight: bold;',
      );
      alert(
        "La reconnaissance vocale n'est pas supportée par votre navigateur. Essayez Chrome ou Edge.",
      );
      return;
    }

    if (this.isListening) {
      console.log("%c⏹️ Arrêt de l'écoute...", 'color: #FF9800;');
      this.recognition.stop();
    } else {
      console.clear();
      console.log('%c' + '='.repeat(70), 'color: #2196F3;');
      console.log(
        '%c🎤 DÉMARRAGE DE LA RECHERCHE VOCALE',
        'color: white; background: #2196F3; padding: 10px; border-radius: 4px; font-weight: bold; font-size: 16px;',
      );
      console.log(
        '%c💡 PARLEZ EN WOLOF DANS LE MICROPHONE',
        'color: #FF9800; font-size: 14px;',
      );
      console.log('');
      console.log(
        '%c📝 EXEMPLES DE MOTS WOLOF À DIRE:',
        'color: #4CAF50; font-weight: bold;',
      );
      console.log('   • "mango" (mangue)');
      console.log('   • "karot" (carotte)');
      console.log('   • "dio" (riz)');
      console.log('   • "sangue" (arachide)');
      console.log('   • "nyebe" (niébé)');
      console.log('   • "tomater" (tomate)');
      console.log('');
      console.log(
        '%c📢 Le système affichera dans la console:',
        'color: #9C27B0;',
      );
      console.log('   ✓ Le mot que vous avez dit');
      console.log('   ✓ La traduction en français');
      console.log('   ✓ Les alternatives possibles');
      console.log('   ✓ Les résultats de la recherche');
      console.log('%c' + '='.repeat(70), 'color: #2196F3;');

      try {
        this.recognition.start();
      } catch (error) {
        console.error('❌ Erreur démarrage reconnaissance:', error);
        this.isListening = false;
      }
    }
  }

  // TRAITEMENT COMMANDE VOCALE
  private processVoiceCommand(command: string) {
    console.group(
      '%c🎯 TRAITEMENT DE LA COMMANDE',
      'color: #FF5722; font-weight: bold;',
    );

    this.lastVoiceCommand = command;
    console.log(`Commande vocale reçue: "${command}"`);

    // Traduire le wolof en français
    const frenchTerm = this.translateWolofToFrench(command);

    console.log(
      `%c🌍 TRADUCTION: "${command}" → "${frenchTerm}"`,
      'color: #2196F3; font-weight: bold; background: #E3F2FD; padding: 8px; border-radius: 4px;',
    );

    // Afficher les mots traduits un par un
    const words = command.split(' ');
    if (words.length > 1) {
      console.group('%c📝 DÉTAIL DE LA TRADUCTION', 'color: #607D8B;');
      words.forEach((word, index) => {
        const translation = this.translateWolofToFrench(word);
        console.log(`${index + 1}. "${word}" → "${translation}"`);
      });
      console.groupEnd();
    }

    // Mettre à jour la recherche
    this.searchQuery = frenchTerm;
    console.log(
      `%c🔍 RECHERCHE APPLIQUÉE: "${frenchTerm}"`,
      'color: #4CAF50; font-weight: bold;',
    );

    // Appliquer les filtres
    this.applyFilters();

    console.groupEnd();

    // Afficher les résultats après un court délai
    setTimeout(() => {
      console.log(
        '%c📊 RÉSULTATS DE LA RECHERCHE',
        'color: #4CAF50; font-weight: bold;',
      );
      console.log(`Produits trouvés: ${this.filteredProducts.length}`);

      if (this.filteredProducts.length > 0) {
        console.log('%c✅ SUCCÈS: Produits trouvés!', 'color: #4CAF50;');
        this.filteredProducts.slice(0, 3).forEach((product, index) => {
          console.log(
            `${index + 1}. ${product.name} - ${this.formatPrice(product.price)}`,
          );
        });
        if (this.filteredProducts.length > 3) {
          console.log(`   ... et ${this.filteredProducts.length - 3} autres`);
        }
      } else {
        console.log('%c❌ AUCUN produit trouvé', 'color: #F44336;');
        console.log('💡 Essayez un autre mot wolof');
      }

      console.log('');
      console.log(
        '%c💡 ASTUCE: Cliquez à nouveau sur le micro pour une nouvelle recherche',
        'color: #FF9800; font-style: italic;',
      );
    }, 500);
  }

  // TRADUCTION WOLOF → FRANÇAIS
  private translateWolofToFrench(wolofText: string): string {
    const lowerText = wolofText.toLowerCase().trim();

    // Vérifier d'abord les phrases complètes
    for (const [wolof, french] of Object.entries(this.wolofToFrench)) {
      if (lowerText === wolof) {
        return french;
      }
    }

    // Si c'est une phrase, traduire mot par mot
    const words = lowerText.split(' ');
    if (words.length > 1) {
      const translatedWords = words.map((word) => {
        for (const [wolof, french] of Object.entries(this.wolofToFrench)) {
          if (word === wolof) {
            return french;
          }
        }
        return word; // Retourner le mot original si non trouvé
      });
      return translatedWords.join(' ');
    }

    // Si non trouvé, retourner le texte original
    return wolofText;
  }

  // LOGGER POUR LES INFORMATIONS VOCALES
  private logVoiceInfo(
    message: string,
    type: 'info' | 'success' | 'error' | 'warning' = 'info',
  ) {
    const styles = {
      info: 'color: #2196F3;',
      success: 'color: #4CAF50; font-weight: bold;',
      error: 'color: #F44336; font-weight: bold;',
      warning: 'color: #FF9800;',
    };

    const timestamp = new Date().toLocaleTimeString();
    console.log(`%c[${timestamp}] ${message}`, styles[type]);
  }

  // MÉTHODES EXISTANTES (MISE À JOUR AVEC LA PROPRIÉTÉ BADGES)
  async loadProducts() {
    this.isLoading = true;

    try {
      const firebaseProducts = await this.getAllProductsFromFirebase();
      this.allProducts = firebaseProducts.map((product) =>
        this.transformToMarketProduct(product),
      );

      console.log(
        `${this.allProducts.length} produits chargés depuis Firebase`,
      );
      this.applyFilters();
      this.updateCategoryCounts();
    } catch (error) {
      console.error('Erreur lors du chargement des produits:', error);
      this.loadFallbackData();
    } finally {
      this.isLoading = false;
    }
  }

  private async getAllProductsFromFirebase(): Promise<Product[]> {
    try {
      if (this.firebaseService.getAllAvailableProducts) {
        return await this.firebaseService.getAllAvailableProducts();
      } else {
        console.warn(
          "La méthode getAllAvailableProducts n'existe pas dans FirebaseService",
        );
        return [];
      }
    } catch (error) {
      console.error(
        'Erreur lors de la récupération des produits Firebase:',
        error,
      );
      return [];
    }
  }

  private transformToMarketProduct(product: Product): MarketProduct {
    const randomDistance = Math.floor(Math.random() * 30) + 1;
    const randomRating = 3.5 + Math.random() * 1.5;
    const randomReviews = Math.floor(Math.random() * 100);
    const producerRating = 3.5 + Math.random() * 1.5;

    // Vérifier si le produit a une CERTIFICATION BLOCKCHAIN
    const hasBlockchainCertification =
      product.certification?.type === 'certified' ||
      (product.badges &&
        product.badges.some((badge) => badge.id === 'certified'));

    // CORRECTION: Convertir explicitement en boolean
    const isCertified = !!hasBlockchainCertification; // ← Double !! pour conversion
    const hasCertifications =
      Array.isArray(product.certifications) &&
      product.certifications.length > 0;

    const productCertifications = Array.isArray(product.certifications)
      ? product.certifications
      : [];

    const isOrganic =
      product.isOrganic || productCertifications.includes('organic') || false;

    const isLocal = productCertifications.includes('local') || false;

    const displayImage = this.getDisplayImage(product);

    // Récupérer les badges de certification
    const certificationBadges = product.badges || [];

    // Si le produit a une certification blockchain mais pas de badge, en créer un
    if (isCertified && !certificationBadges.some((b) => b.id === 'certified')) {
      certificationBadges.push({
        id: 'certified',
        label: 'Certifié',
        icon: '✅',
        color: '#10b981',
      });
    }

    const marketProduct: MarketProduct = {
      id: product.id || '',
      name: product.name,
      // CORRECTION : Prioriser producerName, puis producer
      producer: product.producerName || 'Producteur',
      producerId: product.producerId || '',
      producerRating: producerRating,
      price: product.price,
      unit: product.unit,
      quantity: product.quantity,
      category: product.category,
      displayImage: displayImage,
      certified: isCertified,
      organic: isOrganic,
      local: isLocal,
      distance: randomDistance,
      rating: randomRating,
      reviews: randomReviews,
      description: product.description || 'Produit agricole de qualité',
      stock: product.quantity,
      // CORRECTION : Toujours utiliser productCertifications
      certification: product.certification
        ? {
            id: product.certification.id,
            type: product.certification.type,
            level: product.certification.level,
            score: product.certification.score,
            verificationDate: product.certification.verificationDate,
            validUntil: product.certification.validUntil,
            qrCodeUrl: product.certification.qrCodeUrl,
            certificateUrl: product.certification.certificateUrl,
            verificationUrl: product.certification.verificationUrl,
          }
        : undefined,
      isOrganic: isOrganic,
      location: product.location,
      harvestDate: product.harvestDate,
      expirationDate: product.expirationDate,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      status: product.status,
      views: product.views,
      sales: product.sales,
      // AJOUTER ce champ manquant :
      producerName: product.producerName || 'Producteur',
      minOrderQuantity: product.minOrderQuantity || 1,
      images: product.images || [],
      storageConditions: product.storageConditions,
      contactPhone: product.contactPhone,
      badges: certificationBadges,
    };
    return marketProduct;
  }

  private getDisplayImage(product: Product): string {
    // Log pour débogage
    console.log('Catégorie du produit:', product.category);

    // FORCER l'utilisation de l'emoji de catégorie
    const icon = this.getCategoryIcon(product.category);
    console.log('Emoji utilisé:', icon);
    return icon;
  }

  // Et améliorer getCategoryIcon pour gérer plus de cas
  private getCategoryIcon(categoryId: string): string {
    if (!categoryId) return '📦';

    // Convertir en minuscules et nettoyer
    const cleanId = categoryId.toString().toLowerCase().trim();

    const iconMap: { [key: string]: string } = {
      // Catégories français
      vegetables: '🥦',
      légumes: '🥦',
      fruits: '🍎',
      cereals: '🌾',
      céréales: '🌾',
      tubers: '🥔',
      tubercules: '🥔',
      legumes: '🥜', // Attention: 'legumes' en anglais = légumineuses
      légumineuses: '🥜',
      spices: '🌶️',
      épices: '🌶️',
      dairy: '🥛',
      'produits laitiers': '🥛',
      laitiers: '🥛',
      poultry: '🐔',
      volaille: '🐔',

      // Variations possibles
      veg: '🥦',
      fruit: '🍎',
      cereal: '🌾',
      tuber: '🥔',
      legume: '🥜',
      spice: '🌶️',
      milk: '🥛',
      chicken: '🐔',

      // Autres catégories
      céréale: '🌾',
      féculent: '🥔',
      viande: '🍖',
      poisson: '🐟',
      œuf: '🥚',
      miel: '🍯',
      huile: '🫒',
    };

    // Chercher la correspondance exacte
    if (iconMap[cleanId]) {
      return iconMap[cleanId];
    }

    // Chercher par correspondance partielle
    for (const [key, icon] of Object.entries(iconMap)) {
      if (cleanId.includes(key) || key.includes(cleanId)) {
        console.log(`Correspondance trouvée: ${cleanId} -> ${key} (${icon})`);
        return icon;
      }
    }

    console.warn(`Aucune icône trouvée pour la catégorie: ${categoryId}`);
    return '📦';
  }

  private loadFallbackData() {
    console.log('Chargement des données de fallback');
    this.allProducts = [
      {
        id: '1',
        name: 'Tomates Bio',
        producer: 'Alioune Farm',
        producerId: 'producer_1',
        producerRating: 4.8,
        price: 1500,
        unit: 'kg',
        quantity: 1,
        category: 'vegetables',
        displayImage: '🍅',
        certified: true,
        organic: true,
        local: true,
        distance: 2.5,
        rating: 4.8,
        reviews: 45,
        description: 'Tomates biologiques cultivées sans pesticides',
        stock: 50,
        certifications: ['organic', 'local'],
        isOrganic: true,
        location: 'Dakar',
        harvestDate: '2024-01-10',
        expirationDate: '2024-01-20',
        createdAt: new Date('2024-01-10'),
        updatedAt: new Date('2024-01-15'),
        status: 'available',
        views: 100,
        sales: 45,
        producerName: 'Alioune Farm',
        minOrderQuantity: 1,
        images: [],
        storageConditions: 'Conserver au frais',
        contactPhone: '771234567',
        badges: [], // Ajout de la propriété badges
      },
      {
        id: '2',
        name: 'Mangues',
        producer: 'Mango Farm',
        producerId: 'producer_2',
        producerRating: 4.5,
        price: 800,
        unit: 'kg',
        quantity: 1,
        category: 'fruits',
        displayImage: '🥭',
        certified: false,
        organic: true,
        local: true,
        distance: 5.2,
        rating: 4.6,
        reviews: 32,
        description: 'Mangues sucrées de saison',
        stock: 100,
        certifications: ['organic'],
        isOrganic: true,
        location: 'Thiès',
        harvestDate: '2024-01-05',
        expirationDate: '2024-01-25',
        createdAt: new Date('2024-01-05'),
        updatedAt: new Date('2024-01-10'),
        status: 'available',
        views: 85,
        sales: 60,
        producerName: 'Mango Farm',
        minOrderQuantity: 2,
        images: [],
        storageConditions: 'Conserver à température ambiante',
        contactPhone: '772345678',
        badges: [], // Ajout de la propriété badges
      },
      {
        id: '3',
        name: 'Riz local',
        producer: 'Rizière Sénégal',
        producerId: 'producer_3',
        producerRating: 4.9,
        price: 1200,
        unit: 'kg',
        quantity: 1,
        category: 'cereals',
        displayImage: '🌾',
        certified: true,
        organic: false,
        local: true,
        distance: 15.7,
        rating: 4.7,
        reviews: 78,
        description: 'Riz cultivé dans le delta du Saloum',
        stock: 200,
        certifications: ['local'],
        isOrganic: false,
        location: 'Fatick',
        harvestDate: '2023-12-20',
        expirationDate: '2024-06-20',
        createdAt: new Date('2023-12-25'),
        updatedAt: new Date('2024-01-01'),
        status: 'available',
        views: 150,
        sales: 120,
        producerName: 'Rizière Sénégal',
        minOrderQuantity: 5,
        images: [],
        storageConditions: 'Conserver au sec',
        contactPhone: '773456789',
        badges: [], // Ajout de la propriété badges
      },
    ];

    this.applyFilters();
    this.updateCategoryCounts();
  }

  loadCategories() {
    this.categories = [
      { id: 'all', name: 'Tout voir', icon: '🛒', count: 0 },
      { id: 'vegetables', name: 'Légumes', icon: '🥦', count: 0 },
      { id: 'fruits', name: 'Fruits', icon: '🍎', count: 0 },
      { id: 'cereals', name: 'Céréales', icon: '🌾', count: 0 },
      { id: 'tubers', name: 'Tubercules', icon: '🥔', count: 0 },
      { id: 'legumes', name: 'Légumineuses', icon: '🥜', count: 0 },
      { id: 'poultry', name: 'Volaille', icon: '🐔', count: 0 },
      { id: 'dairy', name: 'Laitiers', icon: '🥛', count: 0 },
      { id: 'spices', name: 'Épices', icon: '🌶️', count: 0 },
    ];
  }

  private updateCategoryCounts() {
    this.categories.forEach((category) => {
      if (category.id === 'all') {
        category.count = this.allProducts.length;
      } else {
        category.count = this.allProducts.filter(
          (p) => p.category === category.id,
        ).length;
      }
    });
  }

  applyFilters() {
    let filtered = [...this.allProducts];

    if (this.searchQuery) {
      filtered = filtered.filter(
        (product) =>
          product.name.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
          product.producer
            .toLowerCase()
            .includes(this.searchQuery.toLowerCase()) ||
          product.description
            .toLowerCase()
            .includes(this.searchQuery.toLowerCase()),
      );
    }

    if (this.selectedCategory !== 'all') {
      filtered = filtered.filter(
        (product) => product.category === this.selectedCategory,
      );
    }

    if (this.selectedCertification !== 'all') {
      switch (this.selectedCertification) {
        case 'certified':
          // Filtrer uniquement les produits certifiés blockchain
          filtered = filtered.filter(
            (product) =>
              product.certified ||
              (product.badges &&
                product.badges.some((b) => b.id === 'certified')),
          );
          break;
        case 'organic':
          filtered = filtered.filter((product) => product.organic);
          break;
        case 'local':
          filtered = filtered.filter((product) => product.local);
          break;
      }
    }

    filtered = filtered.filter(
      (product) => product.distance <= this.maxDistance,
    );

    filtered = filtered.filter(
      (product) =>
        product.price >= this.priceRange[0] &&
        product.price <= this.priceRange[1],
    );

    filtered = filtered.filter(
      (product) => product.status === 'available' && product.stock > 0,
    );

    filtered.sort((a, b) => {
      switch (this.selectedSort) {
        case 'distance':
          return (a.distance || 0) - (b.distance || 0);
        case 'price_low':
          return (a.price || 0) - (b.price || 0);
        case 'price_high':
          return (b.price || 0) - (a.price || 0);
        case 'rating':
          return (b.rating || 0) - (a.rating || 0);
        case 'newest':
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        default:
          return 0;
      }
    });

    this.filteredProducts = filtered;
  }

  getCategoryName(categoryId: string): string {
    const category = this.categories.find((c) => c.id === categoryId);
    return category ? category.name : categoryId;
  }

  getStars(rating: number): number[] {
    return Array(5)
      .fill(0)
      .map((_, i) => (i < Math.round(rating) ? 1 : 0));
  }

  getProductUnit(product: MarketProduct): string {
    return product.unit || 'unité';
  }

  formatPrice(price: number): string {
    return price.toLocaleString() + ' FCFA';
  }

  addToCart(product: MarketProduct) {
    console.log('Ajouter au panier:', product);
    const quantity = product.minOrderQuantity || 1;

    if (product.stock >= quantity) {
      this.cartService.addToCart(product, quantity);
      this.showAddToCartNotification(product.name, quantity);
    } else {
      alert(
        `Stock insuffisant. Seulement ${product.stock} ${product.unit} disponible(s).`,
      );
    }
  }

  private showAddToCartNotification(productName: string, quantity: number) {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 15px 20px;
      border-radius: 10px;
      box-shadow: 0 6px 20px rgba(0,0,0,0.15);
      z-index: 1000;
      animation: slideUp 0.3s ease;
      display: flex;
      align-items: center;
      gap: 15px;
      cursor: pointer;
    `;

    notification.innerHTML = `
      <div style="font-size: 28px;">🛒</div>
      <div>
        <div style="font-weight: 600; margin-bottom: 5px;">${productName}</div>
        <div style="font-size: 14px;">Ajouté au panier (${quantity} unité(s))</div>
        <div style="font-size: 12px; margin-top: 5px; opacity: 0.8;">
          👉 Cliquez pour voir le panier
        </div>
      </div>
    `;

    notification.onclick = () => {
      this.cartService.goToCart();
      document.body.removeChild(notification);
    };

    document.body.appendChild(notification);

    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 4000);
  }

  viewProductDetails(product: MarketProduct) {
    console.log('Voir détails:', product);

    const details = `
      🛒 **${product.name}**

      👨‍🌾 **Producteur:** ${product.producer}
      📍 **Localisation:** ${product.location}
      📊 **Catégorie:** ${this.getCategoryName(product.category)}

      💰 **Prix:** ${this.formatPrice(product.price)}/${product.unit}
      📦 **Stock disponible:** ${product.stock} ${product.unit}
      📋 **Quantité minimale:** ${product.minOrderQuantity || 1} ${product.unit}

      ⭐ **Note du producteur:** ${product.producerRating.toFixed(1)}/5
      📊 **Note du produit:** ${product.rating.toFixed(1)}/5 (${
        product.reviews
      } avis)

      📝 **Description:**
      ${product.description}

      ✅ **Certifications:** ${product.certifications?.join(', ') || 'Aucune'}
      🌱 **Bio:** ${product.organic ? 'Oui ✅' : 'Non ❌'}
      📍 **Local:** ${product.local ? 'Oui ✅' : 'Non ❌'}

      🗓️ **Récolté le:** ${product.harvestDate || 'Non spécifié'}
      ⏳ **Expire le:** ${product.expirationDate || 'Non spécifié'}

      📞 **Contact:** ${product.contactPhone || 'Non disponible'}
    `;

    alert(details);
  }

  toggleFavorite(productId: string) {
    if (!productId) {
      console.error('ID du produit non valide');
      return;
    }
    console.log('Toggle favori:', productId);
  }

  getProductStatus(product: MarketProduct): string {
    if (product.stock === 0 || product.status !== 'available') return 'Épuisé';
    if (product.stock < (product.minOrderQuantity || 1)) return 'Stock limité';
    return 'Disponible';
  }

  getProductStatusClass(product: MarketProduct): string {
    if (product.stock === 0 || product.status !== 'available')
      return 'status-out';
    if (product.stock < (product.minOrderQuantity || 1)) return 'status-low';
    return 'status-available';
  }

  clearFilters() {
    this.searchQuery = '';
    this.selectedCategory = 'all';
    this.selectedCertification = 'all';
    this.selectedSort = 'distance';
    this.priceRange = [0, 100000];
    this.maxDistance = 50;
    this.applyFilters();
  }

  getFilteredCount(): number {
    return this.filteredProducts.length;
  }

  getCertifiedProductsCount(): number {
    return this.allProducts.filter(
      (p) =>
        p.certified || (p.badges && p.badges.some((b) => b.id === 'certified')),
    ).length;
  }
  getUniqueProducersCount(): number {
    const uniqueProducers = new Set(
      this.filteredProducts.map((p) => p.producer),
    );
    return uniqueProducers.size;
  }

  getTotalProducts(): number {
    return this.filteredProducts.length;
  }

  getUniqueProducers(products: MarketProduct[]): number {
    const uniqueProducers = new Set(products.map((p) => p.producer));
    return uniqueProducers.size;
  }

  // Nouvelle méthode pour afficher les badges
  // Nouvelle méthode pour afficher les badges
  getProductBadges(
    product: MarketProduct,
  ): Array<{ id: string; label: string; icon: string; color: string }> {
    const badges = product.badges || [];

    // Si pas de badges dans les données, créer des badges basés sur les certifications
    if (badges.length === 0) {
      // Vérifier d'abord si le produit est certifié blockchain
      if (product.certified) {
        badges.push({
          id: 'certified',
          label: 'Certifié',
          icon: '✅',
          color: '#10b981',
        });
      }

      // Ajouter les autres badges de certification
      if (product.organic) {
        badges.push({
          id: 'organic',
          label: 'Bio',
          icon: '🌱',
          color: '#4CAF50',
        });
      }
      if (product.local) {
        badges.push({
          id: 'local',
          label: 'Local',
          icon: '📍',
          color: '#2196F3',
        });
      }

      // Ajouter les badges du tableau certifications
      if (product.certifications?.includes('fairtrade')) {
        badges.push({
          id: 'fairtrade',
          label: 'Équitable',
          icon: '⚖️',
          color: '#FF9800',
        });
      }
      if (product.certifications?.includes('seasonal')) {
        badges.push({
          id: 'seasonal',
          label: 'Saison',
          icon: '🌞',
          color: '#FF5722',
        });
      }
    }

    return badges;
  }

  /**
   * Voir le certificat du produit certifié
   * Redirige vers la page de vérification publique avec l'ID de certification
   */
  viewCertificate(product: MarketProduct) {
    if (!product || !product.id) {
      console.error('Produit non valide');
      return;
    }

    // RÉCUPÉRER L'ID DE CERTIFICATION DEPUIS LE PRODUIT
    // Priorité : 1. certification.id, 2. product.id (fallback)
    const certificationId = product.certification?.id;

    if (!certificationId) {
      console.error('Aucun ID de certification trouvé pour ce produit');
      this.showNotification(
        'error',
        'Certification non trouvée pour ce produit',
      );
      return;
    }

    // Rediriger vers la page de vérification
    const verificationUrl = `/verify/${certificationId}`;
    console.log('🔍 Redirection vers:', verificationUrl);
    window.open(verificationUrl, '_blank');

    this.showNotification('info', 'Redirection vers le certificat...');
  }
  // Ajoutez aussi cette méthode utilitaire pour les notifications
  private showNotification(
    type: 'success' | 'error' | 'info',
    message: string,
  ) {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    Object.assign(notification.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      padding: '12px 20px',
      background:
        type === 'success'
          ? '#2d6a4f'
          : type === 'error'
            ? '#dc2626'
            : '#3b82f6',
      color: 'white',
      borderRadius: '8px',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
      zIndex: '10001',
      animation: 'slideIn 0.3s ease-out',
    });

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease-in';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
  // Dans market.ts - Ajouter cette méthode
  isProductCertified(product: MarketProduct): boolean {
    return !!(
      product.certified ||
      (product.badges && product.badges.some((b) => b.id === 'certified'))
    );
  }
}

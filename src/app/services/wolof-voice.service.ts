// wolof-voice.service.ts (version corrigée)
import { Injectable } from '@angular/core';

export type WolofIntent =
  'GREETING' |
  'AVAILABILITY' |
  'PRICE' |
  'ORDER' |
  'COMPARE' |
  'HELP' |
  'THANKS' |
  'GOODBYE' |
  'UNKNOWN';

export interface WolofPhrase {
  wolof: string;
  french: string;
  english: string;
  intent: WolofIntent;
  synonyms: string[];
}

@Injectable({
  providedIn: 'root',
})
export class WolofVoiceService {

  // Base de données de phrases Wolof avec leurs intentions
  private wolofPhrases: WolofPhrase[] = [
    // SALUTATIONS
    {
      wolof: 'Nanga def',
      french: 'Bonjour, comment vas-tu ?',
      english: 'Hello, how are you?',
      intent: 'GREETING',
      synonyms: ['nangadef', 'nanga def rekk', 'manga def', 'salamalekoum']
    },
    {
      wolof: 'Maa ngi fi',
      french: 'Je vais bien',
      english: 'I am fine',
      intent: 'GREETING',
      synonyms: ['maangi fi', 'ma ngi fi rekk']
    },

    // DISPONIBILITÉ
    {
      wolof: 'Am na ci tomate?',
      french: 'Y a-t-il des tomates ?',
      english: 'Are there tomatoes?',
      intent: 'AVAILABILITY',
      synonyms: ['am na ci tomat?', 'am na tomate?', 'am ci tomate?']
    },
    {
      wolof: 'Am na ci riz?',
      french: 'Y a-t-il du riz ?',
      english: 'Is there rice?',
      intent: 'AVAILABILITY',
      synonyms: ['am na riz?', 'am ci riz?', 'riz am na?']
    },
    {
      wolof: 'Am na ci mango?',
      french: 'Y a-t-il des mangues ?',
      english: 'Are there mangoes?',
      intent: 'AVAILABILITY',
      synonyms: ['am na mango?', 'mango am na?', 'am ci mango?']
    },
    {
      wolof: 'Am na ci oignon?',
      french: 'Y a-t-il des oignons ?',
      english: 'Are there onions?',
      intent: 'AVAILABILITY',
      synonyms: ['am na oignon?', 'oignon am na?', 'am ci oignon?']
    },

    // PRIX
    {
      wolof: 'Nani prix tomate?',
      french: 'Quel est le prix des tomates ?',
      english: 'What is the price of tomatoes?',
      intent: 'PRICE',
      synonyms: ['prix bi ci tomate?', 'tomate prix?', 'combien tomate?']
    },
    {
      wolof: 'Nani prix riz?',
      french: 'Quel est le prix du riz ?',
      english: 'What is the price of rice?',
      intent: 'PRICE',
      synonyms: ['prix bi ci riz?', 'riz prix?', 'combien riz?']
    },
    {
      wolof: 'Nani la ci?',
      french: 'Combien ça coûte ?',
      english: 'How much does it cost?',
      intent: 'PRICE',
      synonyms: ['combien?', 'prix bi?', 'nan la?']
    },

    // COMMANDES
    {
      wolof: 'Dama bëgg jënd tomate',
      french: 'Je veux acheter des tomates',
      english: 'I want to buy tomatoes',
      intent: 'ORDER',
      synonyms: ['bëgg naa jënd tomate', 'dama jënd tomate', 'jënd tomate']
    },
    {
      wolof: 'Dama bëgg jënd mango',
      french: 'Je veux acheter des mangues',
      english: 'I want to buy mangoes',
      intent: 'ORDER',
      synonyms: ['bëgg naa jënd mango', 'dama jënd mango', 'jënd mango']
    },
    {
      wolof: 'Dama bëgg commande',
      french: 'Je veux faire une commande',
      english: 'I want to place an order',
      intent: 'ORDER',
      synonyms: ['bëgg commande', 'faire commande', 'commander']
    },

    // COMPARAISON
    {
      wolof: 'Compare producteur bi',
      french: 'Compare les producteurs',
      english: 'Compare the producers',
      intent: 'COMPARE',
      synonyms: ['compare producteurs', 'comparer', 'producteur compare']
    },

    // AIDE
    {
      wolof: 'Dimbali ma',
      french: 'Aide-moi',
      english: 'Help me',
      intent: 'HELP',
      synonyms: ['aidez moi', 'dimbalima', 'aide']
    },

    // REMERCIEMENTS
    {
      wolof: 'Jërejëf',
      french: 'Merci',
      english: 'Thank you',
      intent: 'THANKS',
      synonyms: ['merci', 'thanks', 'cimer']
    },

    // AU REVOIR
    {
      wolof: 'Ba beneen',
      french: 'Au revoir',
      english: 'Goodbye',
      intent: 'GOODBYE',
      synonyms: ['au revoir', 'bye', 'ciao', 'a bientôt']
    }
  ];

  // Dictionnaire de produits Wolof-Français
  private productDictionary: { [key: string]: string } = {
    'tomate': 'tomate',
    'tomat': 'tomate',
    'tommate': 'tomate',
    'tomater': 'tomate',
    'mango': 'mangue',
    'mangue': 'mangue',
    'mangues': 'mangue',
    'riz': 'riz',
    'rice': 'riz',
    'oignon': 'oignon',
    'onion': 'oignon',
    'oignons': 'oignon',
    'carotte': 'carotte',
    'carot': 'carotte',
    'carottes': 'carotte',
    'patate': 'patate',
    'potato': 'patate',
    'patates': 'patate',
    'manioc': 'manioc',
    'cassava': 'manioc',
    'niébé': 'niébé',
    'niebe': 'niébé',
    'cowpea': 'niébé',
    'maïs': 'maïs',
    'mais': 'maïs',
    'corn': 'maïs',
    'arachide': 'arachide',
    'peanut': 'arachide',
    'arachides': 'arachide',
    'citron': 'citron',
    'lemon': 'citron',
    'citrons': 'citron',
    'orange': 'orange',
    'oranges': 'orange',
    'banane': 'banane',
    'banana': 'banane',
    'bananes': 'banane',
    'ananas': 'ananas',
    'pineapple': 'ananas',
    'pomme': 'pomme',
    'apple': 'pomme',
    'pommes': 'pomme',
    'lait': 'lait',
    'milk': 'lait',
    'beurre': 'beurre',
    'butter': 'beurre',
    'fromage': 'fromage',
    'cheese': 'fromage'
  };

  constructor() {}

  /* ===============================
     DÉTECTION D'INTENTION AMÉLIORÉE
  =============================== */
  detectIntent(text: string): WolofIntent {
    if (!text) return 'UNKNOWN';

    const normalizedText = this.normalizeText(text);

    // 1. Vérifier les phrases exactes
    for (const phrase of this.wolofPhrases) {
      if (this.matchesPhrase(normalizedText, phrase)) {
        return phrase.intent;
      }
    }

    // 2. Vérifier par mots-clés
    const intentKeywords = {
      'GREETING': ['nanga', 'def', 'salam', 'bonjour', 'hello', 'salut'],
      'AVAILABILITY': ['am', 'na', 'ci', 'disponible', 'avoir', 'y a-t-il'],
      'PRICE': ['nani', 'prix', 'combien', 'coûte', 'cout', 'nan', 'la'],
      'ORDER': ['bëgg', 'jënd', 'commande', 'acheter', 'veux', 'commander'],
      'COMPARE': ['compare', 'comparer', 'comparaison', 'meilleur'],
      'HELP': ['dimbali', 'aide', 'help', 'assistance'],
      'THANKS': ['jërejëf', 'merci', 'thanks', 'cimer'],
      'GOODBYE': ['ba', 'beneen', 'au revoir', 'bye', 'ciao'],
    };

    for (const [intent, keywords] of Object.entries(intentKeywords)) {
      if (keywords.some(keyword => normalizedText.includes(keyword))) {
        return intent as WolofIntent;
      }
    }

    // 3. Vérifier les produits spécifiques
    if (this.containsProductName(normalizedText)) {
      if (normalizedText.includes('prix') || normalizedText.includes('nani') || normalizedText.includes('combien')) {
        return 'PRICE';
      } else if (normalizedText.includes('am') || normalizedText.includes('disponible')) {
        return 'AVAILABILITY';
      } else if (normalizedText.includes('jënd') || normalizedText.includes('acheter')) {
        return 'ORDER';
      }
    }

    return 'UNKNOWN';
  }

  /* ===============================
     EXTRACTION DE PRODUIT
  =============================== */
  extractProduct(text: string): { wolof: string; french: string } | null {
    const normalizedText = this.normalizeText(text);

    // Chercher dans le dictionnaire
    for (const [wolofWord, frenchWord] of Object.entries(this.productDictionary)) {
      if (normalizedText.includes(wolofWord)) {
        return { wolof: wolofWord, french: frenchWord };
      }
    }

    return null;
  }

  /* ===============================
     EXTRACTION D'INFORMATIONS
  =============================== */
  extractQuantity(text: string): number | null {
    const normalizedText = this.normalizeText(text);
    const quantityMatches = normalizedText.match(/(\d+)\s*(kg|kilo|kilogramme|g|gramme|l|litre|unité|pièce)/i);

    if (quantityMatches) {
      return parseInt(quantityMatches[1], 10);
    }

    // Chercher des mots de quantité
    const quantityWords: { [key: string]: number } = {
      'benn': 1, 'une': 1, 'un': 1, 'one': 1,
      'ñaar': 2, 'deux': 2, 'two': 2,
      'ñett': 3, 'trois': 3, 'three': 3,
      'ñeent': 4, 'quatre': 4, 'four': 4,
      'juróom': 5, 'cinq': 5, 'five': 5,
      'beaucoup': 10, 'many': 10, 'plusieurs': 5
    };

    for (const [word, quantity] of Object.entries(quantityWords)) {
      if (normalizedText.includes(word)) {
        return quantity;
      }
    }

    return null;
  }

  /* ===============================
     RÉPONSES VOCALES CONTEXTUELLES
  =============================== */
  getResponse(intent: WolofIntent, context?: any): string {
    switch (intent) {
      case 'GREETING':
        return this.getGreetingResponse(context);
      case 'AVAILABILITY':
        return this.getAvailabilityResponse(context);
      case 'PRICE':
        return this.getPriceResponse(context);
      case 'ORDER':
        return this.getOrderResponse(context);
      case 'COMPARE':
        return this.getCompareResponse(context);
      case 'HELP':
        return this.getHelpResponse();
      case 'THANKS':
        return this.getThanksResponse();
      case 'GOODBYE':
        return this.getGoodbyeResponse();
      default:
        return this.getFallbackResponse();
    }
  }

  getGreetingResponse(context?: any): string {
    const responses = [
      'Nanga def ! Maa ngi fi, yaw nag?',
      'Salamalekoum ! Na nga def?',
      'Bonjour ! Ça va ?',
      'Nangadef rekk, nan nga bëgg ma dimbali la?'
    ];
    return this.getRandomResponse(responses);
  }

  getAvailabilityResponse(context?: any): string {
    const product = context?.product || 'produit';
    const isAvailable = context?.isAvailable || false;

    if (isAvailable) {
      return `Waaw, am na ci ${product}.`;
    } else {
      return `Dédét, amul ci ${product} bi tey.`;
    }
  }

  getPriceResponse(context?: any): string {
    const product = context?.product || 'produit';
    const price = context?.price;

    if (price) {
      return `Prix bi ci ${product} bi mooy ${price.toLocaleString()} FCFA.`;
    } else {
      return `Nanga laaj ci prix ${product}?`;
    }
  }

  getOrderResponse(context?: any): string {
    const product = context?.product || 'produit';
    const quantity = context?.quantity;

    if (quantity) {
      return `Waaw, nga am ${quantity} ${product}. Danga bëgg jënd?`;
    } else {
      return `Nanga bëgg jënd ${product}?`;
    }
  }

  getCompareResponse(context?: any): string {
    return 'Nanga bëgg compare producteur bi? Dimbali ma ci product bi nga bëgg.';
  }

  getHelpResponse(): string {
    return 'Dama bëgg la dimbali ci: 1. Prix 2. Produit disponible 3. Commander 4. Compare producteur. Nanga bëgg ci lan?';
  }

  getThanksResponse(): string {
    const responses = [
      'De rien!',
      'Ay waay, jërejëf!',
      'Derien rekk!',
      'Amul solo!'
    ];
    return this.getRandomResponse(responses);
  }

  getGoodbyeResponse(): string {
    const responses = [
      'Ba beneen yoon!',
      'À bientôt!',
      'Ba ci kanam!',
      'Salam!'
    ];
    return this.getRandomResponse(responses);
  }

  getFallbackResponse(): string {
    const responses = [
      'Eske meun nga léral sa laaj bi?',
      'Dégguma loo wax. Nanga laaj ci Français?',
      'Dama xam dégg sa wax bi. Nanga tëral?',
      'Pardon, dégguma. Nanga wax ci Français?'
    ];
    return this.getRandomResponse(responses);
  }

  // NOUVELLES MÉTHODES POUR COMPATIBILITÉ
  isTomate(text: string): boolean {
    const normalizedText = this.normalizeText(text);
    return normalizedText.includes('tomate') ||
           normalizedText.includes('tomat') ||
           normalizedText.includes('tommate');
  }

  isMangue(text: string): boolean {
    const normalizedText = this.normalizeText(text);
    return normalizedText.includes('mango') ||
           normalizedText.includes('mangue') ||
           normalizedText.includes('mangues');
  }

  getAskProductResponse(): string {
    return 'Eske tomate walla mangue la nga laaj ?';
  }

  /* ===============================
     UTILITAIRES
  =============================== */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[?!.,;:]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/ñ/g, 'n')
      .replace(/ë/g, 'e')
      .replace(/é/g, 'e')
      .replace(/è/g, 'e')
      .replace(/ê/g, 'e');
  }

  private matchesPhrase(text: string, phrase: WolofPhrase): boolean {
    const normalizedText = this.normalizeText(text);
    const targetPhrase = this.normalizeText(phrase.wolof);

    if (normalizedText.includes(targetPhrase)) {
      return true;
    }

    return phrase.synonyms.some(synonym =>
      normalizedText.includes(this.normalizeText(synonym))
    );
  }

  private containsProductName(text: string): boolean {
    const normalizedText = this.normalizeText(text);
    return Object.keys(this.productDictionary).some(product =>
      normalizedText.includes(product)
    );
  }

  private getRandomResponse(responses: string[]): string {
    return responses[Math.floor(Math.random() * responses.length)];
  }

  /* ===============================
     MÉTHODES DE CONVERSION
  =============================== */
  translateToFrench(wolofText: string): string {
    const normalizedText = this.normalizeText(wolofText);
    let translated = normalizedText;

    const translations: { [key: string]: string } = {
      'nanga': 'comment',
      'def': 'vas',
      'am': 'avoir',
      'na': 'il y a',
      'ci': 'de/des',
      'nani': 'quel est',
      'prix': 'prix',
      'bëgg': 'vouloir',
      'jënd': 'acheter',
      'dama': 'je',
      'compare': 'comparer',
      'producteur': 'producteur',
      'dimbali': 'aider',
      'jërejëf': 'merci',
      'ba': 'jusqu\'à',
      'beneen': 'prochain',
      'waaw': 'oui',
      'dédét': 'non',
      'tey': 'aujourd\'hui',
      'mooy': 'c\'est',
      'nan': 'est',
      'la': 'le/la',
      'bi': 'le/la',
      'eske': 'est-ce que',
      'meun': 'peux',
      'léral': 'répéter',
      'laaj': 'question',
      'dégg': 'comprendre',
      'wax': 'parler',
      'xam': 'savoir',
      'tëral': 'essayer'
    };

    Object.entries(translations).forEach(([wolof, french]) => {
      const regex = new RegExp(`\\b${wolof}\\b`, 'gi');
      translated = translated.replace(regex, french);
    });

    Object.entries(this.productDictionary).forEach(([wolof, french]) => {
      const regex = new RegExp(`\\b${wolof}\\b`, 'gi');
      translated = translated.replace(regex, french);
    });

    return translated.charAt(0).toUpperCase() + translated.slice(1);
  }

  isWolofText(text: string): boolean {
    const normalizedText = this.normalizeText(text);
    const wolofMarkers = ['nanga', 'def', 'am', 'na', 'ci', 'bëgg', 'jënd', 'jërejëf', 'waaw', 'dédét'];
    return wolofMarkers.some(marker => normalizedText.includes(marker));
  }
}

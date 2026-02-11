// chatbot.service.ts (version corrigée)
import { Injectable } from '@angular/core';
import { Product } from '../interfaces/data.interfaces';
import { WolofVoiceService, WolofIntent } from './wolof-voice.service';

interface ChatbotContext {
  lastQuestion?: string;
  pendingIntent?: 'estimate' | 'compare' | 'order' | null;
  pendingProduct?: string | null; // CHANGÉ: null autorisé
  conversationHistory: string[];
  userPreferences?: {
    preferredLanguage: 'fr' | 'wolof';
    favoriteProducts: string[];
    favoriteProducers: string[];
  };
}

@Injectable({
  providedIn: 'root',
})
export class ChatbotService {
  private contexts = new Map<string, ChatbotContext>();

  constructor(private wolofVoiceService: WolofVoiceService) {
    this.initializeContexts();
  }

  private initializeContexts() {
    this.contexts.set('default', {
      conversationHistory: [],
      userPreferences: {
        preferredLanguage: 'fr',
        favoriteProducts: [],
        favoriteProducers: []
      }
    });
  }

  private getContext(userId: string = 'default'): ChatbotContext {
    if (!this.contexts.has(userId)) {
      this.contexts.set(userId, {
        conversationHistory: [],
        userPreferences: {
          preferredLanguage: 'fr',
          favoriteProducts: [],
          favoriteProducers: []
        }
      });
    }
    return this.contexts.get(userId)!;
  }

  private updateContext(userId: string, updates: Partial<ChatbotContext>) {
    const context = this.getContext(userId);
    Object.assign(context, updates);

    if (context.conversationHistory.length > 10) {
      context.conversationHistory = context.conversationHistory.slice(-10);
    }
  }

  async getIntelligentResponse(
    question: string,
    products: Product[],
    producers: any[],
    userId: string = 'default'
  ): Promise<string> {
    const q = question.toLowerCase().trim();
    const context = this.getContext(userId);

    context.conversationHistory.push(q);
    this.updateContext(userId, context);

    // Détecter si c'est du Wolof
    if (this.wolofVoiceService.isWolofText(q)) {
      return this.handleWolofQuestion(q, products, producers, context);
    }

    /* =============================
       SALUTATIONS & POLITESSE
    ============================= */
    if (this.isGreeting(q)) {
      return this.getGreetingResponse(context);
    }

    if (this.isThankYouMessage(q)) {
      return this.getThankYouResponse();
    }

    if (this.isGoodbye(q)) {
      return this.getGoodbyeResponse();
    }

    /* =============================
       GESTION DU CONTEXTE MULTI-ÉTAPES
    ============================= */
    if (context.pendingIntent && !context.pendingProduct && this.extractProductName(q)) {
      return this.handlePendingIntent(context, q, products, producers, userId);
    }

    /* =============================
       CATÉGORIES DE QUESTIONS
    ============================= */

    // 1️⃣ ESTIMATION DE PRIX
    if (this.isPriceEstimationQuestion(q)) {
      const productName = this.extractProductName(q);
      if (productName) {
        this.updateContext(userId, {
          pendingIntent: null as any,
          pendingProduct: null
        });
        return this.getMarketPriceEstimate(productName, products);
      } else {
        this.updateContext(userId, {
          pendingIntent: 'estimate',
          pendingProduct: null
        });
        return '🤔 Pour quel produit souhaitez-vous une estimation de prix ? (ex: tomates, riz, mangues)';
      }
    }

    // 2️⃣ COMPARAISON PRODUCTEURS
    if (this.isComparisonQuestion(q)) {
      const productName = this.extractProductName(q);
      if (productName) {
        this.updateContext(userId, {
          pendingIntent: null as any,
          pendingProduct: null
        });
        return this.compareProducersForProduct(productName, products);
      } else {
        this.updateContext(userId, {
          pendingIntent: 'compare',
          pendingProduct: null
        });
        return '🏆 Pour quel produit souhaitez-vous comparer les producteurs ? (ex: tomates, riz, mangues)';
      }
    }

    // 3️⃣ COMMANDER UN PRODUIT
    if (this.isOrderQuestion(q)) {
      const productName = this.extractProductName(q);
      if (productName) {
        this.updateContext(userId, {
          pendingIntent: null as any,
          pendingProduct: null
        });
        return this.getProductOrderInfo(productName, products);
      } else {
        this.updateContext(userId, {
          pendingIntent: 'order',
          pendingProduct: null
        });
        return '🛒 Quel produit souhaitez-vous commander ?';
      }
    }

    // 4️⃣ PRIX EXACT
    if (this.isExactPriceQuestion(q)) {
      const productName = this.extractProductName(q);
      if (productName) {
        return this.getExactProductPrice(productName, products);
      } else {
        return '💰 De quel produit souhaitez-vous connaître le prix ?';
      }
    }

    // 5️⃣ DISPONIBILITÉ
    if (this.isAvailabilityQuestion(q)) {
      const productName = this.extractProductName(q);
      if (productName) {
        return this.checkProductAvailability(productName, products);
      } else {
        return this.getAvailableProducts(products);
      }
    }

    // 6️⃣ PROCEDURES
    if (this.isProcedureQuestion(q)) {
      return this.getProcedureInfo(q);
    }

    // 7️⃣ CONSEILS & ASTUCES
    if (this.isTipQuestion(q)) {
      return this.getTipResponse(q);
    }

    // 8️⃣ RECOMMANDATIONS
    if (this.isRecommendationQuestion(q)) {
      return this.getRecommendationResponse(context);
    }

    // 9️⃣ PRODUCTEURS
    if (this.isProducerQuestion(q)) {
      return this.getProducerInfo(q, producers, products);
    }

    // 🔟 SAISONNALITÉ
    if (this.isSeasonalityQuestion(q)) {
      return this.getSeasonalityInfo();
    }

    // 💡 AIDE GÉNÉRALE
    if (this.isHelpRequest(q)) {
      return this.getHelpMessage(context);
    }

    return this.getContextualResponse(q, context, products);
  }

  private async handleWolofQuestion(
    q: string,
    products: Product[],
    producers: any[],
    context: ChatbotContext
  ): Promise<string> {
    const intent = this.wolofVoiceService.detectIntent(q);
    const product = this.wolofVoiceService.extractProduct(q);

    let response = '';
    let wolofResponse = '';

    switch (intent) {
      case 'GREETING':
        wolofResponse = this.wolofVoiceService.getGreetingResponse();
        response = `🌍 **${wolofResponse}**\n\nJe suis votre assistant bilingue. Comment puis-je vous aider aujourd'hui ?`;
        break;

      case 'AVAILABILITY':
        if (product) {
          const available = products.some(p =>
            p.name.toLowerCase().includes(product.french) &&
            p.status === 'available' &&
            p.quantity > 0
          );

          wolofResponse = this.wolofVoiceService.getAvailabilityResponse({
            product: product.wolof,
            isAvailable: available
          });

          if (available) {
            const availableProducts = products.filter(p =>
              p.name.toLowerCase().includes(product.french) &&
              p.status === 'available'
            );
            const count = availableProducts.length;
            const totalStock = availableProducts.reduce((sum, p) => sum + p.quantity, 0);

            response = `🌍 **${wolofResponse}**\n\n✅ **${product.french.toUpperCase()} DISPONIBLE**\n` +
                      `📦 **Stock :** ${totalStock} unités\n` +
                      `👨‍🌾 **Producteurs :** ${count} producteur(s)\n` +
                      `💰 **Prix moyen :** ${this.getAveragePrice(availableProducts).toLocaleString()} FCFA`;
          } else {
            response = `🌍 **${wolofResponse}**\n\n❌ **${product.french.toUpperCase()} NON DISPONIBLE**\n` +
                      `Ce produit n'est pas disponible actuellement.`;
          }
        } else {
          wolofResponse = this.wolofVoiceService.getFallbackResponse();
          response = `🌍 **${wolofResponse}**\n\nDe quel produit parlez-vous ?`;
        }
        break;

      case 'PRICE':
        if (product) {
          const productProducts = products.filter(p =>
            p.name.toLowerCase().includes(product.french) &&
            p.status === 'available'
          );

          if (productProducts.length > 0) {
            const avgPrice = this.getAveragePrice(productProducts);
            wolofResponse = this.wolofVoiceService.getPriceResponse({
              product: product.wolof,
              price: avgPrice
            });

            response = `🌍 **${wolofResponse}**\n\n💰 **PRIX ${product.french.toUpperCase()}**\n` +
                      `📊 **Prix moyen :** ${avgPrice.toLocaleString()} FCFA\n` +
                      `📦 **Disponible chez :** ${productProducts.length} producteur(s)`;
          } else {
            response = `🌍 Dédét, xamuma prix bi ci ${product.wolof} bi. Amul tey.\n\n` +
                      `❌ Ce produit n'est pas disponible.`;
          }
        } else {
          wolofResponse = this.wolofVoiceService.getFallbackResponse();
          response = `🌍 **${wolofResponse}**\n\nDe quel produit voulez-vous connaître le prix ?`;
        }
        break;

      case 'ORDER':
        if (product) {
          wolofResponse = this.wolofVoiceService.getOrderResponse({
            product: product.wolof
          });

          const productInfo = this.getProductOrderInfo(product.french, products);
          response = `🌍 **${wolofResponse}**\n\n${productInfo}`;
        } else {
          wolofResponse = this.wolofVoiceService.getFallbackResponse();
          response = `🌍 **${wolofResponse}**\n\nQuel produit souhaitez-vous commander ?`;
        }
        break;

      case 'COMPARE':
        wolofResponse = this.wolofVoiceService.getCompareResponse();
        if (product) {
          const comparison = this.compareProducersForProduct(product.french, products);
          response = `🌍 **${wolofResponse}**\n\n${comparison}`;
        } else {
          response = `🌍 **${wolofResponse}**\n\nPour quel produit voulez-vous comparer ?`;
        }
        break;

      case 'THANKS':
        wolofResponse = this.wolofVoiceService.getThanksResponse();
        response = `🌍 **${wolofResponse}**\n\nJe suis là pour vous aider !`;
        break;

      case 'GOODBYE':
        wolofResponse = this.wolofVoiceService.getGoodbyeResponse();
        response = `🌍 **${wolofResponse}**\n\nÀ bientôt !`;
        break;

      default:
        const translated = this.wolofVoiceService.translateToFrench(q);
        return this.getIntelligentResponse(translated, products, producers);
    }

    return response;
  }

  private handlePendingIntent(
    context: ChatbotContext,
    q: string,
    products: Product[],
    producers: any[],
    userId: string
  ): string {
    const productName = this.extractProductName(q);
    if (!productName) {
      return '🤔 Je n\'ai pas compris le nom du produit.';
    }

    this.updateContext(userId, { pendingProduct: productName });

    switch (context.pendingIntent) {
      case 'estimate':
        return this.getMarketPriceEstimate(productName, products);
      case 'compare':
        return this.compareProducersForProduct(productName, products);
      case 'order':
        return this.getProductOrderInfo(productName, products);
      default:
        return this.getDefaultResponse();
    }
  }

  private getGreetingResponse(context: ChatbotContext): string {
    const userPreferences = context.userPreferences;
    const name = userPreferences?.favoriteProducts && userPreferences.favoriteProducts.length > 0 ?
      `, amateur de ${userPreferences.favoriteProducts[0]}` : '';

    return `👋 **Bonjour${name} !** Je suis votre assistant Jokko-Agro.\n\n` +
           `🌍 **Je parle Français et Wolof !**\n\n` +
           `Voici ce que je peux faire :\n\n` +
           `💰 **Estimation de prix** – "Estimation tomates"\n` +
           `🏆 **Comparaison producteurs** – "Comparer les mangues"\n` +
           `🛒 **Procédure de commande** – "Comment commander"\n` +
           `📦 **Produits disponibles** – "Quels produits"\n` +
           `👨‍🌾 **Producteurs actifs** – "Meilleurs producteurs"\n\n` +
           `💡 **En Wolof :** "Nani prix tomates?" ou "Am na ci riz?"`;
  }

  private getThankYouResponse(): string {
    const responses = [
      "🙏 **De rien !** C'est un plaisir de vous aider.",
      "🌍 **Jërejëf !** Je suis là pour vous servir.",
      "😊 **Avec plaisir !** N'hésitez pas à revenir.",
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }

  private getGoodbyeResponse(): string {
    return `👋 **À bientôt !**\n\n` +
           `N'oubliez pas :\n` +
           `• Vérifiez vos notifications\n` +
           `• Consultez les produits de saison\n` +
           `• Donnez votre avis sur vos achats\n\n` +
           `🌍 **En Wolof :** Ba beneen yoon !`;
  }

  // [Garder les autres méthodes existantes avec corrections...]

  private getMarketPriceEstimate(productName: string, products: Product[]): string {
    const matches = products.filter(p =>
      p.name.toLowerCase().includes(productName.toLowerCase()) &&
      p.status === 'available' &&
      p.quantity > 0
    );

    if (matches.length === 0) {
      return `❌ **${productName.toUpperCase()} NON DISPONIBLE**\n\n` +
             `Aucune donnée de marché pour ce produit.\n` +
             `💡 **Suggestions :**\n` +
             `• Vérifiez l'orthographe\n` +
             `• Essayez un produit similaire\n\n` +
             `🌍 **En Wolof :** Déedéet, amul ci ${productName} bi tey.`;
    }

    const prices = matches.map(p => p.price);
    const unit = matches[0].unit;
    const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const producerNames = Array.from(new Set(matches.map(p => p.producerName)));

    let res = `📊 **ESTIMATION DE PRIX – ${productName.toUpperCase()}**\n\n` +
              `💰 **Prix moyen :** ${avg.toLocaleString()} FCFA/${unit}\n` +
              `📉 **Prix minimum :** ${min.toLocaleString()} FCFA/${unit}\n` +
              `📈 **Prix maximum :** ${max.toLocaleString()} FCFA/${unit}\n\n`;

    if (matches.length > 0) {
      res += `👨‍🌾 **Producteurs (${producerNames.length}) :**\n`;
      producerNames.forEach((name, index) => {
        const producerProducts = matches.filter(p => p.producerName === name);
        const producerMinPrice = Math.min(...producerProducts.map(p => p.price));
        const producerStock = producerProducts.reduce((sum, p) => sum + p.quantity, 0);

        res += `${index + 1}. **${name}** – ${producerMinPrice.toLocaleString()} FCFA/${unit} (Stock: ${producerStock})\n`;
      });
    }

    res += `\n💡 **Conseil :** Les prix varient selon la qualité.`;
    res += `\n\n🌍 **En Wolof :** Prix bi ci ${productName} bi mooy ${avg.toLocaleString()} FCFA/${unit}`;

    return res;
  }

  private compareProducersForProduct(productName: string, products: Product[]): string {
    const matches = products.filter(p =>
      p.name.toLowerCase().includes(productName.toLowerCase()) &&
      p.status === 'available'
    );

    if (matches.length === 0) {
      return `❌ Aucun producteur trouvé pour **${productName}**.`;
    }

    // Implémentation simplifiée
    const producerMap = new Map<string, number>();

    matches.forEach(p => {
      const current = producerMap.get(p.producerName) || 0;
      producerMap.set(p.producerName, current + 1);
    });

    const sortedProducers = Array.from(producerMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    let res = `🏆 **COMPARAISON – ${productName.toUpperCase()}**\n\n`;

    sortedProducers.forEach(([name, count], index) => {
      const producerProducts = matches.filter(p => p.producerName === name);
      const avgPrice = this.getAveragePrice(producerProducts);
      const minPrice = Math.min(...producerProducts.map(p => p.price));
      const certified = producerProducts.some(p => p.certifications && p.certifications.length > 0);

      res += `${index + 1}. **${name}**\n`;
      res += `   💰 Prix: ${minPrice.toLocaleString()} FCFA (moy: ${avgPrice.toLocaleString()})\n`;
      res += `   📦 Produits: ${count}\n`;
      res += `   🏅 ${certified ? '✅ Certifié' : '❌ Non certifié'}\n\n`;
    });

    return res;
  }

  private getProductOrderInfo(productName: string, products: Product[]): string {
    const availableProducts = products.filter(p =>
      p.name.toLowerCase().includes(productName.toLowerCase()) &&
      p.status === 'available' &&
      p.quantity > 0
    );

    if (availableProducts.length === 0) {
      return `❌ **${productName.toUpperCase()} INDISPONIBLE**\n\n` +
             `Aucun stock disponible.`;
    }

    const producers = Array.from(new Set(availableProducts.map(p => p.producerName)));
    const bestPrice = Math.min(...availableProducts.map(p => p.price));

    return `🛒 **COMMANDER ${productName.toUpperCase()}**\n\n` +
           `✅ **Disponible chez ${producers.length} producteur(s)**\n` +
           `💰 **Meilleur prix :** ${bestPrice.toLocaleString()} FCFA\n\n` +
           `👨‍🌾 **Producteurs :**\n` +
           producers.slice(0, 3).map((name, i) =>
             `${i + 1}. **${name}**`
           ).join('\n') + '\n\n' +
           `📋 **Pour commander :**\n` +
           `1. Visitez la page du produit\n` +
           `2. Sélectionnez un producteur\n` +
           `3. Choisissez la quantité\n` +
           `4. Validez votre panier`;
  }

  private getAvailableProducts(products: Product[]): string {
    const available = products.filter(p => p.status === 'available' && p.quantity > 0);

    if (available.length === 0) {
      return '❌ **AUCUN PRODUIT DISPONIBLE**\n\n' +
             'Le marché est actuellement vide.';
    }

    // Grouper par catégorie
    const categories: { [key: string]: Product[] } = {};
    available.forEach(p => {
      const category = p.category?.toLowerCase() || 'autres';
      if (!categories[category]) categories[category] = [];
      categories[category].push(p);
    });

    let res = `📦 **PRODUITS DISPONIBLES (${available.length})**\n\n`;

    Object.entries(categories).forEach(([category, prods]) => {
      const categoryName = this.formatCategoryName(category);
      res += `**${categoryName}** (${prods.length})\n`;

      const uniqueProducts = Array.from(new Set(prods.map(p => p.name)));
      uniqueProducts.slice(0, 5).forEach(productName => {
        const productProds = prods.filter(p => p.name === productName);
        const minPrice = Math.min(...productProds.map(p => p.price));
        res += `• ${productName} – ${minPrice.toLocaleString()} FCFA\n`;
      });

      if (uniqueProducts.length > 5) {
        res += `  ... et ${uniqueProducts.length - 5} autres\n`;
      }
      res += '\n';
    });

    return res;
  }

  private getActiveProducers(producers: any[], products: Product[]): string {
    const producerMap = new Map<string, number>();

    products
      .filter(p => p.status === 'available' && p.quantity > 0)
      .forEach(p => {
        const name = p.producerName;
        producerMap.set(name, (producerMap.get(name) || 0) + 1);
      });

    if (producerMap.size === 0) {
      return '❌ **AUCUN PRODUCTEUR ACTIF**';
    }

    const sortedProducers = Array.from(producerMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    let res = `👨‍🌾 **PRODUCTEURS ACTIFS (${producerMap.size})**\n\n`;

    sortedProducers.forEach(([name, count], index) => {
      res += `${index + 1}. **${name}** – ${count} produit(s)\n`;
    });

    return res;
  }

  private getExactProductPrice(productName: string, products: Product[]): string {
    const matches = products.filter(p =>
      p.name.toLowerCase().includes(productName.toLowerCase()) &&
      p.status === 'available'
    );

    if (matches.length === 0) {
      return `❌ **${productName.toUpperCase()} NON DISPONIBLE**`;
    }

    let res = `💰 **PRIX ${productName.toUpperCase()}**\n\n`;

    matches.forEach(p => {
      res += `• ${p.name} – ${p.price.toLocaleString()} FCFA/${p.unit}\n`;
      if (p.certifications && p.certifications.length > 0) {
        res += `  🏅 Certifié\n`;
      }
    });

    const avgPrice = this.getAveragePrice(matches);
    res += `\n📊 **Prix moyen :** ${avgPrice.toLocaleString()} FCFA`;

    return res;
  }

  private checkProductAvailability(productName: string, products: Product[]): string {
    const availableProducts = products.filter(p =>
      p.name.toLowerCase().includes(productName.toLowerCase()) &&
      p.status === 'available' &&
      p.quantity > 0
    );

    if (availableProducts.length === 0) {
      return `❌ **${productName.toUpperCase()} INDISPONIBLE**`;
    }

    const producers = Array.from(new Set(availableProducts.map(p => p.producerName)));
    const totalStock = availableProducts.reduce((sum, p) => sum + p.quantity, 0);

    return `✅ **${productName.toUpperCase()} DISPONIBLE**\n\n` +
           `📊 **Statistiques :**\n` +
           `• **Producteurs :** ${producers.length}\n` +
           `• **Stock total :** ${totalStock} unités\n` +
           `• **Prix :** ${this.getPriceRange(availableProducts)}`;
  }

  private getProcedureInfo(q: string): string {
    if (q.includes('commande') || q.includes('commander')) {
      return `🛒 **PROCÉDURE DE COMMANDE**\n\n` +
             `1. Parcourez le marché\n` +
             `2. Ajoutez au panier\n` +
             `3. Validez la commande\n` +
             `4. Suivez la livraison`;
    }

    return `📋 **AIDE**\n\nJe peux vous aider avec :\n` +
           `• Comment commander\n` +
           `• Modes de paiement\n` +
           `• Délais de livraison`;
  }

  private getTipResponse(q: string): string {
    return `💡 **CONSEILS**\n\n` +
           `• Commandez le matin pour plus de fraîcheur\n` +
           `• Comparez les prix entre producteurs\n` +
           `• Vérifiez les certifications\n` +
           `• Lisez les avis des autres acheteurs`;
  }

  private getRecommendationResponse(context: ChatbotContext): string {
    const userPreferences = context.userPreferences;
    const favoriteCount = userPreferences?.favoriteProducts?.length || 0;
    const level = favoriteCount > 3 ? 'avancé' : 'débutant';

    return `🎯 **RECOMMANDATIONS (${level})**\n\n` +
           `Commencez par les produits certifiés\n` +
           `Choisissez des producteurs bien notés\n` +
           `Utilisez le chatbot pour toutes vos questions`;
  }

  private getProducerInfo(q: string, producers: any[], products: Product[]): string {
    if (q.includes('actif') || q.includes('actifs')) {
      return this.getActiveProducers(producers, products);
    }

    return this.getActiveProducers(producers, products);
  }

  private getSeasonalityInfo(): string {
    const month = new Date().toLocaleString('fr-FR', { month: 'long' });
    return `📅 **SAISONNALITÉ (${month.toUpperCase()})**\n\n` +
           `Les produits de saison sont plus frais et moins chers.\n` +
           `Consultez régulièrement le marché pour les nouveautés.`;
  }

  private getHelpMessage(context: ChatbotContext): string {
    const isWolofUser = context.userPreferences?.preferredLanguage === 'wolof';

    let response = `🤖 **COMMENT PUIS-JE VOUS AIDER ?**\n\n`;

    if (isWolofUser) {
      response += `🌍 **EN WOLOF :**\n` +
                 `• "Nani prix tomates?" – Prix des tomates\n` +
                 `• "Am na ci riz?" – Riz disponible?\n` +
                 `• "Dama bëgg jënd mango" – Acheter des mangues\n\n`;
    }

    response += `🇫🇷 **EN FRANÇAIS :**\n\n` +
               `💰 **PRIX & ESTIMATIONS**\n` +
               `• "Estimation tomates"\n` +
               `• "Prix du marché pour le riz"\n\n` +
               `🔄 **COMPARAISONS**\n` +
               `• "Comparer les producteurs de mangues"\n\n` +
               `📦 **PRODUITS & DISPONIBILITÉ**\n` +
               `• "Quels produits sont disponibles?"\n\n` +
               `🛒 **COMMANDES & LIVRAISON**\n` +
               `• "Comment faire une commande?"\n\n` +
               `💡 **Cliquez sur ${isWolofUser ? '🇫🇷' : '🌍'} pour changer de langue !**`;

    return response;
  }

  private getContextualResponse(
    q: string,
    context: ChatbotContext,
    products: Product[]
  ): string {
    return this.getDefaultResponse();
  }

  private getDefaultResponse(): string {
    return `🤔 Je ne suis pas sûr de comprendre.\n\n` +
           `Je peux vous aider avec :\n` +
           `• 💰 **Estimation de prix** d'un produit\n` +
           `• 🔄 **Comparaison** des producteurs\n` +
           `• 📦 **Produits disponibles**\n` +
           `• 🛒 **Procédure de commande**\n\n` +
           `🌍 **Je comprends aussi le Wolof !**`;
  }

  // Méthodes utilitaires
  private isGreeting(q: string): boolean {
    return ['bonjour', 'salut', 'hello', 'hey', 'hi'].some(word => q.includes(word));
  }

  private isThankYouMessage(q: string): boolean {
    return ['merci', 'thanks', 'thank you', 'cimer', 'jërejëf'].some(word => q.includes(word));
  }

  private isGoodbye(q: string): boolean {
    return ['au revoir', 'bye', 'à bientôt', 'ciao', 'ba beneen'].some(word => q.includes(word));
  }

  private isPriceEstimationQuestion(q: string): boolean {
    return ['estimation', 'estimer', 'prix du marché', 'prix moyen'].some(word => q.includes(word));
  }

  private isComparisonQuestion(q: string): boolean {
    return ['compare', 'comparer', 'comparaison', 'meilleur producteur'].some(word => q.includes(word));
  }

  private isOrderQuestion(q: string): boolean {
    return ['commander', 'acheter', 'qui vend', 'je veux acheter', 'dama bëgg jënd'].some(word => q.includes(word));
  }

  private isExactPriceQuestion(q: string): boolean {
    return q.startsWith('prix ') || q.includes('combien coûte');
  }

  private isAvailabilityQuestion(q: string): boolean {
    return ['disponible', 'disponibilité', 'en stock', 'am na ci'].some(word => q.includes(word));
  }

  private isProcedureQuestion(q: string): boolean {
    return q.includes('comment') && (q.includes('commande') || q.includes('payer') || q.includes('livraison'));
  }

  private isTipQuestion(q: string): boolean {
    return ['conseil', 'astuce', 'tip', 'recommandation'].some(word => q.includes(word));
  }

  private isRecommendationQuestion(q: string): boolean {
    return ['recommande', 'suggère', 'propose', 'idée'].some(word => q.includes(word));
  }

  private isProducerQuestion(q: string): boolean {
    return ['producteur', 'vendeur', 'fermier', 'agriculteur'].some(word => q.includes(word));
  }

  private isSeasonalityQuestion(q: string): boolean {
    return ['saison', 'meilleure saison', 'quand acheter'].some(word => q.includes(word));
  }

  private isHelpRequest(q: string): boolean {
    return q.includes('aide') || q.includes('help') || q === '?' || q === 'menu';
  }

  private extractProductName(q: string): string {
    const stopWords = [
      'estimation', 'estimer', 'compare', 'comparer', 'comparaison',
      'meilleur', 'meilleure', 'producteur', 'producteurs', 'vendeur',
      'vendeurs', 'qui', 'est', 'prix', 'marche', 'marché', 'moyen',
      'combien', 'coûte', 'je', 'veux', 'de', 'du', 'des', 'la', 'le',
      'les', 'un', 'une', 'faire', 'commander', 'acheter', 'vend', 'vendre',
      'pour', 'avec', 'sur', 'dama', 'bëgg', 'jënd', 'may', 'am', 'na',
      'ci', 'nan', 'la', 'nani', 'disponible', 'disponibilité', 'stock'
    ];

    const patterns = [
      /estimation\s+(.+?)(?:\?|$)/i,
      /compare[rz]?\s+(.+?)(?:\?|$)/i,
      /prix\s+(.+?)(?:\?|$)/i,
      /combien coûte\s+(.+?)(?:\?|$)/i,
      /commander\s+(.+?)(?:\?|$)/i,
      /acheter\s+(.+?)(?:\?|$)/i,
      /am na ci\s+(.+?)(?:\?|$)/i,
      /nani prix\s+(.+?)(?:\?|$)/i
    ];

    for (const pattern of patterns) {
      const match = q.match(pattern);
      if (match && match[1]) {
        const extracted = match[1]
          .toLowerCase()
          .replace(/[^\w\s]/g, '')
          .split(' ')
          .filter(word =>
            word.length > 2 &&
            !stopWords.includes(word.toLowerCase())
          )
          .join(' ')
          .trim();

        if (extracted) return extracted;
      }
    }

    const words = q.toLowerCase().split(' ');
    const filteredWords = words.filter(word =>
      word.length > 2 &&
      !stopWords.includes(word)
    );

    return filteredWords.join(' ') || '';
  }

  private getAveragePrice(products: Product[]): number {
    if (products.length === 0) return 0;
    const total = products.reduce((sum, p) => sum + p.price, 0);
    return Math.round(total / products.length);
  }

  private getPriceRange(products: Product[]): string {
    if (products.length === 0) return 'Non disponible';
    const prices = products.map(p => p.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const unit = products[0].unit;

    if (min === max) {
      return `${min.toLocaleString()} FCFA/${unit}`;
    }
    return `${min.toLocaleString()} - ${max.toLocaleString()} FCFA/${unit}`;
  }

  private formatCategoryName(category: string): string {
    const categoryMap: { [key: string]: string } = {
      'fruit': '🍎 Fruits',
      'fruits': '🍎 Fruits',
      'légume': '🥦 Légumes',
      'légumes': '🥦 Légumes',
      'vegetable': '🥦 Légumes',
      'vegetables': '🥦 Légumes',
      'céréale': '🌾 Céréales',
      'céréales': '🌾 Céréales',
      'epicerie': '🛒 Épicerie',
      'épicerie': '🛒 Épicerie'
    };

    return categoryMap[category] ||
           `📦 ${category.charAt(0).toUpperCase() + category.slice(1)}`;
  }
}

import { Injectable } from '@angular/core';
import { Product } from '../services/data.interfaces';

@Injectable({
  providedIn: 'root'
})
export class ChatbotService {
  
  constructor() {}

  async getIntelligentResponse(
    question: string,
    products: Product[],
    producers: any[]
  ): Promise<string> {
    const lowerQuestion = question.toLowerCase().trim();
    
    // 0. REMERCIEMENTS
    if (this.isThankYouMessage(lowerQuestion)) {
      return "🙏 **De rien !**\n\nN'hésitez pas si vous avez d'autres questions. Je suis là pour vous aider à trouver les meilleurs produits !";
    }
    
    // 1. PRODUCTEURS ACTIFS
    if (lowerQuestion.includes('producteur actif') || 
        lowerQuestion.includes('producteurs actifs') ||
        lowerQuestion.includes('qui sont les producteurs')) {
      return this.getActiveProducers(producers, products);
    }
    
    // 2. PRODUITS DISPONIBLES
    if (lowerQuestion.includes('produits disponible') ||
        lowerQuestion.includes('quels produits') ||
        lowerQuestion.includes('liste des produits')) {
      return this.getAvailableProducts(products);
    }
    
    // 3. COMMANDER UN PRODUIT
    if (lowerQuestion.includes('je veux commander') ||
        lowerQuestion.includes('commander des') ||
        lowerQuestion.includes('acheter des') ||
        lowerQuestion.includes('qui vend des')) {
      return this.getProductInfo(lowerQuestion, products);
    }
    
    // 4. PRIX DES PRODUITS
    if (lowerQuestion.includes('prix') || 
        lowerQuestion.includes('cher') ||
        lowerQuestion.includes('combien coûte')) {
      return this.getPriceInfo(lowerQuestion, products);
    }
    
    // 5. COMMENT COMMANDER
    if (lowerQuestion.includes('comment commander') ||
        lowerQuestion.includes('faire une commande')) {
      return this.getOrderProcedure();
    }
    
    // 6. SALUTATIONS
    if (lowerQuestion.includes('bonjour') || 
        lowerQuestion.includes('salut') ||
        lowerQuestion.includes('coucou')) {
      return "👋 **Bonjour !**\n\nJe suis votre assistant AgroConnect. Posez-moi vos questions sur les produits disponibles !";
    }
    
    // 7. AU REVOIR
    if (lowerQuestion.includes('au revoir') ||
        lowerQuestion.includes('bye') ||
        lowerQuestion.includes('à plus')) {
      return "👋 **À bientôt !**\n\nN'hésitez pas à revenir si vous avez d'autres questions.";
    }
    
    // 8. RECHERCHE PAR CATÉGORIE
    if (lowerQuestion.includes('légumes') ||
        lowerQuestion.includes('fruits') ||
        lowerQuestion.includes('céréales')) {
      return this.getCategoryProducts(lowerQuestion, products);
    }
    
    // 9. AIDE
    if (lowerQuestion.includes('aide') ||
        lowerQuestion.includes('tu peux faire quoi') ||
        lowerQuestion.includes('que peux-tu')) {
      return this.getHelpResponse();
    }
    
    // RÉPONSE PAR DÉFAUT
    return this.getDefaultResponse();
  }

  private isThankYouMessage(message: string): boolean {
    const thankYouWords = [
      'merci', 'thank you', 'thanks', 'merci beaucoup', 
      'je te remercie', 'cimer', 'merci bien', 'merci infiniment'
    ];
    
    return thankYouWords.some(word => message.includes(word));
  }

  private getActiveProducers(producers: any[], products: Product[]): string {
    if (!producers || producers.length === 0) {
      return "❌ **Aucun producteur trouvé pour le moment.**";
    }
    
    let response = `👨‍🌾 **${producers.length} PRODUCTEUR(S) ACTIF(S)**\n\n`;
    
    producers.forEach(producer => {
      const producerName = producer.name || producer;
      const productCount = products.filter(p => p.producerName === producerName).length;
      
      response += `**${producerName}**\n`;
      response += `   📦 ${productCount} produit(s) disponible(s)\n\n`;
    });
    
    return response;
  }

  private getAvailableProducts(products: Product[]): string {
    if (!products || products.length === 0) {
      return "❌ **Aucun produit disponible pour le moment.**";
    }
    
    const categories: { [key: string]: Product[] } = {};
    
    products.forEach(product => {
      const category = product.category || 'Non catégorisé';
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push(product);
    });
    
    let response = `📦 **${products.length} PRODUIT(S) DISPONIBLE(S)**\n\n`;
    
    Object.keys(categories).forEach(category => {
      response += `**${category.toUpperCase()}**\n`;
      categories[category].slice(0, 3).forEach(product => {
        const certified = product.certifications && product.certifications.length > 0;
        response += `• ${product.name} - ${product.price.toLocaleString()} FCFA/${product.unit || 'unité'}\n`;
        if (certified) response += `  ✅ Certifié\n`;
        response += `\n`;
      });
      
      if (categories[category].length > 3) {
        response += `... et ${categories[category].length - 3} autre(s) produit(s)\n\n`;
      }
    });
    
    return response;
  }

  private getProductInfo(question: string, products: Product[]): string {
    const productName = this.extractProductName(question);
    
    if (!productName) {
      return "🤔 **Quel produit cherchez-vous ?**\n\n" +
             "Exemple : « Je veux commander des tomates »\n" +
             "ou « Qui vend des mangues ? »";
    }
    
    const matchingProducts = products.filter(p => 
      p.name.toLowerCase().includes(productName.toLowerCase())
    );
    
    if (matchingProducts.length === 0) {
      return `❌ **Aucun "${productName}" trouvé**\n\n` +
             `Essayez avec un autre produit.`;
    }
    
    let response = `🔍 **${matchingProducts.length} PRODUIT(S) POUR "${productName.toUpperCase()}"**\n\n`;
    
    matchingProducts.forEach(product => {
      response += `**${product.name}**\n`;
      response += `💰 **Prix :** ${product.price.toLocaleString()} FCFA/${product.unit || 'unité'}\n`;
      response += `👨‍🌾 **Producteur :** ${product.producerName || 'Inconnu'}\n`;
      response += `📦 **Stock :** ${product.quantity || 0} disponible(s)\n\n`;
    });
    
    response += `💡 **Pour commander :**\n`;
    response += `1. Rendez-vous sur la page « Marché »\n`;
    response += `2. Sélectionnez le produit\n`;
    response += `3. Ajoutez-le à votre panier\n`;
    
    return response;
  }

  private getPriceInfo(question: string, products: Product[]): string {
    const productName = this.extractProductName(question);
    
    if (!productName || products.length === 0) {
      return "💰 **MEILLEURS PRIX ACTUELS**\n\n" +
             this.getPriceOverview(products);
    }
    
    const matchingProducts = products.filter(p => 
      p.name.toLowerCase().includes(productName.toLowerCase())
    );
    
    if (matchingProducts.length === 0) {
      return `❌ **Aucun prix trouvé pour "${productName}"**\n\n` +
             this.getPriceOverview(products);
    }
    
    let response = `💰 **PRIX POUR "${productName.toUpperCase()}"**\n\n`;
    
    matchingProducts.sort((a, b) => a.price - b.price).forEach((product, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : '📊';
      response += `${medal} **${product.name}**\n`;
      response += `   👨‍🌾 ${product.producerName}\n`;
      response += `   💰 ${product.price.toLocaleString()} FCFA/${product.unit || 'unité'}\n\n`;
    });
    
    return response;
  }

  private getOrderProcedure(): string {
    return `🛒 **COMMENT COMMANDER SUR Jokko-Agro**\n\n` +
           `1️⃣ **Recherchez un produit**\n` +
           `   • Parcourez le marché\n\n` +
           
           `2️⃣ **Sélectionnez votre produit**\n` +
           `   • Choisissez la quantité\n` +
           `   • Ajoutez au panier 🛒\n\n` +
           
           `3️⃣ **Passez la commande**\n` +
           `   • Rendez-vous dans votre panier\n` +
           `   • Vérifiez l'adresse de livraison\n` +
           `   • Choisissez le mode de paiement 💳\n\n` +
           
           `4️⃣ **Suivez votre commande**\n` +
           `   • Confirmation immédiate\n` +
           `   • Livraison en 24-48heures 🚚`;
  }

  private getCategoryProducts(category: string, products: Product[]): string {
    const matchingProducts = products.filter(p => 
      p.category && p.category.toLowerCase().includes(category.toLowerCase())
    );
    
    if (matchingProducts.length === 0) {
      return `❌ **Aucun produit dans la catégorie "${category}"**`;
    }
    
    let response = `📦 **${matchingProducts.length} PRODUIT(S) EN ${category.toUpperCase()}**\n\n`;
    
    matchingProducts.slice(0, 5).forEach(product => {
      response += `• ${product.name}\n`;
      response += `  👨‍🌾 ${product.producerName} | 💰 ${product.price.toLocaleString()} FCFA\n\n`;
    });
    
    return response;
  }

  private getHelpResponse(): string {
    return `🤖 **JE PEUX VOUS AIDER À :**\n\n` +
           `🔍 **Trouver des produits**\n` +
           `   • « produits disponibles »\n` +
           `   • « je veux des tomates »\n\n` +
           
           `👨‍🌾 **Connaître les producteurs**\n` +
           `   • « producteurs actifs »\n` +
           `   • « producteurs de légumes »\n\n` +
           
           `💰 **Comparer les prix**\n` +
           `   • « prix des tomates »\n` +
           `   • « meilleurs prix »\n\n` +
           
           `🛒 **Passer commande**\n` +
           `   • « comment commander »\n` +
           `   • « procédure d'achat »\n\n` +
           
           `💡 **Conseils d'achat**\n` +
           `   • « produits certifiés »\n` +
           `   • « produits bio »`;
  }

  private extractProductName(question: string): string {
    const stopWords = ['des', 'du', 'de', 'la', 'le', 'les', 'un', 'une', 'je', 'veux', 'commander', 'acheter', 'qui', 'vend'];
    
    const words = question.toLowerCase().split(' ');
    const productWords = words.filter(word => 
      !stopWords.includes(word) && 
      word.length > 2
    );
    
    return productWords.join(' ') || '';
  }

  private getPriceOverview(products: Product[]): string {
    if (!products || products.length === 0) {
      return "Aucun produit disponible.";
    }
    
    const categories = new Set(products.map(p => p.category).filter(Boolean));
    let response = '';
    
    categories.forEach(category => {
      const categoryProducts = products.filter(p => p.category === category);
      if (categoryProducts.length > 0) {
        const cheapest = categoryProducts.reduce((prev, current) => 
          prev.price < current.price ? prev : current
        );
        
        response += `• **${category}** : à partir de ${cheapest.price.toLocaleString()} FCFA\n`;
        response += `  (${cheapest.name})\n\n`;
      }
    });
    
    return response;
  }

  private getDefaultResponse(): string {
    return `🤔 **Je ne suis pas sûr de comprendre.**\n\n` +
           `Essayez de me demander :\n` +
           `• **« Qui sont les producteurs actifs ? »**\n` +
           `• **« Quels sont les produits disponibles ? »**\n` +
           `• **« Je veux commander [produit] »**\n` +
           `• **« Comment faire une commande ? »**\n\n` +
           `Ou dites simplement **« merci »** pour terminer la conversation.`;
  }
}
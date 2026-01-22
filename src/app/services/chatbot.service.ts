import { Injectable } from '@angular/core';
import { Product } from '../services/data.interfaces';

@Injectable({
  providedIn: 'root'
})
export class ChatbotService {
  async getIntelligentResponse(
    question: string,
    products: Product[],
    producers: any[]
  ): Promise<string> {
    const q = question.toLowerCase().trim();

    /* =============================
       1️⃣ REMERCIEMENTS
    ============================= */
    if (this.isThankYouMessage(q)) {
      return "🙏 De rien ! N'hésitez pas si vous avez d'autres questions.";
    }

    /* =============================
       2️⃣ COMMENT FAIRE UNE COMMANDE
    ============================= */
    if (
      q.includes('comment faire une commande') ||
      q.includes('comment commander') ||
      q.includes('faire une commande') ||
      q.includes('commander')
    ) {
      return this.getOrderProcedure();
    }

    /* =============================
       3️⃣ ESTIMATION DU PRIX
    ============================= */
    if (
      q.includes('estimation') ||
      q.includes('estimer') ||
      q.includes('prix du marché') ||
      q.includes('prix moyen') ||
      q.includes('estimation prix') ||
      q.startsWith('estimation')
    ) {
      const productName = this.extractProductNameFromQuestion(q);
      if (productName) {
        return this.getMarketPriceEstimate(productName, products);
      } else {
        return "🤔 Pour quel produit souhaitez-vous une estimation de prix ? (ex: tomates, riz, mangues)";
      }
    }

    /* =============================
       4️⃣ COMPARAISON PRODUCTEURS
    ============================= */
    if (
      q.includes('compare') ||
      q.includes('comparer') ||
      q.includes('comparaison') ||
      q.includes('meilleur producteur') ||
      q.includes('qui est le meilleur') ||
      q.includes('producteurs pour')
    ) {
      const productName = this.extractProductNameFromQuestion(q);
      if (productName) {
        return this.compareProducersForProduct(productName, products);
      } else {
        return "🤔 Pour quel produit souhaitez-vous comparer les producteurs ? (ex: tomates, riz, mangues)";
      }
    }

    /* =============================
       5️⃣ PRIX EXACT D'UN PRODUIT
    ============================= */
    if (q.startsWith('prix') || q.includes('combien coûte')) {
      const productName = this.extractProductNameFromQuestion(q);
      if (productName) {
        return this.getExactProductPrice(productName, products);
      } else {
        return "🤔 De quel produit souhaitez-vous connaître le prix ?";
      }
    }

    /* =============================
       6️⃣ COMMANDER / QUI VEND
    ============================= */
    if (q.includes('commander') || q.includes('acheter') || q.includes('qui vend')) {
      const productName = this.extractProductNameFromQuestion(q);
      if (productName) {
        return this.getProductInfo(productName, products);
      } else {
        return "🤔 Quel produit souhaitez-vous commander ?";
      }
    }

    /* =============================
       7️⃣ PRODUITS DISPONIBLES
    ============================= */
    if (
      q.includes('produits disponible') ||
      q.includes('quels produits') ||
      q.includes('produits disponibles')
    ) {
      return this.getAvailableProducts(products);
    }

    /* =============================
       8️⃣ PRODUCTEURS ACTIFS
    ============================= */
    if (q.includes('producteur actif') || q.includes('producteurs actifs')) {
      return this.getActiveProducers(producers, products);
    }

    /* =============================
       9️⃣ DEMANDE GÉNÉRIQUE D'AIDE
    ============================= */
    if (q.includes('aide') || q.includes('help') || q === '?' || q === 'help') {
      return this.getHelpMessage();
    }

    return this.getDefaultResponse();
  }

  /* =====================================================
     OUTILS LINGUISTIQUES
  ===================================================== */
  private isThankYouMessage(msg: string): boolean {
    return ['merci', 'thanks', 'thank you', 'cimer'].some(w => msg.includes(w));
  }

  private extractProductNameFromQuestion(question: string): string {
    const stopWords = [
      'compare', 'comparer', 'comparaison',
      'meilleur', 'meilleure',
      'producteur', 'producteurs',
      'vendeur', 'vendeurs',
      'qui', 'est',
      'prix', 'marche', 'marché', 'moyen', 'estimation',
      'combien', 'coûte',
      'je', 'veux', 'de', 'du', 'des', 'la', 'le', 'les',
      'un', 'une', 'faire',
      'commander', 'acheter', 'vend', 'vendre',
      'pour', 'avec', 'sur'
    ];

    // Extraire le nom du produit après certains mots-clés
    const patterns = [
      /estimation\s+(.+)/i,
      /prix\s+(.+)/i,
      /combien coûte\s+(.+)/i,
      /commander\s+(.+)/i,
      /acheter\s+(.+)/i,
      /qui vend\s+(.+)/i,
      /compare[r]?\s+(.+)/i,
      /comparer\s+(.+)/i,
      /producteurs?\s+pour\s+(.+)/i
    ];

    for (const pattern of patterns) {
      const match = question.match(pattern);
      if (match && match[1]) {
        const extracted = match[1]
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

    // Si pas de pattern, utiliser l'extraction simple
    return question
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(' ')
      .filter(word =>
        word.length > 2 &&
        !stopWords.includes(word)
      )
      .join(' ')
      .trim();
  }

  /* =====================================================
     ESTIMATION DU PRIX DU MARCHÉ
  ===================================================== */
  private getMarketPriceEstimate(productName: string, products: Product[]): string {
    const key = productName.toLowerCase().trim();

    const matches = products.filter(p =>
      p.name.toLowerCase().includes(key) &&
      p.status === 'available' &&
      p.quantity > 0
    );

    if (matches.length === 0) {
      return `❌ Aucune donnée de marché disponible pour "${productName}". Ce produit n'est pas disponible actuellement.`;
    }

    const prices = matches.map(p => p.price);
    const unit = matches[0].unit;

    const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
    const min = Math.min(...prices);
    const max = Math.max(...prices);

    const producers = Array.from(new Set(matches.map(p => p.producerName)));

    let res =
      `📊 **ESTIMATION DE PRIX – ${productName.toUpperCase()}**\n\n` +
      `💰 **Prix moyen du marché :** ${avg.toLocaleString()} FCFA / ${unit}\n` +
      `📉 **Prix minimum :** ${min.toLocaleString()} FCFA / ${unit}\n` +
      `📈 **Prix maximum :** ${max.toLocaleString()} FCFA / ${unit}\n\n`;

    if (matches.length > 0) {
      res += `👨‍🌾 **Producteurs disponibles (${producers.length}) :**\n`;
      producers.forEach((name, index) => {
        const producerProducts = matches.filter(p => p.producerName === name);
        const producerMinPrice = Math.min(...producerProducts.map(p => p.price));
        const producerStock = producerProducts.reduce((sum, p) => sum + p.quantity, 0);
        
        res += `${index + 1}. **${name}** - ${producerMinPrice.toLocaleString()} FCFA/${unit} (Stock: ${producerStock})\n`;
      });
    }

    res += `\n💡 **Conseil :** Les prix peuvent varier selon la qualité, la certification et la disponibilité.`;

    return res;
  }

  /* =====================================================
     COMPARAISON DES PRODUCTEURS POUR UN PRODUIT
  ===================================================== */
  compareProducersForProduct(productName: string, products: Product[]): string {
    if (!productName || productName.trim() === '') {
      return "❌ Veuillez spécifier un produit à comparer. (ex : tomates, riz, mangues)";
    }

    const matches = products.filter(p =>
      p.name.toLowerCase().includes(productName.toLowerCase()) &&
      p.status === 'available'
    );

    if (matches.length === 0) {
      return `❌ Aucun producteur trouvé pour **${productName}**. Ce produit n'est pas disponible actuellement.`;
    }

    if (matches.length === 1) {
      const p = matches[0];
      return `⚠️ Seul **${p.producerName}** propose **${p.name}** actuellement.\n\n` +
             `💰 Prix : ${p.price.toLocaleString()} FCFA / ${p.unit}\n` +
             `📦 Stock : ${p.quantity} ${p.unit}\n` +
             (p.certifications?.length > 0 ? `🏅 Certifié : Oui\n` : '') +
             (p.rating ? `⭐ Note : ${p.rating}/5\n` : '');
    }

    // Regrouper par producteur
    const grouped: Record<string, Product[]> = {};

    matches.forEach(p => {
      if (!grouped[p.producerName]) {
        grouped[p.producerName] = [];
      }
      grouped[p.producerName].push(p);
    });

    // Analyser chaque producteur
    const analysis = Object.entries(grouped).map(([producer, prods]) => {
      const avgPrice = Math.round(prods.reduce((s, p) => s + p.price, 0) / prods.length);
      const totalStock = prods.reduce((s, p) => s + (p.quantity || 0), 0);
      const avgRating = Math.round(
        (prods.reduce((s, p) => s + (p.rating || 0), 0) / prods.length) * 10
      ) / 10;
      const certifications = prods.reduce((s, p) => s + (p.certifications?.length || 0), 0);
      const hasCertification = certifications > 0;

      return {
        producer,
        avgPrice,
        totalStock,
        avgRating: avgRating || 0,
        hasCertification,
        productCount: prods.length
      };
    });

    // Calculer un score pour chaque producteur
    const minPrice = Math.min(...analysis.map(a => a.avgPrice));
    const maxStock = Math.max(...analysis.map(a => a.totalStock));

    const scoredAnalysis = analysis.map(a => {
      let score = 0;
      
      // Score prix (plus bas = meilleur)
      if (minPrice > 0) {
        score += (minPrice / a.avgPrice) * 40;
      }
      
      // Score stock (plus élevé = meilleur)
      if (maxStock > 0) {
        score += (a.totalStock / maxStock) * 25;
      }
      
      // Score certification
      if (a.hasCertification) {
        score += 20;
      }
      
      // Score note
      if (a.avgRating > 0) {
        score += (a.avgRating / 5) * 15;
      }
      
      return { ...a, score: Math.round(score) };
    });

    // Trier par score décroissant
    scoredAnalysis.sort((a, b) => b.score - a.score);

    // Construction de la réponse
    let res = `📊 **COMPARAISON DES PRODUCTEURS – ${productName.toUpperCase()}**\n\n`;
    res += `*Basée sur ${matches.length} produit(s) de ${scoredAnalysis.length} producteur(s)*\n\n`;

    scoredAnalysis.forEach((a, i) => {
      const badge = i === 0 ? '🏆 **MEILLEUR CHOIX**' : `${i + 1}.`;
      
      res += `${badge} **${a.producer}**\n`;
      res += `   💰 Prix moyen : ${a.avgPrice.toLocaleString()} FCFA\n`;
      res += `   📦 Stock total : ${a.totalStock} ${matches[0].unit}\n`;
      res += `   ⭐ Note : ${a.avgRating > 0 ? a.avgRating + '/5' : 'Pas encore noté'}\n`;
      res += `   🏅 Certifié : ${a.hasCertification ? 'Oui ✅' : 'Non ❌'}\n`;
      res += `   📊 Score : ${a.score}/100\n\n`;
    });

    // Recommandation
    const best = scoredAnalysis[0];
    res += `👉 **RECOMMANDATION :**\n`;
    res += `**${best.producer}** est recommandé pour **${productName}** car :\n`;
    
    const reasons: string[] = [];
    if (best.avgPrice === minPrice) {
      reasons.push('offre le meilleur prix');
    }
    if (best.totalStock === maxStock) {
      reasons.push('dispose du plus grand stock');
    }
    if (best.hasCertification) {
      reasons.push('produit certifié');
    }
    if (best.avgRating >= 4) {
      reasons.push('excellente note des clients');
    }
    
    if (reasons.length > 0) {
      res += `• ${reasons.join('\n• ')}\n`;
    }

    return res;
  }

  /* =====================================================
     PRIX EXACT D'UN PRODUIT
  ===================================================== */
  private getExactProductPrice(productName: string, products: Product[]): string {
    const key = productName.toLowerCase().trim();

    const matches = products.filter(p =>
      p.name.toLowerCase().includes(key) &&
      p.status === 'available'
    );

    if (matches.length === 0) {
      return `❌ Aucun produit trouvé pour "${productName}".`;
    }

    let res = `💰 **PRIX POUR ${productName.toUpperCase()}**\n\n`;

    matches.forEach(p => {
      res += `• **${p.name}**\n`;
      res += `  👨‍🌾 Producteur : ${p.producerName}\n`;
      res += `  💰 Prix : ${p.price.toLocaleString()} FCFA / ${p.unit}\n`;
      res += `  📦 Stock : ${p.quantity} ${p.unit}\n`;
      if (p.certifications && p.certifications.length > 0) {
        res += `  🏅 Certifications : ${p.certifications.join(', ')}\n`;
      }
      if (p.rating) {
        res += `  ⭐ Note : ${p.rating}/5\n`;
      }
      res += '\n';
    });

    if (matches.length > 1) {
      const prices = matches.map(p => p.price);
      const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
      res += `📊 **Prix moyen :** ${avg.toLocaleString()} FCFA/${matches[0].unit}\n`;
    }

    return res;
  }

  /* =====================================================
     INFORMATIONS SUR UN PRODUIT
  ===================================================== */
  private getProductInfo(productName: string, products: Product[]): string {
    const key = productName.toLowerCase().trim();

    const matches = products.filter(p =>
      p.name.toLowerCase().includes(key) &&
      p.status === 'available'
    );

    if (matches.length === 0) {
      return `❌ Aucun produit trouvé pour "${productName}".`;
    }

    let res = `📦 **${matches.length} PRODUIT(S) DISPONIBLE(S) POUR "${productName.toUpperCase()}"**\n\n`;

    matches.forEach(p => {
      res += `• **${p.name}**\n`;
      res += `  💰 ${p.price.toLocaleString()} FCFA/${p.unit}\n`;
      res += `  👨‍🌾 ${p.producerName}\n`;
      res += `  📦 Stock : ${p.quantity} ${p.unit}\n`;
      if (p.certifications && p.certifications.length > 0) {
        res += `  🏅 Certifié\n`;
      }
      res += '\n';
    });

    res += `💡 **Pour commander :**\n`;
    res += `1. Rendez-vous sur le marché\n`;
    res += `2. Recherchez "${productName}"\n`;
    res += `3. Ajoutez au panier\n`;
    res += `4. Validez votre commande`;

    return res;
  }

  /* =====================================================
     PRODUITS DISPONIBLES
  ===================================================== */
  private getAvailableProducts(products: Product[]): string {
    const available = products.filter(p => 
      p.status === 'available' && 
      p.quantity > 0
    );

    if (available.length === 0) {
      return "❌ Aucun produit disponible pour le moment.";
    }

    // Grouper par catégorie
    const categories: { [key: string]: Product[] } = {};

    available.forEach(p => {
      const category = p.category?.toLowerCase() || 'autres';
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push(p);
    });

    let res = `📦 **PRODUITS DISPONIBLES (${available.length})**\n\n`;

    Object.entries(categories).forEach(([category, prods]) => {
      const categoryName = this.formatCategoryName(category);
      res += `**${categoryName}** (${prods.length})\n`;
      
      // Limiter à 5 produits par catégorie pour éviter une réponse trop longue
      prods.slice(0, 5).forEach(p => {
        res += `• ${p.name} - ${p.price.toLocaleString()} FCFA/${p.unit}\n`;
      });
      
      if (prods.length > 5) {
        res += `  ... et ${prods.length - 5} autres\n`;
      }
      res += '\n';
    });

    res += `💡 **Astuce :** Utilisez "prix [produit]" pour connaître le prix exact ou "comparer [produit]" pour comparer les producteurs.`;

    return res;
  }

  /* =====================================================
     PRODUCTEURS ACTIFS
  ===================================================== */
  private getActiveProducers(producers: any[], products: Product[]): string {
    if (!products || products.length === 0) {
      return "❌ Aucun producteur actif pour le moment.";
    }

    const producerMap = new Map<string, number>();

    products
      .filter(p => p.status === 'available' && p.quantity > 0)
      .forEach(p => {
        const name = p.producerName;
        producerMap.set(name, (producerMap.get(name) || 0) + 1);
      });

    if (producerMap.size === 0) {
      return "❌ Aucun producteur actif pour le moment.";
    }

    const sortedProducers = Array.from(producerMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10); // Limiter à 10 producteurs

    let res = `👨‍🌾 **PRODUCTEURS ACTIFS (${producerMap.size})**\n\n`;

    sortedProducers.forEach(([name, count], index) => {
      const producerProducts = products.filter(p => 
        p.producerName === name && 
        p.status === 'available'
      );
      
      const certifications = producerProducts.filter(p => 
        p.certifications && p.certifications.length > 0
      ).length;

      const badge = index < 3 ? ['🥇', '🥈', '🥉'][index] : `${index + 1}.`;
      res += `${badge} **${name}**\n`;
      res += `   📦 ${count} produit(s) disponible(s)\n`;
      if (certifications > 0) {
        res += `   🏅 ${certifications} produit(s) certifié(s)\n`;
      }
      res += '\n';
    });

    return res;
  }

  /* =====================================================
     PROCÉDURE DE COMMANDE
  ===================================================== */
  private getOrderProcedure(): string {
    return (
      `🛒 **COMMENT FAIRE UNE COMMANDE SUR JOKKO-AGRO**\n\n` +
      `1️⃣ **Parcourez le marché** – Trouvez les produits qui vous intéressent\n` +
      `2️⃣ **Ajoutez au panier** – Sélectionnez la quantité souhaitée\n` +
      `3️⃣ **Validez la commande** – Révisez votre panier et confirmez\n` +
      `4️⃣ **Suivez la livraison** – Consultez le statut dans "Mes commandes"\n\n` +
      `💡 **Astuces :**\n` +
      `• Vérifiez les certifications des produits\n` +
      `• Comparez les prix entre producteurs\n` +
      `• Consultez les avis des autres acheteurs`
    );
  }

  /* =====================================================
     MESSAGE D'AIDE
  ===================================================== */
  private getHelpMessage(): string {
    return (
      `🤖 **COMMENT PUIS-JE VOUS AIDER ?**\n\n` +
      `Je peux vous aider avec :\n\n` +
      `💰 **Estimation de prix**\n` +
      `   • "Estimation tomates"\n` +
      `   • "Prix du marché pour le riz"\n\n` +
      `🔄 **Comparaison de producteurs**\n` +
      `   • "Comparer les producteurs de mangues"\n` +
      `   • "Qui est le meilleur pour les carottes?"\n\n` +
      `📦 **Produits disponibles**\n` +
      `   • "Quels produits sont disponibles?"\n` +
      `   • "Montre-moi les légumes"\n\n` +
      `🛒 **Commande**\n` +
      `   • "Comment faire une commande?"\n` +
      `   • "Qui vend des oignons?"\n\n` +
      `👨‍🌾 **Producteurs**\n` +
      `   • "Producteurs actifs"\n` +
      `   • "Meilleurs vendeurs"\n\n` +
      `💡 **Utilisez les boutons ci-dessous pour des questions rapides !**`
    );
  }

  /* =====================================================
     RÉPONSE PAR DÉFAUT
  ===================================================== */
  private getDefaultResponse(): string {
    return (
      `🤔 Je ne suis pas sûr de comprendre votre demande.\n\n` +
      `Je peux vous aider avec :\n` +
      `• 💰 **Estimation de prix** d'un produit\n` +
      `• 🔄 **Comparaison** des producteurs\n` +
      `• 📦 **Produits disponibles** sur le marché\n` +
      `• 🛒 **Procédure de commande**\n` +
      `• 👨‍🌾 **Producteurs actifs**\n\n` +
      `💡 **Essayez de formuler votre question différemment ou utilisez les boutons ci-dessous.**`
    );
  }

  /* =====================================================
     UTILITAIRES
  ===================================================== */
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
      'cereal': '🌾 Céréales',
      'cereals': '🌾 Céréales',
      'epicerie': '🛒 Épicerie',
      'épicerie': '🛒 Épicerie',
      'grocery': '🛒 Épicerie'
    };

    return categoryMap[category] || `📦 ${category.charAt(0).toUpperCase() + category.slice(1)}`;
  }

  private calculateProducerScore(
    product: Product,
    context: { minPrice: number; maxStock: number }
  ): number {
    const priceScore = (context.minPrice / product.price) * 100;
    const certScore = product.certifications && product.certifications.length > 0 ? 100 : 0;
    const ratingScore = product.rating ? (product.rating / 5) * 100 : 0;
    const stockScore = context.maxStock > 0
      ? Math.min((product.quantity / context.maxStock) * 100, 100)
      : 0;

    return (
      priceScore * 0.35 +
      certScore * 0.30 +
      ratingScore * 0.20 +
      stockScore * 0.15
    );
  }

  private explainScore(scored: any[]): string {
    let response = `📊 **COMPARAISON DES PRODUCTEURS**\n\n`;

    scored.forEach(s => {
      const p = s.product;

      response += `👨‍🌾 **${p.producerName}**\n`;
      response += `• 💰 Prix : ${p.price.toLocaleString()} FCFA/${p.unit}\n`;
      response += `• 🏅 Certifié : ${p.certifications?.length > 0 ? 'Oui ✅' : 'Non ❌'}\n`;
      response += `• ⭐ Avis clients : ${p.rating || 'Pas encore noté'}\n`;
      response += `• 📦 Stock : ${p.quantity} ${p.unit}\n`;
      response += `• 📊 Score : ${Math.round(s.score)}/100\n\n`;
    });

    const best = scored[0].product;

    response += `🏆 **RECOMMANDATION**\n`;
    response += `👉 **${best.producerName}** est recommandé pour :\n`;

    const reasons: string[] = [];
    
    // Vérifier le prix
    const minPrice = Math.min(...scored.map(s => s.product.price));
    if (best.price === minPrice) {
      reasons.push('offre le meilleur prix');
    }

    // Vérifier les certifications
    if (best.certifications?.length > 0) {
      reasons.push('produit certifié de qualité');
    }

    // Vérifier la note
    if (best.rating && best.rating >= 4) {
      reasons.push('excellente note des clients');
    }

    // Vérifier le stock
    const maxStock = Math.max(...scored.map(s => s.product.quantity));
    if (best.quantity === maxStock) {
      reasons.push('stock important disponible');
    }

    if (reasons.length > 0) {
      reasons.forEach(reason => {
        response += `• ${reason}\n`;
      });
    } else {
      response += `• bon équilibre qualité/prix\n`;
      response += `• disponibilité garantie\n`;
    }

    return response;
  }
}
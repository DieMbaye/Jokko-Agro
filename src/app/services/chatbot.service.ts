import { Injectable } from '@angular/core';
import { Product } from '../services/data.interfaces';

@Injectable({
  providedIn: 'root'
})
export class ChatbotService {

  /* =====================================================
     POINT D’ENTRÉE PRINCIPAL
  ===================================================== */
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
      q.includes('faire une commande')
    ) {
      return this.getOrderProcedure();
    }
    // 🆕 COMPARAISON DES PRODUCTEURS
if (
  q.includes('compare') ||
  q.includes('comparer') ||
  q.includes('comparaison') ||
  q.includes('meilleur producteur') ||
  q.includes('qui est le meilleur')
) {
  return this.compareProducers(q, products);
}


    /* =============================
       3️⃣ ESTIMATION DU MARCHÉ
    ============================= */
    if (
      q.includes('prix du marché') ||
      q.includes('prix moyen') ||
      q.includes('estimation')
    ) {
      return this.getMarketPriceEstimate(q, products);
    }
    // 🆕 COMPARAISON DES PRODUCTEURS POUR UN PRODUIT
if (q.includes('compare') || q.includes('comparer')) {
  const product = this.extractProductName(q);
  return this.compareProducersForProduct(product, products);
}

    /* =============================
       4️⃣ PRIX EXACT D’UN PRODUIT
    ============================= */
    if (q.startsWith('prix') || q.includes('combien coûte')) {
      return this.getExactProductPrice(q, products);
    }

    /* =============================
       5️⃣ COMMANDER / QUI VEND
    ============================= */
    if (q.includes('commander') || q.includes('acheter') || q.includes('qui vend')) {
      return this.getProductInfo(q, products);
    }

    /* =============================
       6️⃣ PRODUITS DISPONIBLES
    ============================= */
    if (q.includes('produits disponible') || q.includes('quels produits')) {
      return this.getAvailableProducts(products);
    }

    /* =============================
       7️⃣ PRODUCTEURS ACTIFS
    ============================= */
    if (q.includes('producteur actif') || q.includes('producteurs actifs')) {
      return this.getActiveProducers(producers, products);
    }

    return this.getDefaultResponse();
  }
  

  /* =====================================================
     OUTILS LINGUISTIQUES
  ===================================================== */
  private isThankYouMessage(msg: string): boolean {
    return ['merci', 'thanks', 'thank you', 'cimer'].some(w => msg.includes(w));
  }

 private extractProductName(question: string): string {
  const stopWords = [
    // verbes & intentions
    'compare', 'comparer', 'comparaison',
    'meilleur', 'meilleure',
    'producteur', 'producteurs',
    'vendeur', 'vendeurs',
    'qui', 'est',

    // prix / marché
    'prix', 'marche', 'marché', 'moyen', 'estimation',
    'combien', 'coûte',

    // grammaire
    'je', 'veux', 'de', 'du', 'des', 'la', 'le', 'les',
    'un', 'une', 'faire',

    // commander
    'commander', 'acheter', 'vend', 'vendre'
  ];

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
     PRIX EXACT
  ===================================================== */
  private getExactProductPrice(question: string, products: Product[]): string {
    const key = this.extractProductName(question);

    const matches = products.filter(p =>
      p.name.toLowerCase().includes(key) &&
      p.status === 'available'
    );

    if (matches.length === 0) {
      return `❌ Aucun produit trouvé pour "${key}".`;
    }

    let res = `💰 PRIX POUR ${key.toUpperCase()}\n\n`;

    matches.forEach(p => {
      res += `• ${p.name}\n`;
      res += `  Producteur : ${p.producerName}\n`;
      res += `  Prix : ${p.price.toLocaleString()} FCFA / ${p.unit}\n\n`;
    });

    return res;
  }
  private calculateProducerScore(
  product: Product,
  context: {
    minPrice: number;
    maxStock: number;
  }
): number {

  const priceScore = (context.minPrice / product.price) * 100;

  const certScore =
    product.certifications && product.certifications.length > 0 ? 100 : 0;

  const ratingScore =
    product.rating ? (product.rating / 5) * 100 : 0;

  const stockScore =
    context.maxStock > 0
      ? Math.min((product.quantity / context.maxStock) * 100, 100)
      : 0;

  return (
    priceScore * 0.35 +
    certScore * 0.30 +
    ratingScore * 0.20 +
    stockScore * 0.15
  );
}


  /* =====================================================
     ESTIMATION DU PRIX DU MARCHÉ
     (EXPLIQUÉE + PRODUCTEURS LISTÉS)
  ===================================================== */
  private getMarketPriceEstimate(question: string, products: Product[]): string {
    const key = this.extractProductName(question);

    const matches = products.filter(p =>
      p.name.toLowerCase().includes(key) &&
      p.status === 'available' &&
      p.quantity > 0
    );

    if (matches.length === 0) {
      return `❌ Aucune donnée de marché disponible pour "${key}".`;
    }

    const prices = matches.map(p => p.price);
    const unit = matches[0].unit;

    const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
    const min = Math.min(...prices);
    const max = Math.max(...prices);

    const producers = Array.from(
      new Set(matches.map(p => p.producerName))
    );

    let res =
      `📊 ESTIMATION DU PRIX DU MARCHÉ – ${key.toUpperCase()}\n\n` +
      `ℹ️ L’estimation correspond à une moyenne calculée à partir des prix réels proposés actuellement sur la plateforme.\n\n` +
      `Prix moyen : ${avg.toLocaleString()} FCFA / ${unit}\n` +
      `Prix minimum : ${min.toLocaleString()} FCFA / ${unit}\n` +
      `Prix maximum : ${max.toLocaleString()} FCFA / ${unit}\n\n` +
      `Producteurs concernés (${producers.length}) :\n`;

    producers.forEach(name => {
      res += `• ${name}\n`;
    });

    return res;
  }

  /* =====================================================
     PRODUITS
  ===================================================== */
  private getProductInfo(question: string, products: Product[]): string {
    const key = this.extractProductName(question);

    const matches = products.filter(p =>
      p.name.toLowerCase().includes(key)
    );

    if (matches.length === 0) {
      return `❌ Aucun produit trouvé pour "${key}".`;
    }

    let res = `📦 ${matches.length} PRODUIT(S) TROUVÉ(S)\n\n`;

    matches.forEach(p => {
      res += `• ${p.name} – ${p.price.toLocaleString()} FCFA/${p.unit}\n`;
      res += `  Producteur : ${p.producerName}\n\n`;
    });

    return res;
  }

  private getAvailableProducts(products: Product[]): string {
    const available = products.filter(p => p.status === 'available');

    if (available.length === 0) {
      return "❌ Aucun produit disponible.";
    }

    let res = `📦 ${available.length} PRODUIT(S) DISPONIBLE(S)\n\n`;

    available.forEach(p => {
      res += `• ${p.name} – ${p.price.toLocaleString()} FCFA/${p.unit}\n`;
    });

    return res;
  }

  private getActiveProducers(producers: any[], products: Product[]): string {
    if (!producers || producers.length === 0) {
      return "❌ Aucun producteur actif.";
    }

    let res = `👨‍🌾 PRODUCTEURS ACTIFS\n\n`;

    producers.forEach(p => {
      const count = products.filter(pr => pr.producerName === p.name).length;
      res += `• ${p.name} – ${count} produit(s)\n`;
    });

    return res;
  }
  private compareProducers(question: string, products: Product[]): string {
  const key = this.extractProductName(question);

  if (!key) {
    return "🤔 Quel produit voulez-vous comparer ? (ex : *tomates*, *mil*)";
  }

  // Produits concernés
  const matches = products.filter(p =>
    p.name.toLowerCase().includes(key) &&
    p.status === 'available'
  );

  if (matches.length === 0) {
    return `❌ Aucun producteur trouvé pour **${key}**.`;
  }

  // Regrouper par producteur
  const grouped: Record<string, Product[]> = {};

  matches.forEach(p => {
    if (!grouped[p.producerName]) {
      grouped[p.producerName] = [];
    }
    grouped[p.producerName].push(p);
  });

  // Analyse par producteur
  const analysis = Object.entries(grouped).map(([producer, prods]) => {
    const avgPrice =
      Math.round(prods.reduce((s, p) => s + p.price, 0) / prods.length);

    const totalStock =
      prods.reduce((s, p) => s + (p.quantity || 0), 0);

    const avgRating =
      Math.round(
        (prods.reduce((s, p) => s + (p.rating || 0), 0) / prods.length) * 10
      ) / 10;

    const certifications =
      prods.reduce((s, p) => s + (p.certifications?.length || 0), 0);

    return {
      producer,
      avgPrice,
      totalStock,
      avgRating,
      certifications
    };
  });

  // Trier → meilleur en premier
  analysis.sort((a, b) => {
    if (a.avgPrice !== b.avgPrice) return a.avgPrice - b.avgPrice;
    if (b.avgRating !== a.avgRating) return b.avgRating - a.avgRating;
    return b.totalStock - a.totalStock;
  });

  // Construction réponse
  let res = `📊 **COMPARAISON DES PRODUCTEURS – ${key.toUpperCase()}**\n\n`;

  analysis.forEach((a, i) => {
    const badge = i === 0 ? '🏆 MEILLEUR CHOIX' : '📌';

    res += `${badge} **${a.producer}**\n`;
    res += `💰 Prix moyen : ${a.avgPrice.toLocaleString()} FCFA\n`;
    res += `📦 Stock total : ${a.totalStock}\n`;
    res += `⭐ Note moyenne : ${a.avgRating || 'N/A'}\n`;
    res += `🏅 Certifications : ${a.certifications}\n\n`;
  });

  // Recommandation claire
  res += `👉 **Recommandation :** ${analysis[0].producer} offre le meilleur rapport qualité/prix pour **${key}**.`;

  return res;

}
compareProducersForProduct(
  productName: string,
  products: Product[]
): string {

  const matches = products.filter(p =>
    p.name.toLowerCase().includes(productName.toLowerCase()) &&
    p.status === 'available'
  );

  if (matches.length < 2) {
    return "❌ Pas assez de producteurs pour comparer ce produit.";
  }

  const minPrice = Math.min(...matches.map(p => p.price));
  const maxStock = Math.max(...matches.map(p => p.quantity));

  const scored = matches.map(p => ({
    product: p,
    score: this.calculateProducerScore(p, { minPrice, maxStock })
  }));

  scored.sort((a, b) => b.score - a.score);

  return this.explainScore(scored);
}
private explainScore(scored: any[]): string {
  let response = `📊 **COMPARAISON DES PRODUCTEURS**\n\n`;

  scored.forEach(s => {
    const p = s.product;

    response += `👨‍🌾 **${p.producerName}**\n`;
    response += `• 💰 Prix : ${p.price.toLocaleString()} FCFA/${p.unit}\n`;
    response += `• 🏅 Certifié : ${p.certifications.length > 0 ? 'Oui' : 'Non'}\n`;
    response += `• ⭐ Avis clients : ${p.rating || 'N/A'} / 5\n`;
    response += `• 📦 Stock : ${p.quantity} ${p.unit}\n\n`;
  });

  const best = scored[0].product;

  response += `🏆 **RECOMMANDATION**\n`;
  response += `👉 **${best.producerName}** est recommandé car :\n`;

  if (best.certifications.length > 0) {
    response += `• produit certifié\n`;
  }

  response += `• bon équilibre prix / disponibilité\n`;

  return response;
}



  /* =====================================================
     COMMANDE
  ===================================================== */
  private getOrderProcedure(): string {
    return (
      `🛒 COMMENT FAIRE UNE COMMANDE SUR JOKKO-AGRO\n\n` +
      `1️⃣ Choisissez un produit dans le marché\n` +
      `2️⃣ Ajoutez-le à votre panier\n` +
      `3️⃣ Validez la commande\n` +
      `4️⃣ Suivez la livraison depuis votre tableau de bord`
    );
  }

  /* =====================================================
     FALLBACK
  ===================================================== */
  private getDefaultResponse(): string {
    return (
      `🤔 Je peux vous aider avec :\n` +
      `• prix d’un produit\n` +
      `• estimation du prix du marché\n` +
      `• produits disponibles\n` +
      `• comment faire une commande`
    );
  }
}

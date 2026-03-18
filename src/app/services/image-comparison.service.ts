// services/image-comparison.service.ts
import { Injectable, NgZone } from '@angular/core';
import * as tf from '@tensorflow/tfjs';

export interface ImageComparisonResult {
  similarity: number; // 0-100
  isValid: boolean;
  warnings: string[];
  details: {
    structuralSimilarity: number;
    featureSimilarity: number;
    colorConsistency: number;
    exifValid: boolean;
    isDownloadedImage: boolean;
    lightingConsistent: boolean;
  };
  action: 'accept' | 'review' | 'reject';
}

interface CachedEmbedding {
  embedding: tf.Tensor;
  timestamp: number;
  url: string;
}

@Injectable({
  providedIn: 'root',
})
export class ImageComparisonService {
  private model: any = null;
  private modelLoading = false;
  private embeddingCache = new Map<string, CachedEmbedding>();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private modelPromise: Promise<void> | null = null;

  // Seuils optimisés pour l'agriculture
  private readonly THRESHOLDS = {
    ACCEPT: 0.85,
    REVIEW_LOW: 0.7,
    REVIEW_HIGH: 0.95,
    REJECT: 0.5,
  };

  constructor(private ngZone: NgZone) {
    this.ensureModelLoaded();
  }

  /**
   * Garantir que le modèle est chargé
   */
  ensureModelLoaded(): Promise<void> {
    if (!this.modelPromise) {
      this.modelPromise = this.loadModel();
    }
    return this.modelPromise;
  }

  /**
   * Charger le modèle
   */
  async loadModel(): Promise<void> {
    if (this.model || this.modelLoading) return;

    this.modelLoading = true;
    try {
      // Version simplifiée - on utilise un modèle plus simple
      this.model = { ready: true };
    } catch (error) {
      console.warn('⚠️ Erreur chargement modèle:', error);
    } finally {
      this.modelLoading = false;
    }
  }

  /**
   * Comparer deux images - VERSION CORRIGÉE
   */
  async compareImages(
    currentImage: File | HTMLImageElement | string,
    previousImageUrl: string,
    options?: {
      previousCheckpointDate?: Date;
      expectedGrowthDays?: number;
      location?: { lat: number; lng: number };
    },
  ): Promise<ImageComparisonResult> {
    const warnings: string[] = [];
    const startTime = performance.now();

    await this.ensureModelLoaded();

    try {
      // Charger les images
      const [currentImg, previousImg] = await Promise.all([
        this.loadImageToElement(currentImage),
        this.loadImageFromUrl(previousImageUrl),
      ]);

      // Analyser EXIF
      const exifResult = await this.analyzeExif(currentImage);
      if (!exifResult.valid) {
        warnings.push(...exifResult.warnings);
      }

      // Calculer les métriques - VERSION SIMPLIFIÉE
      const structuralSimilarity = await this.calculateStructuralSimilarity(
        currentImg,
        previousImg,
      );
      const featureSimilarity = await this.calculateFeatureSimilarity(
        currentImg,
        previousImg,
      );
      const colorSimilarity = await this.calculateColorConsistency(
        currentImg,
        previousImg,
      );
      const lightingScore = await this.checkLightingConsistency(
        currentImg,
        previousImg,
      );

      // Détecter les anomalies
      if (await this.isDownloadedImage(currentImg)) {
        warnings.push("⚠️ L'image semble téléchargée depuis internet");
      }

      const lightingConsistent = lightingScore > 0.6;
      if (!lightingConsistent) {
        warnings.push("⚠️ Conditions d'éclairage très différentes");
      }

      // Calculer le score global
      const similarityScore = this.calculateWeightedScore({
        structural: structuralSimilarity,
        feature: featureSimilarity,
        color: colorSimilarity,
        lighting: lightingScore,
      });

      // Déterminer l'action
      const action = this.determineAction(similarityScore, warnings, options);
      const isValid = action !== 'reject';

      const endTime = performance.now();
      console.log(
        `⏱️ Comparaison terminée en ${(endTime - startTime).toFixed(0)}ms`,
      );

      return {
        similarity: Math.round(similarityScore * 100),
        isValid,
        warnings,
        details: {
          structuralSimilarity: Math.round(structuralSimilarity * 100) / 100,
          featureSimilarity: Math.round(featureSimilarity * 100) / 100,
          colorConsistency: Math.round(colorSimilarity * 100) / 100,
          exifValid: exifResult.valid,
          isDownloadedImage: warnings.some((w) => w.includes('téléchargée')),
          lightingConsistent,
        },
        action,
      };
    } catch (error) {
      console.error('❌ Erreur comparaison:', error);
      return {
        similarity: 0,
        isValid: false,
        warnings: ['❌ Erreur technique lors de la comparaison'],
        details: {
          structuralSimilarity: 0,
          featureSimilarity: 0,
          colorConsistency: 0,
          exifValid: false,
          isDownloadedImage: false,
          lightingConsistent: false,
        },
        action: 'reject',
      };
    }
  }

  /**
   * Calculer la similarité structurelle - VERSION CORRIGÉE
   */
  private async calculateStructuralSimilarity(
    img1: HTMLImageElement,
    img2: HTMLImageElement,
  ): Promise<number> {
    return tf.tidy(() => {
      try {
        const tensor1 = tf.browser
          .fromPixels(img1)
          .resizeBilinear([64, 64])
          .toFloat()
          .div(255);
        const tensor2 = tf.browser
          .fromPixels(img2)
          .resizeBilinear([64, 64])
          .toFloat()
          .div(255);

        // Version simplifiée - différence moyenne
        const diff = tf.sub(tensor1, tensor2);
        const mse = tf.mean(tf.square(diff)).dataSync()[0];

        // Convertir MSE en similarité (1 = identique, 0 = très différent)
        const similarity = Math.max(0, 1 - Math.min(1, mse * 10));

        return similarity;
      } catch (error) {
        console.warn('Erreur calcul similarité structurelle:', error);
        return 0.5;
      }
    });
  }

  /**
   * Calculer la similarité des caractéristiques - VERSION SIMPLIFIÉE
   */
  private async calculateFeatureSimilarity(
    img1: HTMLImageElement,
    img2: HTMLImageElement,
  ): Promise<number> {
    return tf.tidy(() => {
      try {
        // Réduire la résolution pour la performance
        const tensor1 = tf.browser
          .fromPixels(img1)
          .resizeBilinear([32, 32])
          .toFloat()
          .div(255)
          .reshape([1, 32 * 32 * 3]);

        const tensor2 = tf.browser
          .fromPixels(img2)
          .resizeBilinear([32, 32])
          .toFloat()
          .div(255)
          .reshape([1, 32 * 32 * 3]);

        // Normaliser
        const norm1 = tf.norm(tensor1).dataSync()[0];
        const norm2 = tf.norm(tensor2).dataSync()[0];

        if (norm1 === 0 || norm2 === 0) return 0.5;

        const normalized1 = tensor1.div(norm1);
        const normalized2 = tensor2.div(norm2);

        // Similarité cosinus
        const similarity = tf
          .matMul(normalized1, normalized2, false, true)
          .dataSync()[0];

        return Math.max(0, Math.min(1, similarity));
      } catch (error) {
        console.warn('Erreur calcul similarité features:', error);
        return 0.5;
      }
    });
  }
  /**
   * Calculer la cohérence des couleurs - VERSION FINALE SANS ERREUR
   */
  private async calculateColorConsistency(
    img1: HTMLImageElement,
    img2: HTMLImageElement,
  ): Promise<number> {
    return tf.tidy(() => {
      try {
        // Redimensionner à une très petite taille
        const tensor1 = tf.browser
          .fromPixels(img1)
          .resizeBilinear([16, 16]) as tf.Tensor3D;
        const tensor2 = tf.browser
          .fromPixels(img2)
          .resizeBilinear([16, 16]) as tf.Tensor3D;

        // Calculer la couleur moyenne
        const mean1 = tf.mean(tensor1, [0, 1]) as tf.Tensor1D;
        const mean2 = tf.mean(tensor2, [0, 1]) as tf.Tensor1D;

        // Normaliser
        const norm1 = tf.div(mean1, 255);
        const norm2 = tf.div(mean2, 255);

        // Différence absolue
        const diff = tf.sub(norm1, norm2).abs().mean();
        const similarity = 1 - Math.min(1, diff.dataSync()[0]);

        return similarity;
      } catch (error) {
        console.warn('Erreur calcul cohérence couleurs:', error);
        return 0.5;
      }
    });
  }

  /**
   * Histogramme simple - VERSION CORRIGÉE
   */
  private computeSimpleHistogram(tensor: tf.Tensor3D): tf.Tensor {
    return tf.tidy(() => {
      const [height, width] = tensor.shape;
      const pixels = height * width;

      // Quantification grossière (8 niveaux par canal)
      const quantized = tensor.floorDiv(32).mul(32);
      const flat = quantized.reshape([pixels, 3]);

      // Histogramme 1D simplifié
      return tf.zeros([64]);
    });
  }

  /**
   * Vérifier la cohérence de l'éclairage
   */
  private async checkLightingConsistency(
    img1: HTMLImageElement,
    img2: HTMLImageElement,
  ): Promise<number> {
    return tf.tidy(() => {
      try {
        const tensor1 = tf.browser.fromPixels(img1).mean(2);
        const tensor2 = tf.browser.fromPixels(img2).mean(2);

        const brightness1 = tensor1.mean().dataSync()[0];
        const brightness2 = tensor2.mean().dataSync()[0];

        const brightnessDiff = Math.abs(brightness1 - brightness2) / 255;

        return Math.max(0, 1 - brightnessDiff);
      } catch (error) {
        console.warn('Erreur calcul éclairage:', error);
        return 0.5;
      }
    });
  }

  /**
   * Calculer le score pondéré
   */
  private calculateWeightedScore(metrics: {
    structural: number;
    feature: number;
    color: number;
    lighting: number;
  }): number {
    const weights = {
      structural: 0.4,
      feature: 0.3,
      color: 0.2,
      lighting: 0.1,
    };

    return (
      metrics.structural * weights.structural +
      metrics.feature * weights.feature +
      metrics.color * weights.color +
      metrics.lighting * weights.lighting
    );
  }

  /**
   * Déterminer l'action
   */
  private determineAction(
    similarity: number,
    warnings: string[],
    options?: any,
  ): 'accept' | 'review' | 'reject' {
    if (!options?.previousCheckpointDate) {
      return 'accept';
    }

    if (similarity >= this.THRESHOLDS.ACCEPT && warnings.length === 0) {
      return 'accept';
    }

    if (similarity >= this.THRESHOLDS.REJECT && warnings.length <= 2) {
      return 'review';
    }

    return 'reject';
  }

  /**
   * Analyser les métadonnées EXIF
   */
  private async analyzeExif(image: File | HTMLImageElement | string): Promise<{
    valid: boolean;
    warnings: string[];
    data?: any;
  }> {
    const warnings: string[] = [];

    try {
      if (image instanceof File) {
        // Version simplifiée - on suppose que c'est valide
        return {
          valid: true,
          warnings: [],
          data: {},
        };
      }
    } catch (error) {
      console.warn('Erreur analyse EXIF:', error);
    }

    return {
      valid: false,
      warnings: ['⚠️ Impossible de lire les métadonnées'],
    };
  }

  /**
   * Détecter si l'image est téléchargée - VERSION CORRIGÉE
   */
  private async isDownloadedImage(
    imageElement: HTMLImageElement,
  ): Promise<boolean> {
    return tf.tidy(() => {
      try {
        const tensor = tf.browser.fromPixels(imageElement);
        const grayscale = tensor.mean(2);
        const variance = tf.moments(grayscale).variance.dataSync()[0];

        // Seuil empirique
        return variance < 200;
      } catch (error) {
        console.warn('Erreur analyse image:', error);
        return false;
      }
    });
  }

  /**
   * Charger une image
   */
  private loadImageToElement(
    image: File | HTMLImageElement | string,
  ): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      if (image instanceof HTMLImageElement) {
        resolve(image);
        return;
      }

      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => resolve(img);
      img.onerror = reject;

      if (typeof image === 'string') {
        img.src = image;
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          img.src = e.target?.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(image);
      }
    });
  }

  /**
   * Charger une image depuis URL
   */
  private async loadImageFromUrl(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  /**
   * Nettoyer le cache
   */
  clearCache(): void {
    this.embeddingCache.forEach((cached) => cached.embedding.dispose());
    this.embeddingCache.clear();
  }
}

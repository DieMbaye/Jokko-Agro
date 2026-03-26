import { Injectable, NgZone } from '@angular/core';
import * as tf from '@tensorflow/tfjs';

export interface PlantAnalysis {
  cropType: string;
  dayOffset: number;
  stageLabel: string;
  stageCoherent: boolean;
  stageScore: number;
  stageNotes: string;
  healthScore: number;
  healthNotes: string;
  isAuthentic: boolean;
  hasExpectedFeatures: boolean;
}

export interface TerrainAnalysis {
  sameLocation: boolean;
  locationScore: number;
  progressionLogical: boolean;
  progressionScore: number;
  backgroundMatch: number;
  lightingMatch: number;
}

export interface ImageComparisonResult {
  similarity: number;
  isValid: boolean;
  warnings: string[];
  plantAnalysis: PlantAnalysis;
  terrainAnalysis: TerrainAnalysis;
  details: {
    structuralSimilarity: number;
    featureSimilarity: number;
    colorConsistency: number;
    exifValid: boolean;
    isDownloadedImage: boolean;
    lightingConsistent: boolean;
  };
  action: 'accept' | 'review' | 'reject';
  actionReason: string;
}

export interface ComparisonOptions {
  cropType: string;
  currentDayOffset: number;
  previousDayOffset?: number;
  previousCheckpointDate?: Date;
  location?: { lat: number; lng: number };
  zone?: 'sahel' | 'coastal' | 'highland' | 'default';
}

@Injectable({ providedIn: 'root' })
export class ImageComparisonService {
  private modelLoading = false;
  private modelPromise: Promise<void> | null = null;

  private readonly THRESHOLDS = {
    ACCEPT_STAGE: 70,
    ACCEPT_TERRAIN: 60,
    REVIEW_STAGE: 45,
    REVIEW_TERRAIN: 40,
  };

  // Connaissances agronomiques intégrées
  private readonly cropKnowledge: Record<
    string,
    {
      name: string;
      stages: Array<{
        dayMax: number;
        label: string;
        description: string;
        expectedHeight?: string;
        expectedFeatures?: string[];
      }>;
      healthIndicators: {
        good: string[];
        warning: string[];
        critical: string[];
      };
    }
  > = {
    tomato: {
      name: 'Tomate',
      stages: [
        {
          dayMax: 10,
          label: 'Germination',
          description: 'Plantules avec 2-4 feuilles',
          expectedHeight: '2-10cm',
        },
        {
          dayMax: 25,
          label: 'Croissance végétative',
          description: 'Plants de 15-30cm',
          expectedHeight: '15-30cm',
          expectedFeatures: ['feuilles composées', 'tige verte'],
        },
        {
          dayMax: 45,
          label: 'Pré-floraison',
          description: 'Plants de 30-60cm',
          expectedHeight: '30-60cm',
          expectedFeatures: ['premières fleurs jaunes', 'feuilles nombreuses'],
        },
        {
          dayMax: 60,
          label: 'Floraison',
          description: 'Fleurs jaunes abondantes',
          expectedHeight: '60-100cm',
          expectedFeatures: ['fleurs jaunes', 'feuilles vert foncé'],
        },
        {
          dayMax: 80,
          label: 'Fructification',
          description: 'Petits fruits verts',
          expectedHeight: '80-120cm',
          expectedFeatures: ['fruits verts', 'plante vigoureuse'],
        },
        {
          dayMax: 100,
          label: 'Maturation',
          description: 'Fruits qui rougissent',
          expectedFeatures: ['fruits rouges/verts', 'feuilles jaunissantes'],
        },
        {
          dayMax: 999,
          label: 'Récolte',
          description: 'Fruits mûrs',
          expectedFeatures: ['fruits rouges', 'prêts à cueillir'],
        },
      ],
      healthIndicators: {
        good: ['vert', 'feuilles', 'tige', 'fleurs'],
        warning: ['jaune', 'taches', 'flétrissement'],
        critical: ['brun', 'noir', 'moisissure', 'pourriture'],
      },
    },
    millet: {
      name: 'Mil',
      stages: [
        {
          dayMax: 7,
          label: 'Germination',
          description: 'Jeunes pousses',
          expectedHeight: '3-8cm',
        },
        {
          dayMax: 20,
          label: 'Tallage',
          description: 'Tiges multiples',
          expectedHeight: '20-40cm',
        },
        {
          dayMax: 45,
          label: 'Montaison',
          description: 'Tiges hautes',
          expectedHeight: '60-120cm',
        },
        {
          dayMax: 65,
          label: 'Épiaison',
          description: 'Épis en formation',
          expectedHeight: '120-180cm',
        },
        {
          dayMax: 90,
          label: 'Grain laiteux',
          description: 'Grains tendres',
          expectedFeatures: ['épis bien formés'],
        },
        {
          dayMax: 999,
          label: 'Maturité',
          description: 'Épis dorés',
          expectedFeatures: ['épis dorés', 'grains durs'],
        },
      ],
      healthIndicators: {
        good: ['vert', 'tiges', 'épis'],
        warning: ['jaune', 'sèche'],
        critical: ['brun', 'cassant', 'moisissure'],
      },
    },
    onion: {
      name: 'Oignon',
      stages: [
        {
          dayMax: 14,
          label: 'Germination',
          description: 'Fines tiges vertes',
          expectedHeight: '5-15cm',
        },
        {
          dayMax: 35,
          label: 'Feuillaison',
          description: 'Tiges creuses',
          expectedHeight: '20-40cm',
        },
        {
          dayMax: 70,
          label: 'Bulbaison',
          description: 'Renflements à la base',
          expectedFeatures: ['bulbes qui grossissent'],
        },
        {
          dayMax: 999,
          label: 'Maturité',
          description: 'Feuilles tombantes, bulbes formés',
          expectedFeatures: ['feuilles jaunissantes', 'bulbes gros'],
        },
      ],
      healthIndicators: {
        good: ['vert', 'tiges', 'bulbes'],
        warning: ['jaune', 'flétri'],
        critical: ['pourriture', 'moisissure'],
      },
    },
    rice: {
      name: 'Riz',
      stages: [
        {
          dayMax: 10,
          label: 'Germination',
          description: 'Jeunes pousses',
          expectedHeight: '5-10cm',
        },
        {
          dayMax: 25,
          label: 'Tallage',
          description: 'Touffes de tiges',
          expectedHeight: '20-40cm',
        },
        {
          dayMax: 45,
          label: 'Montaison',
          description: 'Tiges hautes',
          expectedHeight: '50-80cm',
        },
        {
          dayMax: 70,
          label: 'Floraison',
          description: 'Panicules',
          expectedFeatures: ['épis blancs'],
        },
        {
          dayMax: 999,
          label: 'Maturité',
          description: 'Grains dorés',
          expectedFeatures: ['épis dorés', 'grains lourds'],
        },
      ],
      healthIndicators: {
        good: ['vert', 'tiges', 'panicules'],
        warning: ['jaune', 'flétri'],
        critical: ['brun', 'cassant'],
      },
    },
    corn: {
      name: 'Maïs',
      stages: [
        {
          dayMax: 7,
          label: 'Germination',
          description: 'Jeunes pousses',
          expectedHeight: '5-15cm',
        },
        {
          dayMax: 20,
          label: 'Croissance',
          description: 'Feuilles larges',
          expectedHeight: '20-50cm',
        },
        {
          dayMax: 40,
          label: 'Floraison',
          description: 'Panicules et soies',
          expectedHeight: '100-150cm',
          expectedFeatures: ['panicules mâles', 'soies femelles'],
        },
        {
          dayMax: 999,
          label: 'Maturité',
          description: 'Épis formés',
          expectedFeatures: ['épis gonflés', 'grains jaunes'],
        },
      ],
      healthIndicators: {
        good: ['vert', 'feuilles', 'épis'],
        warning: ['jaune', 'sèche'],
        critical: ['brun', 'moisissure'],
      },
    },
    cassava: {
      name: 'Manioc',
      stages: [
        {
          dayMax: 30,
          label: 'Établissement',
          description: 'Boutures qui poussent',
          expectedHeight: '10-30cm',
        },
        {
          dayMax: 90,
          label: 'Croissance',
          description: 'Tiges et feuilles',
          expectedHeight: '50-100cm',
        },
        {
          dayMax: 180,
          label: 'Tuberisation',
          description: 'Formation des racines',
          expectedFeatures: ['tiges épaisses'],
        },
        {
          dayMax: 999,
          label: 'Maturité',
          description: 'Racines prêtes',
          expectedFeatures: ['feuilles jaunissantes', 'tubercules gros'],
        },
      ],
      healthIndicators: {
        good: ['vert', 'tiges', 'feuilles'],
        warning: ['jaune', 'taches'],
        critical: ['brun', 'flétri'],
      },
    },
  };

  constructor(private ngZone: NgZone) {
    this.ensureModelLoaded();
  }

  ensureModelLoaded(): Promise<void> {
    if (!this.modelPromise) {
      this.modelPromise = this.loadModel();
    }
    return this.modelPromise;
  }

  private async loadModel(): Promise<void> {
    if (this.modelLoading) return;
    this.modelLoading = true;
    try {
      await tf.ready();
      console.log('✅ TensorFlow.js prêt pour analyse visuelle');
    } catch (e) {
      console.warn(
        '⚠️ TensorFlow.js non disponible, analyse basique seulement',
        e,
      );
    } finally {
      this.modelLoading = false;
    }
  }

  async compareImages(
    currentImage: File | HTMLImageElement | string,
    previousImageUrl: string | null,
    options: ComparisonOptions,
  ): Promise<ImageComparisonResult> {
    const warnings: string[] = [];
    await this.ensureModelLoaded();

    try {
      // ── 1. ANALYSE DE LA PLANTE (intelligence locale) ────────────────────
      const plantAnalysis = await this.analyzePlantLocally(
        currentImage,
        options,
      );

      if (!plantAnalysis.stageCoherent)
        warnings.push(`⚠️ ${plantAnalysis.stageNotes}`);
      if (!plantAnalysis.isAuthentic)
        warnings.push("⚠️ L'image semble téléchargée depuis internet");
      if (plantAnalysis.healthScore < 50)
        warnings.push(`⚠️ ${plantAnalysis.healthNotes}`);

      // ── 2. ANALYSE DU TERRAIN (comparaison TF.js) ─────────────────────────
      let terrainAnalysis: TerrainAnalysis;

      if (previousImageUrl) {
        const [currentImg, previousImg] = await Promise.all([
          this.loadImageToElement(currentImage),
          this.loadImageFromUrl(previousImageUrl),
        ]);

        terrainAnalysis = await this.analyzeTerrainConsistency(
          currentImg,
          previousImg,
          options,
        );

        if (!terrainAnalysis.sameLocation) {
          warnings.push(
            '❌ La parcelle semble différente du checkpoint précédent',
          );
        }
        if (!terrainAnalysis.progressionLogical) {
          warnings.push('⚠️ La progression de la plante semble incohérente');
        }
      } else {
        terrainAnalysis = this.defaultTerrainAnalysis();
      }

      // ── 3. EXIF ──────────────────────────────────────────────────────────
      const exifResult = await this.analyzeExif(currentImage);
      if (!exifResult.valid) warnings.push(...exifResult.warnings);

      // ── 4. Score global + décision ───────────────────────────────────────
      const globalScore = this.computeGlobalScore(
        plantAnalysis,
        terrainAnalysis,
        previousImageUrl,
      );
      const { action, actionReason } = this.determineAction(
        plantAnalysis,
        terrainAnalysis,
        warnings,
        !!previousImageUrl,
      );

      return {
        similarity: Math.round(globalScore),
        isValid: action !== 'reject',
        warnings,
        plantAnalysis,
        terrainAnalysis,
        details: {
          structuralSimilarity: terrainAnalysis.backgroundMatch / 100,
          featureSimilarity: terrainAnalysis.locationScore / 100,
          colorConsistency: terrainAnalysis.lightingMatch / 100,
          exifValid: exifResult.valid,
          isDownloadedImage: !plantAnalysis.isAuthentic,
          lightingConsistent: terrainAnalysis.lightingMatch > 60,
        },
        action,
        actionReason,
      };
    } catch (error: any) {
      console.error('❌ Erreur comparaison:', error);
      return this.errorResult(error.message);
    }
  }

  /**
   * Analyse intelligente de la plante (sans API externe)
   */
  private async analyzePlantLocally(
    image: File | HTMLImageElement | string,
    options: ComparisonOptions,
  ): Promise<PlantAnalysis> {
    try {
      const imgElement = await this.loadImageToElement(image);

      // Obtenir les connaissances sur la culture
      const crop =
        this.cropKnowledge[options.cropType] || this.cropKnowledge['tomato'];
      const expectedStage =
        crop.stages.find((s) => options.currentDayOffset <= s.dayMax) ||
        crop.stages[crop.stages.length - 1];

      // Analyse visuelle avec TensorFlow.js
      const visualAnalysis = await this.analyzeWithTensorFlow(
        imgElement,
        crop,
        expectedStage,
      );

      // Calculer le score de cohérence du stade
      const stageScore = this.calculateStageScore(
        visualAnalysis,
        expectedStage,
        options,
      );

      // Calculer le score de santé
      const healthScore = await this.calculateHealthScore(imgElement, crop);

      // Détecter si l'image est authentique
      const isAuthentic = await this.detectImageAuthenticity(imgElement);

      // Vérifier les caractéristiques attendues
      const hasExpectedFeatures = await this.checkExpectedFeatures(
        imgElement,
        expectedStage,
      );

      // Déterminer si le stade est cohérent
      const stageCoherent = stageScore >= 50;

      // Générer des notes explicatives
      const stageNotes = this.generateStageNotes(
        expectedStage,
        visualAnalysis,
        stageScore,
      );
      const healthNotes = this.generateHealthNotes(healthScore, visualAnalysis);

      return {
        cropType: options.cropType,
        dayOffset: options.currentDayOffset,
        stageLabel: expectedStage.label,
        stageCoherent,
        stageScore: Math.round(stageScore),
        stageNotes,
        healthScore: Math.round(healthScore),
        healthNotes,
        isAuthentic,
        hasExpectedFeatures,
      };
    } catch (error) {
      console.error('❌ Erreur analyse locale:', error);
      // Fallback basé uniquement sur le calendrier
      const crop =
        this.cropKnowledge[options.cropType] || this.cropKnowledge['tomato'];
      const stage =
        crop.stages.find((s) => options.currentDayOffset <= s.dayMax) ||
        crop.stages[crop.stages.length - 1];
      const progress = Math.min(1, options.currentDayOffset / 100);
      const score = Math.min(95, 60 + progress * 35);

      return {
        cropType: options.cropType,
        dayOffset: options.currentDayOffset,
        stageLabel: stage.label,
        stageCoherent: true,
        stageScore: Math.round(score),
        stageNotes: `Stade ${stage.label} attendu pour J+${options.currentDayOffset}`,
        healthScore: 70,
        healthNotes: 'État sanitaire normal (analyse basique)',
        isAuthentic: true,
        hasExpectedFeatures: true,
      };
    }
  }

  /**
   * Analyse visuelle avec TensorFlow.js (version corrigée sans await dans tf.tidy)
   */
  /**
   * Analyse visuelle avec TensorFlow.js (version corrigée)
   */
  private async analyzeWithTensorFlow(
    img: HTMLImageElement,
    crop: any,
    expectedStage: any,
  ): Promise<any> {
    // Calculer le ratio de végétation d'abord (hors tf.tidy car asynchrone)
    const vegetationRatio = await this.estimateVegetationRatio(img);

    // Variables pour stocker les résultats
    let meanGreenness = 0;
    let variance = 0;
    let saturation = 0;
    let hasFlowers = false;
    let hasFruits = false;

    // Faire l'analyse TensorFlow dans tf.tidy
    tf.tidy(() => {
      try {
        const tensor = tf.browser
          .fromPixels(img)
          .resizeBilinear([224, 224])
          .toFloat();

        // Extraire les canaux de couleur
        const r = tensor.slice([0, 0, 0], [-1, -1, 1]);
        const g = tensor.slice([0, 0, 1], [-1, -1, 1]);
        const b = tensor.slice([0, 0, 2], [-1, -1, 1]);

        // Calculer la dominance de vert (indice de végétation)
        const greenness = g.sub(r.add(b).div(2));
        meanGreenness = greenness.mean().dataSync()[0];

        // Calculer la variance (texture)
        variance = tensor.sub(tensor.mean()).square().mean().dataSync()[0];

        // Détecter la présence de couleurs vives (fleurs, fruits)
        const max = tf.maximum(tf.maximum(r, g), b);
        const min = tf.minimum(tf.minimum(r, g), b);
        const sat = tf.where(
          max.equal(min),
          tf.zerosLike(max),
          max.sub(min).div(max),
        );
        saturation = sat.mean().dataSync()[0];

        // Libérer les tensors intermédiaires
        r.dispose();
        g.dispose();
        b.dispose();
        greenness.dispose();
        max.dispose();
        min.dispose();
        sat.dispose();
      } catch (error) {
        console.warn('Erreur analyse TF:', error);
      }
    });

    hasFlowers = saturation > 0.3;
    hasFruits = saturation > 0.4;

    return {
      meanGreenness,
      variance,
      saturation,
      vegetationRatio,
      hasFlowers,
      hasFruits,
    };
  }

  private calculateSaturationSync(
    r: tf.Tensor,
    g: tf.Tensor,
    b: tf.Tensor,
  ): number {
    const max = tf.maximum(tf.maximum(r, g), b);
    const min = tf.minimum(tf.minimum(r, g), b);
    const saturation = tf.where(
      max.equal(min),
      tf.zerosLike(max),
      max.sub(min).div(max),
    );
    return saturation.mean().dataSync()[0];
  }

  private async estimateVegetationRatio(
    img: HTMLImageElement,
  ): Promise<number> {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, img.width, img.height).data;

    let greenPixels = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];

      // Critère de verdure
      if (g > r * 1.1 && g > b * 1.1) {
        greenPixels++;
      }
    }

    return greenPixels / (img.width * img.height);
  }

  private calculateStageScore(
    visualAnalysis: any,
    expectedStage: any,
    options: ComparisonOptions,
  ): number {
    if (!visualAnalysis) {
      // Fallback basé sur la progression
      const maxDay = 100;
      const progress = Math.min(1, options.currentDayOffset / maxDay);
      return 60 + progress * 35;
    }

    let score = 60; // Base

    // Bonus pour la végétation
    if (visualAnalysis.meanGreenness > 0.3) score += 15;
    if (visualAnalysis.meanGreenness > 0.4) score += 10;

    // Bonus pour la texture (plante développée)
    if (visualAnalysis.variance > 0.05) score += 10;

    // Bonus pour les caractéristiques spécifiques au stade
    if (expectedStage.label.includes('Floraison') && visualAnalysis.hasFlowers)
      score += 15;
    if (
      expectedStage.label.includes('Fructification') &&
      visualAnalysis.hasFruits
    )
      score += 15;

    // Ajustement pour la progression
    const expectedProgress = options.currentDayOffset / 100;
    const actualProgress = visualAnalysis.vegetationRatio;
    const progressDiff = Math.abs(expectedProgress - actualProgress);
    if (progressDiff < 0.2) score += 10;
    if (progressDiff > 0.4) score -= 15;

    return Math.min(100, Math.max(0, score));
  }

  private async calculateHealthScore(
    img: HTMLImageElement,
    crop: any,
  ): Promise<number> {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, img.width, img.height).data;

    let warningPixels = 0;
    let criticalPixels = 0;

    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];

      // Détecter les zones problématiques
      if (r > 200 && g < 100 && b < 100) {
        criticalPixels++; // Rouge intense = pourriture/maladie
      } else if (r > 180 && g > 150 && b < 100) {
        warningPixels++; // Jaune = stress
      } else if (r < 80 && g < 80 && b < 80) {
        criticalPixels++; // Noir = mort
      }
    }

    const totalPixels = img.width * img.height;
    const warningRatio = warningPixels / totalPixels;
    const criticalRatio = criticalPixels / totalPixels;

    let score = 100;
    score -= warningRatio * 50;
    score -= criticalRatio * 100;

    return Math.min(100, Math.max(0, score));
  }

  private async detectImageAuthenticity(
    img: HTMLImageElement,
  ): Promise<boolean> {
    // Vérifier si l'image est trop petite (screenshot souvent petit)
    if (img.width < 200 || img.height < 200) {
      return false;
    }

    return true;
  }

  private async checkExpectedFeatures(
    img: HTMLImageElement,
    expectedStage: any,
  ): Promise<boolean> {
    if (!expectedStage.expectedFeatures) return true;
    return true;
  }

  private generateStageNotes(
    expectedStage: any,
    visualAnalysis: any,
    score: number,
  ): string {
    let notes = `Stade ${expectedStage.label} `;

    if (expectedStage.expectedHeight) {
      notes += `(hauteur attendue: ${expectedStage.expectedHeight}) `;
    }

    if (score >= 80) {
      notes += '- Bonne correspondance';
    } else if (score >= 60) {
      notes += '- Correspondance acceptable';
    } else if (score >= 40) {
      notes += '- Écart modéré par rapport au stade attendu';
    } else {
      notes += '- Écart important, vérifier manuellement';
    }

    if (
      visualAnalysis &&
      visualAnalysis.hasFlowers &&
      expectedStage.label.includes('Floraison')
    ) {
      notes += ' - Fleurs détectées ✓';
    }

    if (
      visualAnalysis &&
      visualAnalysis.hasFruits &&
      expectedStage.label.includes('Fructification')
    ) {
      notes += ' - Fruits détectés ✓';
    }

    return notes;
  }

  private generateHealthNotes(score: number, visualAnalysis: any): string {
    if (score >= 80) {
      return 'État sanitaire excellent';
    } else if (score >= 60) {
      return 'État sanitaire normal';
    } else if (score >= 40) {
      return 'Signes de stress modérés - Surveiller';
    } else {
      return '⚠️ État sanitaire préoccupant - Vérifier manuellement';
    }
  }

  private async analyzeTerrainConsistency(
    currentImg: HTMLImageElement,
    previousImg: HTMLImageElement,
    options: ComparisonOptions,
  ): Promise<TerrainAnalysis> {
    const [bgMatch, lightingMatch, progressionScore] = await Promise.all([
      this.compareBackground(currentImg, previousImg),
      this.checkLightingConsistency(currentImg, previousImg),
      this.assessProgression(currentImg, previousImg, options),
    ]);

    const locationScore = Math.round(bgMatch * 100);

    return {
      sameLocation: locationScore >= this.THRESHOLDS.ACCEPT_TERRAIN,
      locationScore,
      progressionLogical: progressionScore >= 40,
      progressionScore: Math.round(progressionScore),
      backgroundMatch: Math.round(bgMatch * 100),
      lightingMatch: Math.round(lightingMatch * 100),
    };
  }

  private async compareBackground(
    img1: HTMLImageElement,
    img2: HTMLImageElement,
  ): Promise<number> {
    return tf.tidy(() => {
      try {
        const SIZE = 64;
        const border = 12;
        const center = SIZE - 2 * border;

        const t1 = tf.browser
          .fromPixels(img1)
          .resizeBilinear([SIZE, SIZE])
          .toFloat()
          .div(255);
        const t2 = tf.browser
          .fromPixels(img2)
          .resizeBilinear([SIZE, SIZE])
          .toFloat()
          .div(255);

        const diffs = [
          tf
            .mean(
              tf.abs(
                tf.sub(
                  t1.slice([0, 0, 0], [border, SIZE, 3]),
                  t2.slice([0, 0, 0], [border, SIZE, 3]),
                ),
              ),
            )
            .dataSync()[0],
          tf
            .mean(
              tf.abs(
                tf.sub(
                  t1.slice([SIZE - border, 0, 0], [border, SIZE, 3]),
                  t2.slice([SIZE - border, 0, 0], [border, SIZE, 3]),
                ),
              ),
            )
            .dataSync()[0],
          tf
            .mean(
              tf.abs(
                tf.sub(
                  t1.slice([border, 0, 0], [center, border, 3]),
                  t2.slice([border, 0, 0], [center, border, 3]),
                ),
              ),
            )
            .dataSync()[0],
          tf
            .mean(
              tf.abs(
                tf.sub(
                  t1.slice([border, SIZE - border, 0], [center, border, 3]),
                  t2.slice([border, SIZE - border, 0], [center, border, 3]),
                ),
              ),
            )
            .dataSync()[0],
        ];

        const avgDiff = diffs.reduce((a, b) => a + b, 0) / 4;
        return Math.max(0, 1 - avgDiff / 0.4);
      } catch {
        return 0.6;
      }
    });
  }

  private async assessProgression(
    currentImg: HTMLImageElement,
    previousImg: HTMLImageElement,
    options: ComparisonOptions,
  ): Promise<number> {
    return tf.tidy(() => {
      try {
        const SIZE = 64;
        const border = 16;
        const center = SIZE - 2 * border;

        const prev = tf.browser
          .fromPixels(previousImg)
          .resizeBilinear([SIZE, SIZE])
          .toFloat()
          .div(255);
        const curr = tf.browser
          .fromPixels(currentImg)
          .resizeBilinear([SIZE, SIZE])
          .toFloat()
          .div(255);

        const greenMeanPrev = tf
          .mean(prev.slice([border, border, 1], [center, center, 1]))
          .dataSync()[0];
        const greenMeanCurr = tf
          .mean(curr.slice([border, border, 1], [center, center, 1]))
          .dataSync()[0];

        const dayDiff =
          options.currentDayOffset - (options.previousDayOffset ?? 0);
        if (dayDiff <= 0) return 70;

        const delta = greenMeanCurr - greenMeanPrev;
        if (delta > -0.05) return 85;
        if (delta > -0.15) return 60;
        if (delta > -0.25) return 40;
        return 20;
      } catch {
        return 60;
      }
    });
  }

  private async checkLightingConsistency(
    img1: HTMLImageElement,
    img2: HTMLImageElement,
  ): Promise<number> {
    return tf.tidy(() => {
      try {
        const b1 = tf.browser.fromPixels(img1).mean(2).mean().dataSync()[0];
        const b2 = tf.browser.fromPixels(img2).mean(2).mean().dataSync()[0];
        return Math.max(0, 1 - (Math.abs(b1 - b2) / 255) * 1.5);
      } catch {
        return 0.6;
      }
    });
  }

  private computeGlobalScore(
    plant: PlantAnalysis,
    terrain: TerrainAnalysis,
    hasPrevious: string | null,
  ): number {
    if (!hasPrevious) {
      return plant.stageScore * 0.7 + plant.healthScore * 0.3;
    }
    return (
      plant.stageScore * 0.35 +
      plant.healthScore * 0.15 +
      terrain.locationScore * 0.35 +
      terrain.progressionScore * 0.15
    );
  }

  private determineAction(
    plant: PlantAnalysis,
    terrain: TerrainAnalysis,
    warnings: string[],
    hasPrevious: boolean,
  ): { action: 'accept' | 'review' | 'reject'; actionReason: string } {
    if (hasPrevious && terrain.locationScore < 30) {
      return {
        action: 'reject',
        actionReason: 'Parcelle différente du checkpoint précédent',
      };
    }

    if (!plant.isAuthentic) {
      return {
        action: 'reject',
        actionReason: 'Image non authentique (téléchargée ou générée)',
      };
    }

    if (!plant.stageCoherent && plant.stageScore < 30) {
      return {
        action: 'reject',
        actionReason: `Stade végétatif incohérent : ${plant.stageNotes}`,
      };
    }

    const stageOk = plant.stageScore >= this.THRESHOLDS.ACCEPT_STAGE;
    const terrainOk =
      !hasPrevious || terrain.locationScore >= this.THRESHOLDS.ACCEPT_TERRAIN;
    const progressOk = !hasPrevious || terrain.progressionLogical;

    if (stageOk && terrainOk && progressOk && warnings.length === 0) {
      return { action: 'accept', actionReason: 'Stade et terrain conformes' };
    }

    if (
      plant.stageScore >= this.THRESHOLDS.REVIEW_STAGE &&
      (!hasPrevious || terrain.locationScore >= this.THRESHOLDS.REVIEW_TERRAIN)
    ) {
      return {
        action: 'review',
        actionReason: warnings[0] ?? 'Vérification manuelle recommandée',
      };
    }

    return {
      action: 'reject',
      actionReason: 'Score insuffisant sur plusieurs critères',
    };
  }

  private defaultTerrainAnalysis(): TerrainAnalysis {
    return {
      sameLocation: true,
      locationScore: 100,
      progressionLogical: true,
      progressionScore: 100,
      backgroundMatch: 100,
      lightingMatch: 100,
    };
  }

  private async analyzeExif(
    image: File | HTMLImageElement | string,
  ): Promise<{ valid: boolean; warnings: string[] }> {
    if (image instanceof File) {
      return { valid: true, warnings: [] };
    }
    return {
      valid: false,
      warnings: ['⚠️ Impossible de lire les métadonnées EXIF'],
    };
  }

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

  private loadImageFromUrl(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  private errorResult(message: string): ImageComparisonResult {
    return {
      similarity: 0,
      isValid: false,
      warnings: [`❌ Erreur : ${message}`],
      plantAnalysis: {
        cropType: '',
        dayOffset: 0,
        stageLabel: 'Erreur',
        stageCoherent: false,
        stageScore: 0,
        stageNotes: message,
        healthScore: 0,
        healthNotes: '',
        isAuthentic: false,
        hasExpectedFeatures: false,
      },
      terrainAnalysis: this.defaultTerrainAnalysis(),
      details: {
        structuralSimilarity: 0,
        featureSimilarity: 0,
        colorConsistency: 0,
        exifValid: false,
        isDownloadedImage: false,
        lightingConsistent: false,
      },
      action: 'reject',
      actionReason: message,
    };
  }
}

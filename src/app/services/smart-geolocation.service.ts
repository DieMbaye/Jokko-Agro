// services/smart-geolocation.service.ts
import { Injectable, NgZone } from '@angular/core';

// ============== INTERFACES ==============

export interface PreciseLocation {
  lat: number;
  lng: number;
  reportedAccuracy: number;
  realAccuracy: number;
  confidence: number;
  timestamp: number;
  method:
    | 'gps'
    | 'reference-compare'
    | 'google-compare'
    | 'averaging'
    | 'network'
    | 'fallback';
  distanceFromReference?: number;
}

export interface LocationAnalysis {
  averageLat: number;
  averageLng: number;
  calculatedAccuracy: number;
  confidence: number;
  measurements: number;
  dispersion: number;
}

export interface ComparisonResult {
  distance: number;
  adjustedLat?: number;
  adjustedLng?: number;
  isConsistent: boolean;
  warning?: string;
}

// Interfaces pour compatibilité avec l'ancien service
export interface LocationData {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

export interface LocationResult {
  location: LocationData;
  status: 'excellent' | 'good' | 'acceptable' | 'poor' | 'timeout';
  message: string;
  attempts?: number;
}

export interface LocationConsistencyResult {
  consistent: boolean;
  score: number;
  warning?: string;
  distance: number;
}

export interface LocationThresholds {
  EXCELLENT: number;
  GOOD: number;
  ACCEPTABLE: number;
  MINIMUM: number;
  REJECT: number;
}

@Injectable({
  providedIn: 'root',
})
export class SmartGeolocationService {
  // ============== CONSTANTES ==============

  // Point de référence Google Maps (fallback)
  private readonly GOOGLE_REFERENCE = {
    lat: 14.744276760109274,
    lng: -17.136237725691014,
  };

  // Configuration des seuils
  private readonly CONFIG = {
    MAX_DISTANCE_FROM_REFERENCE: 100,
    EXCELLENT_ACCURACY: 5,
    GOOD_ACCURACY: 15,
    ACCEPTABLE_ACCURACY: 30,
    MIN_MEASUREMENTS_FOR_HIGH_CONFIDENCE: 5,
    ACQUISITION_TIMEOUT: 25000,
    HIGH_ACCURACY_TIMEOUT: 10000,
    MAX_MEASUREMENTS: 10,
    DISTANCE_CORRECTION_THRESHOLD: 10,
  };

  // Seuils pour compatibilité
  public readonly THRESHOLDS: LocationThresholds = {
    EXCELLENT: this.CONFIG.EXCELLENT_ACCURACY,
    GOOD: this.CONFIG.GOOD_ACCURACY,
    ACCEPTABLE: this.CONFIG.ACCEPTABLE_ACCURACY,
    MINIMUM: 50,
    REJECT: this.CONFIG.MAX_DISTANCE_FROM_REFERENCE,
  };

  constructor(private ngZone: NgZone) {}

  // ============== MÉTHODES PRINCIPALES ==============

  /**
   * Méthode principale avec correction et point de référence
   */
  // Dans smart-geolocation.service.ts

  // MODIFIER la méthode acquireWithCorrection
  async acquireWithCorrection(referencePoint?: {
    lat: number;
    lng: number;
  }): Promise<PreciseLocation> {
    try {
      console.log(
        '🧠 Acquisition avec correction...',
        referencePoint ? '(avec référence)' : '(sans référence)',
      );

      const location = await this.getSmartLocation();

      // ✅ Si on a un point de référence (checkpoint précédent), on compare
      if (referencePoint) {
        const comparison = await this.compareWithReference(
          location.lat,
          location.lng,
          referencePoint,
        );

        location.distanceFromReference = comparison.distance;

        if (!comparison.isConsistent) {
          console.warn(
            `⚠️ Incohérence: ${comparison.distance.toFixed(1)}m du point de référence`,
          );
          location.confidence = Math.max(0, 100 - comparison.distance / 5);

          if (comparison.distance > this.CONFIG.MAX_DISTANCE_FROM_REFERENCE) {
            location.confidence = 0;
            location.method = 'fallback';
          }
        }

        if (
          comparison.adjustedLat &&
          comparison.distance <= this.CONFIG.DISTANCE_CORRECTION_THRESHOLD
        ) {
          location.lat = comparison.adjustedLat;
          location.lng = comparison.adjustedLng || location.lng;
          location.realAccuracy = comparison.distance;
          location.method = 'reference-compare';
          location.confidence = 100;
        }
      }
      // ✅ Si PAS de point de référence (premier checkpoint), on utilise la position brute
      else {
        // Pas de comparaison, on garde la position telle quelle
        console.log(
          '📍 Premier checkpoint - pas de référence, utilisation position brute',
        );
        location.method = 'gps';
        // On garde la confiance calculée par l'analyse
      }

      return location;
    } catch (error) {
      console.error('❌ Erreur acquisition:', error);
      throw error;
    }
  }

  /**
   * Version rapide pour le préchauffage
   */
  async quickAcquire(): Promise<PreciseLocation> {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location: PreciseLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            reportedAccuracy: position.coords.accuracy,
            realAccuracy: position.coords.accuracy * 0.8,
            confidence: position.coords.accuracy <= 30 ? 80 : 50,
            timestamp: Date.now(),
            method: 'gps',
          };
          this.ngZone.run(() => resolve(location));
        },
        (error) => reject(this.formatError(error)),
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 10000,
        },
      );
    });
  }

  /**
   * MÉTHODE DE COMPATIBILITÉ - Ancien service
   */
  async acquireLocation(options?: {
    requiredAccuracy?: number;
    maxWaitTime?: number;
    showUserPrompt?: boolean;
  }): Promise<LocationResult> {
    try {
      const location = await this.acquireWithCorrection();
      const status = this.getStatusFromAccuracy(location.realAccuracy);

      return {
        location: {
          lat: location.lat,
          lng: location.lng,
          accuracy: location.realAccuracy,
          timestamp: location.timestamp,
        },
        status,
        message: this.getUserMessageFromStatus(status),
        attempts: 1,
      };
    } catch (error) {
      throw this.formatErrorLegacy(error);
    }
  }

  // ============== ANALYSE ET TRAITEMENT ==============

  /**
   * Obtenir une position avec analyse multiple
   */
  private async getSmartLocation(): Promise<PreciseLocation> {
    const measurements: GeolocationPosition[] = [];

    return new Promise((resolve, reject) => {
      let watchId: number;
      let timeoutId: any;
      let highAccuracyTimeoutId: any;

      watchId = navigator.geolocation.watchPosition(
        (position) => {
          measurements.push(position);
          if (measurements.length > this.CONFIG.MAX_MEASUREMENTS) {
            measurements.shift();
          }

          const analysis = this.analyzeMeasurements(measurements);

          if (
            analysis.confidence > 80 &&
            analysis.calculatedAccuracy <= this.CONFIG.ACCEPTABLE_ACCURACY
          ) {
            this.cleanup(watchId, timeoutId, highAccuracyTimeoutId);

            const location: PreciseLocation = {
              lat: analysis.averageLat,
              lng: analysis.averageLng,
              reportedAccuracy: position.coords.accuracy,
              realAccuracy: analysis.calculatedAccuracy,
              confidence: analysis.confidence,
              timestamp: Date.now(),
              method: 'averaging',
            };

            console.log(
              `✅ Position stable: ${analysis.calculatedAccuracy.toFixed(1)}m (${analysis.measurements} mesures)`,
            );
            this.ngZone.run(() => resolve(location));
          }
        },
        (error) => {
          this.cleanup(watchId, timeoutId, highAccuracyTimeoutId);
          reject(this.formatError(error));
        },
        {
          enableHighAccuracy: true,
          timeout: this.CONFIG.HIGH_ACCURACY_TIMEOUT,
          maximumAge: 0,
        },
      );

      highAccuracyTimeoutId = setTimeout(() => {
        if (measurements.length > 0) {
          const analysis = this.analyzeMeasurements(measurements);

          if (analysis.calculatedAccuracy <= this.CONFIG.ACCEPTABLE_ACCURACY) {
            this.cleanup(watchId, timeoutId, highAccuracyTimeoutId);

            const location: PreciseLocation = {
              lat: analysis.averageLat,
              lng: analysis.averageLng,
              reportedAccuracy:
                measurements[measurements.length - 1].coords.accuracy,
              realAccuracy: analysis.calculatedAccuracy,
              confidence: analysis.confidence,
              timestamp: Date.now(),
              method: 'averaging',
            };

            console.log(
              `⏱️ Haute précision: ${analysis.calculatedAccuracy.toFixed(1)}m`,
            );
            this.ngZone.run(() => resolve(location));
          }
        }
      }, this.CONFIG.HIGH_ACCURACY_TIMEOUT);

      timeoutId = setTimeout(() => {
        this.cleanup(watchId, timeoutId, highAccuracyTimeoutId);

        if (measurements.length > 0) {
          const analysis = this.analyzeMeasurements(measurements);
          const fallbackLocation: PreciseLocation = {
            lat: analysis.averageLat,
            lng: analysis.averageLng,
            reportedAccuracy:
              measurements[measurements.length - 1].coords.accuracy,
            realAccuracy: analysis.calculatedAccuracy,
            confidence: analysis.confidence,
            timestamp: Date.now(),
            method: 'averaging',
          };

          console.log(
            `⚠️ Timeout - Position approximative: ${analysis.calculatedAccuracy.toFixed(1)}m`,
          );
          this.ngZone.run(() => resolve(fallbackLocation));
        } else {
          reject(new Error('Aucune mesure obtenue'));
        }
      }, this.CONFIG.ACQUISITION_TIMEOUT);
    });
  }

  /**
   * Analyser les mesures
   */
  private analyzeMeasurements(
    measurements: GeolocationPosition[],
  ): LocationAnalysis {
    if (measurements.length === 0) {
      return {
        averageLat: 0,
        averageLng: 0,
        calculatedAccuracy: 999,
        confidence: 0,
        measurements: 0,
        dispersion: 999,
      };
    }

    const avgLat =
      measurements.reduce((sum, m) => sum + m.coords.latitude, 0) /
      measurements.length;
    const avgLng =
      measurements.reduce((sum, m) => sum + m.coords.longitude, 0) /
      measurements.length;

    const latMetersPerDegree = 111320;
    const lngMetersPerDegree = 111320 * Math.cos((avgLat * Math.PI) / 180);

    const latDiffs = measurements.map((m) =>
      Math.abs(m.coords.latitude - avgLat),
    );
    const lngDiffs = measurements.map((m) =>
      Math.abs(m.coords.longitude - avgLng),
    );

    const maxLatDiff = Math.max(...latDiffs) * latMetersPerDegree;
    const maxLngDiff = Math.max(...lngDiffs) * lngMetersPerDegree;

    const dispersion = Math.max(maxLatDiff, maxLngDiff);
    const bestReportedAccuracy = Math.min(
      ...measurements.map((m) => m.coords.accuracy),
    );
    const calculatedAccuracy = Math.min(dispersion, bestReportedAccuracy * 0.7);

    let confidence = 100;
    if (measurements.length < 3) confidence -= 30;
    if (measurements.length < 5) confidence -= 20;
    if (dispersion > 20) confidence -= 20;
    if (dispersion > 50) confidence -= 30;
    if (bestReportedAccuracy > 30) confidence -= 20;
    if (bestReportedAccuracy > 50) confidence -= 30;
    confidence = Math.max(0, Math.min(100, confidence));

    return {
      averageLat: avgLat,
      averageLng: avgLng,
      calculatedAccuracy,
      confidence,
      measurements: measurements.length,
      dispersion,
    };
  }

  // ============== COMPARAISON ET VALIDATION ==============

  /**
   * Comparer avec un point de référence
   */
  async compareWithReference(
    currentLat: number,
    currentLng: number,
    referencePoint?: { lat: number; lng: number }, // Maintenir le ? mais traiter correctement
  ): Promise<ComparisonResult> {
    // ✅ Si on a un point de référence, on compare avec lui
    if (referencePoint) {
      const distance = this.calculateDistance(
        currentLat,
        currentLng,
        referencePoint.lat,
        referencePoint.lng,
      );

      let warning: string | undefined;
      let isConsistent = distance <= this.CONFIG.MAX_DISTANCE_FROM_REFERENCE;

      if (!isConsistent) {
        warning = `❌ Position trop éloignée (${distance.toFixed(1)}m) - Maximum: ${this.CONFIG.MAX_DISTANCE_FROM_REFERENCE}m`;
      } else if (distance > this.CONFIG.MAX_DISTANCE_FROM_REFERENCE * 0.7) {
        warning = `⚠️ Distance: ${distance.toFixed(1)}m (limite: ${this.CONFIG.MAX_DISTANCE_FROM_REFERENCE}m)`;
      }

      return {
        distance,
        isConsistent,
        warning,
        adjustedLat:
          distance <= this.CONFIG.DISTANCE_CORRECTION_THRESHOLD
            ? referencePoint.lat
            : undefined,
        adjustedLng:
          distance <= this.CONFIG.DISTANCE_CORRECTION_THRESHOLD
            ? referencePoint.lng
            : undefined,
      };
    }

    // ✅ Si PAS de point de référence, retourner un résultat sans comparaison
    return {
      distance: 0,
      isConsistent: true, // Toujours cohérent car pas de référence
      adjustedLat: undefined,
      adjustedLng: undefined,
    };
  }

  /**
   * Vérifier la cohérence entre deux points
   */
  checkConsistency(
    current: LocationData,
    previous: LocationData | null,
    options?: { maxDistance?: number; maxAccuracy?: number },
  ): LocationConsistencyResult {
    const maxDistance = options?.maxDistance ?? 50;
    const maxAccuracy = options?.maxAccuracy ?? this.THRESHOLDS.ACCEPTABLE;

    if (!previous) {
      return { consistent: true, score: 100, distance: 0 };
    }

    if (current.accuracy > maxAccuracy) {
      return {
        consistent: false,
        score: 0,
        warning: `Précision insuffisante: ${Math.round(current.accuracy)}m`,
        distance: 0,
      };
    }

    const distance = this.calculateDistance(
      current.lat,
      current.lng,
      previous.lat,
      previous.lng,
    );

    const tolerance = Math.max(
      maxDistance,
      (current.accuracy + previous.accuracy) * 0.5,
    );

    if (distance > tolerance) {
      return {
        consistent: false,
        score: Math.max(0, 100 - (distance / tolerance) * 50),
        warning: `Distance trop grande: ${Math.round(distance)}m (max ${Math.round(tolerance)}m)`,
        distance: Math.round(distance),
      };
    }

    const score = Math.max(80, 100 - (distance / tolerance) * 20);

    return {
      consistent: true,
      score: Math.round(score),
      distance: Math.round(distance),
    };
  }

  /**
   * Vérifier la cohérence (version simplifiée)
   */
  isLocationConsistent(
    currentLocation: { lat: number; lng: number },
    referenceLocation: { lat: number; lng: number },
    maxDistance: number = this.CONFIG.MAX_DISTANCE_FROM_REFERENCE,
  ): { consistent: boolean; distance: number; message: string } {
    const distance = this.calculateDistance(
      currentLocation.lat,
      currentLocation.lng,
      referenceLocation.lat,
      referenceLocation.lng,
    );

    const consistent = distance <= maxDistance;

    return {
      consistent,
      distance,
      message: consistent
        ? `✓ Position cohérente (${distance.toFixed(1)}m)`
        : `❌ Trop loin (${distance.toFixed(1)}m > ${maxDistance}m)`,
    };
  }

  // ============== UTILITAIRES ==============

  /**
   * Calculer la distance Haversine
   */
  calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Obtenir le niveau de qualité
   */
  getAccuracyLevel(accuracy: number): {
    level: 'excellent' | 'good' | 'acceptable' | 'poor' | 'bad';
    color: string;
    icon: string;
    message: string;
  } {
    if (accuracy <= this.CONFIG.EXCELLENT_ACCURACY) {
      return {
        level: 'excellent',
        color: '#10b981',
        icon: '🎯',
        message: 'Précision excellente',
      };
    }
    if (accuracy <= this.CONFIG.GOOD_ACCURACY) {
      return {
        level: 'good',
        color: '#3b82f6',
        icon: '✓',
        message: 'Bonne précision',
      };
    }
    if (accuracy <= this.CONFIG.ACCEPTABLE_ACCURACY) {
      return {
        level: 'acceptable',
        color: '#f59e0b',
        icon: '⚠️',
        message: 'Précision acceptable',
      };
    }
    if (accuracy <= 50) {
      return {
        level: 'poor',
        color: '#ef4444',
        icon: '⚡',
        message: 'Faible précision',
      };
    }
    return {
      level: 'bad',
      color: '#7f1d1d',
      icon: '❌',
      message: 'Très faible précision',
    };
  }

  /**
   * Obtenir les seuils
   */
  getThresholds(): LocationThresholds {
    return { ...this.THRESHOLDS };
  }

  /**
   * Formater une position
   */
  formatLocation(lat: number, lng: number, accuracy?: number): string {
    const latStr = lat.toFixed(6);
    const lngStr = lng.toFixed(6);
    return accuracy !== undefined
      ? `${latStr}, ${lngStr} (±${accuracy.toFixed(1)}m)`
      : `${latStr}, ${lngStr}`;
  }

  /**
   * Conseils pour améliorer la précision
   */
  getAccuracyTips(): string[] {
    return [
      '🌳 Placez-vous dans un espace dégagé, loin des bâtiments',
      '📱 Tenez le téléphone à la main, pas dans une poche',
      "⏳ Restez immobile pendant l'acquisition (5-10 secondes)",
      '📡 Activez le WiFi même sans connexion',
      "🔋 Désactivez le mode économie d'énergie",
      '🏢 Évitez les cours intérieures',
    ];
  }

  /**
   * Vérifier si supporté
   */
  isSupported(): boolean {
    return 'geolocation' in navigator;
  }

  /**
   * Demander la permission
   */
  async requestPermission(): Promise<boolean> {
    if (!this.isSupported()) return false;
    try {
      const result = await navigator.permissions.query({ name: 'geolocation' });
      return result.state === 'granted' || result.state === 'prompt';
    } catch {
      return true;
    }
  }

  // ============== MÉTHODES PRIVÉES ==============

  private getStatusFromAccuracy(accuracy: number): LocationResult['status'] {
    if (accuracy <= this.THRESHOLDS.EXCELLENT) return 'excellent';
    if (accuracy <= this.THRESHOLDS.GOOD) return 'good';
    if (accuracy <= this.THRESHOLDS.ACCEPTABLE) return 'acceptable';
    if (accuracy <= this.THRESHOLDS.MINIMUM) return 'poor';
    return 'timeout';
  }

  private getUserMessageFromStatus(status: LocationResult['status']): string {
    switch (status) {
      case 'excellent':
        return '✅ Signal GPS excellent';
      case 'good':
        return '✓ Bonne précision GPS';
      case 'acceptable':
        return '⚠️ Précision acceptable';
      case 'poor':
        return '❌ Précision faible, déplacez-vous';
      case 'timeout':
        return '⌛ Délai dépassé, réessayez';
    }
  }

  private formatError(error: GeolocationPositionError): Error {
    switch (error.code) {
      case error.PERMISSION_DENIED:
        return new Error('PERMISSION_DENIED');
      case error.POSITION_UNAVAILABLE:
        return new Error('POSITION_UNAVAILABLE');
      case error.TIMEOUT:
        return new Error('TIMEOUT');
      default:
        return new Error(`UNKNOWN_ERROR: ${error.message}`);
    }
  }

  private formatErrorLegacy(error: any): Error {
    if (error.message === 'PERMISSION_DENIED') {
      return new Error('📍 Permission refusée. Activez la localisation.');
    }
    if (error.message === 'POSITION_UNAVAILABLE') {
      return new Error('📡 Signal GPS indisponible.');
    }
    if (error.message === 'TIMEOUT') {
      return new Error(
        '⏳ Délai dépassé. Déplacez-vous dans une zone dégagée.',
      );
    }
    return new Error(`❌ Erreur GPS: ${error.message}`);
  }

  private cleanup(
    watchId: number,
    timeoutId: any,
    highAccuracyTimeoutId?: any,
  ): void {
    if (watchId) navigator.geolocation.clearWatch(watchId);
    if (timeoutId) clearTimeout(timeoutId);
    if (highAccuracyTimeoutId) clearTimeout(highAccuracyTimeoutId);
  }
}

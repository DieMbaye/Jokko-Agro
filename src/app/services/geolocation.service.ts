// services/geolocation.service.ts
import { Injectable, NgZone } from '@angular/core';

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
  providedIn: 'root'
})
export class GeolocationService {
  // Seuils métier (adaptés à l'agriculture)
  private readonly THRESHOLDS = {
    EXCELLENT: 5,    // 5m  - GPS parfait (extérieur, ciel dégagé)
    GOOD: 15,        // 15m - Très bon signal
    ACCEPTABLE: 30,  // 30m - Acceptable pour la certification
    MINIMUM: 50,     // 50m - Minimum requis (alerte)
    REJECT: 100      // >100m - Rejeté
  };

  private readonly MAX_WAIT_TIME = 20000; // 20 secondes max
  private readonly MIN_MEASUREMENTS = 3;   // Minimum 3 mesures
  private readonly CONVERGENCE_DELTA = 5;   // 5m de variation pour considérer stable

  constructor(private ngZone: NgZone) {}

  /**
   * MÉTHODE UNIQUE ET ROBUSTE
   * Attend que la précision soit bonne ou que le délai expire
   */
  async acquireLocation(options?: {
    requiredAccuracy?: number;
    maxWaitTime?: number;
    showUserPrompt?: boolean;
  }): Promise<LocationResult> {
    const requiredAccuracy = options?.requiredAccuracy ?? this.THRESHOLDS.ACCEPTABLE;
    const maxWaitTime = options?.maxWaitTime ?? this.MAX_WAIT_TIME;
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      let bestLocation: LocationData | null = null;
      let measurements: LocationData[] = [];
      let watchId: number;
      let timeoutId: any;

      // 1. Nettoyage final
      const cleanup = () => {
        if (watchId) navigator.geolocation.clearWatch(watchId);
        if (timeoutId) clearTimeout(timeoutId);
      };

      // 2. Timeout global
      timeoutId = setTimeout(() => {
        cleanup();

        if (bestLocation) {
          // On retourne la meilleure mesure avec statut timeout
          const status = this.getStatusFromAccuracy(bestLocation.accuracy);
          resolve({
            location: bestLocation,
            status: status === 'poor' ? 'timeout' : status,
            message: `Délai dépassé (${maxWaitTime/1000}s). Précision: ${Math.round(bestLocation.accuracy)}m`,
            attempts: measurements.length
          });
        } else {
          reject(new Error('Aucune position obtenue dans le délai imparti'));
        }
      }, maxWaitTime);

      // 3. Watch position avec convergence
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          this.ngZone.run(() => {
            const location: LocationData = {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              accuracy: position.coords.accuracy,
              timestamp: position.timestamp
            };

            // Stocker la meilleure position
            if (!bestLocation || location.accuracy < bestLocation.accuracy) {
              bestLocation = location;
            }

            measurements.push(location);
            if (measurements.length > 10) measurements.shift(); // Garder 10 dernières

            // --- CRITÈRES DE VALIDATION ---

            // 1. Précision excellente ou très bonne => validation immédiate
            if (location.accuracy <= this.THRESHOLDS.GOOD) {
              cleanup();
              resolve({
                location,
                status: location.accuracy <= this.THRESHOLDS.EXCELLENT ? 'excellent' : 'good',
                message: `Position précise (${Math.round(location.accuracy)}m)`,
                attempts: measurements.length
              });
              return;
            }

            // 2. Précision acceptable ET convergence atteinte
            if (location.accuracy <= this.THRESHOLDS.ACCEPTABLE && measurements.length >= this.MIN_MEASUREMENTS) {
              // Vérifier la convergence (variation faible)
              const accuracies = measurements.map(m => m.accuracy);
              const variation = Math.max(...accuracies) - Math.min(...accuracies);

              if (variation <= this.CONVERGENCE_DELTA) {
                cleanup();
                resolve({
                  location,
                  status: 'acceptable',
                  message: `Position acceptable (${Math.round(location.accuracy)}m)`,
                  attempts: measurements.length
                });
                return;
              }
            }

            // 3. Mise à jour UI en cours (pas de résolution)
          });
        },
        (error) => {
          cleanup();
          this.ngZone.run(() => {
            reject(this.formatError(error));
          });
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    });
  }

  /**
   * Convertir une précision en statut
   */
  private getStatusFromAccuracy(accuracy: number): LocationResult['status'] {
    if (accuracy <= this.THRESHOLDS.EXCELLENT) return 'excellent';
    if (accuracy <= this.THRESHOLDS.GOOD) return 'good';
    if (accuracy <= this.THRESHOLDS.ACCEPTABLE) return 'acceptable';
    if (accuracy <= this.THRESHOLDS.MINIMUM) return 'poor';
    return 'timeout';
  }

  /**
   * Formater les erreurs utilisateur
   */
  private formatError(error: GeolocationPositionError): Error {
    switch(error.code) {
      case error.PERMISSION_DENIED:
        return new Error('📍 Permission refusée. Activez la localisation dans les paramètres.');
      case error.POSITION_UNAVAILABLE:
        return new Error('📡 Signal GPS indisponible. Vérifiez votre connexion.');
      case error.TIMEOUT:
        return new Error('⏳ Délai dépassé. Déplacez-vous dans une zone dégagée.');
      default:
        return new Error(`❌ Erreur GPS: ${error.message}`);
    }
  }

  /**
   * Vérifier la cohérence entre deux points (avec tolérance adaptative)
   */
  checkConsistency(
    current: LocationData,
    previous: LocationData | null,
    options?: { maxDistance?: number; maxAccuracy?: number }
  ): LocationConsistencyResult {
    const maxDistance = options?.maxDistance ?? 50;
    const maxAccuracy = options?.maxAccuracy ?? this.THRESHOLDS.ACCEPTABLE;

    // Pas de précédent => toujours cohérent
    if (!previous) {
      return { consistent: true, score: 100, distance: 0 };
    }

    // Vérifier précision
    if (current.accuracy > maxAccuracy) {
      return {
        consistent: false,
        score: 0,
        warning: `Précision insuffisante: ${Math.round(current.accuracy)}m`,
        distance: 0
      };
    }

    // Calculer distance
    const distance = this.calculateDistance(
      current.lat, current.lng,
      previous.lat, previous.lng
    );

    // Tolérance = max( maxDistance, somme des précisions * 0.5 )
    const tolerance = Math.max(maxDistance, (current.accuracy + previous.accuracy) * 0.5);

    if (distance > tolerance) {
      return {
        consistent: false,
        score: Math.max(0, 100 - (distance / tolerance) * 50),
        warning: `Distance trop grande: ${Math.round(distance)}m (max ${Math.round(tolerance)}m)`,
        distance: Math.round(distance)
      };
    }

    // Score de cohérence (plus la distance est faible, meilleur est le score)
    const score = Math.max(80, 100 - (distance / tolerance) * 20);

    return {
      consistent: true,
      score: Math.round(score),
      distance: Math.round(distance)
    };
  }

  /**
   * Calculer distance Haversine
   */
  calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  }

  /**
   * Obtenir le message utilisateur selon le statut
   */
  getUserMessage(result: LocationResult): string {
    switch(result.status) {
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

  getThresholds(): LocationThresholds {
    return { ...this.THRESHOLDS };
  }
}

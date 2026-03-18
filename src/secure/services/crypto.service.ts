import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class CryptoService {
  /**
   * Génère un hash SHA-256 à partir d'une chaîne de caractères.
   */
  async sha256(message: string): Promise<string> {
    // 1. Encoder la chaîne en Uint8Array
    const msgBuffer = new TextEncoder().encode(message);
    // 2. Calculer le hash
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    // 3. Convertir le buffer en chaîne hexadécimale
    return this.bufferToHex(hashBuffer);
  }

  /**
   * Convertit un ArrayBuffer en chaîne hexadécimale.
   */
  private bufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Calcule le hash d'un bloc à partir de ses données.
   */
  async calculateBlockHash(blockData: {
    previousHash: string;
    blockHeight: number;
    fromUserId: string;
    toUserId: string;
    amount: number;
    type: string;
    timestamp: number;
    nonce?: number;
  }): Promise<string> {
    // Créer une chaîne unique représentant le bloc.
    // L'ordre des éléments est important pour la consistance du hash.
    const dataString = `${blockData.previousHash}|${blockData.blockHeight}|${blockData.fromUserId}|${blockData.toUserId}|${blockData.amount}|${blockData.type}|${blockData.timestamp}|${blockData.nonce || 0}`;
    return await this.sha256(dataString);
  }
}

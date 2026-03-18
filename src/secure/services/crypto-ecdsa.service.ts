// services/crypto-ecdsa.service.ts
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class CryptoECDAService {

  /**
   * Générer une paire de clés ECDSA (courbe secp256k1)
   */
  async generateKeyPair(): Promise<{
    publicKey: string;
    privateKey: string;
  }> {
    try {
      // 1. Générer la paire de clés
      const keyPair = await crypto.subtle.generateKey(
        {
          name: 'ECDSA',
          namedCurve: 'P-256', // ou 'K-256' pour secp256k1
        },
        true, // extractable
        ['sign', 'verify']
      );

      // 2. Exporter la clé publique
      const publicKeyBuffer = await crypto.subtle.exportKey(
        'raw',
        keyPair.publicKey
      );
      const publicKey = this.arrayBufferToBase64(publicKeyBuffer);

      // 3. Exporter la clé privée (protégée)
      const privateKeyBuffer = await crypto.subtle.exportKey(
        'pkcs8',
        keyPair.privateKey
      );
      const privateKey = this.arrayBufferToBase64(privateKeyBuffer);

      return { publicKey, privateKey };
    } catch (error) {
      console.error('Erreur génération clés ECDSA:', error);
      throw error;
    }
  }

  /**
   * Signer une transaction avec la clé privée
   */
  async signTransaction(
    transactionData: any,
    privateKeyBase64: string
  ): Promise<string> {
    try {
      // 1. Importer la clé privée
      const privateKeyBuffer = this.base64ToArrayBuffer(privateKeyBase64);
      const privateKey = await crypto.subtle.importKey(
        'pkcs8',
        privateKeyBuffer,
        {
          name: 'ECDSA',
          namedCurve: 'P-256',
        },
        false,
        ['sign']
      );

      // 2. Créer l'empreinte de la transaction
      const transactionString = JSON.stringify(transactionData);
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(transactionString);
      const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);

      // 3. Signer l'empreinte
      const signatureBuffer = await crypto.subtle.sign(
        {
          name: 'ECDSA',
          hash: { name: 'SHA-256' },
        },
        privateKey,
        hashBuffer
      );

      // 4. Convertir la signature en base64
      return this.arrayBufferToBase64(signatureBuffer);
    } catch (error) {
      console.error('Erreur signature transaction:', error);
      throw error;
    }
  }

  /**
   * Vérifier une signature
   */
  async verifySignature(
    transactionData: any,
    signatureBase64: string,
    publicKeyBase64: string
  ): Promise<boolean> {
    try {
      // 1. Importer la clé publique
      const publicKeyBuffer = this.base64ToArrayBuffer(publicKeyBase64);
      const publicKey = await crypto.subtle.importKey(
        'raw',
        publicKeyBuffer,
        {
          name: 'ECDSA',
          namedCurve: 'P-256',
        },
        false,
        ['verify']
      );

      // 2. Recalculer l'empreinte
      const transactionString = JSON.stringify(transactionData);
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(transactionString);
      const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);

      // 3. Convertir la signature
      const signatureBuffer = this.base64ToArrayBuffer(signatureBase64);

      // 4. Vérifier
      return await crypto.subtle.verify(
        {
          name: 'ECDSA',
          hash: { name: 'SHA-256' },
        },
        publicKey,
        signatureBuffer,
        hashBuffer
      );
    } catch (error) {
      console.error('Erreur vérification signature:', error);
      return false;
    }
  }

  // Utilitaires de conversion
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

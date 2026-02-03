// services/ipfs.service.ts
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class IpfsService {
  private readonly PINATA_API_KEY: string;
  private readonly PINATA_SECRET_API_KEY: string;
  private readonly PINATA_JWT: string;

  constructor() {
    const config = environment.ipfs;
    this.PINATA_API_KEY = config.pinataApiKey;
    this.PINATA_SECRET_API_KEY = config.pinataSecretApiKey;
    this.PINATA_JWT = config.pinataJWT;
  }

  /**
   * Upload un fichier sur IPFS via Pinata
   */
  async uploadFile(file: File): Promise<{
    success: boolean;
    cid?: string;
    url?: string;
    error?: string;
  }> {
    try {
      // 1. Créer FormData
      const formData = new FormData();
      formData.append('file', file);

      // Ajouter des métadonnées
      const metadata = JSON.stringify({
        name: file.name,
        keyvalues: {
          timestamp: Date.now().toString(),
          type: 'certification_photo',
          size: file.size
        }
      });
      formData.append('pinataMetadata', metadata);

      // 2. Configurer les options
      const options = JSON.stringify({
        cidVersion: 1,
        wrapWithDirectory: false
      });
      formData.append('pinataOptions', options);

      // 3. Envoyer à Pinata
      const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.PINATA_JWT}`
        },
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Erreur Pinata: ${error.error?.details || 'Upload failed'}`);
      }

      const data = await response.json();

      // 4. Retourner les informations
      const cid = data.IpfsHash;
      const url = `https://gateway.pinata.cloud/ipfs/${cid}`;

      console.log(`✅ Fichier uploadé sur IPFS:`, { cid, url });

      return {
        success: true,
        cid,
        url
      };

    } catch (error: any) {
      console.error('❌ Erreur upload IPFS:', error);
      return {
        success: false,
        error: error.message || 'Erreur lors de l\'upload IPFS'
      };
    }
  }

  /**
   * Upload des données JSON sur IPFS
   */
  async uploadJSON(data: any): Promise<{
    success: boolean;
    cid?: string;
    url?: string;
    error?: string;
  }> {
    try {
      const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.PINATA_JWT}`
        },
        body: JSON.stringify({
          pinataContent: data,
          pinataMetadata: {
            name: `certification_metadata_${Date.now()}.json`,
            keyvalues: {
              timestamp: Date.now().toString(),
              type: 'certification_metadata'
            }
          },
          pinataOptions: {
            cidVersion: 1
          }
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Erreur Pinata JSON: ${error.error?.details || 'Upload failed'}`);
      }

      const result = await response.json();
      const cid = result.IpfsHash;
      const url = `https://gateway.pinata.cloud/ipfs/${cid}`;

      console.log(`✅ JSON uploadé sur IPFS:`, { cid, url });

      return {
        success: true,
        cid,
        url
      };

    } catch (error: any) {
      console.error('❌ Erreur upload JSON IPFS:', error);
      return {
        success: false,
        error: error.message || 'Erreur lors de l\'upload JSON IPFS'
      };
    }
  }

  /**
   * Récupérer un fichier depuis IPFS
   */
  async getFile(cid: string): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> {
    try {
      const response = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`, {
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Erreur récupération IPFS: ${response.statusText}`);
      }

      // Essayer de parser en JSON, sinon retourner le texte
      const text = await response.text();
      let data = text;

      try {
        data = JSON.parse(text);
      } catch {
        // Ce n'est pas du JSON, on garde le texte
      }

      return {
        success: true,
        data
      };

    } catch (error: any) {
      console.error('❌ Erreur récupération IPFS:', error);
      return {
        success: false,
        error: error.message || 'Erreur lors de la récupération IPFS'
      };
    }
  }

  /**
   * Vérifier qu'un CID existe sur IPFS
   */
  async verifyCID(cid: string): Promise<boolean> {
    try {
      const response = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`, {
        method: 'HEAD'
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Générer un URL de gateway pour un CID
   */
  getGatewayUrl(cid: string): string {
    return `https://gateway.pinata.cloud/ipfs/${cid}`;
  }

  /**
   * Upload multiple files
   */
  async uploadMultipleFiles(files: File[]): Promise<Array<{
    success: boolean;
    filename: string;
    cid?: string;
    url?: string;
    error?: string;
  }>> {
    const results = [];

    for (const file of files) {
      const result = await this.uploadFile(file);
      results.push({
        ...result,
        filename: file.name
      });
    }

    return results;
  }

  /**
   * Tester la connexion à Pinata
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch('https://api.pinata.cloud/data/testAuthentication', {
        headers: {
          'Authorization': `Bearer ${this.PINATA_JWT}`
        }
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

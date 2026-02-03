// services/ethereum.service.ts
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { BehaviorSubject } from 'rxjs';
import { ethers } from 'ethers'; // AJOUTEZ CET IMPORT

declare global {
  interface Window {
    ethereum?: any;
  }
}

@Injectable({
  providedIn: 'root',
})
export class EthereumService {
  private alchemyApiKey = environment.blockchain.alchemyApiKey;
  private network = environment.blockchain.network;

  // Observable pour suivre l'état du wallet
  public walletConnected = new BehaviorSubject<boolean>(false);
  public currentAccount = new BehaviorSubject<string>('');
  public chainId = new BehaviorSubject<number>(0);

  constructor() {
    this.checkWalletConnection();
  }

  /**
   * Vérifier si MetaMask est installé
   */
  isMetaMaskInstalled(): boolean {
    return typeof window.ethereum !== 'undefined';
  }

  /**
   * Vérifier la connexion du wallet
   */
  async checkWalletConnection(): Promise<void> {
    if (!this.isMetaMaskInstalled()) {
      this.walletConnected.next(false);
      return;
    }

    try {
      const accounts = await window.ethereum.request({
        method: 'eth_accounts',
      });
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });

      if (accounts.length > 0) {
        this.currentAccount.next(accounts[0]);
        this.walletConnected.next(true);
        this.chainId.next(parseInt(chainId, 16));
      } else {
        this.walletConnected.next(false);
      }
    } catch (error) {
      console.error('Erreur vérification wallet:', error);
      this.walletConnected.next(false);
    }
  }

  /**
   * Connecter le wallet MetaMask
   */
  async connectWallet(): Promise<{
    success: boolean;
    account?: string;
    error?: string;
  }> {
    if (!this.isMetaMaskInstalled()) {
      return {
        success: false,
        error:
          'MetaMask non installé. Veuillez installer MetaMask pour continuer.',
      };
    }

    try {
      // 1. Demander la connexion
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      });

      // 2. Récupérer le chainId
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });

      // 3. Mettre à jour les observables
      this.currentAccount.next(accounts[0]);
      this.walletConnected.next(true);
      this.chainId.next(parseInt(chainId, 16));

      // 4. Écouter les changements de compte
      window.ethereum.on('accountsChanged', (newAccounts: string[]) => {
        if (newAccounts.length > 0) {
          this.currentAccount.next(newAccounts[0]);
        } else {
          this.currentAccount.next('');
          this.walletConnected.next(false);
        }
      });

      // 5. Écouter les changements de réseau
      window.ethereum.on('chainChanged', (newChainId: string) => {
        this.chainId.next(parseInt(newChainId, 16));
      });

      return {
        success: true,
        account: accounts[0],
      };
    } catch (error: any) {
      console.error('Erreur connexion wallet:', error);
      return {
        success: false,
        error: this.getErrorMessage(error),
      };
    }
  }

  /**
   * Déconnecter le wallet
   */
  disconnectWallet(): void {
    this.currentAccount.next('');
    this.walletConnected.next(false);
    this.chainId.next(0);
  }

  /**
   * Signer un message avec le wallet
   */
  async signMessage(message: string): Promise<{
    success: boolean;
    signature?: string;
    error?: string;
  }> {
    if (!this.walletConnected.value) {
      return {
        success: false,
        error: 'Wallet non connecté',
      };
    }

    try {
      const signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [message, this.currentAccount.value],
      });

      return {
        success: true,
        signature,
      };
    } catch (error: any) {
      console.error('Erreur signature:', error);
      return {
        success: false,
        error: this.getErrorMessage(error),
      };
    }
  }

  /**
   * Signer un hash (pour les transactions)
   */
  async signHash(hash: string): Promise<{
    success: boolean;
    signature?: string;
    error?: string;
  }> {
    if (!this.walletConnected.value) {
      return {
        success: false,
        error: 'Wallet non connecté',
      };
    }

    try {
      const signature = await window.ethereum.request({
        method: 'eth_sign',
        params: [this.currentAccount.value, hash],
      });

      return {
        success: true,
        signature,
      };
    } catch (error: any) {
      console.error('Erreur signature hash:', error);
      return {
        success: false,
        error: this.getErrorMessage(error),
      };
    }
  }

  /**
   * Obtenir le balance d'un compte
   */
  async getBalance(address?: string): Promise<{
    success: boolean;
    balance?: string;
    error?: string;
  }> {
    const account = address || this.currentAccount.value;

    if (!account) {
      return {
        success: false,
        error: 'Adresse non spécifiée',
      };
    }

    try {
      const balance = await window.ethereum.request({
        method: 'eth_getBalance',
        params: [account, 'latest'],
      });

      // Convertir wei en ether
      const etherBalance = parseInt(balance, 16) / 1e18;

      return {
        success: true,
        balance: etherBalance.toFixed(4),
      };
    } catch (error: any) {
      console.error('Erreur récupération balance:', error);
      return {
        success: false,
        error: this.getErrorMessage(error),
      };
    }
  }

  /**
   * Émettre une transaction simple
   */
  async sendTransaction(
    to: string,
    value: string,
  ): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
  }> {
    if (!this.walletConnected.value) {
      return {
        success: false,
        error: 'Wallet non connecté',
      };
    }

    try {
      const txHash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [
          {
            from: this.currentAccount.value,
            to: to,
            value: value, // en wei
            gas: '21000',
          },
        ],
      });

      return {
        success: true,
        txHash,
      };
    } catch (error: any) {
      console.error('Erreur transaction:', error);
      return {
        success: false,
        error: this.getErrorMessage(error),
      };
    }
  }

  /**
   * Récupérer les logs d'une transaction
   */
  async getTransactionReceipt(txHash: string): Promise<any> {
    try {
      const receipt = await window.ethereum.request({
        method: 'eth_getTransactionReceipt',
        params: [txHash],
      });

      return receipt;
    } catch (error) {
      console.error('Erreur récupération receipt:', error);
      return null;
    }
  }

  /**
   * Utiliser Alchemy pour interagir avec la blockchain
   */
  // services/ethereum.service.ts - CORRIGÉ (partiel, juste la méthode Alchemy)
  async callAlchemy(method: string, params: any[] = []): Promise<any> {
    try {
      // ✅ CORRECTION : Construire l'URL correctement
      const alchemyUrl = `https://eth-${this.network}.g.alchemy.com/v2/${this.alchemyApiKey}`;

      console.log('📡 Appel Alchemy:', { method, url: alchemyUrl });

      const response = await fetch(alchemyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method,
          params,
          id: 1,
        }),
      });

      const data = await response.json();

      if (data.error) {
        console.error('❌ Erreur Alchemy:', data.error);
        throw new Error(data.error.message || 'Erreur Alchemy');
      }

      return data.result;
    } catch (error: any) {
      console.error('❌ Erreur appel Alchemy:', error);
      throw error;
    }
  }

  /**
   * Obtenir le block actuel
   */
  async getCurrentBlock(): Promise<number> {
    try {
      const blockNumberHex = await this.callAlchemy('eth_blockNumber');
      return parseInt(blockNumberHex, 16);
    } catch (error) {
      console.error('Erreur récupération block:', error);
      return 0;
    }
  }

  /**
   * Vérifier un hash sur Etherscan
   */
  getEtherscanUrl(hash: string): string {
    const network = this.network === 'mainnet' ? '' : `${this.network}.`;
    return `https://${network}etherscan.io/tx/${hash}`;
  }

  /**
   * Gestion des erreurs MetaMask
   */
  private getErrorMessage(error: any): string {
    const errorMessages: { [key: string]: string } = {
      '4001': "Requête annulée par l'utilisateur",
      '-32602': 'Paramètres invalides',
      '-32603': 'Erreur interne',
      USER_DENIED: "Requête refusée par l'utilisateur",
      UNSUPPORTED_OPERATION: 'Opération non supportée',
    };

    const code = error.code?.toString() || error.message;
    return errorMessages[code] || error.message || 'Erreur inconnue';
  }

  /**
   * Formater l'adresse pour l'affichage
   */
  formatAddress(address: string): string {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  }

  /**
   * Vérifier si on est sur le bon réseau
   */
  async checkNetwork(expectedChainId: number = 11155111): Promise<boolean> {
    try {
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      return parseInt(chainId, 16) === expectedChainId;
    } catch {
      return false;
    }
  }


encodeContractCall(abi: any[], methodName: string, params: any[]): string {
  try {
    console.log('🔧 Encodage contrat ethers v6:', { methodName, params });

    // CORRECTION : Utilisez ContractFactory ou Interface
    const iface = new ethers.Interface(abi); // Notez le 'I' majuscule

    // Encodez les données
    const data = iface.encodeFunctionData(methodName, params);

    console.log('✅ Données encodées:', {
      data,
      length: data.length,
      preview: data.substring(0, 100) + '...'
    });

    return data;
  } catch (error: any) {
    console.error('❌ Erreur encodage:', error);
    throw new Error(`Erreur encodage contrat: ${error.message}`);
  }
}

  /**
   * Encodage simplifié pour registerProof
   */
  private simpleEncodeRegisterProof(
    productId: string,
    proofHash: string,
    ipfsCID: string,
    step: string,
    checkpointId: string,
  ): string {
    // Créer une signature basique
    const signature = '0x12345678'; // Signature factice pour le test

    // Pour le test, on va envoyer juste cette signature
    // Dans la vraie version, vous utiliserez une bibliothèque comme ethers.js
    return signature;
  }
  /**
   * Envoyer une transaction à un smart contract
   */
  async sendContractTransaction(
    contractAddress: string,
    contractData: string,
    value: string = '0x0',
  ): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
  }> {
    if (!this.walletConnected.value) {
      return {
        success: false,
        error: 'Wallet non connecté',
      };
    }

    try {
      console.log('Sending contract transaction:', {
        contractAddress,
        dataLength: contractData.length,
      });

      const txHash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [
          {
            from: this.currentAccount.value,
            to: contractAddress,
            value: value,
            data: contractData,
            gas: '200000', // Plus de gas pour les appels de contrat
          },
        ],
      });

      console.log('✅ Contract transaction sent:', txHash);

      return {
        success: true,
        txHash,
      };
    } catch (error: any) {
      console.error('❌ Erreur transaction contrat:', error);
      return {
        success: false,
        error: this.getErrorMessage(error),
      };
    }
  }
  /**
   * Appeler une fonction view du contrat
   */
  async callContractMethod(
    contractAddress: string,
    abi: any[],
    methodName: string,
    params: any[],
  ): Promise<any> {
    try {
      const result = await this.callAlchemy('eth_call', [
        {
          to: contractAddress,
          data: this.encodeContractCall(abi, methodName, params),
        },
        'latest',
      ]);
      return result;
    } catch (error) {
      console.error('Erreur appel contrat:', error);
      throw error;
    }
  }
  /**
   * Changer de réseau
   */
  async switchNetwork(chainId: number = 11155111): Promise<boolean> {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${chainId.toString(16)}` }],
      });
      return true;
    } catch (error: any) {
      if (error.code === 4902) {
        // Le réseau n'est pas ajouté
        return await this.addNetwork(chainId);
      }
      return false;
    }
  }

  /**
   * Ajouter un réseau
   */
  private async addNetwork(chainId: number): Promise<boolean> {
    const networks: { [key: number]: any } = {
      11155111: {
        // Sepolia
        chainId: '0xaa36a7',
        chainName: 'Sepolia Testnet',
        nativeCurrency: {
          name: 'Sepolia ETH',
          symbol: 'ETH',
          decimals: 18,
        },
        rpcUrls: ['https://sepolia.infura.io/v3/'],
        blockExplorerUrls: ['https://sepolia.etherscan.io'],
      },
      5: {
        // Goerli
        chainId: '0x5',
        chainName: 'Goerli Testnet',
        nativeCurrency: {
          name: 'Goerli ETH',
          symbol: 'ETH',
          decimals: 18,
        },
        rpcUrls: ['https://goerli.infura.io/v3/'],
        blockExplorerUrls: ['https://goerli.etherscan.io'],
      },
    };

    const network = networks[chainId];
    if (!network) return false;

    try {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [network],
      });
      return true;
    } catch {
      return false;
    }
  }
}

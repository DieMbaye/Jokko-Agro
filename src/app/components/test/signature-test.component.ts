// components/test/signature-test.component.ts (version corrigée)
import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AGCService } from '../../services/agc.service';
import { AuthService } from '../../services/auth.service';
import { UserKeysService } from 'src/secure/services/user-keys.service';

@Component({
  selector: 'app-signature-test',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './signature-test.component.html', // Utiliser un fichier HTML séparé
  styleUrls: ['./signature-test.component.css']
})
export class SignatureTestComponent implements OnInit {
  private agcService = inject(AGCService);
  private userKeys = inject(UserKeysService);
  private authService = inject(AuthService);

  isProcessing = false;
  successMessage = '';
  errorMessage = '';
  result: any = null;
  signatureStats: any = null;
  userEmail: string = '';
  hasKeys: boolean = false;
  keysInfo: any = null; // ✅ AJOUTÉ

  async ngOnInit() {
    const user = this.authService.getUserData();
    if (user) {
      this.userEmail = user.email;
      const publicKey = await this.userKeys.getPublicKey(user.uid);
      this.hasKeys = !!publicKey;
    }
  }

  async testSignature() {
    this.isProcessing = true;
    this.clearMessages();

    try {
      const user = this.authService.getUserData();
      if (!user) {
        this.showError('Connectez-vous d\'abord');
        return;
      }

      // ✅ Vérifier que les clés existent
      const publicKey = await this.userKeys.getPublicKey(user.uid);
      const privateKey = this.userKeys.getPrivateKey(user.uid);

      if (!publicKey || !privateKey) {
        this.showError('Clés non trouvées - Générez-les d\'abord (bouton 4)');
        return;
      }

      this.log('⏳ Création d\'une transaction signée...');

      // Créer une transaction de test
      const tx = await (this.agcService as any).createSignedTransaction({
        fromUserId: user.uid,
        toUserId: 'test_user',
        amount: 10,
        type: 'transfer',
        referenceId: `test_${Date.now()}`,
        description: 'Test signature ECDSA',
        status: 'completed',
        createdAt: new Date(),
        metadata: { test: true }
      }, user.uid);

      this.result = {
        success: true,
        transaction: {
          id: tx.id,
          fromUserId: tx.fromUserId?.substring(0, 8) + '...',
          toUserId: tx.toUserId?.substring(0, 8) + '...',
          amount: tx.amount,
          type: tx.type,
          signature: tx.signature?.substring(0, 30) + '...',
          signatureTimestamp: tx.signatureTimestamp ? new Date(tx.signatureTimestamp).toLocaleString() : 'N/A',
          signerId: tx.signerId?.substring(0, 8) + '...'
        }
      };

      this.log(`Transaction signée avec succès!`);

      // Vérifier la signature
      const isValid = await this.agcService.verifyTransactionSignature(tx);
      this.result.verification = isValid ? '✅ Signature valide' : '❌ Signature invalide';

    } catch (error: any) {
      this.showError(error?.message || 'Erreur inconnue');
    } finally {
      this.isProcessing = false;
    }
  }

  async testTampering() {
    this.isProcessing = true;
    this.clearMessages();

    try {
      const user = this.authService.getUserData();
      if (!user) {
        this.showError('Connectez-vous d\'abord');
        return;
      }

      // Vérifier les clés
      const publicKey = await this.userKeys.getPublicKey(user.uid);
      const privateKey = this.userKeys.getPrivateKey(user.uid);

      if (!publicKey || !privateKey) {
        this.showError('Clés non trouvées - Générez-les d\'abord');
        return;
      }

      // Créer une transaction normale
      const tx = await (this.agcService as any).createSignedTransaction({
        fromUserId: user.uid,
        toUserId: 'victime',
        amount: 10,
        type: 'transfer',
        referenceId: `test_${Date.now()}`,
        description: 'Paiement normal',
        status: 'completed',
        createdAt: new Date()
      }, user.uid);

      // Tentative de modification du montant (attaque)
      const tamperedTx = { ...tx, amount: 1000 };

      // Vérifier si la signature tient toujours
      const isValid = await this.agcService.verifyTransactionSignature(tamperedTx);

      this.result = {
        success: false,
        originalTransaction: {
          amount: tx.amount,
          signature: tx.signature?.substring(0, 20) + '...'
        },
        tamperedTransaction: {
          amount: tamperedTx.amount,
          signature: tamperedTx.signature?.substring(0, 20) + '...'
        },
        verificationResult: isValid ? '❌ ÉCHEC (signature toujours valide!)' : '✅ RÉUSSI (signature cassée)',
        conclusion: isValid ? '❌ L\'attaque a réussi!' : '✅ L\'attaque a échoué - Signature invalide'
      };

      if (!isValid) {
        this.log('La modification a été détectée! Signature invalide.');
      } else {
        this.showError('ERREUR: La signature est restée valide après modification!');
      }

    } catch (error: any) {
      this.showError(error?.message || 'Erreur inconnue');
    } finally {
      this.isProcessing = false;
    }
  }

  async verifyLedger() {
    this.isProcessing = true;
    this.clearMessages();

    try {
      this.log('⏳ Vérification de toutes les signatures...');

      // ✅ Vérifier que la méthode existe
      if (!(this.agcService as any).verifyAllSignatures) {
        this.showError('Méthode verifyAllSignatures non implémentée dans AGCService');
        return;
      }

      this.signatureStats = await (this.agcService as any).verifyAllSignatures();

      this.result = {
        total: this.signatureStats.total,
        valides: this.signatureStats.valid,
        invalides: this.signatureStats.invalid,
        pourcentageValidite: this.signatureStats.total > 0
          ? ((this.signatureStats.valid / this.signatureStats.total) * 100).toFixed(1) + '%'
          : 'N/A'
      };

      if (this.signatureStats.invalid === 0) {
        this.log(`Toutes les ${this.signatureStats.total} signatures sont valides!`);
      } else {
        this.showError(`${this.signatureStats.invalid} signature(s) invalide(s) détectée(s)`);
      }

    } catch (error: any) {
      this.showError(error?.message || 'Erreur inconnue');
    } finally {
      this.isProcessing = false;
    }
  }

  async generateKeys() {
    this.isProcessing = true;
    this.clearMessages();
    this.result = null;

    try {
      const user = this.authService.getUserData();
      if (!user) {
        this.showError('Connectez-vous d\'abord');
        return;
      }

      this.log('🔑 Génération des clés ECDSA...');

      // Vérifier si les clés existent déjà
      const existingPublicKey = await this.userKeys.getPublicKey(user.uid);
      if (existingPublicKey) {
        this.log('✅ Des clés existent déjà dans Firestore');
        this.keysInfo = {
          hasKeys: true,
          publicKeyExists: true,
          privateKeyInSession: !!this.userKeys.getPrivateKey(user.uid),
          publicKeyPreview: existingPublicKey.substring(0, 50) + '...'
        };
        this.hasKeys = true;
        this.isProcessing = false;
        return;
      }

      // Générer les clés
      const result = await this.userKeys.generateAndSaveUserKeys(user.uid);

      if (result.success) {
        this.log('✅ CLÉS GÉNÉRÉES AVEC SUCCÈS !');
        this.log(`🔐 Clé publique: ${result.publicKey.substring(0, 50)}...`);

        // Vérifier le stockage
        const privateKey = this.userKeys.getPrivateKey(user.uid);
        this.log(`🔑 Clé privée en session: ${privateKey ? '✅ OUI' : '❌ NON'}`);

        this.keysInfo = {
          hasKeys: true,
          publicKeyExists: true,
          privateKeyInSession: !!privateKey,
          publicKeyPreview: result.publicKey.substring(0, 50) + '...'
        };

        this.hasKeys = true;
        this.result = this.keysInfo;
      } else {
        this.showError('Échec de la génération');
      }
    } catch (error: any) {
      this.showError(error.message);
    } finally {
      this.isProcessing = false;
    }
  }

  async checkKeys() {
    try {
      const user = this.authService.getUserData();
      if (!user) {
        this.showError('Connectez-vous d\'abord');
        return;
      }

      const publicKey = await this.userKeys.getPublicKey(user.uid);
      const privateKey = this.userKeys.getPrivateKey(user.uid);

      this.hasKeys = !!(publicKey && privateKey);

      this.result = {
        hasKeys: this.hasKeys,
        publicKeyExists: !!publicKey,
        privateKeyInSession: !!privateKey,
        publicKeyPreview: publicKey ? publicKey.substring(0, 30) + '...' : null
      };

      if (this.hasKeys) {
        this.log('✅ Clés ECDSA trouvées!');
      } else {
        this.showError('Clés non trouvées - Générez-les d\'abord');
      }

    } catch (error: any) {
      this.showError(error?.message || 'Erreur inconnue');
    }
  }

  // ✅ Méthodes utilitaires ajoutées
  private log(message: string) {
    console.log(message);
    this.successMessage = message;
  }

  private showError(message: string) {
    console.error(message);
    this.errorMessage = message;
  }

  private clearMessages() {
    this.successMessage = '';
    this.errorMessage = '';
  }
}

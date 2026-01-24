// blockchain-proof.component.ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  BlockchainService,
  BlockchainRecord,
  BlockchainVerification,
  CanonicalProof,
} from 'src/app/services/blockchain.service';
import { CertificationService } from 'src/app/services/certification.service';

@Component({
  selector: 'app-blockchain-proof',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './blockchain-proof.component.html',
  styleUrls: ['./blockchain-proof.component.css']
})
export class BlockchainProofComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private blockchainService = inject(BlockchainService);
  private certificationService = inject(CertificationService);

  // Données du produit
  productId = '';
  currentProduct: any = null;
  blockchainRecords: BlockchainRecord[] = [];

  // Onglets
  activeTab: 'register' | 'verify' | 'history' | 'qr' = 'register';

  // Nouvelle preuve
  newProof = {
    step: 'INIT' as 'INIT' | 'FOLLOW_UP' | 'HARVEST' | 'CHECKPOINT',
    photoFile: null as File | null,
    photoPreview: null as string | null,
    photoHash: '',
    proofHash: '',
    lat: 0,
    lng: 0,
    accuracy: 0,
    checkpointId: '',
    checkpointOrder: 0,
    useCurrentLocation: true,
  };

  // Vérification
  verificationMethod: 'transaction' | 'qr' | 'manual' = 'transaction';
  verificationData = {
    transactionId: '',
    photoHash: '',
    lat: 0,
    lng: 0,
    timestamp: 0,
    step: 'INIT' as string,
  };
  verificationResult: BlockchainVerification | null = null;

  // Historique
  historyFilter = '';
  historySort = 'timestamp-desc';

  // QR Code
  qrCodeUrl = '';
  verificationUrl = '';

  // État
  isLoading = false;
  isRegistering = false;
  isVerifying = false;
  showGpsInfo = false;
  errorMessage = '';
  successMessage = '';

  async ngOnInit() {
    // Vérifier s'il y a un ID de produit dans l'URL
    const id = this.route.snapshot.paramMap.get('productId');
    if (id) {
      this.productId = id;
      await this.loadProductData();
    }

    // Obtenir la localisation actuelle
    await this.getCurrentLocation();
  }

  // Charger les données du produit
  async loadProductData() {
    if (!this.productId) {
      this.errorMessage = 'Veuillez entrer un ID de produit';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    try {
      // Charger la certification
      this.currentProduct = await this.certificationService.getCertification(
        this.productId,
      );

      if (!this.currentProduct) {
        this.errorMessage = 'Produit non trouvé';
        return;
      }

      // Charger les enregistrements blockchain
      this.blockchainRecords =
        this.blockchainService.getProductBlockchainRecords(this.productId);

      // Générer le QR Code
      this.generateQRCode();

      this.successMessage = 'Produit chargé avec succès';
    } catch (error: any) {
      console.error('Erreur chargement produit:', error);
      this.errorMessage = error.message || 'Erreur lors du chargement';
    } finally {
      this.isLoading = false;
    }
  }

  // Capturer une photo
  capturePhoto() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = (event: any) => this.onPhotoSelected(event);
    input.click();
  }

  onPhotoSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      // Validation
      if (!file.type.startsWith('image/')) {
        this.errorMessage = 'Veuillez sélectionner une image';
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        // 10MB
        this.errorMessage = "L'image est trop volumineuse (max 10MB)";
        return;
      }

      this.newProof.photoFile = file;

      // Aperçu
      const reader = new FileReader();
      reader.onload = () => {
        this.newProof.photoPreview = reader.result as string;
      };
      reader.readAsDataURL(file);

      // Calculer le hash de la photo
      this.calculatePhotoHash(file);

      this.errorMessage = '';
      this.showGpsInfo = true;
    }
  }

  // Calculer le hash de la photo
  async calculatePhotoHash(file: File) {
    try {
      this.newProof.photoHash =
        await this.blockchainService.calculatePhotoHash(file);

      // Pré-calculer le hash de preuve si toutes les données sont disponibles
      await this.previewProofHash();
    } catch (error: any) {
      console.error('Erreur calcul hash photo:', error);
      this.errorMessage = 'Erreur lors du calcul du hash de la photo';
    }
  }

  // Obtenir la localisation GPS
  async getCurrentLocation() {
    if (!navigator.geolocation) {
      this.errorMessage =
        "La géolocalisation n'est pas supportée par votre navigateur";
      return;
    }

    try {
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
          });
        },
      );

      this.newProof.lat = position.coords.latitude;
      this.newProof.lng = position.coords.longitude;
      this.newProof.accuracy = position.coords.accuracy;

      // Pré-calculer le hash de preuve
      await this.previewProofHash();

      this.showGpsInfo = true;
    } catch (error: any) {
      console.warn('Erreur géolocalisation:', error);

      // Fallback: utiliser une position par défaut pour le test
      this.newProof.lat = 14.716677;
      this.newProof.lng = -17.467686;
      this.newProof.accuracy = 10000;

      this.errorMessage = 'Utilisation de la position par défaut (Dakar)';
      this.showGpsInfo = true;
      await this.previewProofHash();
    }
  }

  // Pré-calculer le hash de preuve
  async previewProofHash() {
    if (!this.newProof.photoFile || !this.productId) {
      return;
    }

    try {
      const canonicalObject =
        await this.blockchainService.createCanonicalObject({
          productId: this.productId,
          photoFile: this.newProof.photoFile,
          lat: this.newProof.lat,
          lng: this.newProof.lng,
          step: this.newProof.step,
          checkpointId: this.newProof.checkpointId || undefined,
          checkpointOrder: this.newProof.checkpointOrder || undefined,
        });

      this.newProof.proofHash =
        this.blockchainService.calculateProofHash(canonicalObject);
    } catch (error) {
      console.error('Erreur pré-calcul hash:', error);
    }
  }

  // Obtenir l'aperçu de l'objet canonique
  getCanonicalPreview(): string {
    if (!this.productId || !this.newProof.photoHash) {
      return 'Les données canoniques seront affichées ici...';
    }

    const canonicalObject: CanonicalProof = {
      productId: this.productId,
      photoHash: this.newProof.photoHash,
      lat: this.newProof.lat,
      lng: this.newProof.lng,
      timestamp: Math.floor(Date.now() / 1000),
      step: this.newProof.step,
    };

    if (this.newProof.checkpointId) {
      canonicalObject.checkpointId = this.newProof.checkpointId;
    }

    if (this.newProof.checkpointOrder) {
      canonicalObject.checkpointOrder = this.newProof.checkpointOrder;
    }

    return JSON.stringify(canonicalObject, null, 2);
  }

  // Vérifier si on peut enregistrer une preuve
  canRegisterProof(): boolean {
    return !!(
      this.productId &&
      this.newProof.photoFile &&
      this.newProof.lat &&
      this.newProof.lng
    );
  }

  // Enregistrer une preuve sur la blockchain
  async registerProof() {
    if (!this.canRegisterProof()) {
      this.errorMessage = 'Veuillez remplir tous les champs requis';
      return;
    }

    this.isRegistering = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      // VÉRIFICATION CRITIQUE : S'assurer que photoFile n'est pas null
      if (!this.newProof.photoFile) {
        throw new Error('Fichier photo manquant');
      }

      // Créer l'objet canonique
      const canonicalObject = await this.blockchainService.createCanonicalObject({
        productId: this.productId,
        photoFile: this.newProof.photoFile,
        lat: this.newProof.lat,
        lng: this.newProof.lng,
        step: this.newProof.step,
        checkpointId: this.newProof.checkpointId || undefined,
        checkpointOrder: this.newProof.checkpointOrder || undefined,
      });

      // Enregistrer sur la blockchain
      const record = await this.blockchainService.registerProofOnBlockchain(canonicalObject);

      // Mettre à jour l'historique
      this.blockchainRecords = this.blockchainService.getProductBlockchainRecords(this.productId);

      // Réinitialiser le formulaire
      this.resetNewProof();

      this.successMessage = `✅ Preuve enregistrée avec succès ! Transaction ID: ${record.transactionId}`;
    } catch (error: any) {
      console.error('Erreur enregistrement preuve:', error);
      this.errorMessage = error.message || "Erreur lors de l'enregistrement sur la blockchain";
    } finally {
      this.isRegistering = false;
    }
  }

  // Réinitialiser le formulaire de nouvelle preuve
  resetNewProof() {
    this.newProof = {
      step: 'INIT',
      photoFile: null,
      photoPreview: null,
      photoHash: '',
      proofHash: '',
      lat: 0,
      lng: 0,
      accuracy: 0,
      checkpointId: '',
      checkpointOrder: 0,
      useCurrentLocation: true,
    };
    this.showGpsInfo = false;
  }

  // Vérifier si on peut vérifier une preuve
  canVerifyProof(): boolean {
    if (this.verificationMethod === 'transaction') {
      return !!this.verificationData.transactionId;
    } else if (this.verificationMethod === 'manual') {
      return !!(
        this.verificationData.photoHash &&
        this.verificationData.lat &&
        this.verificationData.lng &&
        this.verificationData.timestamp
      );
    }
    return false;
  }

  // Charger une transaction
  async loadTransaction() {
    if (!this.verificationData.transactionId) {
      return;
    }

    // Trouver la transaction dans les enregistrements
    const record = this.blockchainRecords.find(
      (r) => r.transactionId === this.verificationData.transactionId,
    );

    if (record) {
      this.verificationData.step = record.step;
    } else {
      this.errorMessage = 'Transaction non trouvée';
    }
  }

  // Vérifier une preuve
  async verifyProof() {
    if (!this.canVerifyProof()) {
      this.errorMessage = 'Veuillez remplir tous les champs requis';
      return;
    }

    this.isVerifying = true;
    this.errorMessage = '';
    this.verificationResult = null;

    try {
      let verificationResult: BlockchainVerification;

      if (this.verificationMethod === 'transaction') {
        // Trouver l'enregistrement blockchain
        const record = this.blockchainRecords.find(
          (r) => r.transactionId === this.verificationData.transactionId,
        );

        if (!record) {
          throw new Error('Transaction non trouvée');
        }

        verificationResult = await this.blockchainService.verifyProof({
          lat: 14.716677,
          lng: -17.467686,
          timestamp: record.timestamp,
          step: record.step,
          blockchainRecord: record,
        });
      } else {
        throw new Error(
          'Vérification manuelle non implémentée dans cette démo',
        );
      }

      this.verificationResult = verificationResult;

      if (verificationResult.isValid) {
        this.successMessage = '✅ Preuve vérifiée avec succès !';
      } else {
        this.errorMessage = '❌ Preuve invalide';
      }
    } catch (error: any) {
      console.error('Erreur vérification:', error);
      this.errorMessage = error.message || 'Erreur lors de la vérification';
    } finally {
      this.isVerifying = false;
    }
  }

  // Réinitialiser la vérification
  resetVerification() {
    this.verificationData = {
      transactionId: '',
      photoHash: '',
      lat: 0,
      lng: 0,
      timestamp: 0,
      step: 'INIT',
    };
    this.verificationResult = null;
  }

  // Vérifier l'historique complet
  async verifyCompleteHistory() {
    if (!this.productId) {
      this.errorMessage = 'Veuillez sélectionner un produit';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    try {
      const history = await this.blockchainService.verifyCertificationHistory(
        this.productId,
      );

      if (history.valid) {
        this.successMessage = `✅ Historique complet vérifié : ${history.validProofs}/${history.totalProofs} preuves valides`;
      } else {
        this.errorMessage = `❌ Historique incomplet : ${history.invalidProofs} preuve(s) invalide(s)`;
      }
    } catch (error: any) {
      console.error('Erreur vérification historique:', error);
      this.errorMessage = error.message || 'Erreur lors de la vérification';
    } finally {
      this.isLoading = false;
    }
  }

  // Générer le QR Code
  generateQRCode() {
    if (this.productId) {
      this.qrCodeUrl = this.blockchainService.generateVerificationQRCode(
        this.productId,
      );
      this.verificationUrl = `${window.location.origin}/verify/${this.productId}`;
    }
  }

  // Télécharger le QR Code
  downloadQRCode() {
    if (!this.qrCodeUrl) return;

    const link = document.createElement('a');
    link.href = this.qrCodeUrl;
    link.download = `qrcode-${this.productId}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Copier le lien de vérification
  copyVerificationLink() {
    if (this.verificationUrl) {
      navigator.clipboard.writeText(this.verificationUrl).then(() => {
        this.successMessage = 'Lien copié dans le presse-papier !';
      });
    }
  }

  // Générer un rapport de vérification
  generateVerificationReport() {
    if (!this.productId) return;

    const report = this.blockchainService.generateVerificationReport(
      this.productId,
    );
    const blob = new Blob([report], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `verification-report-${this.productId}-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    this.successMessage = 'Rapport téléchargé avec succès !';
  }

  // Obtenir les enregistrements filtrés
  getFilteredRecords(): BlockchainRecord[] {
    let records = [...this.blockchainRecords];

    // Filtrer
    if (this.historyFilter) {
      const filter = this.historyFilter.toLowerCase();
      records = records.filter(
        (record) =>
          record.transactionId.toLowerCase().includes(filter) ||
          record.step.toLowerCase().includes(filter) ||
          record.proofHash.toLowerCase().includes(filter),
      );
    }

    // Trier
    switch (this.historySort) {
      case 'timestamp-desc':
        records.sort((a, b) => b.timestamp - a.timestamp);
        break;
      case 'timestamp-asc':
        records.sort((a, b) => a.timestamp - b.timestamp);
        break;
      case 'step':
        records.sort((a, b) => a.step.localeCompare(b.step));
        break;
    }

    return records;
  }

  // Obtenir les blocs uniques
  getUniqueBlocks(): number[] {
    const blocks = this.blockchainRecords
      .map((r) => r.blockNumber)
      .filter((b): b is number => b !== undefined);
    return [...new Set(blocks)];
  }

  // Obtenir l'icône d'étape
  getStepIcon(step: string): string {
    switch (step) {
      case 'INIT':
        return '🌱';
      case 'FOLLOW_UP':
        return '📊';
      case 'CHECKPOINT':
        return '📋';
      case 'HARVEST':
        return '🌾';
      default:
        return '📝';
    }
  }

  // Vérifier une transaction spécifique
  async verifyTransaction(transactionId: string) {
    this.verificationData.transactionId = transactionId;
    this.verificationMethod = 'transaction';
    this.activeTab = 'verify';
    await this.loadTransaction();
    await this.verifyProof();
  }

  // Voir les détails d'une transaction
  viewTransactionDetails(record: BlockchainRecord) {
    const details = `
📄 Détails de la transaction:
─────────────────────────
ID: ${record.transactionId}
Étape: ${record.step}
Horodatage: ${new Date(record.timestamp * 1000).toLocaleString()}
Hash: ${record.proofHash}
Bloc: ${record.blockNumber || 'En attente'}
Statut: ${record.verified ? '✅ Vérifié' : '⏳ En attente'}
    `;
    alert(details);
  }

  // Voir toutes les preuves
  viewAllProofs() {
    this.activeTab = 'history';
  }

  // Rafraîchir l'historique
  refreshHistory() {
    if (this.productId) {
      this.blockchainRecords =
        this.blockchainService.getProductBlockchainRecords(this.productId);
    }
  }

  getVerifiedBlockchainRecordsCount(): number {
    return this.blockchainRecords.filter((r) => r.verified).length;
  }

  // Retour
  goBack() {
    this.router.navigate(['/producer/certifications']);
  }
}

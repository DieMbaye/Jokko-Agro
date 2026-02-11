// certification-verify.component.ts - VERSION CORRIGÉE
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CertificationService } from '../../../services/certification.service';
import { BlockchainSyncService } from '../../../services/blockchain-sync.service';
import { QRCodeModule } from 'angularx-qrcode';

@Component({
  selector: 'app-certification-verify',
  standalone: true,
  imports: [CommonModule, QRCodeModule],
  templateUrl: './certification-verify.component.html',
  styleUrls: ['./certification-verify.component.css'],
})
export class CertificationVerifyComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private certificationService = inject(CertificationService);
  private blockchainSyncService = inject(BlockchainSyncService);

  certificationId: string = '';
  certification: any = null;
  verificationResult: any = null;
  currentDate = new Date();
  verificationUrl: string = '';
  isLoading = true;
  error: string | null = null;

  // Dans certification-verify.component.ts, assurez-vous que l'URL est correcte

  ngOnInit() {
    this.route.params.subscribe((params) => {
      this.certificationId = params['id'];
      // Utiliser window.location.origin pour l'URL de vérification
      this.verificationUrl = `${window.location.origin}/verify/${this.certificationId}`;
      this.verifyCertification();
    });
  }

  getEtherscanUrl(txHash: string): string {
    return `https://sepolia.etherscan.io/tx/${txHash}`;
  }

  viewOnBlockchain() {
    if (this.certification?.blockchainTransactions?.length > 0) {
      const txHash = this.certification.blockchainTransactions[0];
      window.open(this.getEtherscanUrl(txHash), '_blank');
    } else {
      this.showNotification('info', 'Aucune transaction blockchain trouvée');
    }
  }

  async verifyCertification() {
    this.isLoading = true;
    try {
      // 1. D'abord vérifier via le service de certification
      this.verificationResult =
        await this.certificationService.verifyCertification(
          this.certificationId,
        );

      // 2. Récupérer les détails de la certification
      this.certification = await this.certificationService.getCertificationById(
        this.certificationId,
      );

      // 3. Si la certification existe, vérifier aussi l'intégrité blockchain
      if (this.certification) {
        const integrityCheck =
          await this.blockchainSyncService.verifyCertificationIntegrity(
            this.certificationId,
          );
        this.certification.integrityCheck = integrityCheck;

        // Mettre à jour le score de vérification
        if (this.verificationResult) {
          this.verificationResult.score =
            integrityCheck.summary.verificationRate;
          this.verificationResult.valid = integrityCheck.valid;
        }
      }

      this.error = null;
    } catch (error: any) {
      console.error('Erreur vérification:', error);
      this.error =
        error.message || 'Impossible de vérifier cette certification';
      this.verificationResult = {
        valid: false,
        score: 0,
        warnings: [this.error || 'Certification non trouvée'],
      };
    } finally {
      this.isLoading = false;
    }
  }

  getStepIcon(step: string): string {
    const icons: { [key: string]: string } = {
      INIT: '🌱',
      FOLLOW_UP: '📈',
      HARVEST: '✂️',
      CHECKPOINT: '📍',
      FINAL: '🏁',
    };
    return icons[step] || '📋';
  }


  formatTxHash(txHash: string): string {
    if (!txHash) return '';
    return `${txHash.substring(0, 6)}...${txHash.substring(txHash.length - 4)}`;
  }

  getVerifiedCount(): number {
    if (!this.certification?.checkpoints) return 0;
    return this.certification.checkpoints.filter(
      (cp: any) => cp.blockchainVerified,
    ).length;
  }

  getIntegrityScore(): number {
    if (!this.certification?.checkpoints) return 0;
    const total = this.certification.checkpoints.length;
    const verified = this.getVerifiedCount();
    return total > 0 ? Math.round((verified / total) * 100) : 0;
  }

  printCertificate() {
    window.print();
  }

  shareCertification() {
    if (navigator.share) {
      navigator
        .share({
          title: `Certification ${this.certification?.productName || 'Produit'} - Jokko-Agro`,
          text: `Vérifiez la certification de ${this.certification?.productName} sur la blockchain`,
          url: this.verificationUrl,
        })
        .catch(() => {
          // Fallback si le partage échoue
          this.copyVerificationLink();
        });
    } else {
      this.copyVerificationLink();
    }
  }

  copyVerificationLink() {
    navigator.clipboard.writeText(this.verificationUrl);
    alert('🔗 Lien de vérification copié dans le presse-papier!');
  }



  downloadCertificate() {
    if (this.certification?.certificateUrl) {
      window.open(this.certification.certificateUrl, '_blank');
    } else {
      // Générer un certificat simple
      this.generateSimpleCertificate();
    }
  }

  private generateSimpleCertificate() {
    // Créer un contenu HTML pour le certificat
    const certificateHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Certificat - ${this.certification?.productName}</title>
          <style>
            body { font-family: Arial; padding: 40px; }
            .certificate { border: 10px solid #2d6a4f; padding: 40px; text-align: center; }
            .title { color: #2d6a4f; font-size: 32px; }
            .qr { margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="certificate">
            <h1 class="title">JOKKO-AGRO</h1>
            <h2>CERTIFICAT DE CERTIFICATION</h2>
            <p>Produit: ${this.certification?.productName}</p>
            <p>Producteur: ${this.certification?.producerName}</p>
            <p>Score: ${this.verificationResult?.score || 0}/100</p>
            <div class="qr">
              <img src="${this.certification?.qrCodeUrl || `https://chart.googleapis.com/chart?cht=qr&chs=200x200&chl=${encodeURIComponent(this.verificationUrl)}`}" />
            </div>
            <p>Vérifiez sur: ${this.verificationUrl}</p>
            <p>Date: ${new Date().toLocaleDateString()}</p>
          </div>
        </body>
      </html>
    `;

    // Ouvrir dans une nouvelle fenêtre
    const win = window.open('', '_blank');
    win?.document.write(certificateHtml);
  }

  /**
   * Obtenir le statut formaté d'un checkpoint
   */
  getCheckpointStatus(checkpoint: any): string {
    if (checkpoint.blockchainVerified) {
      return 'verified';
    }
    if (checkpoint.completed) {
      return 'pending';
    }
    return 'upcoming';
  }

  /**
   * Obtenir le texte du statut
   */
  getStatusText(checkpoint: any): string {
    if (checkpoint.blockchainVerified) {
      return 'Vérifié blockchain';
    }
    if (checkpoint.completed) {
      return 'En attente de vérification';
    }
    return 'À venir';
  }

  /**
   * Voir une photo en plein écran
   */
  viewPhoto(photoUrl: string) {
    // Ouvrir dans une nouvelle fenêtre
    window.open(photoUrl, '_blank');

    // Alternative : créer un modal
    // this.showPhotoModal(photoUrl);
  }

  /**
   * Afficher une photo dans un modal
   */
  private showPhotoModal(photoUrl: string) {
    const modalHtml = `
    <div style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.9); display:flex; justify-content:center; align-items:center; z-index:10000; cursor:pointer;" onclick="this.remove()">
      <img src="${photoUrl}" style="max-width:90%; max-height:90%; object-fit:contain;" alt="Photo checkpoint">
      <button style="position:absolute; top:20px; right:20px; background:white; border:none; border-radius:50%; width:40px; height:40px; font-size:20px; cursor:pointer;" onclick="this.parentElement.remove()">✕</button>
    </div>
  `;

    const div = document.createElement('div');
    div.innerHTML = modalHtml;
    document.body.appendChild(div);
  }

  /**
   * Copier dans le presse-papier
   */
  async copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);

      // Afficher une notification
      this.showNotification('success', 'CID copié dans le presse-papier !');
    } catch (err) {
      // Fallback pour les anciens navigateurs
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);

      this.showNotification('success', 'CID copié dans le presse-papier !');
    }
  }

  /**
   * Afficher une notification
   */
  private showNotification(
    type: 'success' | 'error' | 'info',
    message: string,
  ) {
    // Créer la notification
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px;">
      <span style="font-size:20px;">${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
      <span>${message}</span>
    </div>
  `;

    // Styles
    Object.assign(notification.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      padding: '12px 20px',
      background:
        type === 'success'
          ? '#2d6a4f'
          : type === 'error'
            ? '#dc2626'
            : '#3b82f6',
      color: 'white',
      borderRadius: '8px',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
      zIndex: '10001',
      animation: 'slideIn 0.3s ease-out',
    });

    document.body.appendChild(notification);

    // Supprimer après 3 secondes
    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease-in';
      setTimeout(() => notification.remove(), 300);
    }, 3000);

    // Ajouter les animations si elles n'existent pas
    this.addNotificationStyles();
  }

  /**
   * Ajouter les styles pour les notifications
   */
  private addNotificationStyles() {
    if (document.getElementById('notification-styles')) return;

    const style = document.createElement('style');
    style.id = 'notification-styles';
    style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }
  `;
    document.head.appendChild(style);
  }

  /**
   * Exporter les données (compléter la méthode)
   */
  exportData() {
    if (!this.certification) return;

    const data = {
      certification: this.certification,
      verification: this.verificationResult,
      verifiedAt: new Date().toISOString(),
      verificationUrl: this.verificationUrl,
      checkpoints: this.certification.checkpoints?.map((cp: any) => ({
        title: cp.title,
        step: cp.step,
        completedAt: cp.completedAt,
        verified: cp.blockchainVerified,
        txHash: cp.blockchainTransactionId,
        ipfsCID: cp.ipfsCID,
        location: cp.location,
      })),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `certification-${this.certificationId}-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    window.URL.revokeObjectURL(url);

    this.showNotification('success', 'Données exportées avec succès !');
  }

  /**
   * Vérifier une transaction (amélioration)
   */
  async verifyTransaction(txHash: string) {
    try {
      this.isLoading = true;
      const result = await this.blockchainSyncService.syncTransaction({
        txHash,
        certificationId: this.certificationId,
      });

      if (result.verified) {
        this.showNotification(
          'success',
          '✅ Transaction vérifiée avec succès sur la blockchain !',
        );
        // Recharger les données
        await this.verifyCertification();
      } else if (result.updated) {
        this.showNotification(
          'info',
          '⏳ Transaction mise à jour, vérification en cours...',
        );
      } else {
        this.showNotification(
          'info',
          '⏳ Transaction en attente de confirmation...',
        );
      }
    } catch (error) {
      console.error('Erreur vérification transaction:', error);
      this.showNotification(
        'error',
        '❌ Erreur lors de la vérification de la transaction',
      );
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Vérifier l'intégrité d'une certification
   */
  async verifyCertificationIntegrity() {
    if (!this.certification) return;

    try {
      this.isLoading = true;
      const integrity =
        await this.blockchainSyncService.verifyCertificationIntegrity(
          this.certificationId,
        );
      this.certification.integrityCheck = integrity;

      if (integrity.valid) {
        this.showNotification(
          'success',
          `✅ Intégrité vérifiée : ${integrity.summary.verificationRate}% des checkpoints sont valides`,
        );
      } else {
        this.showNotification(
          'info',
          `⚠️ Intégrité partielle : ${integrity.summary.verificationRate}% des checkpoints sont valides`,
        );
      }
    } catch (error) {
      console.error('Erreur vérification intégrité:', error);
      this.showNotification(
        'error',
        "❌ Erreur lors de la vérification de l'intégrité",
      );
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Rafraîchir les données
   */
  async refreshData() {
    this.showNotification('info', '🔄 Rafraîchissement des données...');
    await this.verifyCertification();
  }

  /**
   * Signaler un problème
   */
  reportIssue() {
    const subject = encodeURIComponent(
      `Problème de certification - ${this.certificationId}`,
    );
    const body = encodeURIComponent(`
    Certification ID: ${this.certificationId}
    Produit: ${this.certification?.productName}
    Date: ${new Date().toLocaleString()}

    Description du problème:

  `);

    window.location.href = `mailto:support@jokko-agro.com?subject=${subject}&body=${body}`;
    this.showNotification('info', '📧 Ouverture du client email...');
  }

  /**
   * Obtenir l'icône du statut
   */
  getStatusIcon(status: string): string {
    const icons: { [key: string]: string } = {
      verified: '✅',
      pending: '⏳',
      upcoming: '⏰',
      completed: '✓',
      failed: '❌',
    };
    return icons[status] || '📋';
  }

  /**
   * Formater la date relative
   */
  getRelativeDate(date: Date | string): string {
    if (!date) return '';

    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const now = new Date();
    const diffTime = dateObj.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return `Il y a ${Math.abs(diffDays)} jours`;
    } else if (diffDays === 0) {
      return "Aujourd'hui";
    } else if (diffDays === 1) {
      return 'Demain';
    } else {
      return `Dans ${diffDays} jours`;
    }
  }
}

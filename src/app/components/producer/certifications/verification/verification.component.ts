// verification.component.ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { CertificationService } from 'src/app/services/certification.service';
import { Certification } from 'src/app/interfaces/certification.interfaces';

@Component({
  selector: 'app-verification',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './verification.component.html',
  styleUrls: ['./verification.component.css'],
})
export class VerificationComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private certificationService = inject(CertificationService);

  certification: Certification | null = null;
  isLoading = true;
  today = new Date();

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      await this.loadCertification(id);
    }
  }

  async loadCertification(id: string) {
    try {
      this.certification = await this.certificationService.getCertification(id);
    } catch (error) {
      console.error('Erreur chargement certification:', error);
      this.certification = null;
    } finally {
      this.isLoading = false;
    }
  }

  getVerificationClass(): string {
    if (!this.certification) return 'invalid';

    switch (this.certification.verificationStatus) {
      case 'auto_verified':
      case 'manually_verified':
        return 'valid';
      case 'pending':
        return 'pending';
      default:
        return 'invalid';
    }
  }

  getVerificationIcon(): string {
    switch (this.getVerificationClass()) {
      case 'valid':
        return '✅';
      case 'pending':
        return '⏳';
      default:
        return '❌';
    }
  }

  getVerificationText(): string {
    switch (this.getVerificationClass()) {
      case 'valid':
        return 'Certification validée';
      case 'pending':
        return 'Certification en cours';
      default:
        return 'Certification non valide';
    }
  }

  getQRCodeUrl(): string {
    if (!this.certification) return '';
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
      JSON.stringify({
        id: this.certification.id,
        type: 'certification',
        url: `${window.location.origin}/verify/${this.certification.id}`,
        timestamp: new Date().toISOString(),
      }),
    )}`;
  }

  downloadCertificate() {
    alert('Téléchargement du certificat à implémenter');
  }
}

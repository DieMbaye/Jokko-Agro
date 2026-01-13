// certification-detail.component.ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CertificationService } from 'src/app/services/certification.service';
import { Certification } from 'src/app/services/certification.interfaces';

@Component({
  selector: 'app-certification-detail',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './certification-detail.html'
})
export class CertificationDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private certificationService = inject(CertificationService);

  certification: Certification | null = null;
  isLoading = true;
  activeTab: 'overview' | 'checkpoints' | 'proofs' | 'product' = 'overview';

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigate(['/producer/certifications']);
      return;
    }

    try {
      this.certification = await this.certificationService.getCertification(id);
    } catch (error) {
      console.error('Erreur:', error);
      this.router.navigate(['/producer/certifications']);
    } finally {
      this.isLoading = false;
    }
  }

  // Méthodes utilitaires...
}

// components/access-denied/access-denied.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from 'src/app/services/auth.service';

@Component({
  selector: 'app-access-denied',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="access-denied-container">
      <div class="error-content">
        <h1>🚫 Accès Refusé</h1>

        <div class="error-message">
          <p *ngIf="attemptedUrl">
            <strong>URL tentée:</strong> {{ attemptedUrl }}
          </p>
          <p *ngIf="requiredRole">
            <strong>Rôle requis:</strong> {{ requiredRole === 'producteur' ? 'Producteur' : 'Acheteur' }}
          </p>
          <p *ngIf="currentRole">
            <strong>Votre rôle:</strong> {{ currentRole === 'producer' ? 'Producteur' : 'Acheteur' }}
          </p>

          <p class="warning">
            Vous n'avez pas les permissions nécessaires pour accéder à cette page.
          </p>
        </div>

        <div class="actions">
          <button class="btn-primary" (click)="goToDashboard()">
            Retour au Tableau de bord
          </button>
          <button class="btn-secondary" (click)="goToLogin()">
            Se connecter avec un autre compte
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .access-denied-container {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 20px;
    }

    .error-content {
      background: white;
      border-radius: 20px;
      padding: 40px;
      max-width: 600px;
      width: 100%;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      text-align: center;
    }

    h1 {
      color: #e74c3c;
      font-size: 2.5rem;
      margin-bottom: 30px;
      font-weight: 700;
    }

    .error-message {
      background: #f8f9fa;
      border-radius: 10px;
      padding: 20px;
      margin-bottom: 30px;
      text-align: left;
    }

    .error-message p {
      margin: 10px 0;
      color: #333;
    }

    .error-message strong {
      color: #555;
    }

    .warning {
      color: #e74c3c !important;
      font-weight: 600;
      margin-top: 20px !important;
      border-top: 1px solid #eee;
      padding-top: 15px;
    }

    .actions {
      display: flex;
      flex-direction: column;
      gap: 15px;
    }

    .btn-primary, .btn-secondary {
      padding: 15px 30px;
      border: none;
      border-radius: 50px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
    }

    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }

    .btn-primary:hover {
      transform: translateY(-3px);
      box-shadow: 0 10px 20px rgba(102, 126, 234, 0.4);
    }

    .btn-secondary {
      background: transparent;
      color: #667eea;
      border: 2px solid #667eea;
    }

    .btn-secondary:hover {
      background: #667eea;
      color: white;
    }

    @media (max-width: 768px) {
      .error-content {
        padding: 20px;
      }

      h1 {
        font-size: 2rem;
      }

      .actions {
        flex-direction: column;
      }
    }
  `]
})
export class AccessDeniedComponent implements OnInit {
  attemptedUrl: string | null = null;
  requiredRole: string | null = null;
  currentRole: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService
  ) {}

  ngOnInit() {
    const navigation = this.router.getCurrentNavigation();
    if (navigation?.extras.state) {
      this.attemptedUrl = navigation.extras.state['attemptedUrl'];
      this.requiredRole = navigation.extras.state['requiredRole'];
      this.currentRole = navigation.extras.state['currentRole'];
    }
  }

  goToDashboard() {
    const role = this.authService.getUserRole();
    if (role === 'producer') {
      this.router.navigate(['/producer/dashboard']);
    } else if (role === 'buyer') {
      this.router.navigate(['/buyer/dashboard']);
    } else {
      this.router.navigate(['/select-role']);
    }
  }

  goToLogin() {
    this.authService.logout();
  }
}

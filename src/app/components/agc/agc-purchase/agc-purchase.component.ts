import { Component, EventEmitter, Output, inject, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AGCService } from '../../../services/agc.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-agc-purchase',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './agc-purchase.component.html',
  styleUrls: ['./agc-purchase.component.css'],
})
export class AGCPurchaseComponent {
  private agcService = inject(AGCService);
  private authService = inject(AuthService);
  @Input() visible = false;
  @Output() close = new EventEmitter<void>();
  @Output() purchased = new EventEmitter<void>();

  showModal = false;
  fiatAmount: number = 1000;
  agcAmount: number = 10;
  selectedMethod: string = 'wave';
  isProcessing = false;
  errorMessage = '';
  successMessage = '';
  currentBalance: number | null = null;

  paymentMethods = [
    {
      id: 'wave',
      name: 'Wave',
      icon: '/assets/images/wave-money-logo.png',
    },
    {
      id: 'orange_money',
      name: 'Orange Money',
      icon: '/assets/images/orange-logo.png',
    },
    {
      id: 'free_money',
      name: 'Free Money',
      icon: '/assets/images/free-money.jpeg',
    },
    {
      id: 'card',
      name: 'Carte',
      icon: '/assets/images/card_agc.png',
    },
  ];

  get canPurchase(): boolean {
    return this.fiatAmount >= 100 && !!this.selectedMethod;
  }

  constructor() {
    // Charger le solde actuel
    this.agcService.balance$.subscribe((balance) => {
      this.currentBalance = balance;
    });
  }


  private resetForm(): void {
    this.fiatAmount = 1000;
    this.selectedMethod = 'wave';
    this.errorMessage = '';
    this.successMessage = '';
    this.isProcessing = false;
  }

  calculateAGC(): void {
    this.agcAmount = this.agcService.convertFiatToAGC(this.fiatAmount);
  }

  async purchaseAGC(): Promise<void> {
    const user = this.authService.getUserData();
    if (!user) {
      this.errorMessage = 'Vous devez être connecté';
      return;
    }

    this.isProcessing = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      const result = await this.agcService.purchaseAGC(
        user.uid,
        this.fiatAmount,
        this.selectedMethod as any,
      );

      if (result.success) {
        this.successMessage = `Achat de ${result.agcAmount} AGC initié ! Vous recevrez une confirmation sous peu.`;

        // Émettre l'événement purchased
        this.purchased.emit();

        // Fermer le modal après 3 secondes
        setTimeout(() => {
          this.showModal = false;
          this.close.emit(); // Émettre l'événement close
        }, 3000);
      } else {
        this.errorMessage = result.error || "Erreur lors de l'achat";
      }
    } catch (error: any) {
      this.errorMessage = error.message || "Erreur lors de l'achat";
    } finally {
      this.isProcessing = false;
    }
  }

  closeModal(event: MouseEvent): void {
    if (
      (event.target as HTMLElement).classList.contains('agc-purchase-modal')
    ) {
      this.showModal = false;
      this.close.emit(); // Émettre l'événement close
    }
  }

  // Méthode pour fermer le modal depuis le bouton
  closeModalManually(): void {
    this.showModal = false;
    this.close.emit();
  }
}

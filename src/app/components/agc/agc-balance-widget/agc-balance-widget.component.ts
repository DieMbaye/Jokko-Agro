import { Component, inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AGCService } from '../../../services/agc.service';
import { AGCPurchaseComponent } from '../agc-purchase/agc-purchase.component';

@Component({
  selector: 'app-agc-balance-widget',
  standalone: true,
  imports: [CommonModule, AGCPurchaseComponent],
  templateUrl: './agc-balance-widget.component.html',
  styleUrls: ['./agc-balance-widget.component.css'],
})
export class AGCBalanceWidgetComponent {
  private agcService = inject(AGCService);

  @ViewChild('purchaseModal') purchaseModal!: AGCPurchaseComponent;

  balance: number = 0;
  showTooltip = false;

  constructor() {
    this.agcService.balance$.subscribe((balance) => {
      this.balance = balance;
    });
  }

  toggleTooltip(): void {
    this.showTooltip = !this.showTooltip;
  }


  showPurchase = false;

  openPurchaseModal(): void {
    this.showTooltip = false;
    this.showPurchase = true;
  }

  closePurchaseModal(): void {
    this.showPurchase = false;
  }
}

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FirebaseService } from '../../services/firebase.service';
import { AuthService } from '../../services/auth.service';

interface Purchase {
  id: string;
  product: string;
  productId: string;
  producer: string;
  producerId: string;
  date: string;
  amount: number;
  status: 'pending' | 'shipping' | 'delivered';
  certified: boolean;

  // ⭐ rating
  rated: boolean;
  ratingValue: number;
}

@Component({
  selector: 'app-buyer-purchases',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './buyer-purchases.component.html',
  styleUrls: ['./buyer-purchases.component.css']
})
export class BuyerPurchasesComponent implements OnInit {

  purchases: Purchase[] = [];
  isLoading = true;

  constructor(
    private firebaseService: FirebaseService,
    private authService: AuthService
  ) {}

  async ngOnInit() {
    await this.loadPurchases();
  }

  async loadPurchases() {
    this.isLoading = true;

    const sales = await this.firebaseService.getBuyerSales();
    const ratings = await this.firebaseService.getMyRatings();

    this.purchases = sales.map(sale => {
      const rating = ratings.find(r => r.productId === sale.productId);

      return {
        ...sale,
        rated: !!rating,
        ratingValue: rating?.stars ?? 0
      };
    });

    this.isLoading = false;
  }

  // ⭐ cliquer une étoile
  async rate(purchase: Purchase, stars: number) {
    if (purchase.status !== 'delivered' || purchase.rated) return;

    await this.firebaseService.submitRating({
      productId: purchase.productId,
      producerId: purchase.producerId,
      stars,
      buyerId: this.authService.getUserData()?.uid ?? ''
    });

    purchase.rated = true;
    purchase.ratingValue = stars;
  }

  starsArray() {
    return [1, 2, 3, 4, 5];
  }

  statusLabel(status: string) {
    switch (status) {
      case 'pending': return 'En attente';
      case 'shipping': return 'En cours';
      case 'delivered': return 'Livré';
      default: return status;
    }
  }
}

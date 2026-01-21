import { inject, Injectable } from "@angular/core";
import { addDoc, collection, Firestore } from "firebase/firestore";

@Injectable({ providedIn: 'root' })
export class RatingService {
  private readonly firestore = inject(Firestore);

  async submitRating(data: {
    productId: string;
    producerId: string;
    buyerId: string;
    stars: number;
  }) {
    await addDoc(collection(this.firestore, 'ratings'), {
      ...data,
      createdAt: new Date()
    });
  }
}

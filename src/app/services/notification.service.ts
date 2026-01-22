import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  doc,
  serverTimestamp
} from '@angular/fire/firestore';
import { Auth, user } from '@angular/fire/auth';
import { Observable } from 'rxjs';

export interface AppNotification {
  id?: string;
  userId: string;
  title: string;
  message: string;
  type: 'order' | 'product' | 'system';
  link?: string;
  read: boolean;
  createdAt?: any;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {

  constructor(
    private firestore: Firestore,
    private auth: Auth
  ) {}

  // 🔔 Écouter les notifications de l'utilisateur connecté (temps réel)
  listenUserNotifications(): Observable<AppNotification[]> {
    return new Observable(observer => {
      const authSub = user(this.auth).subscribe(u => {
        if (!u) {
          observer.next([]);
          return;
        }

        const q = query(
          collection(this.firestore, 'notifications'),
          where('userId', '==', u.uid),
          orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, snapshot => {
          const notifications = snapshot.docs.map(doc => ({
            id: doc.id,
            ...(doc.data() as AppNotification)
          }));

          observer.next(notifications);
        });

        // cleanup Firestore listener
        return () => unsubscribe();
      });

      // cleanup auth listener
      return () => authSub.unsubscribe();
    });
  }

  // ➕ Créer une notification
  async createNotification(data: {
    userId: string;
    title: string;
    message: string;
    type: 'order' | 'product' | 'system';
    link?: string;
  }): Promise<void> {
    await addDoc(collection(this.firestore, 'notifications'), {
      ...data,
      read: false,
      createdAt: serverTimestamp()
    });
  }

  // ✅ Marquer une notification comme lue
  async markAsRead(notificationId: string): Promise<void> {
    await updateDoc(
      doc(this.firestore, 'notifications', notificationId),
      { read: true }
    );
  }

  // ✅ Marquer toutes les notifications comme lues
  async markAllAsRead(userId: string): Promise<void> {
    const q = query(
      collection(this.firestore, 'notifications'),
      where('userId', '==', userId),
      where('read', '==', false)
    );

    const snap = await import('@angular/fire/firestore')
      .then(m => m.getDocs(q));

    for (const d of snap.docs) {
      await updateDoc(d.ref, { read: true });
    }
  }
}

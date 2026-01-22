import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Auth, user } from '@angular/fire/auth';
import {
  Firestore,
  collection,
  query,
  where,
  onSnapshot
} from '@angular/fire/firestore';
import { NotificationsComponent } from '../../components/notifications/notifications.component';

@Component({
  selector: 'app-buyer-settings',
  standalone: true,
  imports: [CommonModule, NotificationsComponent],
  templateUrl: './buyer-settings.component.html',
  styleUrls: ['./buyer-settings.component.css']
})
export class BuyerSettingsComponent implements OnInit {

  activeSection: 'overview' | 'notifications' | 'settings' = 'overview';
  loading = true;

  userData: any = {};
  notifications: any[] = [];
  unreadCount = 0;

  constructor(
    private auth: Auth,
    private firestore: Firestore,
    private router: Router
  ) {}

  ngOnInit(): void {
    user(this.auth).subscribe(u => {
      if (!u) return;

      this.userData.email = u.email;

      // 🔔 écouter notifications en temps réel
      const q = query(
        collection(this.firestore, 'notifications'),
        where('userId', '==', u.uid)
      );

      onSnapshot(q, snap => {
        this.notifications = snap.docs.map(d => ({
          id: d.id,
          ...d.data()
        }));
        this.unreadCount = this.notifications.filter(n => !n.read).length;
        this.loading = false;
      });
    });
  }

  goToOrders() {
    this.router.navigate(['/buyer/tracking']);
  }

  logout() {
    this.auth.signOut();
  }

  markAsRead(n: any) {
    n.read = true;
  }
}

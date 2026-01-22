import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './notifications.component.html',
  styleUrls: ['./notifications.component.css']
})
export class NotificationsComponent implements OnInit {

  notifications: any[] = [];

  constructor(private notifService: NotificationService) {}

  ngOnInit(): void {
    this.notifService.listenUserNotifications()
      .subscribe(data => this.notifications = data);
  }

  markRead(n: any) {
    if (!n.read) {
      this.notifService.markAsRead(n.id);
    }
  }
}

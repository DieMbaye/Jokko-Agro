import { Injectable } from '@angular/core';
import { Firestore, doc, docData, updateDoc } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class UserSettingsService {
  constructor(private fs: Firestore, private auth: Auth) {}

  getUser(): Observable<any> {
    const uid = this.auth.currentUser?.uid;
    if (!uid) throw new Error('Utilisateur non connecté');

    return docData(doc(this.fs, `users/${uid}`), { idField: 'uid' });
  }

  updateUser(data: any) {
    const uid = this.auth.currentUser?.uid;
    if (!uid) throw new Error('Utilisateur non connecté');

    return updateDoc(doc(this.fs, `users/${uid}`), data);
  }
}

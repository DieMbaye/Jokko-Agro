import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';

import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideFirestore, getFirestore } from '@angular/fire/firestore';
import { provideAuth, getAuth } from '@angular/fire/auth';

import { App } from './app/app';
import { routes } from './app/app.routes';
import { environment } from './environments/environment';

bootstrapApplication(App, {
  providers: [
    provideRouter(routes), // ✅ OBLIGATOIRE
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideFirestore(() => getFirestore()),
    provideAuth(() => getAuth())
  ]
}).catch(err => console.error(err));

import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';

import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideFirestore, getFirestore } from '@angular/fire/firestore';
import { provideAuth, getAuth } from '@angular/fire/auth';

import { App } from './app/app';
import { routes } from './app/app.routes';
import { environment } from './environments/environment';
import { appConfig } from './app/app.config';

import { provideStorage, getStorage } from '@angular/fire/storage';
import { browserLocalPersistence } from '@angular/fire/auth';
bootstrapApplication(App, {
  providers: [
    provideRouter(routes),
    provideHttpClient(),

    // ✅ Configuration Firebase avec persistance
    provideFirebaseApp(() => {
      const app = initializeApp(environment.firebase);
      return app;
    }),

    // main.ts - modifiez la section provideAuth
    provideAuth(() => {
      const auth = getAuth();

      // ✅ Configuration SYNCHRONE de la persistance
      auth.setPersistence(browserLocalPersistence).catch((error) => {
        console.error('Erreur de persistance Firebase:', error);
      });

      return auth;
    }),

    provideFirestore(() => getFirestore()),
    provideStorage(() => getStorage()),

    ...appConfig.providers,
  ],
}).catch((err) => console.error(err));

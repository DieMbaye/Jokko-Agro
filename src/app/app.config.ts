import { ApplicationConfig, APP_INITIALIZER } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { AppInitService } from './services/app-init.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes)
  ]
};

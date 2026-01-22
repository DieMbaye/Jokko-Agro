import { Injectable } from '@angular/core';

export type AppLanguage = 'fr' | 'en' | 'es';

@Injectable({
  providedIn: 'root'
})
export class LanguageService {

  setLanguage(lang: AppLanguage) {
    localStorage.setItem('app_lang', lang);
    location.reload(); // simple et efficace
  }

  getLanguage(): AppLanguage {
    return (localStorage.getItem('app_lang') as AppLanguage) ?? 'fr';
  }
}

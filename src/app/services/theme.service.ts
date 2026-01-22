import { Injectable } from '@angular/core';

export type ThemeMode = 'light' | 'dark' | 'auto';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {

  applyTheme(theme: ThemeMode) {
    const body = document.body;

    body.classList.remove('light-theme', 'dark-theme');

    if (theme === 'dark') {
      body.classList.add('dark-theme');
    } else if (theme === 'light') {
      body.classList.add('light-theme');
    } else {
      // auto
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      body.classList.add(prefersDark ? 'dark-theme' : 'light-theme');
    }

    localStorage.setItem('app_theme', theme);
  }

  initTheme() {
    const savedTheme = localStorage.getItem('app_theme') as ThemeMode | null;
    this.applyTheme(savedTheme ?? 'light');
  }
}

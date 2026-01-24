// home-page.ts - Correction
import { Component, OnInit, HostListener } from '@angular/core';
import { RouterLink } from '@angular/router';
import { VoiceAssistantComponent } from '../voice-assistant/voice-assistant';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [RouterLink, VoiceAssistantComponent, CommonModule],
  templateUrl: './home-page.html',
  styleUrls: ['./home-page.css']
})
export class HomePageComponent implements OnInit {
  // Statistiques dynamiques avec valeurs réelles
  stats = {
    farmers: 0,
    products: 0,
    transactions: 0,
    traceability: 0
  };

  // Fonctionnalités avec descriptions enrichies
  features = [
    {
      icon: '🤖',
      title: 'IA Multilingue Intelligente',
      description: 'Traduction en temps réel dans 5+ langues africaines. Chatbot expert disponible 24/7.',
      badge: 'IA',
      delay: 0.1
    },
    {
      icon: '⛓️',
      title: 'Blockchain Certifiante',
      description: 'Traçabilité totale de la plantation à la vente. QR Code infalsifiable.',
      badge: 'Sécurité',
      delay: 0.2
    },
    {
      icon: '🔐',
      title: 'Sécurité de Niveau Militaire',
      description: 'Chiffrement AES-256, authentification biométrique et protection anti-fraude.',
      badge: 'Top',
      delay: 0.3
    },
    {
      icon: '🎤',
      title: 'Assistant Vocal Local',
      description: 'Commandes vocales en Wolof, Pulaar, Sérère pour tous les producteurs.',
      badge: 'Innovation',
      delay: 0.4
    },
    {
      icon: '🖼️',
      title: 'Vision IA des Cultures',
      description: 'Détection de maladies, estimation de rendement et validation automatique.',
      badge: 'Smart',
      delay: 0.5
    },
    {
      icon: '📊',
      title: 'Marché Intelligent',
      description: 'Prix en temps réel, prédictions de marché et recommandations personnalisées.',
      badge: 'Data',
      delay: 0.6
    }
  ];

  // Technologies avec détails
  technologies = [
    {
      title: '🤖 Intelligence Artificielle',
      items: [
        'Reconnaissance vocale multilingue',
        'Traduction automatique en temps réel',
        'Analyse d\'images par deep learning',
        'Chatbot agricole expert',
        'Prédiction de rendement IA'
      ]
    },
    {
      title: '🔗 Blockchain & Sécurité',
      items: [
        'Certification immuable sur blockchain',
        'Smart Contracts automatisés',
        'Chiffrement AES-256 militaire',
        'Validation cryptographique',
        'Protection anti-fraude avancée'
      ]
    },
    {
      title: '🌍 Accessibilité & Inclusivité',
      items: [
        'Interface en 5 langues africaines',
        'Mode hors ligne complet',
        'Assistant vocal local',
        'Design adapté à tous les niveaux',
        'Optimisé bas débit'
      ]
    }
  ];

  // État pour animations
  isScrolled = false;

  ngOnInit() {
    this.animateStats();
    this.createParticles();
    this.initScrollAnimations();
  }

  // CORRECTION ICI : Supprimer le paramètre ['$event']
  @HostListener('window:scroll')
  onWindowScroll() {
    this.isScrolled = window.scrollY > 100;
  }

  animateStats() {
    const targets = {
      farmers: 12850,
      products: 45600,
      transactions: 8925000,
      traceability: 100
    };

    const duration = 2000;
    const steps = 60;
    const stepDuration = duration / steps;

    Object.keys(targets).forEach((key: string) => {
      const target = targets[key as keyof typeof targets];
      let current = 0;
      const increment = target / steps;

      const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
          this.stats[key as keyof typeof this.stats] = target;
          clearInterval(timer);
        } else {
          this.stats[key as keyof typeof this.stats] = Math.floor(current);
        }
      }, stepDuration);
    });
  }

  createParticles() {
    const container = document.querySelector('.home-container');
    if (!container) return;

    for (let i = 0; i < 20; i++) {
      const particle = document.createElement('div');
      particle.className = 'particle';

      const size = Math.random() * 60 + 20;
      particle.style.width = `${size}px`;
      particle.style.height = `${size}px`;

      const x = Math.random() * 100;
      const y = Math.random() * 100;
      particle.style.left = `${x}%`;
      particle.style.top = `${y}%`;

      const opacity = Math.random() * 0.08 + 0.02;
      particle.style.opacity = opacity.toString();

      particle.style.animation = `float ${Math.random() * 20 + 10}s ease-in-out infinite`;
      particle.style.animationDelay = `${Math.random() * 5}s`;

      container.appendChild(particle);
    }
  }

  initScrollAnimations() {
    const observerOptions = {
      threshold: 0.1,
      rootMargin: '50px'
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-fadeInUp');
        }
      });
    }, observerOptions);

    // Observer les éléments
    document.querySelectorAll('.feature-card, .tech-card, .process-step, .hero-section').forEach(el => {
      observer.observe(el);
    });
  }

  // Méthodes d'interaction
  startVoiceAssistant() {
    console.log('Assistant vocal premium démarré');
    // Implémentation spécifique
  }

  changeLanguage(lang: string) {
    console.log(`Changement de langue premium: ${lang}`);
    // Implémentation avec animations
    document.body.style.opacity = '0.5';
    setTimeout(() => {
      document.body.style.opacity = '1';
    }, 300);
  }

  showDemo() {
    console.log('Démo vidéo premium lancée');
    // Implémentation avec modal ou vidéo
    const demoUrl = 'https://example.com/demo-video';
    window.open(demoUrl, '_blank');
  }

  scrollToSection(sectionId: string) {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { FirebaseService } from '../../../services/firebase.service';
import { Product } from '../../../interfaces/data.interfaces';
// Interface pour les catégories
interface ProductCategory {
  id: string;
  name: string;
  icon: string;
}

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './products.html',
  styleUrls: ['./products.css'],
})
export class ProductsComponent implements OnInit {
  products: Product[] = [];
  filteredProducts: Product[] = [];
  isLoading = true;
  searchQuery = '';
  selectedCategory = 'all';
  selectedStatus = 'all';

  // Tableau de catégories avec icônes obligatoires
  categories: ProductCategory[] = [
    { id: 'all', name: 'Toutes les catégories', icon: '📦' },
    { id: 'vegetables', name: 'Légumes', icon: '🥦' },
    { id: 'fruits', name: 'Fruits', icon: '🍎' },
    { id: 'cereals', name: 'Céréales', icon: '🌾' },
    { id: 'tubers', name: 'Tubercules', icon: '🥔' },
    { id: 'legumes', name: 'Légumineuses', icon: '🥜' },
    { id: 'spices', name: 'Épices', icon: '🌶️' },
    { id: 'dairy', name: 'Produits laitiers', icon: '🥛' },
    { id: 'poultry', name: 'Volaille', icon: '🐔' },
  ];

  statuses = [
    { id: 'all', name: 'Tous les statuts' },
    { id: 'available', name: 'Disponible' },
    { id: 'sold_out', name: 'Épuisé' },
    { id: 'draft', name: 'Brouillon' },
  ];

  sortBy = 'recent';
  sortOptions = [
    { id: 'recent', name: 'Plus récent' },
    { id: 'oldest', name: 'Plus ancien' },
    { id: 'price_low', name: 'Prix croissant' },
    { id: 'price_high', name: 'Prix décroissant' },
    { id: 'sales', name: 'Meilleures ventes' },
    { id: 'rating', name: 'Meilleures notes' },
  ];

  constructor(
    private authService: AuthService,
    private firebaseService: FirebaseService,
  ) {}

  async ngOnInit() {
    await this.loadProducts();
  }

  async loadProducts() {
    this.isLoading = true;

    try {
      const user = this.authService.getCurrentUser();
      if (!user) {
        this.isLoading = false;
        return;
      }

      this.products = await this.firebaseService.getProducerProducts(user.uid);

      this.filteredProducts = [...this.products];
      this.applyFilters();
    } catch (error) {
      console.error('Erreur lors du chargement des produits:', error);
      this.loadFallbackData();
    } finally {
      this.isLoading = false;
    }
  }

  private loadFallbackData() {
    this.products = [
      {
        id: '1',
        name: 'Tomates Bio',
        category: 'vegetables',
        description: 'Tomates biologiques cultivées localement',
        price: 1500,
        quantity: 50,
        unit: 'kg',
        certifications: ['organic', 'local'],
        isOrganic: true,
        harvestDate: '2024-01-10',
        storageConditions: 'Conserver au frais',
        location: 'Dakar, Sénégal',
        contactPhone: '771234567',
        minOrderQuantity: 1,
        producerId: 'producer1',
        producerName: 'Producteur Test',
        producerPhone: '771234567',
        images: [],
        status: 'available',
        views: 100,
        sales: 45,
        rating: 4.8,
        isActive: true,
        createdAt: new Date('2024-01-10'),
        updatedAt: new Date('2024-01-15'),
        badges: [],
      },
    ];
    this.filteredProducts = [...this.products];
    this.applyFilters();
  }

  applyFilters() {
    let filtered = [...this.products];

    if (this.searchQuery) {
      filtered = filtered.filter(
        (product) =>
          product.name.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
          product.description
            ?.toLowerCase()
            .includes(this.searchQuery.toLowerCase()),
      );
    }

    if (this.selectedCategory !== 'all') {
      filtered = filtered.filter(
        (product) => product.category === this.selectedCategory,
      );
    }

    if (this.selectedStatus !== 'all') {
      filtered = filtered.filter(
        (product) => product.status === this.selectedStatus,
      );
    }

    filtered.sort((a, b) => {
      switch (this.sortBy) {
        case 'recent':
          // Tri par date de mise à jour (récent → ancien)
          const updatedA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const updatedB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return updatedB - updatedA;

        case 'oldest':
          // Tri par date de mise à jour (ancien → récent)
          const oldestA = a.updatedAt
            ? new Date(a.updatedAt).getTime()
            : Date.now();
          const oldestB = b.updatedAt
            ? new Date(b.updatedAt).getTime()
            : Date.now();
          return oldestA - oldestB;

        case 'price_low':
          // Prix croissant (bas → haut)
          return (a.price || 0) - (b.price || 0);

        case 'price_high':
          // Prix décroissant (haut → bas)
          return (b.price || 0) - (a.price || 0);

        case 'sales':
          // Ventes décroissantes (plus vendu → moins vendu)
          return (b.sales || 0) - (a.sales || 0);

        case 'rating':
          // Note décroissante (meilleure note → pire note)
          return (b.rating || 0) - (a.rating || 0);

        default:
          return 0;
      }
    });

    this.filteredProducts = filtered;
  }

  getCategoryName(categoryId: string): string {
    const category = this.categories.find((c) => c.id === categoryId);
    return category ? category.name : categoryId;
  }

  getCategoryIcon(categoryId: string): string {
    const category = this.categories.find((c) => c.id === categoryId);
    return category ? category.icon : '📦';
  }

  getStatusText(status: string): string {
    switch (status) {
      case 'available':
        return 'Disponible';
      case 'sold_out':
        return 'Épuisé';
      case 'inactive':
        return 'Inactif';
      default:
        return status;
    }
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'available':
        return 'status-available';
      case 'sold_out':
        return 'status-sold-out';
      case 'inactive':
        return 'status-inactive';
      default:
        return '';
    }
  }

  getTotalValue(product: Product): number {
    return product.price * product.quantity;
  }

  async editProduct(productId: string) {
    console.log('Modifier produit:', productId);
  }

  async deleteProduct(productId: string) {
    if (
      confirm(
        'Êtes-vous sûr de vouloir supprimer ce produit ? Cette action est irréversible.',
      )
    ) {
      try {
        await this.firebaseService.deleteProduct(productId);
        await this.loadProducts();
      } catch (error) {
        alert('Erreur lors de la suppression du produit');
      }
    }
  }

  async duplicateProduct(productId: string) {
    console.log('Dupliquer produit:', productId);
  }

  async updateStatus(productId: string, newStatus: string) {
    try {
      await this.firebaseService.updateProductStatus(
        productId,
        newStatus as Product['status'],
      );
      await this.loadProducts();
    } catch (error) {
      alert('Erreur lors de la mise à jour du statut');
    }
  }

  getTotalProductsCount(): number {
    return this.products.length;
  }

  getAvailableProductsCount(): number {
    return this.products.filter((p) => p.status === 'available').length;
  }

  getTotalValueSum(): number {
    return this.products.reduce(
      (sum, product) => sum + this.getTotalValue(product),
      0,
    );
  }

  getTopSellingProducts(): Product[] {
    return [...this.products].sort((a, b) => b.sales - a.sales).slice(0, 3);
  }

  handleVoiceCommand(command: string) {
    const lowerCommand = command.toLowerCase();

    if (lowerCommand.includes('ajouter') || lowerCommand.includes('nouveau')) {
      window.location.href = '/producer/add-product';
    } else if (
      lowerCommand.includes('rechercher') &&
      lowerCommand.includes('tomates')
    ) {
      this.searchQuery = 'tomates';
      this.applyFilters();
    } else if (
      lowerCommand.includes('filtrer') &&
      lowerCommand.includes('disponible')
    ) {
      this.selectedStatus = 'available';
      this.applyFilters();
    }
  }
}

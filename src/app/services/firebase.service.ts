import { Injectable } from '@angular/core';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  Firestore,
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  addDoc,
  query,
  where,
  getDocs,
  orderBy,
  serverTimestamp,
  deleteDoc,
  increment,
  writeBatch,
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Product } from './data.interfaces';

import { environment } from '../../environments/environment';

// Interface pour les données utilisateur (garder seulement celle-ci)
export interface FirebaseUserData {
  uid: string;
  email: string;
  fullName: string;
  phone: string;
  role: 'producer' | 'buyer';
  createdAt: Date;
  location: string;
  address?: any;
  reputation?: number;
}

@Injectable({
  providedIn: 'root',
})
export class FirebaseService {
  private app = initializeApp(environment.firebase);
  private auth = getAuth(this.app);
  public firestore = getFirestore(this.app);
  private storage = getStorage(this.app);

  currentUser: User | null = null;
  userData: FirebaseUserData | null = null;
  isLoading = true;
  getProducers: any;

  constructor() {
    this.setupAuthPersistence();
    this.setupAuthListener();
  }

  private async setupAuthPersistence() {
    try {
      await setPersistence(this.auth, browserLocalPersistence);
    } catch (error) {
      console.error('Erreur de configuration de persistance:', error);
    }
  }

  private setupAuthListener() {
    onAuthStateChanged(this.auth, async (user) => {
      this.isLoading = true;
      this.currentUser = user;

      if (user) {
        await this.loadUserData(user.uid);
      } else {
        console.log('Aucun utilisateur connecté');
        this.userData = null;
      }

      this.isLoading = false;
    });
  }

  isAuthInitialized(): boolean {
    return !this.isLoading && this.auth.currentUser !== undefined;
  }

  getCurrentAuthUser(): User | null {
    return this.auth.currentUser;
  }

  async register(userData: any): Promise<{ success: boolean; error?: string }> {
    try {
      const userCredential = await createUserWithEmailAndPassword(
        this.auth,
        userData.email,
        userData.password
      );

      const userDataToSave: any = {
        uid: userCredential.user.uid,
        email: userData.email,
        fullName: userData.fullName || '',
        phone: userData.phone || '',
        role: userData.role || 'buyer',
        createdAt: serverTimestamp(),
        location: userData.location || 'Dakar, Sénégal',
      };

      if (userData.role === 'producer') {
        userDataToSave.reputation = 0;
      }

      console.log('Données utilisateur à enregistrer:', userDataToSave);

      await setDoc(
        doc(this.firestore, 'users', userCredential.user.uid),
        userDataToSave
      );

      // Stocker localement avec les données de base
      this.userData = {
        uid: userCredential.user.uid,
        email: userData.email,
        fullName: userData.fullName || '',
        phone: userData.phone || '',
        role: userData.role || 'buyer',
        createdAt: new Date(),
        location: userData.location || 'Dakar, Sénégal',
        reputation: userData.role === 'producer' ? 0 : undefined,
      };

      return { success: true };
    } catch (error: any) {
      console.error("Erreur d'inscription:", error);
      return {
        success: false,
        error: this.getFirebaseErrorMessage(error.code),
      };
    }
  }

  async login(
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await signInWithEmailAndPassword(this.auth, email, password);
      return { success: true };
    } catch (error: any) {
      console.error('Erreur de connexion:', error);
      return {
        success: false,
        error: this.getFirebaseErrorMessage(error.code),
      };
    }
  }

  async logout(): Promise<void> {
    try {
      await signOut(this.auth);
    } catch (error) {
      console.error('Erreur de déconnexion:', error);
      throw error;
    }
  }

  private async loadUserData(uid: string): Promise<void> {
    try {
      this.isLoading = true;

      const userDoc = await getDoc(doc(this.firestore, 'users', uid));

      if (userDoc.exists()) {
        const data = userDoc.data();

        const userData: FirebaseUserData = {
          uid: data['uid'] || uid,
          email: data['email'] || '',
          fullName: data['fullName'] || '',
          phone: data['phone'] || '',
          role: data['role'] || 'buyer',
          createdAt: data['createdAt']?.toDate() || new Date(),
          location: data['location'] || 'Dakar, Sénégal',
        };

        if (data['role'] === 'producer' && data['reputation'] !== undefined) {
          userData.reputation = data['reputation'];
        }

        this.userData = userData;

        localStorage.setItem('userData', JSON.stringify(this.userData));
      } else {
        console.warn(
          'Document utilisateur non trouvé dans Firestore pour uid:',
          uid
        );

        const currentUser = this.auth.currentUser;
        if (currentUser && currentUser.uid === uid) {
          console.log('Création du document utilisateur manquant...');
          await this.createMissingUserDocument(uid);
        }
      }
    } catch (error) {
      console.error('Erreur de chargement des données utilisateur:', error);

      const cachedData = localStorage.getItem('userData');
      if (cachedData) {
        try {
          this.userData = JSON.parse(cachedData);
          console.log('Données utilisateur restaurées depuis localStorage');
        } catch (parseError) {
          console.error(
            'Erreur de parsing des données localStorage:',
            parseError
          );
        }
      }
    } finally {
      this.isLoading = false;
    }
  }

  private async createMissingUserDocument(uid: string): Promise<void> {
    try {
      const currentUser = this.auth.currentUser;
      if (!currentUser) return;

      const userDataToSave: any = {
        uid: uid,
        email: currentUser.email || '',
        fullName: currentUser.displayName || 'Utilisateur',
        phone: '',
        role: 'buyer',
        createdAt: serverTimestamp(),
        location: 'Dakar, Sénégal',
      };

      await setDoc(doc(this.firestore, 'users', uid), userDataToSave);
      console.log('Document utilisateur créé pour:', uid);

      await this.loadUserData(uid);
    } catch (error) {
      console.error(
        'Erreur lors de la création du document utilisateur:',
        error
      );
    }
  }

  async updateUserRole(uid: string, role: 'producer' | 'buyer'): Promise<void> {
    try {
      await updateDoc(doc(this.firestore, 'users', uid), { role });
      if (this.userData) {
        this.userData.role = role;
        localStorage.setItem('userData', JSON.stringify(this.userData));
      }
    } catch (error) {
      console.error('Erreur de mise à jour du rôle:', error);
      throw error;
    }
  }

  isAuthenticated(): boolean {
    return !!this.currentUser;
  }

  getUserRole(): 'producer' | 'buyer' | null {
    return this.userData?.role || null;
  }

  private getFirebaseErrorMessage(code: string): string {
    const errorMessages: { [key: string]: string } = {
      'auth/email-already-in-use': 'Cet email est déjà utilisé',
      'auth/invalid-email': 'Email invalide',
      'auth/operation-not-allowed': 'Opération non autorisée',
      'auth/weak-password': 'Mot de passe trop faible (minimum 6 caractères)',
      'auth/user-disabled': 'Compte désactivé',
      'auth/user-not-found': 'Utilisateur non trouvé',
      'auth/wrong-password': 'Mot de passe incorrect',
      'auth/too-many-requests': 'Trop de tentatives. Réessayez plus tard',
      'auth/network-request-failed': 'Erreur réseau. Vérifiez votre connexion',
    };

    return errorMessages[code] || 'Une erreur est survenue';
  }

  clearCache() {
    localStorage.removeItem('userData');
  }

  // Méthode pour uploader des images
  async uploadImage(file: File, path: string): Promise<string> {
    try {
      const storageRef = ref(this.storage, path);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      return downloadURL;
    } catch (error) {
      console.error("Erreur lors du téléchargement de l'image:", error);
      throw error;
    }
  }

  // ==================== GESTION DES PRODUITS ====================

  async addProduct(
    productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<{ success: boolean; productId?: string; error?: string }> {
    try {
      const productWithTimestamp = {
        ...productData,
        badges: productData.badges || [], // ← AJOUTEZ CETTE LIGNE
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        status: 'available' as const,
        views: 0,
        sales: 0,
        rating: 0,
        isActive: true,
        images: productData.images || [],
      };

      const docRef = await addDoc(
        collection(this.firestore, 'products'),
        productWithTimestamp
      );

      console.log('Produit ajouté avec ID:', docRef.id);

      return {
        success: true,
        productId: docRef.id,
      };
    } catch (error: any) {
      console.error("Erreur lors de l'ajout du produit:", error);
      return {
        success: false,
        error:
          this.getFirebaseErrorMessage(error.code) ||
          "Erreur lors de l'ajout du produit",
      };
    }
  }

  // Dans la méthode getProducerProducts - ligne 244
  async getProducerProducts(producerId: string): Promise<Product[]> {
    try {
      const q = query(
        collection(this.firestore, 'products'),
        where('producerId', '==', producerId),
        orderBy('createdAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const products: Product[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        products.push({
          id: doc.id,
          name: data['name'] || '',
          category: data['category'] || '',
          description: data['description'] || '',
          price: data['price'] || 0,
          quantity: data['quantity'] || 0,
          unit: data['unit'] || 'unit',
          certifications: data['certifications'] || [],
          isOrganic: data['isOrganic'] || false,
          harvestDate: data['harvestDate'],
          expirationDate: data['expirationDate'],
          storageConditions: data['storageConditions'],
          location: data['location'] || '',
          contactPhone: data['contactPhone'] || '',
          minOrderQuantity: data['minOrderQuantity'] || 1,
          producerId: data['producerId'] || '',
          producerName: data['producerName'] || '',
          producerPhone: data['producerPhone'] || '',
          images: data['images'] || [],
          status: data['status'] || 'available',
          views: data['views'] || 0,
          sales: data['sales'] || 0,
          rating: data['rating'] || 0,
          isActive: data['isActive'] !== undefined ? data['isActive'] : true,
          createdAt: data['createdAt']?.toDate() || new Date(),
          updatedAt: data['updatedAt']?.toDate() || new Date(),
          // NOUVEAUX CHAMPS
          certification: data['certification'] || undefined,
          badges: data['badges'] || [], // ← AJOUTEZ CETTE LIGNE
        });
      });

      return products;
    } catch (error) {
      console.error('Erreur lors de la récupération des produits:', error);
      return [];
    }
  }
  async getProductById(productId: string): Promise<Product | null> {
    try {
      const productDoc = await getDoc(
        doc(this.firestore, 'products', productId)
      );

      if (productDoc.exists()) {
        const data = productDoc.data();
        return {
          id: productDoc.id,
          name: data['name'] || '',
          category: data['category'] || '',
          description: data['description'] || '',
          price: data['price'] || 0,
          quantity: data['quantity'] || 0,
          unit: data['unit'] || 'unit',
          certifications: data['certifications'] || [],
          isOrganic: data['isOrganic'] || false,
          harvestDate: data['harvestDate'],
          expirationDate: data['expirationDate'],
          storageConditions: data['storageConditions'],
          location: data['location'] || '',
          contactPhone: data['contactPhone'] || '',
          minOrderQuantity: data['minOrderQuantity'] || 1,
          producerId: data['producerId'] || '',
          producerName: data['producerName'] || '',
          producerPhone: data['producerPhone'] || '',
          images: data['images'] || [],
          status: data['status'] || 'available',
          views: data['views'] || 0,
          sales: data['sales'] || 0,
          rating: data['rating'] || 0,
          isActive: data['isActive'] !== undefined ? data['isActive'] : true,
          createdAt: data['createdAt']?.toDate() || new Date(),
          updatedAt: data['updatedAt']?.toDate() || new Date(),
          // NOUVEAUX CHAMPS
          certification: data['certification'] || undefined,
          badges: data['badges'] || [], // ← AJOUTEZ CETTE LIGNE
        } as Product;
      }
      return null;
    } catch (error) {
      console.error('Erreur lors de la récupération du produit:', error);
      return null;
    }
  }

  async updateProduct(
    productId: string,
    productData: Partial<Product>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const updateData = {
        ...productData,
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(this.firestore, 'products', productId), updateData);

      return { success: true };
    } catch (error: any) {
      console.error('Erreur lors de la mise à jour du produit:', error);
      return {
        success: false,
        error:
          this.getFirebaseErrorMessage(error.code) ||
          'Erreur lors de la mise à jour',
      };
    }
  }

  async deleteProduct(
    productId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await deleteDoc(doc(this.firestore, 'products', productId));
      console.log('Produit supprimé:', productId);
      return { success: true };
    } catch (error: any) {
      console.error('Erreur lors de la suppression du produit:', error);
      return {
        success: false,
        error:
          this.getFirebaseErrorMessage(error.code) ||
          'Erreur lors de la suppression',
      };
    }
  }

  async updateProductStatus(
    productId: string,
    status: Product['status']
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await updateDoc(doc(this.firestore, 'products', productId), {
        status,
        updatedAt: serverTimestamp(),
      });
      return { success: true };
    } catch (error: any) {
      console.error('Erreur lors de la mise à jour du statut:', error);
      return {
        success: false,
        error:
          this.getFirebaseErrorMessage(error.code) ||
          'Erreur lors de la mise à jour',
      };
    }
  }

  async incrementProductViews(productId: string): Promise<void> {
    try {
      const productRef = doc(this.firestore, 'products', productId);
      await updateDoc(productRef, {
        views: increment(1),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Erreur lors de l'incrémentation des vues:", error);
    }
  }

  // Dans firebase.service.ts ou votre service de produits
  // Dans la méthode getAllAvailableProducts
  async getAllAvailableProducts(): Promise<Product[]> {
    try {
      const q = query(
        collection(this.firestore, 'products'),
        where('status', '==', 'available'),
        where('isActive', '==', true),
        where('quantity', '>', 0),
        orderBy('createdAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const products: Product[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();

        const product = {
          id: doc.id,
          name: data['name'] || '',
          category: data['category'] || '',
          description: data['description'] || '',
          price: data['price'] || 0,
          quantity: data['quantity'] || 0,
          unit: data['unit'] || 'unit',
          certifications: data['certifications'] || [],
          isOrganic: data['isOrganic'] || false,
          harvestDate: data['harvestDate'],
          expirationDate: data['expirationDate'],
          storageConditions: data['storageConditions'],
          location: data['location'] || '',
          contactPhone: data['contactPhone'] || '',
          minOrderQuantity: data['minOrderQuantity'] || 1,
          producerId: data['producerId'] || '',
          producerName: data['producerName'] || '',
          producerPhone: data['producerPhone'] || '',
          images: data['images'] || [],
          status: data['status'] || 'available',
          views: data['views'] || 0,
          sales: data['sales'] || 0,
          rating: data['rating'] || 0,
          isActive: data['isActive'] !== undefined ? data['isActive'] : true,
          createdAt: data['createdAt']?.toDate() || new Date(),
          updatedAt: data['updatedAt']?.toDate() || new Date(),
          // NOUVEAUX CHAMPS
          certification: data['certification'] || undefined,
          badges: data['badges'] || [], // ← AJOUTEZ CETTE LIGNE
        };

        // Vérification supplémentaire
        if (!product.producerId) {
          console.warn(
            '⚠️ ATTENTION: product.producerId est vide pour:',
            product.name
          );
          product.producerId =
            this.extractProducerIdFromEmail(data['producerEmail']) || '';
        }

        products.push(product);
      });

      console.log(`${products.length} produits disponibles récupérés`);
      return products;
    } catch (error) {
      console.error(
        'Erreur lors de la récupération des produits disponibles:',
        error
      );
      return [];
    }
  }

  // Méthode utilitaire pour extraire l'ID si nécessaire
  private extractProducerIdFromEmail(email: string): string {
    if (!email) return '';
    // Vous pourriez chercher l'utilisateur par email dans Firestore
    // Mais c'est une solution temporaire
    return '';
  }

  async searchProducts(searchTerm: string): Promise<Product[]> {
    try {
      const allProducts = await this.getAllAvailableProducts();

      return allProducts.filter(
        (product) =>
          product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          product.description
            ?.toLowerCase()
            .includes(searchTerm.toLowerCase()) ||
          product.producerName.toLowerCase().includes(searchTerm.toLowerCase())
      );
    } catch (error) {
      console.error('Erreur lors de la recherche de produits:', error);
      return [];
    }
  }

  // ==================== UTILITAIRES ====================

  // Méthode pour générer un avatar (utilisée par message.service.ts)
  getAvatarForName(name: string): string {
    const avatars = ['👨🏾', '👩🏾', '👨🏾‍🌾', '👩🏾‍🌾', '🧑🏾', '🧑🏾‍🌾'];
    const hash = name
      .split('')
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return avatars[hash % avatars.length];
  }

  // Getters pour les instances Firebase
  get storageInstance() {
    return this.storage;
  }

  get firestoreInstance() {
    return this.firestore;
  }

  get authInstance() {
    return this.auth;
  }

  // Dans FirebaseService
  async getCertifiedProducts(): Promise<Product[]> {
    const q = query(
      collection(this.firestore, 'products'),
      where('certification', '!=', null),
      where('status', '==', 'available'),
      orderBy('createdAt', 'desc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data['name'] || '',
        category: data['category'] || '',
        description: data['description'] || '',
        price: data['price'] || 0,
        quantity: data['quantity'] || 0,
        unit: data['unit'] || 'unit',
        certifications: data['certifications'] || [],
        isOrganic: data['isOrganic'] || false,
        harvestDate: data['harvestDate'],
        expirationDate: data['expirationDate'],
        storageConditions: data['storageConditions'],
        location: data['location'] || '',
        contactPhone: data['contactPhone'] || '',
        minOrderQuantity: data['minOrderQuantity'] || 1,
        producerId: data['producerId'] || '',
        producerName: data['producerName'] || '',
        producerPhone: data['producerPhone'] || '',
        images: data['images'] || [],
        status: data['status'] || 'available',
        views: data['views'] || 0,
        sales: data['sales'] || 0,
        rating: data['rating'] || 0,
        isActive: data['isActive'] !== undefined ? data['isActive'] : true,
        createdAt: data['createdAt']?.toDate() || new Date(),
        updatedAt: data['updatedAt']?.toDate() || new Date(),
        certification: data['certification'],
        badges: data['badges'] || [], // ← AJOUTEZ CETTE LIGNE
      } as Product;
    });
  }

  async getProductWithCertification(
    productId: string
  ): Promise<Product | null> {
    const product = await this.getProductById(productId);
    if (!product) return null;

    if (product.certification?.id) {
      try {
        const cert = await getDoc(
          doc(this.firestore, 'certifications', product.certification.id)
        );

        if (cert.exists()) {
          product.certification.details = cert.data();
        }
      } catch (error) {
        console.error('Erreur récupération certification:', error);
      }
    }

    return product;
  }
}

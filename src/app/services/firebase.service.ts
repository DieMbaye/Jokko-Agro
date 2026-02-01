import { Injectable } from '@angular/core';
import { FirebaseApp, initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  User,
  browserSessionPersistence,
} from 'firebase/auth';
import {
  getFirestore,
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
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Product } from '../interfaces/data.interfaces';
import { environment } from '../../environments/environment';

export interface Order {
  id: string;
  buyerId: string;
  buyerName?: string;
  productId: string;
  productName: string;
  productUnit?: string;
  productPrice?: number;
  producerId: string;
  producerName: string;
  quantity: number;
  amount: number;
  status: 'pending' | 'shipping' | 'delivered' | 'cancelled';
  certified: boolean;
  rated?: boolean;
  ratingValue?: number;
  createdAt: any;
  deliveredAt?: any;
}

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

let firebaseAppInstance: FirebaseApp | null = null;

function getFirebaseApp(): FirebaseApp {
  if (!firebaseAppInstance) {
    firebaseAppInstance = initializeApp(environment.firebase);
  }
  return firebaseAppInstance;
}

@Injectable({
  providedIn: 'root',
})
export class FirebaseService {
  private app: FirebaseApp;
  private auth;
  public firestore;
  private storage;

  currentUser: User | null = null;
  userData: FirebaseUserData | null = null;
  isLoading = true;
  getProducers: any;

  private authListenerInitialized = false;

  constructor() {
    this.app = getFirebaseApp();
    this.auth = getAuth(this.app);
    this.firestore = getFirestore(this.app);
    this.storage = getStorage(this.app);

    this.configurePersistence();

    if (!this.authListenerInitialized) {
      this.setupAuthListener();
      this.authListenerInitialized = true;
    }
  }

  private async configurePersistence(): Promise<void> {
    try {
      await setPersistence(this.auth, browserLocalPersistence);
    } catch (error) {
      try {
        await setPersistence(this.auth, browserSessionPersistence);
      } catch (fallbackError) {
        // Gestion silencieuse de l'erreur
      }
    }
  }

  private setupAuthListener(): void {
    onAuthStateChanged(this.auth, async (user) => {
      if (this.currentUser?.uid === user?.uid) {
        this.isLoading = false;
        return;
      }

      this.currentUser = user;

      if (user) {
        await this.loadUserData(user.uid);
      } else {
        this.userData = null;
        localStorage.removeItem('userData');
      }

      this.isLoading = false;
    });
  }

  async submitRating(data: {
    productId: string;
    producerId: string;
    buyerId: string;
    stars: number;
  }) {
    await addDoc(collection(this.firestore, 'ratings'), {
      productId: data.productId,
      producerId: data.producerId,
      buyerId: data.buyerId,
      stars: data.stars,
      createdAt: serverTimestamp(),
    });
  }

  async getAverageRatingForProduct(productId: string): Promise<number> {
    const q = query(
      collection(this.firestore, 'ratings'),
      where('productId', '==', productId),
    );

    const snap = await getDocs(q);

    if (snap.empty) return 0;

    const total = snap.docs.reduce((sum, d) => sum + d.data()['stars'], 0);
    return Number((total / snap.size).toFixed(1));
  }

  async login(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    try {
      await setPersistence(this.auth, browserLocalPersistence);
      await signInWithEmailAndPassword(this.auth, email, password);
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: this.getFirebaseErrorMessage(error.code),
      };
    }
  }

  async register(userData: any): Promise<{ success: boolean; error?: string }> {
    try {
      const userCredential = await createUserWithEmailAndPassword(
        this.auth,
        userData.email,
        userData.password,
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

      await setDoc(
        doc(this.firestore, 'users', userCredential.user.uid),
        userDataToSave,
      );

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
      return {
        success: false,
        error: this.getFirebaseErrorMessage(error.code),
      };
    }
  }

  async logout(): Promise<void> {
    try {
      await signOut(this.auth);
      this.clearCache();
    } catch (error) {
      throw error;
    }
  }

  async loadUserData(uid: string): Promise<void> {
    try {
      const cachedData = localStorage.getItem('userData');
      if (cachedData) {
        const cachedUser = JSON.parse(cachedData);
        if (cachedUser.uid === uid) {
          this.userData = cachedUser;
          return;
        }
      }

      const userDoc = await getDoc(doc(this.firestore, 'users', uid));

      if (userDoc.exists()) {
        const data = userDoc.data();
        this.userData = {
          uid: data['uid'] || uid,
          email: data['email'] || '',
          fullName: data['fullName'] || '',
          phone: data['phone'] || '',
          role: data['role'] || 'buyer',
          createdAt: data['createdAt']?.toDate() || new Date(),
          location: data['location'] || 'Dakar, Sénégal',
          reputation: data['reputation'],
        };

        localStorage.setItem('userData', JSON.stringify(this.userData));
      } else {
        await this.createMissingUserDocument(uid);
      }
    } catch (error) {
      this.userData = null;
    }
  }

  getUserRole(): 'producer' | 'buyer' | null {
    return this.userData?.role || null;
  }

  getCurrentAuthUser(): User | null {
    return this.auth.currentUser;
  }

  isAuthenticated(): boolean {
    return !!this.auth.currentUser && !!this.userData;
  }

  clearCache(): void {
    localStorage.removeItem('userData');
    this.userData = null;
    this.currentUser = null;
  }

  private getFirebaseErrorMessage(code: string): string {
    const errorMessages: { [key: string]: string } = {
      'auth/email-already-in-use': 'Cet email est déjà utilisé',
      'auth/invalid-email': 'Email invalide',
      'auth/operation-not-allowed': 'Opération non autorisée',
      'auth/weak-password': 'Mot de passe trop faible',
      'auth/user-disabled': 'Compte désactivé',
      'auth/user-not-found': 'Utilisateur non trouvé',
      'auth/wrong-password': 'Mot de passe incorrect',
      'auth/too-many-requests': 'Trop de tentatives',
      'auth/network-request-failed': 'Erreur réseau',
    };

    return errorMessages[code] || 'Une erreur est survenue';
  }

  async getMyOrders(buyerId: string): Promise<Order[]> {
    const q = query(
      collection(this.firestore, 'sales'),
      where('buyerId', '==', buyerId),
      orderBy('createdAt', 'desc'),
    );

    const snapshot = await getDocs(q);

    return snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        buyerId: data['buyerId'] || '',
        producerId: data['producerId'] || '',
        productId: data['productId'] || '',
        quantity: data['quantity'] || 0,
        totalPrice: data['totalPrice'] || 0,
        status: data['status'] || '',
        amount: data['amount'] || data['totalPrice'] || 0,
        createdAt: data['createdAt']?.toDate ? data['createdAt'].toDate() : new Date(),
        updatedAt: data['updatedAt']?.toDate ? data['updatedAt'].toDate() : undefined,
        ...data,
      } as unknown as Order;
    });
  }

  async getBuyerSales(): Promise<any[]> {
    const user = this.auth.currentUser;
    if (!user) return [];

    const salesRef = collection(this.firestore, 'sales');
    const q = query(
      salesRef,
      where('buyerId', '==', user.uid),
      orderBy('createdAt', 'desc'),
    );

    const snapshot = await getDocs(q);
    const results: any[] = [];

    for (const docSnap of snapshot.docs) {
      const sale = docSnap.data();

      let productData: any = null;
      if (sale['productId']) {
        const productSnap = await getDoc(
          doc(this.firestore, 'products', sale['productId']),
        );
        productData = productSnap.exists() ? productSnap.data() : null;
      }

      let producerData: any = null;
      if (sale['producerId']) {
        const producerSnap = await getDoc(
          doc(this.firestore, 'users', sale['producerId']),
        );
        producerData = producerSnap.exists() ? producerSnap.data() : null;
      }

      const isCertified =
        productData?.certifications &&
        Array.isArray(productData.certifications) &&
        productData.certifications.length > 0;

      results.push({
        id: docSnap.id,
        product: productData?.name || 'Produit inconnu',
        producer: producerData?.fullName || 'Producteur inconnu',
        date: sale['createdAt']?.toDate
          ? sale['createdAt'].toDate().toISOString().split('T')[0]
          : '',
        amount: sale['totalAmount'] || 0,
        status: sale['status'] || 'pending',
        certified: isCertified,
        productId: sale['productId'],
        producerId: sale['producerId'],
      });
    }

    return results;
  }

  async getMyRatings(): Promise<any[]> {
    const user = this.getCurrentAuthUser();
    if (!user) return [];

    const ratingsRef = collection(this.firestore, 'ratings');
    const q = query(ratingsRef, where('buyerId', '==', user.uid));

    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
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
      await this.loadUserData(uid);
    } catch (error) {
      // Gestion silencieuse de l'erreur
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
      throw error;
    }
  }

  async uploadImage(file: File, path: string): Promise<string> {
    try {
      const storageRef = ref(this.storage, path);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      return downloadURL;
    } catch (error) {
      throw error;
    }
  }

  async addProduct(productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>):
    Promise<{ success: boolean; productId?: string; error?: string }> {
    try {
      const productWithTimestamp = {
        ...productData,
        badges: productData.badges || [],
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
        productWithTimestamp,
      );

      return {
        success: true,
        productId: docRef.id,
      };
    } catch (error: any) {
      return {
        success: false,
        error: this.getFirebaseErrorMessage(error.code) || "Erreur lors de l'ajout du produit",
      };
    }
  }

  async getProducerProducts(producerId: string): Promise<Product[]> {
    try {
      const q = query(
        collection(this.firestore, 'products'),
        where('producerId', '==', producerId),
        orderBy('createdAt', 'desc'),
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
          isActive: data['isActive'] !== undefined ? data['isActive'] : true,
          createdAt: data['createdAt']?.toDate() || new Date(),
          updatedAt: data['updatedAt']?.toDate() || new Date(),
          badges: data['badges'] || [],
        });
      });

      return products;
    } catch (error) {
      return [];
    }
  }

  async getProductById(productId: string): Promise<Product | null> {
    try {
      const productDoc = await getDoc(doc(this.firestore, 'products', productId));

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
          certification: data['certification'] || undefined,
          badges: data['badges'] || [],
        } as Product;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  async updateProduct(productId: string, productData: Partial<Product>):
    Promise<{ success: boolean; error?: string }> {
    try {
      const updateData = {
        ...productData,
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(this.firestore, 'products', productId), updateData);
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: this.getFirebaseErrorMessage(error.code) || 'Erreur lors de la mise à jour',
      };
    }
  }

  async deleteProduct(productId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await deleteDoc(doc(this.firestore, 'products', productId));
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: this.getFirebaseErrorMessage(error.code) || 'Erreur lors de la suppression',
      };
    }
  }

  async updateProductStatus(productId: string, status: Product['status']):
    Promise<{ success: boolean; error?: string }> {
    try {
      await updateDoc(doc(this.firestore, 'products', productId), {
        status,
        updatedAt: serverTimestamp(),
      });
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: this.getFirebaseErrorMessage(error.code) || 'Erreur lors de la mise à jour',
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
      // Gestion silencieuse de l'erreur
    }
  }

  async getAllAvailableProducts(): Promise<Product[]> {
    try {
      const q = query(
        collection(this.firestore, 'products'),
        where('status', '==', 'available'),
        where('isActive', '==', true),
        where('quantity', '>', 0),
        orderBy('createdAt', 'desc'),
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
          certification: data['certification'] || undefined,
          badges: data['badges'] || [],
        };

        products.push(product);
      });

      return products;
    } catch (error) {
      return [];
    }
  }

  async searchProducts(searchTerm: string): Promise<Product[]> {
    try {
      const allProducts = await this.getAllAvailableProducts();

      return allProducts.filter(
        (product) =>
          product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          product.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          product.producerName.toLowerCase().includes(searchTerm.toLowerCase()),
      );
    } catch (error) {
      return [];
    }
  }

  getAvatarForName(name: string): string {
    const avatars = ['👨🏾', '👩🏾', '👨🏾‍🌾', '👩🏾‍🌾', '🧑🏾', '🧑🏾‍🌾'];
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return avatars[hash % avatars.length];
  }

  async getCertifiedProducts(): Promise<Product[]> {
    const q = query(
      collection(this.firestore, 'products'),
      where('certification', '!=', null),
      where('status', '==', 'available'),
      orderBy('createdAt', 'desc'),
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
        badges: data['badges'] || [],
      } as Product;
    });
  }

  async getProductWithCertification(productId: string): Promise<Product | null> {
    const product = await this.getProductById(productId);
    if (!product) return null;

    if (product.certification?.id) {
      try {
        const cert = await getDoc(
          doc(this.firestore, 'certifications', product.certification.id),
        );

        if (cert.exists()) {
          product.certification.details = cert.data();
        }
      } catch (error) {
        // Gestion silencieuse de l'erreur
      }
    }

    return product;
  }

  get storageInstance() {
    return this.storage;
  }

  get firestoreInstance() {
    return this.firestore;
  }

  get authInstance() {
    return this.auth;
  }

  db(
    db: any,
    arg1: string,
    arg2: any,
  ): import('@firebase/firestore').DocumentReference<
    import('@firebase/firestore').DocumentData,
    import('@firebase/firestore').DocumentData
  > {
    throw new Error('Method not implemented.');
  }

  private extractProducerIdFromEmail(email: string): string {
    if (!email) return '';
    return '';
  }
}

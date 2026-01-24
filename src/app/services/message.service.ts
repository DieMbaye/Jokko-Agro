// services/message.service.ts
import { Injectable } from '@angular/core';
import { FirebaseService } from './firebase.service';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  Conversation,
  Message,
  Producer,
  UserData,
} from '../interfaces/data.interfaces';

import {
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
  onSnapshot,
  limit,
  startAfter,
  DocumentSnapshot,
  Timestamp,
  Query,
} from 'firebase/firestore';

@Injectable({
  providedIn: 'root',
})
export class MessageService {
  private conversationsSubject = new BehaviorSubject<Conversation[]>([]);
  private messagesSubject = new BehaviorSubject<Message[]>([]);
  private unreadCountSubject = new BehaviorSubject<number>(0);
  private typingStatusSubject = new BehaviorSubject<Map<string, boolean>>(
    new Map(),
  );

  constructor(private firebaseService: FirebaseService) {}

  // Méthode pour accéder au Firestore
  private get firestore() {
    return this.firebaseService.firestore;
  }

  // ==================== CONVERSATIONS ====================

  async getConversations(
    userId: string,
    userRole: 'producer' | 'buyer',
  ): Promise<Conversation[]> {
    try {
      const fieldToCheck = userRole === 'producer' ? 'producerId' : 'buyerId';

      const q = query(
        collection(this.firestore, 'conversations'),
        where(fieldToCheck, '==', userId),
        where('status', '!=', 'deleted'),
        orderBy('updatedAt', 'desc'),
        limit(50),
      );

      const querySnapshot = await getDocs(q);
      const conversations: Conversation[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        conversations.push(this.mapConversation(doc.id, data));
      });

      // Mettre à jour le compteur de messages non lus
      const totalUnread = conversations.reduce(
        (sum, conv) => sum + conv.unreadCount,
        0,
      );
      this.unreadCountSubject.next(totalUnread);

      return conversations;
    } catch (error) {
      console.error('Erreur lors de la récupération des conversations:', error);
      return [];
    }
  }

  subscribeToConversations(
    userId: string,
    userRole: 'producer' | 'buyer',
    callback: (conversations: Conversation[]) => void,
  ): () => void {
    const fieldToCheck = userRole === 'producer' ? 'producerId' : 'buyerId';

    const q = query(
      collection(this.firestore, 'conversations'),
      where(fieldToCheck, '==', userId),
      where('status', '!=', 'deleted'),
      orderBy('updatedAt', 'desc'),
    );

    return onSnapshot(q, (querySnapshot) => {
      const conversations: Conversation[] = [];
      let totalUnread = 0;

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const conversation = this.mapConversation(doc.id, data);
        conversations.push(conversation);
        totalUnread += conversation.unreadCount;
      });

      this.unreadCountSubject.next(totalUnread);
      this.conversationsSubject.next(conversations);
      callback(conversations);
    });
  }

  async createConversation(
    buyerId: string,
    buyerName: string,
    buyerAvatar: string,
    producerId: string,
    producerName: string,
    producerAvatar: string,
    initialMessage: string,
    productId?: string,
    productName?: string,
  ): Promise<{ success: boolean; conversationId?: string; error?: string }> {
    try {
      // Vérifier si une conversation existe déjà
      const existingConv = await this.findExistingConversation(
        buyerId,
        producerId,
      );

      if (existingConv && existingConv.id) {
        // Réactiver la conversation existante
        await updateDoc(doc(this.firestore, 'conversations', existingConv.id), {
          status: 'active',
          updatedAt: serverTimestamp(),
        });

        // Envoyer le message initial
        await this.sendMessage({
          conversationId: existingConv.id,
          senderId: buyerId,
          senderName: buyerName,
          senderAvatar: buyerAvatar,
          senderRole: 'buyer',
          content: initialMessage,
          timestamp: new Date(),
          read: false,
          readBy: [],
          delivered: true,
          type: 'text',
        });

        return { success: true, conversationId: existingConv.id };
      }

      // Créer une nouvelle conversation
      const conversationData: any = {
        buyerId,
        buyerName,
        buyerAvatar,
        producerId,
        producerName,
        producerAvatar,
        lastMessage: initialMessage,
        lastMessageTime: serverTimestamp(),
        unreadCount: 1,
        unreadBy: { buyer: 0, producer: 1 },
        status: 'active',
        isTyping: { buyer: false, producer: false },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        participants: [buyerId, producerId],
      };

      // Ajouter les champs productId et productName uniquement s'ils sont définis
      if (productId) {
        conversationData.productId = productId;
      }

      if (productName) {
        conversationData.productName = productName;
      }

      const docRef = await addDoc(
        collection(this.firestore, 'conversations'),
        conversationData,
      );

      // Envoyer le message initial
      await this.sendMessage({
        conversationId: docRef.id,
        senderId: buyerId,
        senderName: buyerName,
        senderAvatar: buyerAvatar,
        senderRole: 'buyer',
        content: initialMessage,
        timestamp: new Date(),
        read: false,
        readBy: [],
        delivered: true,
        type: 'text',
      });

      return { success: true, conversationId: docRef.id };
    } catch (error: any) {
      console.error('Erreur lors de la création de conversation:', error);
      return {
        success: false,
        error:
          'Erreur lors de la création de la conversation: ' + error.message,
      };
    }
  }

  private async findExistingConversation(
    buyerId: string,
    producerId: string,
  ): Promise<Conversation | null> {
    try {
      const q = query(
        collection(this.firestore, 'conversations'),
        where('buyerId', '==', buyerId),
        where('producerId', '==', producerId),
        where('status', 'in', ['active', 'archived']),
      );

      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        return this.mapConversation(doc.id, doc.data());
      }
      return null;
    } catch (error) {
      console.error('Erreur lors de la recherche de conversation:', error);
      return null;
    }
  }

  // ==================== MESSAGES ====================

  async getMessages(
    conversationId: string,
    limitCount: number = 20,
    lastMessageId?: string,
  ): Promise<Message[]> {
    try {
      let messagesQuery: Query;

      if (lastMessageId) {
        // Récupérer le dernier document pour la pagination
        const lastDoc = await getDoc(
          doc(this.firestore, 'messages', lastMessageId),
        );

        messagesQuery = query(
          collection(this.firestore, 'messages'),
          where('conversationId', '==', conversationId),
          orderBy('timestamp', 'desc'),
          startAfter(lastDoc),
          limit(limitCount),
        );
      } else {
        messagesQuery = query(
          collection(this.firestore, 'messages'),
          where('conversationId', '==', conversationId),
          orderBy('timestamp', 'desc'),
          limit(limitCount),
        );
      }

      const querySnapshot = await getDocs(messagesQuery);
      const messages: Message[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        messages.push(this.mapMessage(doc.id, data));
      });

      // Inverser l'ordre pour avoir les plus anciens en premier
      return messages.reverse();
    } catch (error) {
      console.error('Erreur lors de la récupération des messages:', error);
      return [];
    }
  }

  async sendMessage(
    messageData: Omit<Message, 'id'>,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const messageWithTimestamp = {
        ...messageData,
        timestamp: serverTimestamp(),
      };

      const docRef = await addDoc(
        collection(this.firestore, 'messages'),
        messageWithTimestamp,
      );

      // Mettre à jour la conversation
      await this.updateConversationAfterMessage(
        messageData.conversationId,
        messageData,
      );

      return { success: true, messageId: docRef.id };
    } catch (error: any) {
      console.error("Erreur lors de l'envoi du message:", error);
      return {
        success: false,
        error: "Erreur lors de l'envoi du message: " + error.message,
      };
    }
  }

  private async updateConversationAfterMessage(
    conversationId: string,
    messageData: Omit<Message, 'id'>,
  ): Promise<void> {
    try {
      const conversationRef = doc(
        this.firestore,
        'conversations',
        conversationId,
      );
      const conversationSnap = await getDoc(conversationRef);

      if (conversationSnap.exists()) {
        const conversationData = conversationSnap.data();
        const unreadBy = conversationData['unreadBy'] || {
          buyer: 0,
          producer: 0,
        };

        // Incrémenter les messages non lus pour le destinataire
        if (messageData.senderRole === 'buyer') {
          unreadBy.producer = (unreadBy.producer || 0) + 1;
        } else {
          unreadBy.buyer = (unreadBy.buyer || 0) + 1;
        }

        const totalUnread = unreadBy.buyer + unreadBy.producer;

        await updateDoc(conversationRef, {
          lastMessage: messageData.content,
          lastMessageTime: serverTimestamp(),
          unreadCount: totalUnread,
          unreadBy,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      console.error('Erreur lors de la mise à jour de la conversation:', error);
    }
  }

  subscribeToMessages(
    conversationId: string,
    callback: (messages: Message[]) => void,
  ): () => void {
    const q = query(
      collection(this.firestore, 'messages'),
      where('conversationId', '==', conversationId),
      orderBy('timestamp', 'asc'),
    );

    return onSnapshot(q, (querySnapshot) => {
      const messages: Message[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        messages.push(this.mapMessage(doc.id, data));
      });
      this.messagesSubject.next(messages);
      callback(messages);
    });
  }

  async markMessagesAsRead(
    conversationId: string,
    userId: string,
    userRole: 'producer' | 'buyer',
  ): Promise<void> {
    try {
      // Mettre à jour les messages non lus
      const q = query(
        collection(this.firestore, 'messages'),
        where('conversationId', '==', conversationId),
        where('senderId', '!=', userId),
        where('read', '==', false),
      );

      const querySnapshot = await getDocs(q);
      const batch = writeBatch(this.firestore);

      querySnapshot.forEach((doc) => {
        const messageData = doc.data();
        const readBy = [...(messageData['readBy'] || []), userId];

        batch.update(doc.ref, {
          read: true,
          readBy,
        });
      });

      if (querySnapshot.size > 0) {
        await batch.commit();
      }

      // Mettre à jour le compteur de messages non lus dans la conversation
      const conversationRef = doc(
        this.firestore,
        'conversations',
        conversationId,
      );
      const conversationSnap = await getDoc(conversationRef);

      if (conversationSnap.exists()) {
        const conversationData = conversationSnap.data();
        const unreadBy = conversationData['unreadBy'] || {
          buyer: 0,
          producer: 0,
        };

        if (userRole === 'buyer') {
          unreadBy.buyer = 0;
        } else {
          unreadBy.producer = 0;
        }

        const totalUnread = unreadBy.buyer + unreadBy.producer;

        await updateDoc(conversationRef, {
          unreadCount: totalUnread,
          unreadBy,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      console.error('Erreur lors du marquage des messages comme lus:', error);
    }
  }

  async updateTypingStatus(
    conversationId: string,
    userId: string,
    userRole: 'producer' | 'buyer',
    isTyping: boolean,
  ): Promise<void> {
    try {
      const conversationRef = doc(
        this.firestore,
        'conversations',
        conversationId,
      );
      const field =
        userRole === 'buyer' ? 'isTyping.buyer' : 'isTyping.producer';

      await updateDoc(conversationRef, {
        [field]: isTyping,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error(
        'Erreur lors de la mise à jour du statut de frappe:',
        error,
      );
    }
  }

  // ==================== PRODUCTEURS ====================

  async getAvailableProducers(searchTerm?: string): Promise<Producer[]> {
    try {
      let q = query(
        collection(this.firestore, 'users'),
        where('role', '==', 'producer'),
        orderBy('fullName'),
      );

      const querySnapshot = await getDocs(q);
      const producers: Producer[] = [];

      for (const producerDoc of querySnapshot.docs) {
        const data = producerDoc.data();

        // Récupérer les statistiques
        const productsCount = await this.getProducerProductsCount(
          producerDoc.id,
        );
        const responseStats = await this.getProducerResponseStats(
          producerDoc.id,
        );

        const producer: Producer = {
          id: producerDoc.id,
          name: data['fullName'] || 'Producteur',
          farmName: data['farmName'] || data['businessName'] || 'Ferme',
          avatar: this.getAvatarForName(data['fullName'] || 'Producteur'),
          location: data['location'] || 'Sénégal',
          rating: data['rating'] || data['reputation'] || 4.5,
          reviews: data['reviewCount'] || 0,
          description: data['description'] || data['bio'] || 'Producteur local',
          phone: data['phone'] || '',
          email: data['email'] || '',
          certifications: data['certifications'] || [],
          isOrganic: data['isOrganic'] || false,
          isOnline: data['isOnline'] || false,
          lastSeen: data['lastSeen']?.toDate() || new Date(),
          productsCount,
          responseRate: responseStats.responseRate,
          averageResponseTime: responseStats.averageResponseTime,
        };

        // Filtrer par terme de recherche si fourni
        if (
          !searchTerm ||
          producer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          producer.farmName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          producer.location.toLowerCase().includes(searchTerm.toLowerCase())
        ) {
          producers.push(producer);
        }
      }

      return producers;
    } catch (error) {
      console.error('Erreur lors de la récupération des producteurs:', error);
      return [];
    }
  }

  async searchProducers(searchTerm: string): Promise<Producer[]> {
    try {
      const allProducers = await this.getAvailableProducers();
      const term = searchTerm.toLowerCase();

      return allProducers.filter(
        (producer) =>
          producer.name.toLowerCase().includes(term) ||
          producer.farmName.toLowerCase().includes(term) ||
          producer.location.toLowerCase().includes(term) ||
          producer.description.toLowerCase().includes(term),
      );
    } catch (error) {
      console.error('Erreur lors de la recherche des producteurs:', error);
      return [];
    }
  }

  private async getProducerProductsCount(producerId: string): Promise<number> {
    try {
      const q = query(
        collection(this.firestore, 'products'),
        where('producerId', '==', producerId),
        where('status', '==', 'available'),
      );
      const querySnapshot = await getDocs(q);
      return querySnapshot.size;
    } catch (error) {
      return 0;
    }
  }

  private async getProducerResponseStats(
    producerId: string,
  ): Promise<{ responseRate: number; averageResponseTime: number }> {
    try {
      // Récupérer les conversations pour calculer les statistiques
      const q = query(
        collection(this.firestore, 'conversations'),
        where('producerId', '==', producerId),
      );

      const querySnapshot = await getDocs(q);

      if (querySnapshot.size === 0) {
        return { responseRate: 100, averageResponseTime: 0 };
      }

      // Calculer les statistiques à partir des conversations
      let totalResponseTime = 0;
      let respondedConversations = 0;

      for (const convDoc of querySnapshot.docs) {
        const convData = convDoc.data();
        if (convData['lastMessageTime'] && convData['createdAt']) {
          const responseTime =
            convData['lastMessageTime'].toDate().getTime() -
            convData['createdAt'].toDate().getTime();
          if (responseTime > 0) {
            totalResponseTime += responseTime;
            respondedConversations++;
          }
        }
      }

      const averageResponseTime =
        respondedConversations > 0
          ? Math.round(totalResponseTime / respondedConversations / 60000) // Convertir en minutes
          : 0;

      const responseRate =
        respondedConversations > 0
          ? Math.round((respondedConversations / querySnapshot.size) * 100)
          : 100;

      return {
        responseRate,
        averageResponseTime,
      };
    } catch (error) {
      return { responseRate: 85, averageResponseTime: 60 };
    }
  }

  // ==================== PROFIL UTILISATEUR ====================

  async getUserProfile(userId: string): Promise<UserData> {
    try {
      const userDoc = await getDoc(doc(this.firestore, 'users', userId));

      if (userDoc.exists()) {
        const data = userDoc.data();

        // Récupérer les statistiques si c'est un producteur
        let stats = { rating: 0, responseRate: 0, responseTime: 0 };
        if (data['role'] === 'producer') {
          const responseStats = await this.getProducerResponseStats(userId);
          stats = {
            rating: data['rating'] || 0,
            responseRate: responseStats.responseRate,
            responseTime: responseStats.averageResponseTime,
          };
        }

        return {
          id: userDoc.id,
          name: data['fullName'] || data['displayName'] || 'Utilisateur',
          email: data['email'] || '',
          phone: data['phone'] || '',
          role: data['role'] || 'buyer',
          avatar: this.getAvatarForName(data['fullName'] || ''),
          location: data['location'] || '',
          farmName: data['farmName'] || data['businessName'] || '',
          description: data['description'] || data['bio'] || '',
          certifications: data['certifications'] || [],
          isOrganic: data['isOrganic'] || false,
          joinedDate: data['createdAt']?.toDate() || new Date(),
          lastSeen: data['lastSeen']?.toDate() || new Date(),
          isOnline: data['isOnline'] || false,
          stats,
          rating: stats.rating,
          responseRate: stats.responseRate,
          responseTime: stats.responseTime,
        };
      }

      throw new Error('Utilisateur non trouvé');
    } catch (error) {
      console.error('Erreur lors de la récupération du profil:', error);
      throw error;
    }
  }

  // ==================== GESTION DES CONVERSATIONS ====================

  async updateConversationStatus(
    conversationId: string,
    userId: string,
    status: 'active' | 'archived' | 'blocked',
  ): Promise<void> {
    try {
      await updateDoc(doc(this.firestore, 'conversations', conversationId), {
        status,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Erreur lors du changement de statut:', error);
      throw error;
    }
  }

  async archiveConversation(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    return this.updateConversationStatus(conversationId, userId, 'archived');
  }

  async deleteConversation(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    try {
      // Marquer comme supprimé plutôt que supprimer complètement
      await updateDoc(doc(this.firestore, 'conversations', conversationId), {
        status: 'deleted',
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
      throw error;
    }
  }

  async blockUser(blockerId: string, blockedId: string): Promise<void> {
    try {
      // Enregistrer le blocage
      const blockData = {
        blockerId,
        blockedId,
        createdAt: serverTimestamp(),
        status: 'active',
      };

      await addDoc(collection(this.firestore, 'blocks'), blockData);

      // Archiver toutes les conversations entre ces utilisateurs
      const q = query(
        collection(this.firestore, 'conversations'),
        where('participants', 'array-contains', blockerId),
      );

      const querySnapshot = await getDocs(q);
      const batch = writeBatch(this.firestore);

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data['participants'].includes(blockedId)) {
          batch.update(doc.ref, {
            status: 'blocked',
            updatedAt: serverTimestamp(),
          });
        }
      });

      if (querySnapshot.size > 0) {
        await batch.commit();
      }
    } catch (error) {
      console.error('Erreur lors du blocage:', error);
      throw error;
    }
  }

  // ==================== UTILITAIRES ====================

  private mapConversation(id: string, data: any): Conversation {
    return {
      id,
      buyerId: data['buyerId'],
      buyerName: data['buyerName'],
      buyerAvatar: data['buyerAvatar'],
      producerId: data['producerId'],
      producerName: data['producerName'],
      producerAvatar: data['producerAvatar'],
      productId: data['productId'],
      productName: data['productName'],
      lastMessage: data['lastMessage'] || '',
      lastMessageTime: data['lastMessageTime']?.toDate() || new Date(),
      unreadCount: data['unreadCount'] || 0,
      unreadBy: data['unreadBy'] || { buyer: 0, producer: 0 },
      status: data['status'] || 'active',
      isTyping: data['isTyping'] || { buyer: false, producer: false },
      createdAt: data['createdAt']?.toDate() || new Date(),
      updatedAt: data['updatedAt']?.toDate() || new Date(),
      participants: data['participants'] || [],
    };
  }

  private mapMessage(id: string, data: any): Message {
    return {
      id,
      conversationId: data['conversationId'],
      senderId: data['senderId'],
      senderName: data['senderName'],
      senderAvatar: data['senderAvatar'],
      senderRole: data['senderRole'],
      content: data['content'],
      timestamp: data['timestamp']?.toDate() || new Date(),
      read: data['read'] || false,
      readBy: data['readBy'] || [],
      delivered: data['delivered'] !== undefined ? data['delivered'] : true,
      type: data['type'] || 'text',
    };
  }

  // Observables
  getConversationsObservable(): Observable<Conversation[]> {
    return this.conversationsSubject.asObservable();
  }

  getMessagesObservable(): Observable<Message[]> {
    return this.messagesSubject.asObservable();
  }

  getUnreadCountObservable(): Observable<number> {
    return this.unreadCountSubject.asObservable();
  }

  getTypingStatusObservable(): Observable<Map<string, boolean>> {
    return this.typingStatusSubject.asObservable();
  }

  // Méthodes utilitaires supplémentaires
  formatTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "À l'instant";
    if (diffMins < 60) return `Il y a ${diffMins} min`;
    if (diffMins < 1440) return `Il y a ${Math.floor(diffMins / 60)}h`;

    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  }

  getAvatarForName(name: string): string {
    if (!name) return '👤';

    const avatars = ['👨🏾', '👩🏾', '👨🏾‍🌾', '👩🏾‍🌾', '🧑🏾', '🧑🏾‍🌾'];
    const hash = name
      .split('')
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return avatars[hash % avatars.length];
  }

  // Méthode pour générer des données de démonstration
  generateDemoMessages(conversationId: string, count: number = 10): Message[] {
    const messages: Message[] = [];
    const now = new Date();

    for (let i = 0; i < count; i++) {
      const isSent = i % 2 === 0;
      const timestamp = new Date(now.getTime() - (count - i) * 60000); // 1 minute d'intervalle

      messages.push({
        id: `demo-${i}`,
        conversationId,
        senderId: isSent ? 'current-user' : 'other-user',
        senderName: isSent ? 'Moi' : i % 3 === 0 ? 'Producteur Bio' : 'Client',
        senderAvatar: isSent ? '👤' : i % 3 === 0 ? '🌾' : '👨🏾',
        senderRole: isSent ? 'buyer' : i % 3 === 0 ? 'producer' : 'buyer',
        content: this.getDemoMessageContent(i),
        timestamp,
        read: true,
        readBy: [],
        delivered: true,
        type: 'text',
      });
    }

    return messages;
  }

  private getDemoMessageContent(index: number): string {
    const messages = [
      'Bonjour, je suis intéressé par vos tomates bio',
      'Bonjour ! Oui, nous avons des tomates cerises disponibles',
      'Quel est le prix au kilo ?',
      'Le prix est de 1500 FCFA le kilo',
      'Parfait, je voudrais commander 2 kilos',
      'Excellent ! Nous pouvons vous livrer demain matin',
      "Super, quelle est l'adresse de livraison ?",
      'Nous livrons dans toute la région. Quelle est votre adresse ?',
      'Rue 14 x Rue 15, Dakar',
      'Parfait, livraison prévue entre 8h et 10h demain',
    ];

    return messages[index % messages.length];
  }
}

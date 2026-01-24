// components/messages/messages/messages.component.ts
import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  AfterViewChecked,
  ViewEncapsulation,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { MessageService } from '../../services/message.service';
import {
  Conversation,
  Message,
  Producer,
  NewConversationModalData,
  ProfileModalData,
} from '../../interfaces/data.interfaces';

@Component({
  selector: 'app-messages',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './messages.html',
  styleUrls: ['./messages.css'],
  encapsulation: ViewEncapsulation.None,
})
export class MessagesComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef;

  conversations: Conversation[] = [];
  messages: Message[] = [];
  selectedConversation: Conversation | null = null;
  allMessagesLoaded = false;
  showLoadMore = false;
  loadingMoreMessages = false;

  // États
  isLoading = false;
  isSendingMessage = false;
  shouldScrollToBottom = false;

  // Données utilisateur
  currentUser: any;
  userRole: 'producer' | 'buyer' = 'buyer';

  // Recherche et filtres
  searchQuery = '';
  conversationFilter: 'all' | 'unread' | 'archived' = 'all';

  // Nouvelles conversations
  modalData: NewConversationModalData = {
    show: false,
    searchQuery: '',
    selectedProducerId: '',
    message: '',
    isLoading: false,
  };
  availableProducers: Producer[] = [];

  // Profil utilisateur
  profileModalData: ProfileModalData = {
    show: false,
    userName: '',
    userAvatar: '',
    userRole: 'buyer',
    location: '',
    email: '',
    phone: '',
    farmName: '',
    description: '',
    certifications: [],
    joinedDate: new Date(),
    stats: {
      rating: 0,
      responseRate: 0,
      responseTime: 0,
    },
  };

  // Données du formulaire
  newMessage = '';

  // Écouteurs
  private conversationsUnsubscribe: (() => void) | null = null;
  private messagesUnsubscribe: (() => void) | null = null;

  // Gestion du typing
  private typingTimeout: any;
  isTyping = false;
  otherUserTyping = false;

  // Gestion des nouveaux messages
  newMessagesCount = 0;
  showNewMessagesButton = false;

  // Gestion de l'état de la conversation
  private isConversationActive = false;
  private markAsReadTimeout: any;
  private lastSeenUpdateTimeout: any;

  constructor(
    private authService: AuthService,
    private messageService: MessageService,
    private router: Router,
  ) {}

  async ngOnInit() {
    this.currentUser = this.authService.getUserData();

    if (!this.currentUser) {
      this.router.navigate(['/login']);
      return;
    }

    this.userRole = this.currentUser.role;
    await this.loadConversations();
    this.setupRealTimeListeners();

    // Mettre à jour le statut "en ligne"
    this.updateUserOnlineStatus(true);
  }

  ngAfterViewChecked() {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  ngOnDestroy() {
    this.cleanupListeners();

    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }

    if (this.markAsReadTimeout) {
      clearTimeout(this.markAsReadTimeout);
    }

    if (this.lastSeenUpdateTimeout) {
      clearTimeout(this.lastSeenUpdateTimeout);
    }

    // Mettre à jour le statut "hors ligne"
    this.updateUserOnlineStatus(false);
  }

  // ==================== GESTION DU STATUT EN LIGNE ====================

  private updateUserOnlineStatus(isOnline: boolean) {
    // Dans une vraie app, vous enverriez ça au backend
    // Pour l'instant, on garde juste une logique locale
    console.log(`Statut utilisateur: ${isOnline ? 'en ligne' : 'hors ligne'}`);

    // Vous pouvez appeler une API ici pour mettre à jour le statut dans Firestore
    // Exemple: this.messageService.updateUserStatus(this.currentUser.uid, isOnline);
  }

  // ==================== CHARGEMENT DES DONNÉES ====================

  async loadConversations() {
    this.isLoading = true;
    try {
      this.conversations = await this.messageService.getConversations(
        this.currentUser.uid,
        this.userRole,
      );
    } catch (error) {
      console.error('Erreur lors du chargement des conversations:', error);
      this.conversations = this.getFallbackConversations();
    } finally {
      this.isLoading = false;
    }
  }

  setupRealTimeListeners() {
    // Écouter les conversations en temps réel
    this.conversationsUnsubscribe =
      this.messageService.subscribeToConversations(
        this.currentUser.uid,
        this.userRole,
        (conversations) => {
          this.conversations = conversations;

          // Mettre à jour la conversation sélectionnée si elle existe
          if (this.selectedConversation) {
            const updatedConversation = conversations.find(
              (c) => c.id === this.selectedConversation?.id,
            );
            if (updatedConversation) {
              this.selectedConversation = updatedConversation;
            }
          }
        },
      );
  }

  shouldShowDate(message: Message, index: number): boolean {
    if (index === 0) {
      return true;
    }

    const previousMessage = this.messages[index - 1];
    if (!previousMessage) {
      return true;
    }

    const currentDate = new Date(message.timestamp);
    const previousDate = new Date(previousMessage.timestamp);

    return (
      currentDate.getDate() !== previousDate.getDate() ||
      currentDate.getMonth() !== previousDate.getMonth() ||
      currentDate.getFullYear() !== previousDate.getFullYear()
    );
  }

  // ==================== GESTION DES CONVERSATIONS ====================

  async selectConversation(conversation: Conversation) {
    this.isConversationActive = true;

    if (this.messagesUnsubscribe) {
      this.messagesUnsubscribe();
    }

    this.selectedConversation = conversation;
    this.messages = [];
    this.allMessagesLoaded = false;
    this.showLoadMore = false;
    this.showNewMessagesButton = false;
    this.newMessagesCount = 0;

    // Marquer les messages comme lus
    await this.markMessagesAsRead(conversation);

    // Charger les messages initiaux
    await this.loadInitialMessages(conversation.id!);

    // S'abonner aux nouveaux messages
    this.messagesUnsubscribe = this.messageService.subscribeToMessages(
      conversation.id!,
      (newMessages) => {
        this.handleNewMessages(newMessages);
      },
    );

    this.otherUserTyping = false;
  }

  private async markMessagesAsRead(conversation: Conversation) {
    try {
      await this.messageService.markMessagesAsRead(
        conversation.id!,
        this.currentUser.uid,
        this.userRole,
      );

      // Mettre à jour localement
      if (this.userRole === 'buyer') {
        conversation.unreadBy.buyer = 0;
      } else {
        conversation.unreadBy.producer = 0;
      }

      conversation.unreadCount =
        conversation.unreadBy.buyer + conversation.unreadBy.producer;
    } catch (error) {
      console.error('Erreur lors du marquage des messages comme lus:', error);
    }
  }

  private handleNewMessages(newMessages: Message[]) {
    const previousMessagesCount = this.messages.length;
    this.messages = newMessages;

    // Détecter les nouveaux messages
    if (
      previousMessagesCount > 0 &&
      newMessages.length > previousMessagesCount
    ) {
      const newMessagesCount = newMessages.length - previousMessagesCount;

      // Si l'utilisateur est en bas de la discussion, scroll automatique
      // Sinon, afficher le bouton de notification
      if (this.isAtBottom()) {
        this.shouldScrollToBottom = true;
        // Marquer comme lu automatiquement si on est en bas
        this.markCurrentConversationAsRead();
      } else {
        this.newMessagesCount += newMessagesCount;
        this.showNewMessagesButton = true;
      }
    } else if (previousMessagesCount === 0) {
      // Première charge, scroll vers le bas
      this.shouldScrollToBottom = true;
    }

    // Marquer comme lu si la conversation est active et qu'on est en bas
    if (this.isConversationActive && this.isAtBottom()) {
      this.markCurrentConversationAsRead();
    }

    // Vérifier si l'autre utilisateur est en train d'écrire
    if (this.selectedConversation) {
      this.checkTypingStatus(this.selectedConversation);
    }
  }

  async loadInitialMessages(conversationId: string) {
    try {
      this.messages = await this.messageService.getMessages(conversationId, 20);
      this.shouldScrollToBottom = true;
      this.showLoadMore = this.messages.length === 20;
    } catch (error) {
      console.error('Erreur lors du chargement des messages:', error);
    }
  }

  async loadMoreMessages() {
    if (
      this.loadingMoreMessages ||
      this.allMessagesLoaded ||
      !this.selectedConversation
    ) {
      return;
    }

    this.loadingMoreMessages = true;
    try {
      const olderMessages = await this.messageService.getMessages(
        this.selectedConversation.id!,
        20,
        this.messages[0]?.id,
      );

      if (olderMessages.length > 0) {
        this.messages = [...olderMessages, ...this.messages];
      }

      this.showLoadMore = olderMessages.length === 20;
      this.allMessagesLoaded = olderMessages.length < 20;
    } catch (error) {
      console.error('Erreur lors du chargement des anciens messages:', error);
    } finally {
      this.loadingMoreMessages = false;
    }
  }

  // ==================== GESTION DU SCROLL ET POSITION ====================

  onMessagesScroll() {
    if (!this.messagesContainer) return;

    const element = this.messagesContainer.nativeElement;
    const atTop = element.scrollTop === 0;
    const atBottom = this.isAtBottom();

    // Si l'utilisateur scroll vers le bas et atteint le bas
    if (atBottom) {
      // Cacher le bouton de notification
      if (this.showNewMessagesButton) {
        this.showNewMessagesButton = false;
        this.newMessagesCount = 0;
      }

      // Marquer automatiquement comme lu quand on est en bas
      if (this.isConversationActive) {
        this.markCurrentConversationAsRead();
      }
    }

    // Charger plus de messages si en haut
    if (atTop && this.showLoadMore && !this.loadingMoreMessages) {
      this.loadMoreMessages();
    }
  }

  private isAtBottom(): boolean {
    if (!this.messagesContainer) return false;

    const element = this.messagesContainer.nativeElement;
    const distanceFromBottom = Math.abs(
      element.scrollHeight - element.scrollTop - element.clientHeight,
    );

    // Considérer comme "en bas" si à moins de 100px du bas
    return distanceFromBottom < 100;
  }

  scrollToBottom() {
    setTimeout(() => {
      try {
        if (this.messagesContainer) {
          const element = this.messagesContainer.nativeElement;
          element.scrollTop = element.scrollHeight;
          // Cacher le bouton après le scroll
          this.showNewMessagesButton = false;
          this.newMessagesCount = 0;
          // Marquer comme lu
          this.markCurrentConversationAsRead();
        }
      } catch (err) {
        console.error('Erreur lors du défilement:', err);
      }
    }, 100);
  }

  onNewMessagesClick() {
    this.scrollToBottom();
  }

  // ==================== GESTION DE LA VISIBILITÉ ====================

  @HostListener('window:blur')
  onWindowBlur() {
    this.isConversationActive = false;
    this.updateUserOnlineStatus(false);
  }

  @HostListener('window:focus')
  onWindowFocus() {
    if (this.selectedConversation) {
      this.isConversationActive = true;
      this.updateUserOnlineStatus(true);
      // Quand la fenêtre reprend le focus, vérifier s'il y a des messages non lus
      setTimeout(() => {
        if (this.isAtBottom()) {
          this.markCurrentConversationAsRead();
        }
      }, 500);
    }
  }

  @HostListener('window:visibilitychange')
  onVisibilityChange() {
    if (document.visibilityState === 'visible' && this.selectedConversation) {
      this.isConversationActive = true;
      this.updateUserOnlineStatus(true);
      // Marquer comme lu après un court délai si on est en bas
      setTimeout(() => {
        if (this.isAtBottom()) {
          this.markCurrentConversationAsRead();
        }
      }, 300);
    } else {
      this.isConversationActive = false;
      this.updateUserOnlineStatus(false);
    }
  }

  // ==================== MARQUAGE COMME LU INTELLIGENT ====================

  private async markCurrentConversationAsRead() {
    if (!this.selectedConversation || !this.currentUser) return;

    // Annuler le timeout précédent s'il existe
    if (this.markAsReadTimeout) {
      clearTimeout(this.markAsReadTimeout);
    }

    // Délai pour éviter les appels multiples
    this.markAsReadTimeout = setTimeout(async () => {
      const userUnreadCount = this.getConversationUnreadCount(
        this.selectedConversation!,
      );

      if (userUnreadCount > 0) {
        try {
          await this.markMessagesAsRead(this.selectedConversation!);
        } catch (error) {
          console.error('Erreur lors du marquage automatique comme lu:', error);
        }
      }
    }, 500);
  }

  // ==================== ENVOI DE MESSAGES ====================

  onMessageKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      if (!event.shiftKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        this.sendMessage();
      }
    }
  }

  async sendMessage() {
    if (
      !this.newMessage.trim() ||
      !this.selectedConversation ||
      !this.currentUser ||
      this.isSendingMessage
    ) {
      return;
    }

    const messageData: Omit<Message, 'id'> = {
      conversationId: this.selectedConversation.id!,
      senderId: this.currentUser.uid,
      senderName:
        this.currentUser.fullName ||
        this.currentUser.displayName ||
        'Utilisateur',
      senderAvatar:
        this.currentUser.avatarUrl ||
        this.messageService.getAvatarForName(this.currentUser.fullName),
      senderRole: this.userRole,
      content: this.newMessage.trim(),
      timestamp: new Date(),
      read: false,
      readBy: [],
      delivered: true,
      type: 'text',
    };

    this.isSendingMessage = true;
    try {
      const result = await this.messageService.sendMessage(messageData);

      if (result.success) {
        this.newMessage = '';
        this.shouldScrollToBottom = true;

        // Mettre à jour la conversation locale
        if (this.selectedConversation) {
          this.selectedConversation.lastMessage = messageData.content;
          this.selectedConversation.lastMessageTime = messageData.timestamp;

          // Réinitialiser le compteur pour l'utilisateur actuel (il a envoyé le message)
          if (this.userRole === 'buyer') {
            this.selectedConversation.unreadBy.buyer = 0;
          } else {
            this.selectedConversation.unreadBy.producer = 0;
          }

          // Incrémenter le compteur pour l'autre utilisateur
          if (this.userRole === 'buyer') {
            this.selectedConversation.unreadBy.producer += 1;
          } else {
            this.selectedConversation.unreadBy.buyer += 1;
          }

          // Mettre à jour le total
          this.selectedConversation.unreadCount =
            this.selectedConversation.unreadBy.buyer +
            this.selectedConversation.unreadBy.producer;
        }
      } else {
        alert("Erreur lors de l'envoi du message: " + result.error);
      }
    } catch (error) {
      console.error("Erreur lors de l'envoi:", error);
      alert("Erreur lors de l'envoi du message");
    } finally {
      this.isSendingMessage = false;
      await this.updateTypingStatus(false);
    }
  }

  onMessageInput() {
    if (!this.selectedConversation || !this.newMessage.trim()) return;

    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }

    this.updateTypingStatus(true);

    this.typingTimeout = setTimeout(async () => {
      await this.updateTypingStatus(false);
    }, 1000);
  }

  async updateTypingStatus(isTyping: boolean) {
    if (!this.selectedConversation) return;

    try {
      await this.messageService.updateTypingStatus(
        this.selectedConversation.id!,
        this.currentUser.uid,
        this.userRole,
        isTyping,
      );
      this.isTyping = isTyping;
    } catch (error) {
      console.error(
        'Erreur lors de la mise à jour du statut de frappe:',
        error,
      );
    }
  }

  checkTypingStatus(conversation: Conversation) {
    if (!conversation.isTyping) {
      this.otherUserTyping = false;
      return;
    }

    const otherUserField = this.userRole === 'buyer' ? 'producer' : 'buyer';
    this.otherUserTyping = conversation.isTyping[otherUserField] || false;
  }

  getOtherUserTyping(conversation: Conversation): boolean {
    if (!conversation.isTyping) return false;

    const otherUserField = this.userRole === 'buyer' ? 'producer' : 'buyer';
    return conversation.isTyping[otherUserField] || false;
  }

  // ==================== NOUVELLES CONVERSATIONS ====================

  async openNewConversationModal() {
    this.modalData = {
      show: true,
      searchQuery: '',
      selectedProducerId: '',
      message: '',
      isLoading: false,
    };

    this.modalData.isLoading = true;
    try {
      this.availableProducers =
        await this.messageService.getAvailableProducers();
    } catch (error) {
      console.error('Erreur lors du chargement des producteurs:', error);
      this.availableProducers = this.getFallbackProducers();
    } finally {
      this.modalData.isLoading = false;
    }
  }

  closeModal() {
    this.modalData = {
      show: false,
      searchQuery: '',
      selectedProducerId: '',
      message: '',
      isLoading: false,
    };
  }

  onProducerSearch() {
    // Le filtrage est géré par le getter filteredProducers
  }

  selectProducer(producer: Producer) {
    this.modalData.selectedProducerId = producer.id;
    this.modalData.message = '';
  }

  get filteredProducers(): Producer[] {
    if (!this.modalData.searchQuery.trim()) return this.availableProducers;

    const query = this.modalData.searchQuery.toLowerCase();
    return this.availableProducers.filter(
      (producer) =>
        producer.name.toLowerCase().includes(query) ||
        producer.farmName.toLowerCase().includes(query) ||
        producer.location.toLowerCase().includes(query) ||
        producer.description.toLowerCase().includes(query),
    );
  }

  getSelectedProducerName(): string {
    const producer = this.availableProducers.find(
      (p) => p.id === this.modalData.selectedProducerId,
    );
    return producer ? producer.name : '';
  }

  onModalMessageInput() {
    // Limiter à 500 caractères
    if (this.modalData.message.length > 500) {
      this.modalData.message = this.modalData.message.substring(0, 500);
    }
  }

  async startConversation() {
    if (!this.modalData.selectedProducerId || !this.modalData.message.trim()) {
      alert('Veuillez sélectionner un producteur et écrire un message');
      return;
    }

    const selectedProducer = this.availableProducers.find(
      (p) => p.id === this.modalData.selectedProducerId,
    );

    if (!selectedProducer) {
      alert('Producteur non trouvé');
      return;
    }

    this.modalData.isLoading = true;

    try {
      const result = await this.messageService.createConversation(
        this.currentUser.uid,
        this.currentUser.fullName || this.currentUser.displayName || 'Acheteur',
        this.messageService.getAvatarForName(this.currentUser.fullName),
        selectedProducer.id,
        selectedProducer.name,
        selectedProducer.avatar || '👨‍🌾',
        this.modalData.message.trim(),
      );

      if (result.success && result.conversationId) {
        this.closeModal();
        await this.loadConversations();

        const newConversation = this.conversations.find(
          (c) => c.id === result.conversationId,
        );

        if (newConversation) {
          await this.selectConversation(newConversation);
        }

        alert('Conversation démarrée avec succès!');
      } else {
        alert('Erreur: ' + (result.error || 'Erreur inconnue'));
      }
    } catch (error) {
      console.error('Erreur lors du démarrage de la conversation:', error);
      alert('Erreur lors du démarrage de la conversation');
    } finally {
      this.modalData.isLoading = false;
    }
  }

  // ==================== PROFIL UTILISATEUR ====================

  async viewUserProfile(conversation: Conversation) {
    const otherUserId =
      this.userRole === 'buyer'
        ? conversation.producerId
        : conversation.buyerId;

    try {
      const userData = await this.messageService.getUserProfile(otherUserId);

      this.profileModalData = {
        show: true,
        userName: this.getOtherUserName(conversation),
        userAvatar: this.getOtherUserAvatar(conversation),
        userRole: this.userRole === 'buyer' ? 'producer' : 'buyer',
        location: userData.location || '',
        email: userData.email || '',
        phone: userData.phone || '',
        farmName: userData.farmName || '',
        description: userData.description || '',
        certifications: userData.certifications || [],
        joinedDate: userData.joinedDate || new Date(),
        stats: {
          rating: userData.rating || 0,
          responseRate: userData.responseRate || 0,
          responseTime: userData.responseTime || 0,
        },
      };
    } catch (error) {
      console.error('Erreur lors du chargement du profil:', error);

      // Données de démonstration
      this.profileModalData = {
        show: true,
        userName: this.getOtherUserName(conversation),
        userAvatar: this.getOtherUserAvatar(conversation),
        userRole: this.userRole === 'buyer' ? 'producer' : 'buyer',
        location: 'Normandie',
        email: 'contact@fermebio.fr',
        phone: '+33 6 12 34 56 78',
        farmName: 'Ferme Bio Les Prés Verts',
        description:
          'Producteur bio spécialisé en légumes de saison depuis 15 ans.',
        certifications: ['AB', 'Nature & Progrès'],
        joinedDate: new Date('2020-05-15'),
        stats: {
          rating: 4.8,
          responseRate: 95,
          responseTime: 45,
        },
      };
    }
  }

  closeProfileModal() {
    this.profileModalData.show = false;
  }

  startNewConversationFromProfile() {
    this.closeProfileModal();

    if (this.profileModalData.userRole === 'producer') {
      // Trouver le producteur dans la liste
      const producer = this.availableProducers.find(
        (p) => p.name === this.profileModalData.userName,
      );

      if (producer) {
        this.openNewConversationModal();
        setTimeout(() => {
          this.modalData.selectedProducerId = producer.id;
        }, 100);
      } else {
        // Si le producteur n'est pas dans la liste, ouvrir le modal normalement
        this.openNewConversationModal();
      }
    }
  }

  // ==================== GESTION DES CONVERSATIONS ====================

  async toggleArchiveConversation(conversation: Conversation) {
    const newStatus =
      conversation.status === 'archived' ? 'active' : 'archived';
    const confirmMessage =
      newStatus === 'archived'
        ? 'Voulez-vous vraiment archiver cette conversation ?'
        : 'Voulez-vous vraiment désarchiver cette conversation ?';

    if (!confirm(confirmMessage)) return;

    try {
      await this.messageService.updateConversationStatus(
        conversation.id!,
        this.currentUser.uid,
        newStatus,
      );

      // Mettre à jour localement
      conversation.status = newStatus;

      if (this.selectedConversation?.id === conversation.id) {
        this.selectedConversation = conversation;
      }

      alert(
        `Conversation ${
          newStatus === 'archived' ? 'archivée' : 'désarchivée'
        } avec succès`,
      );
    } catch (error) {
      console.error('Erreur lors du changement de statut:', error);
      alert('Erreur lors du changement de statut');
    }
  }

  async deleteConversation(conversation: Conversation) {
    if (
      !confirm(
        'Voulez-vous vraiment supprimer cette conversation? Cette action est irréversible.',
      )
    ) {
      return;
    }

    try {
      await this.messageService.deleteConversation(
        conversation.id!,
        this.currentUser.uid,
      );

      // Retirer de la liste
      this.conversations = this.conversations.filter(
        (c) => c.id !== conversation.id,
      );

      if (this.selectedConversation?.id === conversation.id) {
        this.selectedConversation = null;
        this.messages = [];
        this.showNewMessagesButton = false;
        this.newMessagesCount = 0;
      }

      alert('Conversation supprimée avec succès');
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
      alert('Erreur lors de la suppression');
    }
  }

  async blockUser(conversation: Conversation) {
    const otherUserId =
      this.userRole === 'buyer'
        ? conversation.producerId
        : conversation.buyerId;
    const otherUserName = this.getOtherUserName(conversation);

    if (
      !confirm(
        `Voulez-vous vraiment bloquer ${otherUserName}? Vous ne pourrez plus recevoir de messages de cette personne.`,
      )
    ) {
      return;
    }

    try {
      await this.messageService.blockUser(this.currentUser.uid, otherUserId);

      // Mettre à jour localement
      conversation.status = 'blocked';

      if (this.selectedConversation?.id === conversation.id) {
        this.selectedConversation = null;
        this.messages = [];
        this.showNewMessagesButton = false;
        this.newMessagesCount = 0;
      }

      alert('Utilisateur bloqué avec succès');
    } catch (error) {
      console.error('Erreur lors du blocage:', error);
      alert('Erreur lors du blocage');
    }
  }

  // ==================== UTILITAIRES ET GETTERS ====================

  get filteredConversations(): Conversation[] {
    let filtered = this.conversations;

    // Filtrer par recherche
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(
        (conversation) =>
          this.getOtherUserName(conversation).toLowerCase().includes(query) ||
          conversation.lastMessage.toLowerCase().includes(query) ||
          (conversation.productName || '').toLowerCase().includes(query),
      );
    }

    // Filtrer par statut
    switch (this.conversationFilter) {
      case 'unread':
        filtered = filtered.filter(
          (c) =>
            this.getConversationUnreadCount(c) > 0 && c.status !== 'archived',
        );
        break;
      case 'archived':
        filtered = filtered.filter((c) => c.status === 'archived');
        break;
      case 'all':
      default:
        filtered = filtered.filter((c) => c.status === 'active');
        break;
    }

    // Trier par date (le plus récent en premier)
    return filtered.sort((a, b) => {
      return (
        new Date(b.lastMessageTime).getTime() -
        new Date(a.lastMessageTime).getTime()
      );
    });
  }

  getConversationUnreadCount(conversation: Conversation): number {
    return this.userRole === 'buyer'
      ? conversation.unreadBy.buyer
      : conversation.unreadBy.producer;
  }

  getUnreadCount(): number {
    return this.conversations.reduce((sum, conv) => {
      return sum + this.getConversationUnreadCount(conv);
    }, 0);
  }

  getActiveConversationsCount(): number {
    return this.conversations.filter((c) => c.status === 'active').length;
  }

  getConversationTime(conversation: Conversation): string {
    const date = new Date(conversation.lastMessageTime);
    return this.formatRelativeTime(date);
  }

  getLastMessagePreview(conversation: Conversation): string {
    if (!conversation.lastMessage) return 'Aucun message';

    const preview =
      conversation.lastMessage.length > 50
        ? conversation.lastMessage.substring(0, 50) + '...'
        : conversation.lastMessage;

    return preview;
  }

  getMessageTime(message: Message): string {
    const date = new Date(message.timestamp);
    return date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  getMessageDate(message: Message): string {
    const date = new Date(message.timestamp);
    const now = new Date();

    if (date.toDateString() === now.toDateString()) {
      return "Aujourd'hui";
    }

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === yesterday.toDateString()) {
      return 'Hier';
    }

    // Cette semaine
    const diffDays = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (diffDays < 7) {
      return date.toLocaleDateString('fr-FR', { weekday: 'long' });
    }

    // Cette année
    if (date.getFullYear() === now.getFullYear()) {
      return date.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
      });
    }

    // Autre année
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  getMessageStatusIcon(message: Message): string {
    if (message.read) return '✓✓';
    if (message.delivered) return '✓✓';
    return '✓';
  }

  getOtherUserStatus(conversation: Conversation): string {
    // Logique simplifiée - dans une vraie app, vous vérifieriez le statut réel
    const otherUserId =
      this.userRole === 'buyer'
        ? conversation.producerId
        : conversation.buyerId;

    // Simulation basique
    return Math.random() > 0.5 ? 'online' : 'offline';
  }

  private formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "À l'instant";
    if (diffMins < 60) return `Il y a ${diffMins} min`;
    if (diffHours < 24) return `Il y a ${diffHours} h`;
    if (diffDays === 1) return 'Hier';
    if (diffDays < 7) return `Il y a ${diffDays} j`;

    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }

  onSearchInput() {
    // Le filtrage se fait automatiquement via le getter filteredConversations
  }

  private cleanupListeners() {
    if (this.conversationsUnsubscribe) {
      this.conversationsUnsubscribe();
    }
    if (this.messagesUnsubscribe) {
      this.messagesUnsubscribe();
    }
  }

  // ==================== MÉTHODES DE TRACKING ====================

  trackByConversationId(index: number, conversation: Conversation): string {
    return conversation.id || index.toString();
  }

  trackByMessageId(index: number, message: Message): string {
    return message.id || index.toString();
  }

  trackByProducerId(index: number, producer: Producer): string {
    return producer.id;
  }

  isSentMessage(message: Message): boolean {
    return message.senderId === this.currentUser.uid;
  }

  getOtherUserName(conversation: Conversation): string {
    return this.userRole === 'buyer'
      ? conversation.producerName
      : conversation.buyerName;
  }

  getOtherUserAvatar(conversation: Conversation): string {
    return this.userRole === 'buyer'
      ? conversation.producerAvatar || '👨‍🌾'
      : conversation.buyerAvatar || '👤';
  }

  formatDate(date: Date): string {
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  // ==================== DONNÉES DE DÉMO ====================

  getFallbackConversations(): Conversation[] {
    return [
      {
        id: '1',
        buyerId: this.currentUser.uid,
        buyerName: this.currentUser.fullName || 'Acheteur',
        buyerAvatar: '👤',
        producerId: 'prod1',
        producerName: 'Ferme Bio Dupont',
        producerAvatar: '🌾',
        productId: 'prod123',
        productName: 'Tomates cerises bio',
        lastMessage: 'Bonjour, votre commande sera livrée demain matin.',
        lastMessageTime: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes
        unreadCount: 0,
        unreadBy: { buyer: 0, producer: 0 },
        status: 'active',
        isTyping: { buyer: false, producer: false },
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2), // 2 jours
        updatedAt: new Date(),
        participants: [this.currentUser.uid, 'prod1'],
      },
      {
        id: '2',
        buyerId: this.currentUser.uid,
        buyerName: this.currentUser.fullName || 'Acheteur',
        buyerAvatar: '👤',
        producerId: 'prod2',
        producerName: 'Laiterie Martin',
        producerAvatar: '🐄',
        productId: 'prod456',
        productName: 'Fromage de chèvre',
        lastMessage: 'Nous avons reçu votre paiement, merci!',
        lastMessageTime: new Date(Date.now() - 1000 * 60 * 60 * 3), // 3 heures
        unreadCount: 2,
        unreadBy: { buyer: 2, producer: 0 },
        status: 'active',
        isTyping: { buyer: false, producer: true },
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5), // 5 jours
        updatedAt: new Date(),
        participants: [this.currentUser.uid, 'prod2'],
      },
      {
        id: '3',
        buyerId: this.currentUser.uid,
        buyerName: this.currentUser.fullName || 'Acheteur',
        buyerAvatar: '👤',
        producerId: 'prod3',
        producerName: 'Verger du Soleil',
        producerAvatar: '🍎',
        productId: 'prod789',
        productName: 'Pommes Golden',
        lastMessage: 'Les pommes seront récoltées la semaine prochaine.',
        lastMessageTime: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 jour
        unreadCount: 0,
        unreadBy: { buyer: 0, producer: 0 },
        status: 'archived',
        isTyping: { buyer: false, producer: false },
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10), // 10 jours
        updatedAt: new Date(),
        participants: [this.currentUser.uid, 'prod3'],
      },
    ];
  }

  getFallbackProducers(): Producer[] {
    return [
      {
        id: 'prod1',
        name: 'Jean Dupont',
        farmName: 'Ferme Bio Les Prés Verts',
        avatar: '🌾',
        location: 'Normandie',
        rating: 4.8,
        reviews: 124,
        description:
          'Producteur bio spécialisé en légumes de saison depuis 15 ans.',
        phone: '+33 6 12 34 56 78',
        email: 'jean.dupont@fermebio.fr',
        certifications: ['AB', 'Nature & Progrès'],
        isOrganic: true,
        isOnline: true,
        lastSeen: new Date(),
        productsCount: 24,
        responseRate: 95,
        averageResponseTime: 45,
      },
      {
        id: 'prod2',
        name: 'Marie Martin',
        farmName: 'Laiterie du Val Fleuri',
        avatar: '🐄',
        location: 'Savoie',
        rating: 4.9,
        reviews: 89,
        description:
          'Fromagerie artisanale produisant des fromages au lait cru.',
        phone: '+33 6 23 45 67 89',
        email: 'marie.martin@laiterie.fr',
        certifications: ['AOP', 'Label Rouge'],
        isOrganic: false,
        isOnline: false,
        lastSeen: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 heures
        productsCount: 15,
        responseRate: 98,
        averageResponseTime: 30,
      },
      {
        id: 'prod3',
        name: 'Pierre Lambert',
        farmName: 'Verger du Soleil',
        avatar: '🍎',
        location: 'Alsace',
        rating: 4.7,
        reviews: 67,
        description:
          'Verger familial produisant des fruits de qualité depuis 3 générations.',
        phone: '+33 6 34 56 78 90',
        email: 'pierre.lambert@verger.fr',
        certifications: ['Vergers Écoresponsables'],
        isOrganic: true,
        isOnline: true,
        lastSeen: new Date(),
        productsCount: 18,
        responseRate: 92,
        averageResponseTime: 60,
      },
    ];
  }
}

import { Timestamp } from 'firebase/firestore';

export type StoryThemeId =
  | 'creation'
  | 'rencontres'
  | 'solitudes'
  | 'premiers-elans'
  | 'quotidien';

export type StoryVisibility = 'public' | 'private';

export type StoryFormat = 'confession' | 'roman';

export type ReleaseCadence = 'unique' | 'hebdomadaire' | 'bihebdomadaire' | 'libre';

export type SeriesStatus = 'complet' | 'en-cours' | 'termine';

export type NovelGenre =
  | 'contemporain'
  | 'drame'
  | 'romance'
  | 'poeme'
  | 'historique'
  | 'fantastique'
  | 'polar'
  | 'essai'
  | 'autre';

export type PlagiarismReportReason = 'copie-interne' | 'oeuvre-publiee' | 'autre';

export type EchoReplyType = 'comment' | 'resonance' | 'question' | 'experience';

export type ExchangeKind = 'story' | 'direct';

export type ExchangeStatus = 'active' | 'archived';

export type WallItemKind = 'photo' | 'music' | 'novel' | 'note';

export type WallAccentTone = 'ink' | 'ochre' | 'terracotta' | 'sage' | 'sand';

export interface PublicProfile {
  userId: string;
  displayName: string;
  bio: string;
  listeningNote: string;
  favoriteTrackTitle?: string;
  favoriteTrackArtist?: string;
  favoriteTrackUrl?: string;
  favoriteNovel?: string;
  interests?: string;
  avatarUrl?: string;
  discoverable?: boolean;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface WallItem {
  itemId: string;
  ownerId: string;
  ownerName: string;
  visibility: 'public';
  kind: WallItemKind;
  title: string;
  subtitle: string;
  body: string;
  mediaUrl: string;
  accentTone: WallAccentTone;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export type CustomSalonVisibility = 'public' | 'private';

export type StoryScope = 'salon' | 'pelemele';

export type SalonMemberStatus = 'pending' | 'approved' | 'rejected';

export type SalonMemberRole = 'owner' | 'member';

export interface Story {
  storyId: string;
  authorId: string;
  authorName: string;
  title: string;
  excerpt: string;
  content: string;
  theme: StoryThemeId;
  storyScope?: StoryScope;
  customSalonId?: string;
  customSalonName?: string;
  customSalonVisibility?: CustomSalonVisibility;
  storyFormat?: StoryFormat;
  novelGenre?: NovelGenre;
  coverUrl?: string;
  plagiarismAttested?: boolean;
  releaseCadence?: ReleaseCadence;
  seriesStatus?: SeriesStatus;
  chapterCount?: number;
  lastChapterId?: string;
  promptQuestion: string;
  visibility: StoryVisibility;
  isAnonymous?: boolean;
  readingMinutes: number;
  resonanceCount: number;
  echoCount: number;
  lastEchoId?: string;
  viewCount?: number;
  lastViewId?: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface PlagiarismReport {
  storyId: string;
  reporterId: string;
  reporterName: string;
  reason: PlagiarismReportReason;
  details: string;
  referenceUrl: string;
  createdAt: Timestamp | null;
}

export interface CustomSalon {
  salonId: string;
  name: string;
  description: string;
  promptQuestion: string;
  admissionRules: string;
  visibility: CustomSalonVisibility;
  ownerId: string;
  ownerName: string;
  accentTone: WallAccentTone;
  memberCount: number;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface SalonMember {
  userId: string;
  salonId: string;
  salonOwnerId: string;
  userName: string;
  requestNote: string;
  status: SalonMemberStatus;
  role: SalonMemberRole;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface CustomSalonMessage {
  messageId: string;
  salonId: string;
  senderId: string;
  senderName: string;
  content: string;
  createdAt: Timestamp | null;
}

export interface StoryViewEvent {
  viewId: string;
  storyId: string;
  authorId: string;
  viewerId: string;
  dateKey: string;
  createdAt: Timestamp | null;
}

export interface StoryResonanceEvent {
  userId: string;
  storyId: string;
  authorId?: string;
  createdAt: Timestamp | null;
}

export interface Chapter {
  chapterId: string;
  storyId: string;
  authorId: string;
  storyVisibility: StoryVisibility;
  chapterNumber: number;
  title: string;
  content: string;
  authorNote: string;
  readingMinutes: number;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface Echo {
  echoId: string;
  storyId: string;
  storyVisibility: 'public';
  authorId: string;
  authorName: string;
  replyType: EchoReplyType;
  content: string;
  createdAt: Timestamp | null;
}

export interface SalonMessage {
  messageId: string;
  salonId: StoryThemeId;
  senderId: string;
  senderName: string;
  content: string;
  createdAt: Timestamp | null;
}

export interface Exchange {
  exchangeId: string;
  kind?: ExchangeKind;
  storyId: string;
  storyTitle: string;
  initiatorId: string;
  initiatorName: string;
  recipientId: string;
  recipientName: string;
  participantIds: string[];
  status: ExchangeStatus;
  lastMessagePreview: string;
  lastSenderId: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface ExchangeMessage {
  messageId: string;
  exchangeId: string;
  senderId: string;
  senderName: string;
  participantIds: string[];
  content: string;
  createdAt: Timestamp | null;
}

export interface StoryBookmark {
  userId: string;
  storyId: string;
  storyTitle: string;
  storyExcerpt: string;
  storyAuthorId: string;
  storyAuthorName: string;
  storyTheme: StoryThemeId;
  customSalonId?: string;
  customSalonName?: string;
  storyScope?: StoryScope;
  storyFormat?: StoryFormat;
  readingMinutes: number;
  createdAt: Timestamp | null;
}

export interface StoryRepost {
  repostId: string;
  reposterId: string;
  reposterName: string;
  storyId: string;
  storyTitle: string;
  storyExcerpt: string;
  storyAuthorId: string;
  storyAuthorName: string;
  storyTheme: StoryThemeId;
  customSalonId?: string;
  customSalonName?: string;
  storyScope?: StoryScope;
  storyFormat?: StoryFormat;
  readingMinutes: number;
  note: string;
  visibility: StoryVisibility;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface StoryQuote {
  quoteId: string;
  userId: string;
  storyId: string;
  chapterNumber: number;
  chapterTitle?: string;
  paragraphIndex: number;
  quoteText: string;
  storyTitle: string;
  storyAuthorId: string;
  storyAuthorName: string;
  storyTheme: StoryThemeId;
  customSalonId?: string;
  customSalonName?: string;
  storyScope?: StoryScope;
  storyFormat?: StoryFormat;
  createdAt: Timestamp | null;
}

export const ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export const FIELD_LIMITS = {
  displayName: { min: 2, max: 60 },
  bio: { max: 320 },
  listeningNote: { max: 200 },
  favoriteTrackTitle: { max: 120 },
  favoriteTrackArtist: { max: 100 },
  favoriteTrackUrl: { max: 500 },
  favoriteNovel: { max: 140 },
  interests: { max: 240 },
  avatarUrl: { max: 60000 },
  wallTitle: { min: 1, max: 140 },
  wallSubtitle: { max: 140 },
  wallBody: { max: 600 },
  wallMediaUrl: { max: 160000 },
  title: { min: 3, max: 140 },
  excerpt: { min: 10, max: 300 },
  content: { min: 20, max: 8000 },
  chapterTitle: { min: 2, max: 140 },
  chapterContent: { min: 20, max: 12000 },
  chapterNote: { max: 400 },
  promptQuestion: { max: 240 },
  echoContent: { min: 2, max: 1500 },
  salonChatContent: { min: 1, max: 1000 },
  messageContent: { min: 1, max: 2000 },
  lastMessagePreview: { max: 160 },
  salonName: { min: 3, max: 80 },
  salonDescription: { min: 10, max: 360 },
  salonPrompt: { max: 240 },
  salonAdmissionRules: { max: 500 },
  salonRequestNote: { max: 300 },
  repostNote: { max: 280 },
  quoteText: { min: 3, max: 800 },
  coverUrl: { max: 160000 },
  plagiarismDetails: { min: 10, max: 600 },
  plagiarismRefUrl: { max: 300 },
} as const;

import { Timestamp } from 'firebase/firestore';

export type StoryThemeId =
  | 'creation'
  | 'rencontres'
  | 'solitudes'
  | 'premiers-elans'
  | 'quotidien'
  | 'faq';

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

export type MemberBadgeId =
  | 'administrateur'
  | 'moderateur'
  | 'expert_litteraire'
  | 'plume_confirmee'
  | 'grand_lecteur';

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
  commentsDisabled?: boolean;
  isAdmin?: boolean;
  badges?: MemberBadgeId[];
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

export type SalonMemberRole = 'owner' | 'moderator' | 'member';

export interface PredefinedSalonModerator {
  userId: string;
  salonId: StoryThemeId;
  userName: string;
  assignedById: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export type AgeRating = 0 | 13 | 16 | 18;

export interface PrivateUserInfo {
  email: string;
  declaredAge?: number;
  birthYear?: number;
  ageUpdatedAt?: Timestamp | null;
  favoriteThemes?: StoryThemeId[];
  updatedAt: Timestamp | null;
}

export interface FavoriteAuthor {
  ownerId: string;
  authorId: string;
  authorName: string;
  createdAt: Timestamp | null;
}

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
  minAge?: AgeRating;
  isMature?: boolean;
  matureReason?: string;
  charterAttested?: boolean;
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
  avatarUrl?: string;
  minAge?: AgeRating;
  memberCount: number;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export type SalonThreadScope = 'predefined' | 'custom';

export interface SalonThread {
  threadId: string;
  salonScope: SalonThreadScope;
  salonId: string;
  authorId: string;
  authorName: string;
  title: string;
  body: string;
  minAge?: AgeRating;
  isMature?: boolean;
  matureReason?: string;
  replyCount: number;
  lastReplyId?: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface SalonThreadReply {
  replyId: string;
  threadId: string;
  salonId: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: Timestamp | null;
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
  hiddenFor?: string[];
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
  hiddenFor?: string[];
  content: string;
  createdAt: Timestamp | null;
}

export type UserRelationshipKind = 'blocked' | 'not_interested';

export interface UserRelationship {
  ownerId: string;
  targetUserId: string;
  targetName: string;
  relation: UserRelationshipKind;
  reason: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export type ModerationTargetType =
  | 'private_message'
  | 'story'
  | 'echo'
  | 'salon_message'
  | 'salon_thread'
  | 'thread_reply'
  | 'profile';

export type ContentGuardKind =
  | 'story'
  | 'chapter'
  | 'thread'
  | 'reply'
  | 'echo'
  | 'chat'
  | 'custom_salon';

export interface ContentGuardVerdict {
  allowed: boolean;
  blockedReason: string;
  botNotice: string;
  isMature: boolean;
  recommendedMinAge: AgeRating;
  matureReason: string;
  qualityIssue: boolean;
  model: string;
}

export type ModerationReportCategory =
  | 'propos-outrageants'
  | 'harcelement'
  | 'haine-discrimination'
  | 'contenu-inapproprie'
  | 'usurpation-spam'
  | 'plagiat'
  | 'autre';

export type ModerationCaseStatus =
  | 'open'
  | 'under_review'
  | 'resolved_warned'
  | 'resolved_dismissed';

export type ModerationReviewStep =
  | 'recu'
  | 'analyse_faits'
  | 'evaluation_gravite'
  | 'decision_prise';

export type ModerationGravityLevel = 'aucune' | 'moderee' | 'grave' | 'critique';

export type ModerationAiVerdict =
  | 'outrage_confirme'
  | 'incertain_a_verifier'
  | 'aucun_outrage';

export type ModerationAiRecommendedAction = 'avertir' | 'examen_manuel' | 'classer';

export interface ModerationAiAnalysis {
  analyzedAtIso: string;
  model: string;
  verdict: ModerationAiVerdict;
  confidencePercent: number;
  recommendedAction: ModerationAiRecommendedAction;
  suggestedGravity: ModerationGravityLevel;
  suggestedCriteria: string[];
  summary: string;
  suggestedDecisionReason: string;
  needsAdminIntervention: boolean;
  interventionReason: string;
}

export interface ModerationCase {
  caseId: string;
  reporterId: string;
  reporterName: string;
  targetUserId: string;
  targetUserName: string;
  targetType: ModerationTargetType;
  targetId: string;
  targetContextId: string;
  targetExcerpt: string;
  category: ModerationReportCategory;
  description: string;
  status: ModerationCaseStatus;
  reviewStep: ModerationReviewStep;
  evaluationCriteria: string[];
  gravityLevel: ModerationGravityLevel;
  caseNotes: string;
  decisionReason: string;
  warningIssued: boolean;
  warningId?: string;
  reviewerId?: string;
  reviewerName?: string;
  reviewedAt?: Timestamp | null;
  aiAnalysis?: ModerationAiAnalysis;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export type WarningSeverity = 'moderee' | 'grave' | 'critique';

export interface MemberWarning {
  warningId: string;
  caseId: string;
  targetUserId: string;
  targetUserName: string;
  category: ModerationReportCategory;
  severity: WarningSeverity;
  justification: string;
  excerptSnapshot: string;
  issuedById: string;
  issuedByName: string;
  acknowledged: boolean;
  acknowledgedAt?: Timestamp | null;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
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
  memberBadgesMax: 5,
  userAge: { min: 13, max: 115 },
  wallTitle: { min: 1, max: 140 },
  wallSubtitle: { max: 140 },
  wallBody: { max: 600 },
  wallMediaUrl: { max: 160000 },
  title: { min: 3, max: 140 },
  excerpt: { min: 10, max: 300 },
  content: { min: 20, max: 8000 },
  romanChapterMinChars: 3000,
  confessionMinChars: 160,
  confessionMinLines: 4,
  chapterTitle: { min: 2, max: 140 },
  chapterContent: { min: 20, max: 12000 },
  chapterNote: { max: 400 },
  promptQuestion: { max: 240 },
  matureReason: { max: 180 },
  echoContent: { min: 2, max: 1500 },
  salonChatContent: { min: 1, max: 1000 },
  messageContent: { min: 1, max: 2000 },
  lastMessagePreview: { max: 160 },
  salonName: { min: 3, max: 80 },
  salonDescription: { min: 10, max: 360 },
  salonPrompt: { max: 240 },
  salonAdmissionRules: { max: 500 },
  salonRequestNote: { max: 300 },
  threadTitle: { min: 4, max: 140 },
  threadBody: { max: 1500 },
  threadReply: { min: 2, max: 1200 },
  repostNote: { max: 280 },
  quoteText: { min: 3, max: 800 },
  coverUrl: { max: 160000 },
  plagiarismDetails: { min: 10, max: 600 },
  plagiarismRefUrl: { max: 300 },
  relationshipReason: { max: 240 },
  moderationExcerpt: { max: 1000 },
  moderationDescription: { min: 10, max: 800 },
  moderationNotes: { max: 1000 },
  moderationDecisionReason: { min: 10, max: 800 },
} as const;

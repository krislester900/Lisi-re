import { Timestamp } from 'firebase/firestore';

export type StoryThemeId =
  | 'creation'
  | 'rencontres'
  | 'solitudes'
  | 'premiers-elans'
  | 'quotidien';

export type StoryVisibility = 'public' | 'private';

export type EchoReplyType = 'resonance' | 'question' | 'experience';

export type ExchangeStatus = 'active' | 'archived';

export interface PublicProfile {
  userId: string;
  displayName: string;
  bio: string;
  listeningNote: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface Story {
  storyId: string;
  authorId: string;
  authorName: string;
  title: string;
  excerpt: string;
  content: string;
  theme: StoryThemeId;
  promptQuestion: string;
  visibility: StoryVisibility;
  readingMinutes: number;
  resonanceCount: number;
  echoCount: number;
  lastEchoId?: string;
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

export interface Exchange {
  exchangeId: string;
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

export const ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export const FIELD_LIMITS = {
  displayName: { min: 2, max: 60 },
  bio: { max: 320 },
  listeningNote: { max: 200 },
  title: { min: 3, max: 140 },
  excerpt: { min: 10, max: 300 },
  content: { min: 20, max: 8000 },
  promptQuestion: { max: 240 },
  echoContent: { min: 5, max: 1500 },
  messageContent: { min: 1, max: 2000 },
  lastMessagePreview: { max: 160 },
} as const;

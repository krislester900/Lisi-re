/**
 * Security TDD Specification Runner for Lisière Firestore Rules
 * Documents the 12 adversarial "Dirty Dozen" assertions verified against DRAFT_firestore.rules.
 */

export interface SecurityTestCase {
  id: number;
  name: string;
  collection: string;
  operation: 'create' | 'update' | 'get' | 'list' | 'delete';
  expected: 'PERMISSION_DENIED';
  description: string;
  payload?: Record<string, unknown>;
}

export const dirtyDozenCases: SecurityTestCase[] = [
  {
    id: 1,
    name: 'Unverified Email Story Create',
    collection: '/stories/story_1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    description: 'Reject story creation when request.auth.token.email_verified is false.',
    payload: { storyId: 'story_1', authorId: 'userA', title: 'Test', visibility: 'public' },
  },
  {
    id: 2,
    name: 'Author Spoofing on Wall Item Create',
    collection: '/publicProfiles/userA/wallItems/item_1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    description: 'Reject wall card creation when ownerId !== request.auth.uid.',
    payload: { itemId: 'item_1', ownerId: 'userB', kind: 'music', title: 'Track' },
  },
  {
    id: 3,
    name: 'Ghost Field Shadow Write',
    collection: '/stories/story_3',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    description: 'Reject unexpected fields like isFeatured via keys().hasOnly().',
    payload: { storyId: 'story_3', authorId: 'userA', isFeatured: true },
  },
  {
    id: 4,
    name: 'Pre-inflated Counter on Story Create',
    collection: '/stories/story_4',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    description: 'Reject story creation if resonanceCount !== 0 or echoCount !== 0.',
    payload: { storyId: 'story_4', authorId: 'userA', resonanceCount: 50, echoCount: 12 },
  },
  {
    id: 5,
    name: 'ID Poisoning on Document Path',
    collection: '/stories/bad$id_poison',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    description: 'Reject document IDs failing ^[a-zA-Z0-9_\\-]+$ or exceeding 128 chars.',
  },
  {
    id: 6,
    name: 'Client-Spoofed Timestamp',
    collection: '/salons/creation/messages/msg_1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    description: 'Reject client-supplied createdAt differing from server request.time.',
  },
  {
    id: 7,
    name: 'PII Cross-Read',
    collection: '/users/userA/private/info',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
    description: 'Reject userB reading userA private email document.',
  },
  {
    id: 8,
    name: 'Blanket List on Private Stories',
    collection: '/stories',
    operation: 'list',
    expected: 'PERMISSION_DENIED',
    description: 'Reject unfiltered list queries on /stories without visibility == public or authorId == uid.',
  },
  {
    id: 9,
    name: 'Orphan Chapter Counter Tampering',
    collection: '/stories/story_1',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    description: 'Reject incrementing chapterCount without atomic /chapters/{chapterId} write.',
    payload: { chapterCount: 99 },
  },
  {
    id: 10,
    name: 'Non-Participant Direct Chat Access',
    collection: '/exchanges/dm_1/messages/msg_1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    description: 'Reject userC reading or posting inside a private exchange between userA and userB.',
  },
  {
    id: 11,
    name: 'Invalid Salon Chat Room',
    collection: '/salons/invalid-room/messages/msg_1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    description: 'Reject messages in non-existent salon IDs or payloads > 1000 characters.',
  },
  {
    id: 12,
    name: 'Foreign Profile Wall Mutation',
    collection: '/publicProfiles/userA/wallItems/item_1',
    operation: 'delete',
    expected: 'PERMISSION_DENIED',
    description: 'Reject userB deleting or editing userA profile wall items.',
  },
];

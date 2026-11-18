# Security Specification — Lisière

## 1. Data Invariants
1. **Identity Integrity**: Every write operation requires an authenticated, email-verified user (`request.auth != null && request.auth.token.email_verified == true`), and any author/sender/owner/initiator UID field must strictly equal `request.auth.uid`.
2. **PII Isolation**: User email addresses are stored exclusively in `/users/{userId}/private/info` and are readable/writable only by `request.auth.uid == userId`. `/publicProfiles/{userId}` contains zero PII and is only listable by signed-in members when `resource.data.discoverable == true` (or by the owner).
3. **Profile Wall Ownership**: `/publicProfiles/{userId}/wallItems/{itemId}` is publicly readable (`visibility == 'public'`) but writable/deletable strictly by `request.auth.uid == userId` (`ownerId == request.auth.uid`).
4. **Story & Chapter Privacy**: Stories with `visibility == 'private'` and their chapters are readable and listable only by their `authorId`. Adding a chapter atomically increments `chapterCount` and sets `lastChapterId` via `getAfter` / `existsAfter`.
5. **Atomic Counters**: Story `resonanceCount`, `echoCount`, and `chapterCount` can only change in lockstep with `/resonances/{userId}`, `/echoes/{echoId}`, or `/chapters/{chapterId}` via `existsAfter` / `getAfter` batch verification.
6. **Salon Public Text Chat**: `/salons/{salonId}/messages/{messageId}` is readable by signed-in members when `resource.data.salonId == salonId` and writable only by verified users for the 5 valid salons (`creation`, `rencontres`, `solitudes`, `premiers-elans`, `quotidien`), strictly text-only.
7. **Private Exchanges**: `/exchanges/{exchangeId}` and `/exchanges/{exchangeId}/messages/{messageId}` are strictly restricted to the exact two UIDs listed in `participantIds`, whether anchored to a public story or opened as a direct private chat with another member (`kind == 'direct'`).

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unverified Email Story Create**: `{ authorId: uid, ... }` with `email_verified: false` -> `PERMISSION_DENIED`.
2. **Author Spoofing on Story or Wall Item Create**: `{ ownerId: "other-uid", ... }` -> `PERMISSION_DENIED`.
3. **Ghost Field Shadow Write on Wall Item or Story**: `{ ..., isFeatured: true }` -> `PERMISSION_DENIED`.
4. **Pre-inflated Counter on Story Create**: `{ resonanceCount: 99, echoCount: 10 }` -> `PERMISSION_DENIED`.
5. **ID Poisoning on Document Path**: 200-char or symbol-filled `storyId` or `itemId` (`"bad/id$1"`) -> `PERMISSION_DENIED`.
6. **Client-Spoofed Timestamp**: `{ createdAt: "2020-01-01T00:00:00Z" }` instead of `request.time` -> `PERMISSION_DENIED`.
7. **PII Cross-Read**: User B attempts `get` on `/users/userA/private/info` -> `PERMISSION_DENIED`.
8. **Blanket List on Private Stories or Hidden Profiles**: Client queries `/stories` without `visibility == 'public'` or `authorId == uid` -> `PERMISSION_DENIED`.
9. **Orphan Chapter / Counter Tampering**: User updates `stories/{id}.chapterCount` or `resonanceCount` directly without atomic subcollection write -> `PERMISSION_DENIED`.
10. **Non-Participant Direct Chat Access**: User C attempts `get` or `create` message on a private exchange between User A and User B -> `PERMISSION_DENIED`.
11. **Invalid Salon Chat Target or Oversized Payload**: Posting a message to `/salons/unknown/messages/msg_1` or > 1000 chars -> `PERMISSION_DENIED`.
12. **Foreign Wall Mutation**: User B attempts to create or delete a wall card under `/publicProfiles/userA/wallItems/item_1` -> `PERMISSION_DENIED`.

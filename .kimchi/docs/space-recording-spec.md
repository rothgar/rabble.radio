# Space recording and replay spec

## Goal
Record every space by default when it goes live, store the audio in object storage, and let hosts download the recording for up to 30 days after the live session ends.

## Architecture overview

Add three new infrastructure containers to the Docker Compose stack:
- `redis` — small coordination cache required by LiveKit Egress.
- `minio` — S3-compatible object store for recording files.
- `livekit-egress` — LiveKit Egress service that records room audio to MP3/MP4 and uploads to MinIO.

The Rabble app already owns all application logic. It will:
- Start a `TrackCompositeEgress` (audio-only) when the host clicks **Go Live**.
- Stop the egress when the host clicks **End Live**.
- Persist recording metadata in Postgres via a new `Recording` model.
- Generate short-lived signed MinIO URLs so hosts can download recordings.
- Expire/delete recordings older than 30 days via a scheduled cleanup.

## Chunks

### Chunk 1: Infrastructure — MinIO, Redis, Egress
**Files changed:**
- `docker-compose.yml`
- `livekit-egress.yaml` (new)
- `.env.example`

**Goal:** Add recording infrastructure to the local and remote Docker Compose stack.

**Detailed changes:**
1. In `docker-compose.yml`:
   - Add `redis` service (Redis 7-alpine) with a volume.
   - Add `minio` service (MinIO latest) with:
     - Environment: `MINIO_ROOT_USER=minio`, `MINIO_ROOT_PASSWORD=minio-secret`.
     - Command: `server /data --console-address ":9001"`.
     - Ports: `9000` (S3 API) and `9001` (console).
     - Volume: `minio-data`.
   - Add `livekit-egress` service (livekit/egress:latest) with:
     - Config mounted from `./livekit-egress.yaml`.
     - Depends on `redis` and `minio`.
   - Update `livekit` service to depend on `redis`.
   - Update `app` service environment:
     - `RECORDING_BUCKET=rabble-recordings`
     - `S3_ENDPOINT=http://minio:9000`
     - `S3_ACCESS_KEY=minio`
     - `S3_SECRET_KEY=minio-secret`
     - `S3_REGION=us-east-1`
     - `EGRESS_WS_URL=ws://livekit-egress:7880`
2. Create `livekit-egress.yaml`:
   ```yaml
   redis:
     address: redis:6379
   api_key: devkey
   api_secret: devsecret0123456789abcdef0123456789abcdef
   ws_url: ws://livekit:7880
   log_level: info
   s3:
     endpoint: http://minio:9000
     region: us-east-1
     bucket: rabble-recordings
     access_key: minio
     secret: minio-secret
     force_path_style: true
   ```
3. Update `.env.example` with the new variables.

**Acceptance criteria:**
- `docker compose up -d` starts all services.
- `docker ps` shows `rabble-minio`, `rabble-redis`, `rabble-livekit-egress` healthy/running.

### Chunk 2: Prisma schema and migration
**Files changed:**
- `prisma/schema.prisma`
- `prisma/migrations/20240817000002_add_recording/migration.sql` (new)

**Goal:** Add a `Recording` table to track stored recordings.

**Detailed changes:**
1. In `prisma/schema.prisma` add:
   ```prisma
   model Recording {
     id          String    @id @default(cuid())
     spaceId     String
     egressId    String    @unique
     status      String    @default("starting")
     startedAt   DateTime  @default(now())
     endedAt     DateTime?
     expiresAt   DateTime
     s3Key       String
     s3Bucket    String
     contentType String    @default("audio/mpeg")
     sizeBytes   Int?
     downloadUrl String?
     hostDid     String
     createdAt   DateTime  @default(now())
     updatedAt   DateTime  @updatedAt

     space Space @relation(fields: [spaceId], references: [id], onDelete: Cascade)

     @@index([spaceId])
     @@index([expiresAt])
     @@index([status])
   }
   ```
2. Add the relation field to `Space`:
   ```prisma
   recordings Recording[]
   ```
3. Create migration SQL to add the table and indexes.

**Acceptance criteria:**
- Migration applies cleanly.
- Prisma client includes `Recording` model.

### Chunk 3: Egress client and recording helpers
**Files changed:**
- `src/lib/livekit.ts`
- `src/lib/recording.ts` (new)
- `src/lib/storage.ts` (new)

**Goal:** Wrap LiveKit Egress API calls and signed MinIO URL generation.

**Detailed changes:**
1. In `src/lib/livekit.ts`:
   - Add `getEgressClient()` that returns a cached `EgressClient` using `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
   - Add `startRecording(spaceId, roomName)`:
     - Call `egressClient.startTrackCompositeEgress(roomName, { fileType: EncodedFileType.MP4, filepath: `recordings/{roomName}-{Date.now()}.mp4`, s3: {...} }, { audio: true, video: false })`.
     - Return `{ egressId }`.
   - Add `stopRecording(egressId)`:
     - Call `egressClient.stopEgress(egressId)`.
2. Create `src/lib/storage.ts`:
   - Use `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` (or `minio` package) to generate signed GET URLs.
   - Export `getSignedDownloadUrl(s3Key, expiresInSeconds = 300)`.
   - Use environment variables for endpoint, credentials, region, bucket, force path style.
3. Create `src/lib/recording.ts`:
   - `createRecording(spaceId, hostDid, egressId, s3Key, s3Bucket, expiresAt)` — create `Recording` row.
   - `completeRecording(egressId, endedAt, sizeBytes?)` — set `status = 'available'`, `endedAt`, and generate `downloadUrl`.
   - `getRecordingForSpace(spaceId, hostDid)` — return the recording for a space if the caller is the host.
   - `expireOldRecordings()` — find recordings where `expiresAt < now` and `status != 'expired'`, delete the S3 object, set `status = 'expired'`, clear `downloadUrl`.
   - `refreshSignedUrl(recordingId)` — generate a new signed URL for an available recording.

**Acceptance criteria:**
- `getEgressClient()` returns a configured client.
- `startRecording` returns an egress ID.
- Signed URL generation works against MinIO.

### Chunk 4: Wire recording to live toggle
**Files changed:**
- `src/app/api/spaces/[id]/live/route.ts`
- `src/lib/spaces.ts`

**Goal:** Automatically start/stop recording when the host toggles live.

**Detailed changes:**
1. In `src/lib/spaces.ts`:
   - Update `setSpaceLive(id, isLive)` to return the `roomName` as well, or expose `roomNameForSpace(id)`.
2. In `src/app/api/spaces/[id]/live/route.ts`:
   - On `action: 'start'` (Go Live), after validating the host:
     - Get the room name.
     - Check if there's already an active `Recording` for this space; if yes, skip.
     - Call `startRecording(spaceId, roomName)`.
     - Call `createRecording(...)` with `expiresAt = now + 30 days`.
   - On `action: 'end'` (End Live):
     - Find the active `Recording` for this space.
     - Call `stopRecording(egressId)`.
     - Mark recording as completed with current timestamp.
     - Note: the actual file size/final URL may need a follow-up poll; for MVP, generate a signed URL immediately after stopping.
3. Add a small polling endpoint or extend the space detail API to update recording status. For MVP, generate the signed URL at stop time and accept that very recent recordings may briefly 404 until egress finishes uploading.

**Acceptance criteria:**
- Going live starts a recording.
- Ending live stops the recording.
- A `Recording` row exists after going live.

### Chunk 5: Download UI and API
**Files changed:**
- `src/app/api/spaces/[id]/recording/route.ts` (new)
- `src/app/spaces/[id]/page.tsx`
- `src/components/RecordingDownload.tsx` (new)

**Goal:** Hosts can download recordings after the space ends.

**Detailed changes:**
1. Create `src/app/api/spaces/[id]/recording/route.ts`:
   - `GET` — requires auth, requires caller to be host, returns `{ recording: { id, status, startedAt, endedAt, expiresAt, downloadUrl } | null }`.
   - `POST` — refresh signed URL; returns `{ downloadUrl }`.
2. In `src/app/spaces/[id]/page.tsx`:
   - For hosts, fetch the recording status and render `RecordingDownload`.
3. Create `src/components/RecordingDownload.tsx`:
   - Show "Recording available" with expiry date.
   - Show "Download recording" button linking to `downloadUrl`.
   - Show "Refresh link" button that POSTs to the API for a fresh signed URL.
   - Handle states: `starting`, `available`, `expired`, `none`.

**Acceptance criteria:**
- Host sees a download section on ended spaces.
- Download button opens a signed URL.
- Refresh button generates a new signed URL.

### Chunk 6: Expiration cleanup
**Files changed:**
- `src/app/api/spaces/recording/expire/route.ts` (new)
- `src/lib/recording.ts`

**Goal:** Delete recordings older than 30 days.

**Detailed changes:**
1. In `src/lib/recording.ts`:
   - Implement `expireOldRecordings()` using `deleteObject` from S3 client.
2. Create `src/app/api/spaces/recording/expire/route.ts`:
   - `POST` endpoint that calls `expireOldRecordings()` and returns `{ expired: number }`.
3. Optionally call `expireOldRecordings()` inside `GET /api/spaces` or a periodic cron. For MVP, a manual endpoint is acceptable; a lightweight setInterval in the app is not ideal.

**Acceptance criteria:**
- Calling the expire endpoint removes old S3 objects and marks rows expired.
- Expired recordings no longer show download buttons.

### Chunk 7: Build, test, and deploy
**Files changed:**
- None (verification)

**Goal:** Build image, deploy to `rabble.exe.xyz`, apply migration.

**Detailed changes:**
1. Run `pnpm typecheck` and `pnpm test`.
2. Sync source + migrations to remote.
3. On remote: run `docker compose up -d` to start new services, then `docker compose run --rm migrate npx prisma migrate deploy`.
4. Build image and restart app.
5. Verify health.
6. Create MinIO bucket (`rabble-recordings`) if it doesn't exist. This can be done via a one-time command: `docker exec rabble-minio mc mb /data/rabble-recordings` or by ensuring MinIO auto-creates it on first write.

**Acceptance criteria:**
- All containers running.
- Migration applied.
- Health check green.

## Notes
- Use `@aws-sdk/client-s3` v3 with `forcePathStyle: true` for MinIO compatibility.
- Egress is audio-only (`TrackCompositeEgress` with audio only). This keeps CPU/RAM usage lower than full room composite.
- MinIO console is exposed on port `9001` for debugging; do not expose it publicly via exe.dev.
- All new credentials are simple dev values; production should rotate them.
- The VM has limited RAM; if egress fails to start, consider scaling LiveKit/Egress to lower quality or switching to pure track egress for the host only.

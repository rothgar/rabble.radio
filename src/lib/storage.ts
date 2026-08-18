// src/lib/storage.ts
//
// Signed-URL helper for the S3-compatible object store (MinIO in dev).
// The egress service writes recordings directly to MinIO; the app issues
// short-lived pre-signed GET URLs so hosts can download them. We pin
// `forcePathStyle` because MinIO uses path-style addressing
// (`http://endpoint/bucket/key`) rather than the AWS S3 virtual-host style.
//
// Configuration (env vars):
//   S3_ENDPOINT    e.g. http://minio:9000 (Docker network) or http://127.0.0.1:9000
//   S3_REGION      e.g. us-east-1
//   S3_ACCESS_KEY  MinIO root user / IAM access key
//   S3_SECRET_KEY  MinIO root password / IAM secret
//   RECORDING_BUCKET default bucket name when callers don't supply one

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface StorageConfig {
  endpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  forcePathStyle: boolean;
}

export class StorageConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageConfigError';
  }
}

let cachedClient: S3Client | null = null;
let cachedConfig: StorageConfig | null = null;

function readEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/**
 * Read storage configuration from environment variables. Throws
 * `StorageConfigError` when any required value is missing so callers fail
 * fast instead of silently producing unusable URLs.
 */
export function getStorageConfig(): StorageConfig {
  if (cachedConfig) return cachedConfig;
  const endpoint = readEnv('S3_ENDPOINT');
  const region = readEnv('S3_REGION') ?? 'us-east-1';
  const accessKey = readEnv('S3_ACCESS_KEY');
  const secretKey = readEnv('S3_SECRET_KEY');
  const bucket = readEnv('RECORDING_BUCKET') ?? 'rabble-recordings';
  if (!endpoint) {
    throw new StorageConfigError(
      'S3_ENDPOINT is not configured. Set it to the MinIO/S3 API URL.'
    );
  }
  if (!accessKey || !secretKey) {
    throw new StorageConfigError(
      'S3_ACCESS_KEY and S3_SECRET_KEY must be configured.'
    );
  }
  cachedConfig = {
    endpoint,
    region,
    accessKey,
    secretKey,
    bucket,
    forcePathStyle: true,
  };
  return cachedConfig;
}

/**
 * Get (or lazily build) the S3 client. Cached because it carries no
 * per-call state and is expensive to construct.
 */
export function getStorageClient(): S3Client {
  if (cachedClient) return cachedClient;
  const cfg = getStorageConfig();
  cachedClient = new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    credentials: { accessKeyId: cfg.accessKey, secretAccessKey: cfg.secretKey },
    forcePathStyle: cfg.forcePathStyle,
  });
  return cachedClient;
}

/**
 * Reset the module-level caches. Used by tests that change env vars
 * between cases.
 */
export function __resetStorageCacheForTests(): void {
  cachedClient = null;
  cachedConfig = null;
}

/**
 * Build a pre-signed GET URL for `s3Key` in the configured bucket. Defaults
 * to a 5-minute expiry — short enough to discourage link sharing, long
 * enough for a normal download flow.
 */
export async function getSignedDownloadUrl(
  s3Key: string,
  expiresInSeconds: number = 300,
  bucketOverride?: string
): Promise<string> {
  if (!s3Key) {
    throw new StorageConfigError('s3Key is required for getSignedDownloadUrl.');
  }
  const cfg = getStorageConfig();
  const client = getStorageClient();
  const command = new GetObjectCommand({
    Bucket: bucketOverride ?? cfg.bucket,
    Key: s3Key,
  });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

/**
 * Best-effort: delete an object from the bucket. Returns `true` if the
 * delete was issued successfully (or the object did not exist); `false` on
 * any other error. Callers use this from the cleanup sweep and should not
 * treat a `false` return as fatal.
 */
export async function deleteObject(
  s3Key: string,
  bucketOverride?: string
): Promise<boolean> {
  try {
    const cfg = getStorageConfig();
    const client = getStorageClient();
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucketOverride ?? cfg.bucket,
        Key: s3Key,
      })
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Return the object's size in bytes, or `null` if the object does not
 * exist (or any other error occurs). Used by the recording completion
 * flow to populate `Recording.sizeBytes` once the upload lands.
 */
export async function getObjectSize(
  s3Key: string,
  bucketOverride?: string
): Promise<number | null> {
  try {
    const cfg = getStorageConfig();
    const client = getStorageClient();
    const res = await client.send(
      new HeadObjectCommand({
        Bucket: bucketOverride ?? cfg.bucket,
        Key: s3Key,
      })
    );
    return typeof res.ContentLength === 'number' ? res.ContentLength : null;
  } catch {
    return null;
  }
}

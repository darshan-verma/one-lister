import { loadEnv } from "@one-lister/config/env";
import { createS3Storage, type ObjectStorage } from "@one-lister/core";

let storage: ObjectStorage | undefined;

export function getObjectStorage(): ObjectStorage {
  if (!storage) {
    const env = loadEnv();
    storage = createS3Storage({
      bucket: env.S3_BUCKET,
      region: env.S3_REGION,
      publicBaseUrl: env.S3_PUBLIC_BASE_URL,
      endpoint: env.S3_ENDPOINT,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      forcePathStyle: Boolean(env.S3_ENDPOINT),
    });
  }
  return storage;
}

/** Build a public URL for an object key (MinIO path-style or CDN base). */
export function publicObjectUrl(key: string): string {
  const env = loadEnv();
  return `${env.S3_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key.replace(/^\//, "")}`;
}

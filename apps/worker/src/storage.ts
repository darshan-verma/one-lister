import { loadEnv } from "@one-lister/config/env";
import { createS3Storage, type ObjectStorage } from "@one-lister/core";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

let storage: ObjectStorage | undefined;
let client: S3Client | undefined;
let bucket: string | undefined;

function getS3Client(): { client: S3Client; bucket: string } {
  if (!client || !bucket) {
    const env = loadEnv();
    bucket = env.S3_BUCKET;
    client = new S3Client({
      region: env.S3_REGION,
      ...(env.S3_ENDPOINT
        ? {
            endpoint: env.S3_ENDPOINT,
            forcePathStyle: true,
          }
        : {}),
      ...(env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
        ? {
            credentials: {
              accessKeyId: env.S3_ACCESS_KEY_ID,
              secretAccessKey: env.S3_SECRET_ACCESS_KEY,
            },
          }
        : {}),
    });
  }
  return { client, bucket };
}

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

/** Download object bytes for sharp processing. */
export async function downloadObjectBytes(key: string): Promise<Buffer> {
  const { client: s3, bucket: b } = getS3Client();
  const result = await s3.send(
    new GetObjectCommand({
      Bucket: b,
      Key: key,
    }),
  );
  if (!result.Body) {
    throw new Error("empty S3 body");
  }
  const bytes = await result.Body.transformToByteArray();
  return Buffer.from(bytes);
}

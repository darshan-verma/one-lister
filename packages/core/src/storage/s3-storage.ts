import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type {
  CreateUploadUrlInput,
  CreateUploadUrlResult,
  GetReadUrlInput,
  HeadObjectResult,
  ObjectStorage,
  S3StorageConfig,
} from "./types.js";

export function createS3Storage(config: S3StorageConfig): ObjectStorage {
  const client = new S3Client({
    region: config.region,
    ...(config.endpoint
      ? {
          endpoint: config.endpoint,
          forcePathStyle: config.forcePathStyle ?? true,
        }
      : {}),
    ...(config.accessKeyId && config.secretAccessKey
      ? {
          credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
          },
        }
      : {}),
  });

  return {
    async createUploadUrl(
      input: CreateUploadUrlInput,
    ): Promise<CreateUploadUrlResult> {
      const expiresInSeconds = input.expiresInSeconds ?? 5 * 60;
      const command = new PutObjectCommand({
        Bucket: config.bucket,
        Key: input.key,
        ContentType: input.contentType,
        ContentLength: input.contentLength,
      });
      const uploadUrl = await getSignedUrl(client, command, {
        expiresIn: expiresInSeconds,
      });
      return {
        uploadUrl,
        key: input.key,
        expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
      };
    },

    async headObject(key: string): Promise<HeadObjectResult> {
      try {
        const result = await client.send(
          new HeadObjectCommand({
            Bucket: config.bucket,
            Key: key,
          }),
        );
        return {
          exists: true,
          contentType: result.ContentType,
          contentLength: result.ContentLength,
        };
      } catch (err) {
        const name =
          err && typeof err === "object" && "name" in err
            ? String((err as { name: unknown }).name)
            : "";
        const status =
          err && typeof err === "object" && "$metadata" in err
            ? (err as { $metadata?: { httpStatusCode?: number } }).$metadata
                ?.httpStatusCode
            : undefined;
        if (name === "NotFound" || name === "NoSuchKey" || status === 404) {
          return { exists: false };
        }
        throw err;
      }
    },

    async deleteObject(key: string): Promise<void> {
      await client.send(
        new DeleteObjectCommand({
          Bucket: config.bucket,
          Key: key,
        }),
      );
    },

    async getReadUrl(input: GetReadUrlInput): Promise<string> {
      const expiresInSeconds = input.expiresInSeconds ?? 60 * 60;
      const command = new GetObjectCommand({
        Bucket: config.bucket,
        Key: input.key,
      });
      return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
    },
  };
}

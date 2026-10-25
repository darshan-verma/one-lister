export type CreateUploadUrlInput = {
  key: string;
  contentType: string;
  contentLength: number;
  expiresInSeconds?: number;
};

export type CreateUploadUrlResult = {
  uploadUrl: string;
  key: string;
  expiresAt: Date;
};

export type HeadObjectResult = {
  exists: boolean;
  contentType?: string;
  contentLength?: number;
};

export type GetReadUrlInput = {
  key: string;
  expiresInSeconds?: number;
};

/**
 * Object storage abstraction for product images.
 * Implementations: AWS S3 (prod) / MinIO via S3 API (dev).
 */
export type ObjectStorage = {
  createUploadUrl(input: CreateUploadUrlInput): Promise<CreateUploadUrlResult>;
  headObject(key: string): Promise<HeadObjectResult>;
  deleteObject(key: string): Promise<void>;
  getReadUrl(input: GetReadUrlInput): Promise<string>;
};

export type S3StorageConfig = {
  bucket: string;
  region: string;
  /** Public base for constructing non-presigned URLs when needed. */
  publicBaseUrl: string;
  /** MinIO / custom endpoint. Omit in AWS. */
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
};

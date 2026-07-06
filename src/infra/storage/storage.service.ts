import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageService {
  private client: S3Client;
  private bucket: string;
  private publicUrlBase: string;

  constructor(config: ConfigService) {
    this.bucket = config.get<string>('supabase.bucket')!;
    const endpoint = config.get<string>('supabase.endpointUrl')!;
    const region = config.get<string>('supabase.region')!;

    this.client = new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId: config.get<string>('supabase.accessKey')!,
        secretAccessKey: config.get<string>('supabase.secretKey')!,
      },
      forcePathStyle: true,
    });

    const projectUrl = config.get<string>('supabase.url')!;
    this.publicUrlBase = `${projectUrl}/storage/v1/object/public/${this.bucket}`;
  }

  async getPresignedUploadUrl(key: string, expiry = 3600): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
      { expiresIn: expiry },
    );
  }

  async getPresignedDownloadUrl(key: string, expiry = 3600): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
      { expiresIn: expiry },
    );
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  getPublicUrl(key: string): string {
    return `${this.publicUrlBase}/${key}`;
  }

  extractKey(url: string): string {
    const prefix = `${this.publicUrlBase}/`;
    if (url.startsWith(prefix)) {
      return url.slice(prefix.length);
    }
    const bucketPrefix = `${this.bucket}/`;
    const idx = url.indexOf(bucketPrefix);
    if (idx === -1) return '';
    return url.substring(idx + bucketPrefix.length);
  }

  async getDownloadUrl(key: string, expiry = 3600): Promise<string> {
    return this.getPresignedDownloadUrl(key, expiry);
  }

  normalizeUrl(storedUrl: string): string {
    if (storedUrl.startsWith('/api/arquivos?key=')) {
      const key = decodeURIComponent(storedUrl.slice('/api/arquivos?key='.length));
      return this.getPublicUrl(key);
    }
    return storedUrl;
  }
}
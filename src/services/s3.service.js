const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const path = require('path');

class S3Service {
  constructor() {
    this.client = new S3Client({
      region: process.env.S3_REGION || 'rbx',
      endpoint: process.env.S3_ENDPOINT || 'https://s3.rbx.io.cloud.ovh.net',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      },
      forcePathStyle: true,
    });

    this.bucketName = process.env.S3_BUCKET_NAME || 'thot-3sd';

    console.log('[S3] S3 Service initialized', {
      region: process.env.S3_REGION || 'rbx',
      endpoint: process.env.S3_ENDPOINT || 'https://s3.rbx.io.cloud.ovh.net',
      bucket: this.bucketName,
    });
  }

  async uploadFile(fileBuffer, key, contentType, metadata = {}) {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType,
        ACL: 'public-read',
        Metadata: metadata,
      });

      const result = await this.client.send(command);

      // OVH S3 uses subdomain format: bucket.s3.region.io.cloud.ovh.net
      const endpoint = process.env.S3_ENDPOINT || 'https://s3.rbx.io.cloud.ovh.net';
      const region = process.env.S3_REGION || 'rbx';
      const fileUrl = `https://${this.bucketName}.s3.${region}.io.cloud.ovh.net/${key}`;

      console.log('[S3] File uploaded successfully:', {
        key,
        url: fileUrl,
        etag: result.ETag,
      });

      return {
        success: true,
        url: fileUrl,
        key: key,
        etag: result.ETag,
      };
    } catch (error) {
      console.error('[S3] Error uploading file:', error);
      throw new Error(`S3 upload failed: ${error.message}`);
    }
  }

  async deleteFile(key) {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.client.send(command);

      console.log('[S3] File deleted successfully:', key);

      return {
        success: true,
        key: key,
      };
    } catch (error) {
      console.error('[S3] Error deleting file:', error);
      throw new Error(`S3 delete failed: ${error.message}`);
    }
  }

  async getSignedUrl(key, expiresIn = 3600) {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const signedUrl = await getSignedUrl(this.client, command, { expiresIn });

      console.log('[S3] Generated signed URL for:', key);

      return signedUrl;
    } catch (error) {
      console.error('[S3] Error generating signed URL:', error);
      throw new Error(`S3 signed URL generation failed: ${error.message}`);
    }
  }

  generateKey(type, filename) {
    const timestamp = Date.now();
    const randomString = Math.round(Math.random() * 1E9);
    const extension = path.extname(filename);
    const cleanFilename = path.basename(filename, extension).replace(/[^a-zA-Z0-9]/g, '_');

    return `${type}/${timestamp}-${randomString}-${cleanFilename}${extension}`;
  }

  getPublicUrl(key) {
    // OVH S3 uses subdomain format: bucket.s3.region.io.cloud.ovh.net
    const region = process.env.S3_REGION || 'rbx';
    return `https://${this.bucketName}.s3.${region}.io.cloud.ovh.net/${key}`;
  }

  extractKeyFromUrl(url) {
    // Support both formats
    const region = process.env.S3_REGION || 'rbx';
    const subdomainUrl = `https://${this.bucketName}.s3.${region}.io.cloud.ovh.net/`;
    const pathStyleUrl = `${process.env.S3_ENDPOINT}/${this.bucketName}/`;

    if (url.startsWith(subdomainUrl)) {
      return url.replace(subdomainUrl, '');
    }
    if (url.startsWith(pathStyleUrl)) {
      return url.replace(pathStyleUrl, '');
    }
    return null;
  }
}

module.exports = new S3Service();

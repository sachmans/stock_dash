/**
 * Storage helper — standalone S3 or local filesystem.
 * For standalone operation, files are stored locally in ./uploads/
 * Configure S3_BUCKET, S3_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 * for S3 storage in production.
 */
import fs from "fs";
import path from "path";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  _contentType?: string
): Promise<{ key: string; url: string }> {
  // Check if S3 is configured
  if (process.env.S3_BUCKET && process.env.AWS_ACCESS_KEY_ID) {
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = new S3Client({ region: process.env.S3_REGION || "us-east-1" });
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: relKey,
        Body: data instanceof Buffer ? data : Buffer.from(data as string),
        ContentType: _contentType,
      })
    );
    const url = `https://${process.env.S3_BUCKET}.s3.amazonaws.com/${relKey}`;
    return { key: relKey, url };
  }

  // Fallback: local filesystem
  ensureUploadDir();
  const filePath = path.join(UPLOAD_DIR, relKey);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, data);
  return { key: relKey, url: `/uploads/${relKey}` };
}

export async function storageGet(
  relKey: string,
  _expiresIn?: number
): Promise<{ key: string; url: string }> {
  if (process.env.S3_BUCKET && process.env.AWS_ACCESS_KEY_ID) {
    const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const client = new S3Client({ region: process.env.S3_REGION || "us-east-1" });
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: relKey,
    });
    const url = await getSignedUrl(client, command, { expiresIn: _expiresIn || 3600 });
    return { key: relKey, url };
  }

  return { key: relKey, url: `/uploads/${relKey}` };
}

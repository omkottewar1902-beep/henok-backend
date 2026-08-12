import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { Request, Response, NextFunction } from 'express';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { ApiError } from '../../common/middlewares/error.middleware';
import { env, isS3Configured, isVercel } from '../../config/env';
import { logger } from '../../common/utils/logger';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const LOCAL_UPLOAD_DIR = path.join(__dirname, '../../../public/uploads');

/**
 * Uploads have two backing modes:
 *
 *  - **S3-compatible object storage** (S3_BUCKET etc. set): required on Vercel
 *    (read-only filesystem outside /tmp) and preferred on any horizontally
 *    scaled deployment. Also works with R2, MinIO, Supabase Storage, Spaces.
 *  - **Local disk** (`public/uploads`): fine for single-instance Docker/Railway
 *    deploys and for `npm run dev`. Files are served by the static handler
 *    mounted at `/uploads` in `app.ts`.
 *
 * We pick between them at boot based on env, so route wiring and the mobile
 * client see the same `{ url }` response either way.
 */

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: env.s3.region!,
      credentials: {
        accessKeyId: env.s3.accessKeyId!,
        secretAccessKey: env.s3.secretAccessKey!,
      },
      endpoint: env.s3.endpoint,
      forcePathStyle: env.s3.forcePathStyle,
    });
  }
  return s3Client;
}

function s3PublicUrl(key: string): string {
  if (env.s3.publicBaseUrl) {
    return `${env.s3.publicBaseUrl.replace(/\/$/, '')}/${key}`;
  }
  return `https://${env.s3.bucket}.s3.${env.s3.region}.amazonaws.com/${key}`;
}

/**
 * On Vercel with no object store configured, uploads cannot succeed — fail
 * fast with a clear error rather than letting multer try to write to a
 * read-only filesystem.
 */
export function guardUploadTarget(req: Request, res: Response, next: NextFunction): void {
  if (isVercel && !isS3Configured) {
    next(
      new ApiError(
        501,
        'Image uploads are disabled: this deployment has no writable storage. ' +
          'Set S3_BUCKET / S3_REGION / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY.',
      ),
    );
    return;
  }
  next();
}

// Multer storage picker: memory buffer when going to S3, disk when going to local FS.
const memoryStorage = multer.memoryStorage();

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true });
    cb(null, LOCAL_UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    cb(null, `${uuid()}${EXT_BY_MIME[file.mimetype] ?? path.extname(file.originalname).toLowerCase()}`);
  },
});

export const uploadImageMiddleware = multer({
  storage: isS3Configured ? memoryStorage : diskStorage,
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(new ApiError(400, 'Only JPEG, PNG, or WEBP images are allowed'));
      return;
    }
    cb(null, true);
  },
}).single('image');

export async function uploadImage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file) {
      throw new ApiError(400, 'No image file provided');
    }

    if (isS3Configured) {
      const ext = EXT_BY_MIME[req.file.mimetype] ?? '';
      const key = `uploads/${uuid()}${ext}`;
      await getS3Client().send(
        new PutObjectCommand({
          Bucket: env.s3.bucket!,
          Key: key,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
      logger.info('image uploaded to s3', { key, size: req.file.size, requestId: req.id });
      res.status(201).json({ url: s3PublicUrl(key) });
      return;
    }

    // Local disk path: multer already wrote the file under public/uploads.
    logger.info('image uploaded to disk', { filename: req.file.filename, size: req.file.size, requestId: req.id });
    res.status(201).json({ url: `${env.appBaseUrl}/uploads/${req.file.filename}` });
  } catch (err) {
    next(err);
  }
}

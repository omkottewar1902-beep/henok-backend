import multer from 'multer';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../../common/middlewares/error.middleware';
import { env } from '../../config/env';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Vercel's serverless filesystem is read-only outside /tmp, and /tmp is ephemeral and
 * not shared across instances - writing there wouldn't make the file servable to a later
 * request anyway. Rather than let multer fail with a confusing raw filesystem error (or
 * silently return a URL that 404s), fail clearly here. Real support requires switching to
 * object storage (Supabase Storage / S3 / Vercel Blob) - not wired up yet.
 */
export function rejectOnServerlessFs(req: Request, res: Response, next: NextFunction): void {
  if (process.env.VERCEL) {
    next(new ApiError(501, 'Image uploads are not available on this deployment yet.'));
    return;
  }
  next();
}

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../../../public/uploads'),
  filename: (req, file, cb) => {
    cb(null, `${uuid()}${path.extname(file.originalname).toLowerCase()}`);
  },
});

export const uploadImageMiddleware = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(new ApiError(400, 'Only JPEG, PNG, or WEBP images are allowed'));
      return;
    }
    cb(null, true);
  },
}).single('image');

export function uploadImage(req: Request, res: Response, next: NextFunction): void {
  try {
    if (!req.file) {
      throw new ApiError(400, 'No image file provided');
    }
    res.status(201).json({ url: `${env.appBaseUrl}/uploads/${req.file.filename}` });
  } catch (err) {
    next(err);
  }
}

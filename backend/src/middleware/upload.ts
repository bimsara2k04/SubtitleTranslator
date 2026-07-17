import multer from 'multer';
import type { Request } from 'express';

const storage = multer.memoryStorage();

function fileFilter(req: Request, file: Express.Multer.File, callback: multer.FileFilterCallback) {
  // Allow text/plain, application/x-subrip, or simple srt filenames
  const isSrt = file.originalname.toLowerCase().endsWith('.srt');
  if (isSrt) {
    callback(null, true);
  } else {
    callback(new Error('Only subtitle files with extension .srt are allowed.'));
  }
}

export const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

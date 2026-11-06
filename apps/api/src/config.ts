import 'dotenv/config';
import path from 'path';

const required = (k: string, fallback?: string) => {
  const v = process.env[k] ?? fallback;
  if (v === undefined) throw new Error(`Missing env ${k}`);
  return v;
};

const jwtSecret = required('JWT_SECRET', process.env.NODE_ENV === 'production' ? undefined : 'dev-secret');
if (process.env.NODE_ENV === 'production' && jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production');
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '12h',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map((s) => s.trim()),
  storageDir: path.resolve(process.env.STORAGE_DIR ?? './storage'),
  expoPushEnabled: process.env.EXPO_PUSH_ENABLED === 'true',
  schedulerIntervalMin: Number(process.env.SCHEDULER_INTERVAL_MIN ?? 60),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 15),
  webDistDir: process.env.WEB_DIST_DIR ? path.resolve(process.env.WEB_DIST_DIR) : undefined,
};

import { Payload } from '@/auth/utils/types';

declare global {
  namespace Express {
    interface Request {
      user?: Payload;
      error?: string;
    }
  }
}

export {};

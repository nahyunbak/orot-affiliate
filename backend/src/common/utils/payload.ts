import { Payload } from '@/auth/utils/types';
import { UserRole } from '@prisma/client';

export const isAdminOrSelf = (email: string, payload: Payload) => {
  return payload.role >= UserRole.Admin || payload.email === email;
};

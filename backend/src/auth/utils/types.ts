import { UserRole } from '@prisma/client';

/**
 * @jsonDoc { "isPublic": true }
 */
export type TokenType = 'access' | 'refresh';

/**
 * @jsonDoc { "isPublic": true }
 */
export type Payload = {
  id: number;
  type: TokenType;
  email: string;
  role: UserRole;
  createdAt: number;
};

export type UserInfo = {
  email: string;
  role: UserRole;
  userId: string;
};

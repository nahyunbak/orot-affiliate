import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

/**@description 6자리 인증 코드 생성 */
export const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const generateRandomString = (length: number) => {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';

  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return result;
};

/**@description 만료 시간 검증 */
export const judgeExpired = (exp: number) => {
  return !(exp && exp < Date.now() / 1000);
};
const roleOrder = {
  SuperAdmin: 4,
  Admin: 3,
  Mentor: 2,
  Normal: 0,
};
export const judgeIsRightRole = (
  userRoleInput: UserRole,
  limitRole: UserRole,
) => {
  console.log(userRoleInput, limitRole, 'check');
  const userRoleLevel = roleOrder[userRoleInput];
  const limitRoleLevel = roleOrder[limitRole];

  return userRoleLevel >= limitRoleLevel;
};

export const hashPassword = async (password: string): Promise<string> => {
  const hashRound = process.env.HASH_ROUND;
  return bcrypt.hash(password, Number(hashRound));
};

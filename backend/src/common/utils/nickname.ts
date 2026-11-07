import { MAX_NICKNAME_LENGTH } from '@/common/constants/general';

export function truncateNickname(nickname: string) {
  return nickname.slice(0, MAX_NICKNAME_LENGTH);
}

export function normalizeGeneratedNickname(
  nickname: string,
  fallback = 'New User',
) {
  const trimmedNickname = nickname.trim();

  if (!trimmedNickname) {
    return truncateNickname(fallback);
  }

  return truncateNickname(trimmedNickname);
}

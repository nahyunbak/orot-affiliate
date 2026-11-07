import { DEFAULT_USER_TIMEZONE } from '@/common/constants/general';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);

function normalizeTimezone(timezoneValue?: string | null): string {
  const candidate = timezoneValue?.trim();

  if (!candidate) {
    return DEFAULT_USER_TIMEZONE;
  }

  try {
    dayjs().tz(candidate);
    return candidate;
  } catch {
    return DEFAULT_USER_TIMEZONE;
  }
}

function getUserDayRange(timezoneValue?: string | null, now = dayjs()) {
  const timezone = normalizeTimezone(timezoneValue);
  const currentTime = now.tz(timezone);

  return {
    timezone,
    start: currentTime.startOf('day').toDate(),
    end: currentTime.endOf('day').toDate(),
  };
}

function getUserMonthRange(timezoneValue?: string | null, now = dayjs()) {
  const timezone = normalizeTimezone(timezoneValue);
  const currentTime = now.tz(timezone);

  return {
    timezone,
    start: currentTime.startOf('month').toDate(),
    end: currentTime.endOf('month').toDate(),
  };
}

function getUserWeekdayIndex(timezoneValue?: string | null, now = dayjs()) {
  const timezone = normalizeTimezone(timezoneValue);
  const currentTime = now.tz(timezone);

  return {
    timezone,
    weekday: (currentTime.day() + 6) % 7,
    hour: currentTime.hour(),
    minute: currentTime.minute(),
  };
}

export {
  getUserDayRange,
  getUserMonthRange,
  getUserWeekdayIndex,
  normalizeTimezone,
};

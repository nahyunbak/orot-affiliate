import dayjs from 'dayjs';
import 'dayjs/plugin/timezone';
import timezone from 'dayjs/plugin/timezone';
import 'dayjs/plugin/utc';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale('ko');

const generateSuccessResponse = <T>(data?: T, message?: string) => {
  return {
    success: true,
    ...(data !== undefined && { data }),
    ...(message && { message }),
  };
};

const generateErrorResponse = (message?: string, errorCode?: string) => {
  return {
    success: false,
    ...(message && { message }),
    ...(errorCode && { errorCode }),
  };
};

const dayjsFormat = (date: Date) => {
  return dayjs(date).tz('Asia/Seoul').format('YY.MM.DD HH시 mm분');
};
export { dayjsFormat, generateErrorResponse, generateSuccessResponse };

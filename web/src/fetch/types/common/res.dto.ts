export interface PageResDto<TData> {
  page: number;
  size: number;
  items: TData[];
}

export interface SingleMessageDto {
  message: string;
}

export interface CommonResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  errorCode?: string;
  currentCount?: number;
  maxCount?: number;
  requiredCount?: number;
  remainingCount?: number;
}

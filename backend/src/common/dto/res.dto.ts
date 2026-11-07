import { ApiProperty } from '@nestjs/swagger';

export class PageResDto<TData> {
  @ApiProperty()
  page: number;

  @ApiProperty()
  size: number;

  items: TData[];
}

export class SingleMessageDto {
  @ApiProperty({
    required: true,
    description: '응답 메시지',
    example: '요청이 성공적으로 전송되었습니다.',
  })
  message: string;
}

export class CommonResponse<T = any> {
  @ApiProperty({ required: true })
  success: boolean;

  @ApiProperty({ required: false })
  data?: T;

  @ApiProperty({ required: false })
  message?: string;

  @ApiProperty({ required: false })
  error?: string;

  @ApiProperty({ required: false })
  errorCode?: string;

  @ApiProperty({ required: false })
  currentCount?: number;

  @ApiProperty({ required: false })
  maxCount?: number;

  @ApiProperty({ required: false })
  requiredCount?: number;

  @ApiProperty({ required: false })
  remainingCount?: number;
}

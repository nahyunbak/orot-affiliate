import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';
export class ApproveParticipantReqDto {
  @ApiProperty() @IsBoolean() verified: boolean;
}
export class RejectParticipantReqDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(500) reason: string;
}

import { IsUrl, IsOptional, IsString } from 'class-validator';

export class CreateUrlDto {
  @IsUrl()
  originalUrl: string;

  @IsOptional()
  @IsString()
  customAlias?: string;

  @IsOptional()
  expiration?: Date;
}

import { Controller, Get, Post, Param, Body, Req, Res } from '@nestjs/common';
import { UrlService } from './url.service';
import { CreateUrlDto } from './dto/create-url.dto';
import { Response, Request } from 'express';

@Controller('url')
export class UrlController {
  constructor(private readonly urlService: UrlService) {}

  @Post('shorten')
  async shorten(
    @Body() createUrlDto: CreateUrlDto,
  ): Promise<{ shortUrl: string }> {
    const shortUrl = await this.urlService.shortenUrl(createUrlDto);
    return { shortUrl };
  }

  @Get(':shortUrl')
  async redirect(
    @Param('shortUrl') shortUrl: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const originalUrl = await this.urlService.getOriginalUrl(shortUrl, req);
    return res.redirect(originalUrl);
  }

  @Get('stats/:shortUrl')
  async getStats(@Param('shortUrl') shortUrl: string) {
    return this.urlService.getStats(shortUrl);
  }
}

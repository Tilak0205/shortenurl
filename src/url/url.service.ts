import {
  Injectable,
  NotFoundException,
  ConflictException, HttpStatus, HttpException
} from "@nestjs/common";
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { CreateUrlDto } from './dto/create-url.dto';
import { Url } from './url.entity';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class UrlService {
  private redisClient: Redis;
  private readonly urlPrefix = 'url:';
  private readonly baseUrl: string;
  private readonly MAX_REQUESTS = 10; // 10 requests
  private readonly TIME_WINDOW = 60; //  60 seconds

  constructor(private configService: ConfigService) {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    this.redisClient = new Redis(redisUrl);
    this.baseUrl =
      this.configService.get<string>('BASE_URL') ||
      'http://localhost:3000/url/';
  }
  async shortenUrl(createUrlDto: CreateUrlDto, req: any): Promise<string> {
    const userId = req.headers['x-forwarded-for'] || req.ip;

    // Check rate limit
    await this.checkRateLimit(userId);

    let { originalUrl } = createUrlDto;
    const { customAlias, expiration } = createUrlDto;
    const shortUrlId = customAlias || uuidv4().slice(0, 6);

    // Check if the URL is a valid (http or https)
    if (!/^https?:\/\//i.test(originalUrl)) {
      originalUrl = `https://${originalUrl}`;
    }

    const urlExists = await this.redisClient.exists(
      this.urlPrefix + shortUrlId,
    );
    if (urlExists) {
      throw new ConflictException('Custom alias already exists');
    }

    const urlData = new Url(shortUrlId, originalUrl, expiration);
    await this.redisClient.set(
      `${this.urlPrefix}${shortUrlId}`,
      JSON.stringify(urlData),
    );

    const fullShortUrl = `${this.baseUrl}${shortUrlId}`;
    return fullShortUrl;
  }

  async getOriginalUrl(shortUrl: string, req: any): Promise<string> {
    const urlData = await this.redisClient.get(`${this.urlPrefix}${shortUrl}`);

    if (!urlData) {
      throw new NotFoundException('Short URL not found');
    }

    const url: Url = JSON.parse(urlData);

    if (url.expiration && new Date(url.expiration) < new Date()) {
      await this.redisClient.del(`${this.urlPrefix}${shortUrl}`);
      throw new NotFoundException('Short URL has expired');
    }

    url.hits += 1;

    const clientIp =
      req.headers['x-forwarded-for']?.split(',').shift() ||
      req.headers['cf-connecting-ip'] ||
      req.headers['x-real-ip'] ||
      (req.ip === '::1' ? '127.0.0.1' : req.ip);

    const location = await this.getLocationFromIP(clientIp);
    const browser = this.parseUserAgent(req.headers['user-agent']);

    url.analytics = url.analytics || [];
    url.analytics.push({
      timestamp: new Date().toISOString(),
      location: location || 'Unknown',
      browser: browser || 'Unknown',
    });

    // Save updated data in Redis
    await this.redisClient.set(
      `${this.urlPrefix}${shortUrl}`,
      JSON.stringify(url),
    );

    return url.originalUrl;
  }

  private async getLocationFromIP(ip: string): Promise<string | null> {
    // If the IP is localhost, return a location for testing purposes
    if (ip === '::1' || ip === '127.0.0.1') {
      return 'Localhost';
    }

    try {
      const response = await axios.get(`http://ip-api.com/json/${ip}`);
      const data = response.data;

      if (data.status === 'fail') {
        console.error('Error fetching location:', data.message);
        return null;
      }

      return `${data.city}, ${data.regionName}, ${data.country}`;
    } catch (error) {
      console.error('Error fetching location:', error);
      return null;
    }
  }

  private parseUserAgent(userAgent: string): string {
    if (!userAgent) return 'Unknown';
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    return 'Other';
  }

  async getStats(shortUrl: string): Promise<Url> {
    const urlData = await this.redisClient.get(`${this.urlPrefix}${shortUrl}`);
    if (!urlData) throw new NotFoundException('Short URL not found');

    return JSON.parse(urlData);
  }

  private async checkRateLimit(userId: string): Promise<void> {
    const key = `rate_limit:${userId}`;

    // Increment the counter for the user and set expiry if it's a new counter
    const requests = await this.redisClient.incr(key);

    if (requests === 1) {
      // First request, so set the expiration
      await this.redisClient.expire(key, this.TIME_WINDOW);
    }

    // Check if requests exceed the max limit
    if (requests > this.MAX_REQUESTS) {
      throw new HttpException(
        'Rate limit exceeded. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}

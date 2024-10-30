export interface AnalyticsEntry {
  timestamp: string;
  location: string;
  browser: string;
}

export class Url {
  shortUrl: string;
  originalUrl: string;
  hits: number;
  expiration?: Date;
  analytics: AnalyticsEntry[];

  constructor(shortUrl: string, originalUrl: string, expiration?: Date) {
    this.shortUrl = shortUrl;
    this.originalUrl = originalUrl;
    this.hits = 0;
    this.expiration = expiration;
    this.analytics = [];
  }
}

import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import winston from 'winston';
import pino from 'pino';
import pinoPretty from 'pino-pretty';
import { format, parse, isValid, differenceInDays, addDays, formatDistance } from 'date-fns';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { promisify } from 'util';
import { createHash, randomBytes } from 'crypto';
import { ApiResponse, ErrorResponse } from '@yeyzer/types';
import { register, Counter, Gauge, Histogram, Summary } from 'prom-client';
import NodeCache from 'node-cache';

// ===== Environment Utilities =====

/**
 * Get environment variable with type checking and default value
 */
export const getEnv = (key: string, defaultValue?: string): string => {
  const value = process.env[key] || defaultValue;
  if (value === undefined) {
    throw new Error(`Environment variable ${key} is not set`);
  }
  return value;
};

/**
 * Get environment variable as number
 */
export const getEnvNumber = (key: string, defaultValue?: number): number => {
  const value = process.env[key];
  if (value === undefined && defaultValue === undefined) {
    throw new Error(`Environment variable ${key} is not set`);
  }
  const parsed = value ? parseInt(value, 10) : defaultValue;
  if (parsed === undefined || isNaN(parsed)) {
    throw new Error(`Environment variable ${key} is not a valid number`);
  }
  return parsed;
};

/**
 * Get environment variable as boolean
 */
export const getEnvBoolean = (key: string, defaultValue?: boolean): boolean => {
  const value = process.env[key];
  if (value === undefined && defaultValue === undefined) {
    throw new Error(`Environment variable ${key} is not set`);
  }
  if (value === undefined) {
    return defaultValue as boolean;
  }
  return value.toLowerCase() === 'true';
};

/**
 * Check if environment is production
 */
export const isProduction = (): boolean => {
  return getEnv('NODE_ENV', 'development') === 'production';
};

/**
 * Check if environment is development
 */
export const isDevelopment = (): boolean => {
  return getEnv('NODE_ENV', 'development') === 'development';
};

/**
 * Check if environment is test
 */
export const isTest = (): boolean => {
  return getEnv('NODE_ENV', 'development') === 'test';
};

// ===== Logging Utilities =====

/**
 * Winston logger configuration
 */
export const createWinstonLogger = (service: string) => {
  const logLevel = getEnv('LOG_LEVEL', 'info');

  return winston.createLogger({
    level: logLevel,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    defaultMeta: { service },
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, service, ...rest }) => {
            const meta = Object.keys(rest).length ? JSON.stringify(rest) : '';
            return `${timestamp} [${service}] ${level}: ${message} ${meta}`;
          })
        ),
      }),
    ],
  });
};

/**
 * Pino logger configuration
 */
export const createPinoLogger = (service: string) => {
  const logLevel = getEnv('LOG_LEVEL', 'info');
  const isDev = isDevelopment();

  return isDev
    ? pino({
        level: logLevel,
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
          },
        },
        base: { service },
      })
    : pino({
        level: logLevel,
        base: { service },
      });
};

// ===== Error Handling Utilities =====

/**
 * Custom error class with status code
 */
export class AppError extends Error {
  statusCode: number;
  code: string;
  details?: any;
  isOperational: boolean;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR', details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Create a standardized error response
 */
export const createErrorResponse = (
  error: Error | AppError,
  requestId?: string
): ErrorResponse => {
  const appError = error instanceof AppError ? error : new AppError(error.message);
  
  return {
    success: false,
    message: 'An error occurred',
    timestamp: new Date().toISOString(),
    requestId,
    error: {
      code: appError.code,
      message: appError.message,
      details: appError.details,
    },
  };
};

/**
 * Create a standardized success response
 */
export const createSuccessResponse = <T>(data: T, message = 'Success', requestId?: string): ApiResponse<T> => {
  // Build base response first
  const base = {
    success: true,
    message,
    timestamp: new Date().toISOString(),
    requestId,
  };

  // Only attach `data` if it is not `undefined` – keeps ApiResponse<T> contract
  if (data !== undefined) {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    (base as any).data = data;
  }

  // Cast is safe because conditional field added only when required
  return base as ApiResponse<T>;
};

/**
 * Async error handler for Express
 */
export const asyncHandler = (fn: Function) => {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// ===== HTTP Client Utilities =====

/**
 * Create an Axios instance with retry logic
 */
export const createHttpClient = (
  baseURL: string,
  options: {
    timeout?: number;
    maxRetries?: number;
    headers?: Record<string, string>;
    retryStatusCodes?: number[];
  } = {}
): AxiosInstance => {
  const { timeout = 10000, maxRetries = 3, headers = {}, retryStatusCodes = [408, 429, 500, 502, 503, 504] } = options;

  const client = axios.create({
    baseURL,
    timeout,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });

  // Add request interceptor for logging
  client.interceptors.request.use(
    (config) => {
      // Add request ID
      config.headers['X-Request-ID'] = config.headers['X-Request-ID'] || generateRequestId();
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  // Add response interceptor for retry logic
  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const config = error.config as AxiosRequestConfig & { _retry?: number };
      
      // If we've reached max retries or the error is not retryable, reject
      if (
        !config ||
        !error.response ||
        config._retry === maxRetries ||
        !retryStatusCodes.includes(error.response.status)
      ) {
        return Promise.reject(error);
      }

      // Increment retry count
      config._retry = (config._retry || 0) + 1;

      // Exponential backoff
      const delay = Math.pow(2, config._retry) * 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Retry the request
      return client(config);
    }
  );

  return client;
};

// ===== JWT Utilities =====

/**
 * Sign a JWT token
 */
export const signJwt = (
  payload: Record<string, any>,
  secret: string,
  options: jwt.SignOptions = {}
): Promise<string> => {
  return new Promise((resolve, reject) => {
    jwt.sign(payload, secret, options, (err, token) => {
      if (err) return reject(err);
      if (!token) return reject(new Error('Failed to generate token'));
      resolve(token);
    });
  });
};

/**
 * Verify a JWT token
 */
export const verifyJwt = <T>(token: string, secret: string): Promise<T> => {
  return new Promise((resolve, reject) => {
    jwt.verify(token, secret, (err, decoded) => {
      if (err) return reject(err);
      resolve(decoded as T);
    });
  });
};

/**
 * Decode a JWT token without verification
 */
export const decodeJwt = <T>(token: string): T | null => {
  try {
    const decoded = jwt.decode(token);
    return decoded as T;
  } catch (error) {
    return null;
  }
};

// ===== Date/Time Utilities =====

/**
 * Format a date using date-fns
 */
export const formatDate = (date: Date | string | number, formatStr = 'yyyy-MM-dd'): string => {
  const parsedDate = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  return format(parsedDate, formatStr);
};

/**
 * Parse a string to date
 */
export const parseDate = (dateStr: string, formatStr = 'yyyy-MM-dd'): Date => {
  const parsedDate = parse(dateStr, formatStr, new Date());
  if (!isValid(parsedDate)) {
    throw new Error(`Invalid date string: ${dateStr}`);
  }
  return parsedDate;
};

/**
 * Check if a date is valid
 */
export const isValidDate = (date: any): boolean => {
  if (!date) return false;
  const parsedDate = new Date(date);
  return isValid(parsedDate);
};

/**
 * Get the difference in days between two dates
 */
export const getDaysDifference = (dateA: Date | string, dateB: Date | string): number => {
  const parsedDateA = typeof dateA === 'string' ? new Date(dateA) : dateA;
  const parsedDateB = typeof dateB === 'string' ? new Date(dateB) : dateB;
  return Math.abs(differenceInDays(parsedDateA, parsedDateB));
};

/**
 * Add days to a date
 */
export const addDaysToDate = (date: Date | string, days: number): Date => {
  const parsedDate = typeof date === 'string' ? new Date(date) : date;
  return addDays(parsedDate, days);
};

/**
 * Format relative time (e.g., "2 days ago")
 */
export const formatRelativeTime = (date: Date | string): string => {
  const parsedDate = typeof date === 'string' ? new Date(date) : date;
  return formatDistance(parsedDate, new Date(), { addSuffix: true });
};

// ===== Geolocation Utilities =====

/**
 * Earth radius in kilometers
 */
const EARTH_RADIUS_KM = 6371;

/**
 * Convert degrees to radians
 */
export const degreesToRadians = (degrees: number): number => {
  return degrees * (Math.PI / 180);
};

/**
 * Calculate the distance between two coordinates using the Haversine formula
 */
export const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  unit: 'km' | 'mi' = 'km'
): number => {
  const dLat = degreesToRadians(lat2 - lat1);
  const dLon = degreesToRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(degreesToRadians(lat1)) *
      Math.cos(degreesToRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = EARTH_RADIUS_KM * c;

  return unit === 'mi' ? distance * 0.621371 : distance;
};

/**
 * Calculate the midpoint between two coordinates
 */
export const calculateMidpoint = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): { latitude: number; longitude: number } => {
  const dLon = degreesToRadians(lon2 - lon1);

  const lat1Rad = degreesToRadians(lat1);
  const lat2Rad = degreesToRadians(lat2);
  const lon1Rad = degreesToRadians(lon1);

  const Bx = Math.cos(lat2Rad) * Math.cos(dLon);
  const By = Math.cos(lat2Rad) * Math.sin(dLon);
  const lat3 = Math.atan2(
    Math.sin(lat1Rad) + Math.sin(lat2Rad),
    Math.sqrt((Math.cos(lat1Rad) + Bx) * (Math.cos(lat1Rad) + Bx) + By * By)
  );
  const lon3 = lon1Rad + Math.atan2(By, Math.cos(lat1Rad) + Bx);

  return {
    latitude: (lat3 * 180) / Math.PI,
    longitude: (lon3 * 180) / Math.PI,
  };
};

/**
 * Check if a coordinate is within a radius of another coordinate
 */
export const isWithinRadius = (
  centerLat: number,
  centerLon: number,
  pointLat: number,
  pointLon: number,
  radiusKm: number
): boolean => {
  const distance = calculateDistance(centerLat, centerLon, pointLat, pointLon);
  return distance <= radiusKm;
};

// ===== Validation Utilities =====

/**
 * Validate data against a Zod schema
 */
export const validateWithZod = <T>(schema: z.ZodType<T>, data: unknown): T => {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError(
        'Validation error',
        400,
        'VALIDATION_ERROR',
        error.errors.map((err) => ({
          path: err.path.join('.'),
          message: err.message,
        }))
      );
    }
    throw error;
  }
};

/**
 * Validate email format
 */
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate URL format
 */
export const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Validate phone number format (basic)
 */
export const isValidPhoneNumber = (phone: string): boolean => {
  const phoneRegex = /^\+?[0-9]{10,15}$/;
  return phoneRegex.test(phone);
};

// ===== Cache Utilities =====

/**
 * Create a memory cache instance
 */
export const createMemoryCache = (ttlSeconds = 60) => {
  return new NodeCache({
    stdTTL: ttlSeconds,
    checkperiod: ttlSeconds * 0.2,
    useClones: false,
  });
};

/**
 * Cache decorator for async functions
 */
export const withCache = <T>(
  fn: (...args: any[]) => Promise<T>,
  cache: NodeCache,
  keyPrefix: string,
  ttl?: number
) => {
  return async (...args: any[]): Promise<T> => {
    const key = `${keyPrefix}:${JSON.stringify(args)}`;
    const cached = cache.get<T>(key);
    
    if (cached !== undefined) {
      return cached;
    }
    
    const result = await fn(...args);
    // Avoid passing `undefined` as TTL because `node-cache` expects
    // a `string | number` explicitly. Use the overload without TTL
    // when it is not provided.
    if (ttl !== undefined) {
      cache.set(key, result, ttl);
    } else {
      cache.set(key, result);
    }
    return result;
  };
};

// ===== Prometheus Metrics Utilities =====

/**
 * Initialize Prometheus metrics
 */
export const initializeMetrics = (serviceName: string) => {
  // Reset the registry (useful in tests)
  register.clear();

  // Set default labels
  register.setDefaultLabels({
    service: serviceName,
  });

  // Create standard metrics
  const httpRequestDurationMicroseconds = new Histogram({
    name: `${serviceName}_http_request_duration_seconds`,
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
  });

  const httpRequestCounter = new Counter({
    name: `${serviceName}_http_requests_total`,
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
  });

  const errorCounter = new Counter({
    name: `${serviceName}_errors_total`,
    help: 'Total number of errors',
    labelNames: ['type', 'code'],
  });

  const activeConnections = new Gauge({
    name: `${serviceName}_active_connections`,
    help: 'Number of active connections',
  });

  return {
    httpRequestDurationMicroseconds,
    httpRequestCounter,
    errorCounter,
    activeConnections,
    register,
  };
};

/**
 * Create a middleware for Express to record HTTP metrics
 */
export const createMetricsMiddleware = (metrics: ReturnType<typeof initializeMetrics>) => {
  return (req: any, res: any, next: any) => {
    const start = Date.now();
    
    // Increment active connections
    metrics.activeConnections.inc();
    
    // Record end time and metrics on response finish
    res.on('finish', () => {
      const duration = (Date.now() - start) / 1000;
      const route = req.route?.path || req.path;
      const method = req.method;
      const statusCode = res.statusCode.toString();
      
      // Record request duration
      metrics.httpRequestDurationMicroseconds.labels(method, route, statusCode).observe(duration);
      
      // Increment request counter
      metrics.httpRequestCounter.labels(method, route, statusCode).inc();
      
      // Decrement active connections
      metrics.activeConnections.dec();
      
      // If error, increment error counter
      if (res.statusCode >= 400) {
        metrics.errorCounter.labels('http', statusCode).inc();
      }
    });
    
    next();
  };
};

// ===== Sanitization Utilities =====

/**
 * Sanitize HTML to prevent XSS
 */
export const sanitizeHtml = (html: string): string => {
  return html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

/**
 * Sanitize a string for use in SQL queries
 */
export const sanitizeSql = (str: string): string => {
  return str.replace(/'/g, "''");
};

/**
 * Sanitize object by removing sensitive fields
 */
export const sanitizeObject = <T extends Record<string, any>>(
  obj: T,
  sensitiveFields: string[] = ['password', 'token', 'secret', 'apiKey']
): Partial<T> => {
  const result: Partial<T> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (sensitiveFields.includes(key)) {
      continue;
    }
    
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[key as keyof T] = sanitizeObject(value, sensitiveFields) as any;
    } else {
      result[key as keyof T] = value;
    }
  }
  
  return result;
};

// ===== Miscellaneous Utilities =====

/**
 * Generate a random string
 */
export const generateRandomString = (length = 32): string => {
  return randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
};

/**
 * Generate a request ID
 */
export const generateRequestId = (): string => {
  return `req_${randomBytes(8).toString('hex')}`;
};

/**
 * Generate a hash of a string
 */
export const hashString = (str: string, algorithm = 'sha256'): string => {
  return createHash(algorithm).update(str).digest('hex');
};

/**
 * Chunk an array into smaller arrays
 */
export const chunkArray = <T>(array: T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
};

/**
 * Sleep for a specified duration
 */
export const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Retry a function with exponential backoff
 */
export const retry = async <T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    factor?: number;
    shouldRetry?: (error: any) => boolean;
  } = {}
): Promise<T> => {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    factor = 2,
    shouldRetry = () => true,
  } = options;

  let attempt = 0;
  let delay = initialDelay;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      
      if (attempt > maxRetries || !shouldRetry(error)) {
        throw error;
      }
      
      delay = Math.min(delay * factor, maxDelay);
      await sleep(delay);
    }
  }
};

/**
 * Deep merge two objects
 */
export const deepMerge = <T extends Record<string, any>, U extends Record<string, any>>(
  target: T,
  source: U
): T & U => {
  const output = { ...target } as T & U;
  
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          // Safe write through `any` to avoid TS2862 generic index error
          (output as any)[key] = source[key];
        } else {
          (output as any)[key] = deepMerge(
            (target as any)[key],
            (source as any)[key],
          );
        }
      } else {
        (output as any)[key] = source[key];
      }
    });
  }
  
  return output;
};

/**
 * Check if value is an object
 */
const isObject = (item: any): item is Record<string, any> => {
  return item && typeof item === 'object' && !Array.isArray(item);
};

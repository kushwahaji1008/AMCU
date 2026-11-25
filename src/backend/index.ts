/**
 * DugdhaSetu Backend Entry Point
 *
 * Initializes the Express application, security middlewares, dependency injection,
 * API routes, 404 handling for unmatched API paths, and global error handling.
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import hpp from 'hpp';
import bcrypt from 'bcryptjs';
import * as useragent from 'express-useragent';
import swaggerUi from 'swagger-ui-express';

// Repositories
import {
  MongoFarmerRepository,
  MongoCollectionRepository,
  MongoRateChartRepository,
  MongoLedgerRepository,
  MongoUserRepository,
  MongoSaleRepository,
  MongoCustomerRepository,
  MongoCustomerPaymentRepository,
  MongoDairyRepository,
  MongoSettingsRepository,
  MongoShiftSummaryRepository,
  MongoLoginAuditRepository,
  MongoActivityLogRepository,
} from './Infrastructure/Repositories/MongoRepositories';
import {
  MongoIdempotencyRepository,
  MongoSyncConflictRepository,
  MongoSmsLogRepository,
} from './Infrastructure/Repositories/SyncAndAuditRepositories';

// Interfaces
import {
  IFarmerRepository,
  ICollectionRepository,
  IRateChartRepository,
  ILedgerRepository,
  IUserRepository,
  ISaleRepository,
  ICustomerRepository,
  ICustomerPaymentRepository,
  IDairyRepository,
  ISettingsRepository,
  IShiftSummaryRepository,
  ILoginAuditRepository,
  IActivityLogRepository,
  IIdempotencyRepository,
  ISyncConflictRepository,
  ISmsLogRepository,
} from './Application/Interfaces/IRepositories';

// Services
import { FarmerService } from './Application/Services/FarmerService';
import { CollectionService } from './Application/Services/CollectionService';
import { PaymentService } from './Application/Services/PaymentService';
import { AuthService } from './Application/Services/AuthService';
import { SaleService, CustomerService } from './Application/Services/SaleService';
import { ReportingService } from './Application/Services/ReportingService';
import { ActivityLogService } from './Application/Services/ActivityLogService';
import { SyncConflictService } from './Application/Services/SyncConflictService';
import { emailService } from './Application/Services/EmailService';

// Controllers & Routes
import { FarmerController } from './API/Controllers/FarmerController';
import { CollectionController } from './API/Controllers/CollectionController';
import { SaleController, ReportingController } from './API/Controllers/SaleController';
import { registerSyncAndAuditRoutes } from './API/Routes/SyncAndAuditRoutes';

// Middlewares & Config
import { authenticate, authorize, AuthRequest } from './API/Middleware/AuthMiddleware';
import { ErrorMiddleware } from './API/Middleware/ErrorMiddleware';
import { idempotencyMiddleware } from './API/Middleware/IdempotencyMiddleware';
import {
  validateRegistration,
  validateLogin,
  validateAdminVerify,
  validateFarmer,
  validateFarmerUpdate,
  validateCollection,
  validateCollectionUpdate,
  validateShiftSummary,
  validateCustomer,
  validateCustomerUpdate,
  validateSale,
  validateCustomerPayment,
  validateFarmerPayment,
  validateRate,
  validateUserCreate,
  validateUserUpdate,
  validateDairyUpdate,
} from './API/Middleware/ValidationMiddleware';
import { activityLogger } from './API/Middleware/ActivityLogger';
import { swaggerSpec } from './API/Config/Swagger';
import { dbManager } from './Infrastructure/Persistence/Mongo/DatabaseManager';
import { DEFAULT_DATABASE_ID, isValidDatabaseId, setRequestAuditDiff } from './Core/RequestContext';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './Core/Errors';

const PROTOTYPE_POLLUTION_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Recursively strips MongoDB operator keys (`$*`) and prototype pollution keys
 * without corrupting legitimate strings (such as `<`/`>` in passwords) or
 * decimal-keyed maps (such as `snfDeductions['9.0']`).
 */
export function sanitizePayload(value: unknown, depth: number = 0): any {
  if (depth > 15 || value === null || value === undefined || typeof value !== 'object') {
    return value;
  }
  if (value instanceof Date) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePayload(item, depth + 1));
  }
  const clean: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (key.startsWith('$') || PROTOTYPE_POLLUTION_KEYS.has(key)) {
      continue;
    }
    clean[key] = sanitizePayload(val, depth + 1);
  }
  return clean;
}

const CORS_ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'x-database-id',
  'Idempotency-Key',
  'X-Expected-Version',
  'X-Offline-Sync',
  'X-Correlation-Id',
  'X-App-Version',
  'X-Platform',
  'X-Device-Model',
];

export function getCorsOptions(): cors.CorsOptions {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  if (allowedOrigins && allowedOrigins.length > 0) {
    return {
      origin: allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: CORS_ALLOWED_HEADERS,
    };
  }

  return {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: CORS_ALLOWED_HEADERS,
  };
}

export interface BackendDependencies {
  farmerRepo?: IFarmerRepository;
  collectionRepo?: ICollectionRepository;
  rateChartRepo?: IRateChartRepository;
  ledgerRepo?: ILedgerRepository;
  userRepo?: IUserRepository;
  saleRepo?: ISaleRepository;
  customerRepo?: ICustomerRepository;
  paymentRepo?: ICustomerPaymentRepository;
  dairyRepo?: IDairyRepository;
  settingsRepo?: ISettingsRepository;
  shiftSummaryRepo?: IShiftSummaryRepository;
  auditRepo?: ILoginAuditRepository;
  activityRepo?: IActivityLogRepository;
  idempotencyRepo?: IIdempotencyRepository;
  conflictRepo?: ISyncConflictRepository;
  smsLogRepo?: ISmsLogRepository;
  authMiddleware?: typeof authenticate;
  disableRateLimit?: boolean;
}

function extractDeviceAuditData(req: Request) {
  const userAgent = req.headers['user-agent'] || '';
  const deviceName = req.body?.deviceName;
  let model = deviceName;
  if (!model) {
    const modelMatch = userAgent.match(/\(([^;]+);([^;]+);([^;)]+)\)/);
    if (modelMatch && modelMatch[3]) {
      model = modelMatch[3].split('Build/')[0].trim();
    }
  }
  return {
    ipAddress: req.ip,
    userAgent,
    device: {
      browser: (req as any).useragent?.browser,
      os: (req as any).useragent?.os,
      deviceType: (req as any).useragent?.isMobile
        ? 'Mobile'
        : (req as any).useragent?.isTablet
          ? 'Tablet'
          : 'Desktop',
      model,
    },
  };
}

export function createBackendApp(deps: BackendDependencies = {}) {
  const app = express();

  app.set('trust proxy', 1);

  // Request Logger for API calls and errors
  app.use((req, res, next) => {
    const isStaticAsset = /\.(tsx?|jsx?|css|png|jpg|svg|ico|json)$/.test(req.path);
    if (isStaticAsset && res.statusCode < 400) {
      return next();
    }

    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      if (res.statusCode >= 400) {
        console.warn(`[API] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
      } else if (req.originalUrl.startsWith('/api')) {
        console.log(`[API] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
      }
    });
    next();
  });

  // Security headers, CORS, JSON body parsing, HPP, and NoSQL sanitization
  app.use(
    helmet({
      frameguard: false,
      contentSecurityPolicy: false,
    })
  );
  app.use(cors(getCorsOptions()));
  app.use(express.json({ limit: '100kb' }));
  app.use(hpp());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (req.body && typeof req.body === 'object') req.body = sanitizePayload(req.body);
    if (req.query && typeof req.query === 'object') req.query = sanitizePayload(req.query);
    if (req.params && typeof req.params === 'object') req.params = sanitizePayload(req.params);
    next();
  });
  app.use(useragent.express());

  // Rate limiting
  const skipRateLimit = deps.disableRateLimit === true;
  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false },
    skip: () => skipRateLimit,
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        message: 'Too many requests from this IP, please try again after 15 minutes',
        code: 'RATE_LIMIT_EXCEEDED',
      });
    },
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false },
    skip: () => skipRateLimit,
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        message: 'Too many authentication attempts, please try again later',
        code: 'AUTH_RATE_LIMIT_EXCEEDED',
      });
    },
  });

  app.use('/api/', generalLimiter);

  // Repositories
  const farmerRepo = deps.farmerRepo || new MongoFarmerRepository();
  const collectionRepo = deps.collectionRepo || new MongoCollectionRepository();
  const rateChartRepo = deps.rateChartRepo || new MongoRateChartRepository();
  const ledgerRepo = deps.ledgerRepo || new MongoLedgerRepository();
  const userRepo = deps.userRepo || new MongoUserRepository();
  const saleRepo = deps.saleRepo || new MongoSaleRepository();
  const customerRepo = deps.customerRepo || new MongoCustomerRepository();
  const paymentRepo = deps.paymentRepo || new MongoCustomerPaymentRepository();
  const dairyRepo = deps.dairyRepo || new MongoDairyRepository();
  const settingsRepo = deps.settingsRepo || new MongoSettingsRepository();
  const shiftSummaryRepo = deps.shiftSummaryRepo || new MongoShiftSummaryRepository();
  const auditRepo = deps.auditRepo || new MongoLoginAuditRepository();
  const activityRepo = deps.activityRepo || new MongoActivityLogRepository();
  const idempotencyRepo = deps.idempotencyRepo || new MongoIdempotencyRepository();
  const conflictRepo = deps.conflictRepo || new MongoSyncConflictRepository();
  const smsLogRepo = deps.smsLogRepo || new MongoSmsLogRepository();

  // Services
  const activityLogService = new ActivityLogService(activityRepo);
  const farmerService = new FarmerService(farmerRepo, conflictRepo, activityLogService);
  const collectionService = new CollectionService(
    collectionRepo,
    rateChartRepo,
    ledgerRepo,
    farmerRepo,
    shiftSummaryRepo,
    settingsRepo,
    conflictRepo,
    activityLogService
  );
  const paymentService = new PaymentService(ledgerRepo, farmerRepo);
  const authService = new AuthService(userRepo, dairyRepo, auditRepo, activityLogService);
  const saleService = new SaleService(saleRepo, customerRepo, paymentRepo);
  const customerService = new CustomerService(customerRepo, conflictRepo, activityLogService);
  const reportingService = new ReportingService(collectionRepo, saleRepo, farmerRepo, ledgerRepo);
  const syncConflictService = new SyncConflictService(
    conflictRepo,
    farmerRepo,
    collectionRepo,
    customerRepo,
    rateChartRepo,
    activityLogService
  );

  const rawAuthMw = deps.authMiddleware || authenticate;
  const authMw = [rawAuthMw, idempotencyMiddleware(idempotencyRepo)];

  app.use(activityLogger(activityLogService));

  // Controllers
  const farmerController = new FarmerController(farmerService);
  const collectionController = new CollectionController(collectionService);
  const saleController = new SaleController(saleService, customerService);
  const reportingController = new ReportingController(reportingService);

  // --- Health ---
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: dbManager.getConnectionState(),
    });
  });

  // --- Authentication Routes ---
  app.post('/api/auth/register', authLimiter, validateRegistration, async (req, res, next) => {
    try {
      const { username, email, password, role, dairyData } = req.body;
      // Public registration is strictly for new dairy admin onboarding.
      // Operators and additional tenant users must be created via authenticated /api/users.
      if (role !== 'admin' || !dairyData) {
        throw new ForbiddenError(
          'Public registration requires dairy registration details. Operators must be created by a dairy administrator.',
          'REGISTRATION_FORBIDDEN'
        );
      }

      const user = await authService.register(username, email, password, 'admin', dairyData);
      res.status(201).json(user);
    } catch (error) {
      next(error);
    }
  });

  app.post(
    '/api/auth/login',
    authLimiter,
    (req, _res, next) => {
      if (!req.body.username && req.body.email) {
        req.body.username = req.body.email;
      }
      next();
    },
    validateLogin,
    async (req, res, next) => {
      try {
        const auditData = extractDeviceAuditData(req);
        const result = await authService.login(req.body.username, req.body.password, auditData);
        res.json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  app.post('/api/auth/logout', authMw, async (req: AuthRequest, res, next) => {
    try {
      await authService.logout(req.user!.id);
      res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/auth/verify-otp', authLimiter, async (req, res, next) => {
    try {
      const { userId, otp } = req.body;
      const result = await authService.verifyOTP(userId, otp);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/auth/resend-otp', authLimiter, async (req, res, next) => {
    try {
      const { userId } = req.body;
      const result = await authService.resendOTP(userId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/admin/verify', authLimiter, validateAdminVerify, async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const auditData = extractDeviceAuditData(req);
      const result = await authService.loginSuperAdmin(email, password, auditData);
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  });

  // --- Super Admin Audit, Sync Conflict, & SMS Routes ---
  registerSyncAndAuditRoutes(app, authMw, {
    auditRepo,
    activityLogService,
    syncConflictService,
    smsLogRepo,
  });

  app.get('/api/dairies', authMw, authorize(['super_admin']), async (_req, res, next) => {
    try {
      const dairies = await dairyRepo.getAll();
      res.json(dairies);
    } catch (error) {
      next(error);
    }
  });

  app.put(
    '/api/dairies/:id',
    authMw,
    authorize(['admin', 'super_admin']),
    validateDairyUpdate,
    async (req: AuthRequest, res, next) => {
      try {
        const dairy = await dairyRepo.getById(req.params.id);
        if (!dairy) {
          throw new NotFoundError('Dairy not found', 'DAIRY_NOT_FOUND');
        }

        if (req.user!.role !== 'super_admin') {
          const belongsToUser =
            dairy.databaseId === req.user!.databaseId ||
            dairy.id === req.user!.dairyId ||
            dairy.ownerId === req.user!.id;
          if (!belongsToUser) {
            throw new ForbiddenError('You can only update your own dairy profile', 'FORBIDDEN');
          }
        }

        const updates: Record<string, any> = {};
        if (req.body.name !== undefined) updates.name = req.body.name.trim();
        if (req.body.address !== undefined) updates.address = req.body.address.trim();
        if (req.body.contact !== undefined) updates.contact = req.body.contact.trim();
        if (req.body.phone !== undefined) {
          updates.phone = req.body.phone.trim();
          if (req.body.contact === undefined) updates.contact = req.body.phone.trim();
        }
        if (req.body.email !== undefined) updates.email = req.body.email.trim().toLowerCase();

        const updated = dairyRepo.update
          ? await dairyRepo.update(dairy.id, updates)
          : dairy;
        setRequestAuditDiff(dairy, updated);
        res.json(updated);
      } catch (error) {
        next(error);
      }
    }
  );

  app.get('/api/admin/swagger-status', authMw, authorize(['super_admin']), async (_req, res, next) => {
    try {
      const model = await dbManager.getSettingsModel(DEFAULT_DATABASE_ID);
      const doc = await model.findOne({ key: 'swaggerEnabled' }).lean();
      res.json({ enabled: doc ? doc.value === true : false });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/admin/swagger-toggle', authMw, authorize(['super_admin']), async (req, res, next) => {
    try {
      const { enabled } = req.body;
      if (typeof enabled !== 'boolean') {
        throw new ValidationError('enabled must be a boolean', 'INVALID_SWAGGER_FLAG');
      }
      const model = await dbManager.getSettingsModel(DEFAULT_DATABASE_ID);
      await model.findOneAndUpdate(
        { key: 'swaggerEnabled' },
        { value: enabled, updatedAt: new Date() },
        { upsert: true, new: true }
      );
      res.json({ success: true, enabled });
    } catch (error) {
      next(error);
    }
  });

  app.use(
    '/api-docs',
    async (_req, res, next) => {
      try {
        const model = await dbManager.getSettingsModel(DEFAULT_DATABASE_ID);
        const doc = await model.findOne({ key: 'swaggerEnabled' }).lean();
        const isEnabled = doc ? doc.value === true : false;
        if (isEnabled === true) {
          return next();
        }
        res.status(404).send('Not Found');
      } catch (error) {
        next(error);
      }
    },
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec)
  );

  // --- Notification & Email Diagnostics (Authenticated) ---
  app.post('/api/notify', authMw, authorize(['admin', 'super_admin', 'operator']), async (req: AuthRequest, res, next) => {
    try {
      const { mobile, message, type, idempotencyKey, recipientType, recipientId, recipientName, triggerType } = req.body;
      if (!mobile || !message || typeof mobile !== 'string' || typeof message !== 'string') {
        throw new ValidationError('Mobile and message are required', 'INVALID_NOTIFICATION');
      }
      console.info(`[SIMULATED ${String(type || 'SMS').toUpperCase()}] To: ${mobile}, Length: ${message.length}`);
      if (deps.smsLogRepo || dbManager.getConnectionState() === 'connected') {
        const key = (idempotencyKey || `notify_${Date.now()}_${mobile}`).toString();
        await smsLogRepo
          .upsertByIdempotencyKey({
            idempotencyKey: key,
            recipientType: recipientType === 'customer' ? 'customer' : recipientType === 'farmer' ? 'farmer' : 'other',
            recipientId: recipientId ? String(recipientId) : undefined,
            recipientName: recipientName ? String(recipientName) : undefined,
            phone: mobile,
            message,
            triggerType: String(triggerType || type || 'manual'),
            deliveryChannel: 'server_simulated',
            status: 'simulated',
            attempts: 1,
            createdAt: new Date(),
            operatorId: req.user?.id,
            databaseId: req.user?.databaseId,
          })
          .catch(() => {});
      }
      res.json({
        success: true,
        simulated: true,
        message: 'Notification simulated. Real delivery is disabled.',
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/diag/email', authMw, authorize(['super_admin']), async (req, res, next) => {
    try {
      const testEmail = (req.query.to as string)?.trim();
      if (!testEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail)) {
        throw new ValidationError('Valid recipient email address is required', 'INVALID_EMAIL');
      }
      await emailService.sendOTP(testEmail, '123456');
      res.json({
        success: true,
        message: `Test email sent to ${testEmail}.`,
      });
    } catch (error) {
      next(error);
    }
  });

  // --- Farmer Management ---
  app.get('/api/farmers', authMw, (req, res, next) => farmerController.getAllFarmers(req, res, next));
  app.get('/api/farmers/search/:farmerId', authMw, (req, res, next) =>
    farmerController.searchByFarmerId(req, res, next)
  );
  app.get('/api/farmers/:id', authMw, (req, res, next) => farmerController.getFarmer(req, res, next));
  app.post('/api/farmers', authMw, authorize(['admin', 'super_admin']), validateFarmer, (req, res, next) =>
    farmerController.createFarmer(req, res, next)
  );
  app.put('/api/farmers/:id', authMw, authorize(['admin', 'super_admin']), validateFarmerUpdate, (req, res, next) =>
    farmerController.updateFarmer(req, res, next)
  );
  app.delete('/api/farmers/:id', authMw, authorize(['admin', 'super_admin']), (req, res, next) =>
    farmerController.deleteFarmer(req, res, next)
  );
  app.get('/api/farmers/:id/summary', authMw, (req, res, next) =>
    farmerController.getFarmerSummary(req, res, next)
  );

  // --- Milk Collection & Shifts ---
  app.post(
    '/api/collections',
    authMw,
    authorize(['admin', 'super_admin', 'operator']),
    validateCollection,
    (req, res, next) => collectionController.createCollection(req, res, next)
  );
  app.put(
    '/api/collections/:id',
    authMw,
    authorize(['admin', 'super_admin']),
    validateCollectionUpdate,
    (req, res, next) => collectionController.updateCollection(req, res, next)
  );
  app.get('/api/collections', authMw, (req, res, next) => collectionController.getAllCollections(req, res, next));
  app.get('/api/collections/report', authMw, (req, res, next) => collectionController.getDailyReport(req, res, next));
  app.get('/api/collections/farmer/:farmerInternalId', authMw, (req, res, next) =>
    collectionController.getByFarmerId(req, res, next)
  );
  app.post(
    '/api/shifts/summary',
    authMw,
    authorize(['admin', 'super_admin', 'operator']),
    validateShiftSummary,
    (req, res, next) => collectionController.createShiftSummary(req, res, next)
  );
  app.get('/api/shifts/summary', authMw, (req, res, next) => collectionController.getShiftSummary(req, res, next));
  app.get('/api/shifts/recent', authMw, (req, res, next) =>
    collectionController.getRecentShiftSummaries(req, res, next)
  );

  // --- Sales & Customer Routes ---
  app.get('/api/customers', authMw, (req, res, next) => saleController.getAllCustomers(req, res, next));
  app.post(
    '/api/customers',
    authMw,
    authorize(['admin', 'super_admin', 'operator']),
    validateCustomer,
    (req, res, next) => saleController.createCustomer(req, res, next)
  );
  app.put(
    '/api/customers/:id',
    authMw,
    authorize(['admin', 'super_admin']),
    validateCustomerUpdate,
    (req, res, next) => saleController.updateCustomer(req, res, next)
  );
  app.delete('/api/customers/:id', authMw, authorize(['admin', 'super_admin']), (req, res, next) =>
    saleController.deleteCustomer(req, res, next)
  );
  app.get('/api/sales', authMw, (req, res, next) => saleController.getAllSales(req, res, next));
  app.get('/api/sales/recent', authMw, (req, res, next) => saleController.getRecentSales(req, res, next));
  app.get('/api/sales/daily', authMw, (req, res, next) => saleController.getDailySales(req, res, next));
  app.get('/api/sales/customer/:customerId', authMw, (req, res, next) =>
    saleController.getCustomerHistory(req, res, next)
  );
  app.post(
    '/api/sales',
    authMw,
    authorize(['admin', 'super_admin', 'operator']),
    validateSale,
    (req, res, next) => saleController.recordSale(req, res, next)
  );
  app.get('/api/customer-payments', authMw, (req, res, next) => saleController.getRecentPayments(req, res, next));
  app.post(
    '/api/customer-payments',
    authMw,
    authorize(['admin', 'super_admin', 'operator']),
    validateCustomerPayment,
    (req, res, next) => saleController.recordPayment(req, res, next)
  );

  // --- Reporting & Analytics ---
  app.get('/api/reports/dashboard', authMw, (req, res, next) =>
    reportingController.getDashboardStats(req, res, next)
  );
  app.get('/api/reports/daily', authMw, (req, res, next) => reportingController.getDailyReport(req, res, next));
  app.get('/api/reports/farmer/:id', authMw, (req, res, next) => reportingController.getFarmerReport(req, res, next));
  app.get('/api/reports/bills', authMw, (req, res, next) => reportingController.getPeriodicBills(req, res, next));
  app.post('/api/reports/finalize-bills', authMw, authorize(['admin', 'super_admin']), (req, res, next) =>
    reportingController.finalizePeriodicBills(req, res, next)
  );

  // --- Rate Chart Configuration ---
  app.get('/api/rates/settings', authMw, async (_req, res, next) => {
    try {
      const settings = await settingsRepo.get('rateSettings');
      res.json(settings || {});
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/rates/settings', authMw, authorize(['admin', 'super_admin']), async (req, res, next) => {
    try {
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        throw new ValidationError('Invalid rate settings payload', 'INVALID_SETTINGS');
      }
      const prevSettings = await settingsRepo.get('rateSettings').catch(() => null);
      await settingsRepo.save('rateSettings', req.body);
      setRequestAuditDiff(prevSettings, req.body);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/rates', authMw, async (_req, res, next) => {
    try {
      const rates = await rateChartRepo.getAll();
      res.json(rates);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/rates', authMw, authorize(['admin', 'super_admin']), validateRate, async (req, res, next) => {
    try {
      const rate = await rateChartRepo.create(req.body);
      res.status(201).json(rate);
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/rates/:id', authMw, authorize(['admin', 'super_admin']), async (req: AuthRequest, res, next) => {
    try {
      const existing = rateChartRepo.getById ? await rateChartRepo.getById(req.params.id) : null;
      const headerVer = req.header('x-expected-version');
      const expectedVersion =
        req.body?.expectedVersion ??
        (headerVer !== undefined && !Number.isNaN(Number(headerVer)) ? Number(headerVer) : undefined);

      if (existing && expectedVersion !== undefined && (existing.version ?? 1) !== expectedVersion) {
        let conflictId: string | undefined;
        if (deps.conflictRepo || dbManager.getConnectionState() === 'connected') {
          const conflict = await conflictRepo
            .create({
              entityType: 'rate',
              entityId: existing.id,
              operation: 'update',
              localPayload: req.body,
              serverPayload: existing,
              localVersion: expectedVersion,
              serverVersion: existing.version ?? 1,
              reason: `Rate chart version conflict (client v${expectedVersion} vs server v${existing.version ?? 1})`,
              status: 'unresolved',
              userId: req.user?.id,
              databaseId: req.user?.databaseId,
            })
            .catch(() => null);
          conflictId = conflict?.id;
        }
        throw new ConflictError(
          `Sync conflict: Rate chart entry was updated on the server (v${existing.version ?? 1}) since your offline copy (v${expectedVersion}).`,
          'VERSION_CONFLICT',
          { conflictId, serverRecord: existing, serverVersion: existing.version ?? 1, localVersion: expectedVersion }
        );
      }

      const rate = await rateChartRepo.update(req.params.id, req.body, expectedVersion);
      setRequestAuditDiff(existing, rate);
      res.json(rate);
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/rates/:id', authMw, authorize(['admin', 'super_admin']), async (req, res, next) => {
    try {
      await rateChartRepo.delete(req.params.id);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // --- Ledger & Farmer Payments ---
  app.get('/api/ledger', authMw, async (_req, res, next) => {
    try {
      const entries = await ledgerRepo.getAll();
      res.json(entries);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/ledger/farmer/:farmerInternalId', authMw, async (req, res, next) => {
    try {
      const entries = await ledgerRepo.getByFarmerInternalId(req.params.farmerInternalId);
      res.json(entries);
    } catch (error) {
      next(error);
    }
  });

  app.post(
    '/api/payments',
    authMw,
    authorize(['admin', 'super_admin']),
    validateFarmerPayment,
    async (req, res, next) => {
      try {
        const entry = await paymentService.recordPayment(req.body);
        res.status(201).json({ ...entry, message: 'Payment recorded successfully' });
      } catch (error) {
        next(error);
      }
    }
  );

  // --- User Management (Admin / Super Admin) ---
  app.get('/api/users', authMw, authorize(['admin', 'super_admin']), async (req: AuthRequest, res, next) => {
    try {
      const filter: { role?: 'admin' | 'operator' | 'super_admin'; dairyId?: string; databaseId?: string } = {};
      const requestedRole = req.query.role as string | undefined;

      if (req.user!.role === 'super_admin') {
        if (requestedRole === 'admin' || requestedRole === 'operator') {
          filter.role = requestedRole;
        }
      } else {
        // Dairy admins can only view operators within their own tenant database
        filter.databaseId = req.user!.databaseId;
        filter.role = 'operator';
      }

      const users = await userRepo.getAll(filter);
      res.json(users);
    } catch (error) {
      next(error);
    }
  });

  app.post(
    '/api/users',
    authMw,
    authorize(['admin', 'super_admin']),
    validateUserCreate,
    async (req: AuthRequest, res, next) => {
      try {
        const { username, email, password, role, dairyData, dairyId, databaseId } = req.body;

        let targetRole: 'admin' | 'operator' = role === 'admin' ? 'admin' : 'operator';
        let targetDairyId = dairyId;
        let targetDatabaseId = databaseId;

        if (req.user!.role !== 'super_admin') {
          targetRole = 'operator';
          targetDairyId = req.user!.dairyId || req.user!.databaseId;
          targetDatabaseId = req.user!.databaseId;
        } else if (targetDatabaseId && !isValidDatabaseId(targetDatabaseId)) {
          throw new ValidationError('Invalid databaseId format', 'INVALID_DATABASE_ID');
        }

        const user = await authService.register(
          username,
          email || username,
          password,
          targetRole,
          req.user!.role === 'super_admin' ? dairyData : undefined,
          targetDairyId,
          targetDatabaseId
        );
        res.status(201).json(user);
      } catch (error) {
        next(error);
      }
    }
  );

  app.put(
    '/api/users/:id',
    authMw,
    authorize(['admin', 'super_admin']),
    validateUserUpdate,
    async (req: AuthRequest, res, next) => {
      try {
        const targetUser = userRepo.getById ? await userRepo.getById(req.params.id) : null;
        if (!targetUser) {
          throw new NotFoundError('User not found', 'USER_NOT_FOUND');
        }

        if (req.user!.role !== 'super_admin') {
          if (targetUser.databaseId !== req.user!.databaseId || targetUser.role !== 'operator') {
            throw new ForbiddenError('You can only manage operators belonging to your own dairy', 'FORBIDDEN');
          }
        } else if (targetUser.role === 'super_admin' && req.body.status === 'inactive') {
          throw new ForbiddenError('Super admin accounts cannot be deactivated via this endpoint', 'FORBIDDEN');
        }

        const updateData: Record<string, any> = {};
        if (req.body.status !== undefined) updateData.status = req.body.status;
        if (req.body.email !== undefined) updateData.email = req.body.email.trim().toLowerCase();

        if (req.user!.role === 'super_admin') {
          if (req.body.role !== undefined) {
            if (req.body.role !== 'admin' && req.body.role !== 'operator') {
              throw new ForbiddenError('Cannot assign super_admin role', 'FORBIDDEN');
            }
            if (targetUser.id !== req.user!.id) {
              updateData.role = req.body.role;
            }
          }
          if (req.body.dairyId !== undefined) updateData.dairyId = req.body.dairyId;
          if (req.body.databaseId !== undefined) {
            if (!isValidDatabaseId(req.body.databaseId)) {
              throw new ValidationError('Invalid databaseId format', 'INVALID_DATABASE_ID');
            }
            updateData.databaseId = req.body.databaseId;
          }
        }

        if (req.body.password) {
          updateData.passwordHash = await bcrypt.hash(req.body.password, 10);
          updateData.currentSessionId = ''; // Invalidate existing sessions on password reset
        }

        if (updateData.status === 'inactive') {
          updateData.currentSessionId = ''; // Invalidate existing sessions on deactivation
        }

        const {
          passwordHash: _bp,
          otp: _bo,
          otpExpires: _boe,
          otpAttempts: _boa,
          currentSessionId: _bs,
          ...safeBefore
        } = targetUser;

        const updated = await userRepo.update(req.params.id, updateData);
        const { passwordHash: _p, otp: _o, otpExpires: _oe, otpAttempts: _oa, currentSessionId: _s, ...safeUser } = updated;
        setRequestAuditDiff(safeBefore, safeUser);
        res.json(safeUser);
      } catch (error) {
        next(error);
      }
    }
  );

  app.delete('/api/users/:id', authMw, authorize(['admin', 'super_admin']), async (req: AuthRequest, res, next) => {
    try {
      if (req.params.id === req.user!.id) {
        throw new ValidationError('You cannot delete your own account', 'SELF_DELETE_FORBIDDEN');
      }

      const targetUser = userRepo.getById ? await userRepo.getById(req.params.id) : null;
      if (!targetUser) {
        throw new NotFoundError('User not found', 'USER_NOT_FOUND');
      }

      if (targetUser.role === 'super_admin') {
        throw new ForbiddenError('Super admin accounts cannot be deleted', 'FORBIDDEN');
      }

      if (req.user!.role !== 'super_admin') {
        if (targetUser.databaseId !== req.user!.databaseId || targetUser.role !== 'operator') {
          throw new ForbiddenError('You can only delete operators belonging to your own dairy', 'FORBIDDEN');
        }
      }

      const {
        passwordHash: _bp,
        otp: _bo,
        otpExpires: _boe,
        otpAttempts: _boa,
        currentSessionId: _bs,
        ...safeBefore
      } = targetUser;
      await userRepo.delete(req.params.id);
      setRequestAuditDiff(safeBefore, { deleted: true });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // Ensure unmatched /api/* endpoints return JSON 404 instead of SPA HTML
  app.all('/api/*', (req, res) => {
    res.status(404).json({
      success: false,
      message: `API endpoint not found: ${req.method} ${req.originalUrl}`,
      code: 'ROUTE_NOT_FOUND',
    });
  });

  app.use(ErrorMiddleware.handleError);

  return app;
}

const app = createBackendApp();

/**
 * Ensures default rate charts (and optional env-configured super admin) exist on startup.
 */
export async function seedDatabase() {
  try {
    const rateChartRepo = new MongoRateChartRepository();
    const rates = await rateChartRepo.getAll();
    if (rates.length === 0) {
      await rateChartRepo.create({ fatMin: 3.0, fatMax: 5.4, snfMin: 8.0, snfMax: 8.5, ratePerLiter: 45, milkType: 'Cow' });
      await rateChartRepo.create({ fatMin: 5.5, fatMax: 8.0, snfMin: 8.6, snfMax: 9.5, ratePerLiter: 65, milkType: 'Buffalo' });
      console.log('Rate chart seeded.');
    }

    const bootstrapEmail = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
    const bootstrapPassword = process.env.SUPER_ADMIN_PASSWORD;
    if (bootstrapEmail && bootstrapPassword) {
      const userRepo = new MongoUserRepository();
      const existing = await userRepo.getByUsername(bootstrapEmail);
      if (!existing) {
        const dairyRepo = new MongoDairyRepository();
        const authService = new AuthService(userRepo, dairyRepo);
        await authService.register(bootstrapEmail, bootstrapEmail, bootstrapPassword, 'super_admin');
        console.log(`Super Admin seeded for ${bootstrapEmail}.`);
      }
    }
  } catch (error) {
    console.error('Seeding error:', error);
  }
}

export default app;

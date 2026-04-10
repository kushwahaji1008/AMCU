/**
 * DugdhaSetu Backend Entry Point
 * 
 * This file initializes the Express application, configures security middlewares,
 * sets up dependency injection, and defines all API routes.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import hpp from 'hpp';
// @ts-ignore
import xss from 'xss-clean';
// @ts-ignore
import sanitize from 'mongo-sanitize';

// Repositories
import { 
  MongoFarmerRepository, 
  MongoCollectionRepository, 
  MongoRateChartRepository, 
  MongoLedgerRepository, 
  MongoUserRepository,
  MongoSaleRepository,
  MongoCustomerRepository,
  MongoDairyRepository,
  MongoSettingsRepository,
  MongoShiftSummaryRepository,
  MongoLoginAuditRepository
} from './Infrastructure/Repositories/MongoRepositories';

// Services
import { FarmerService } from './Application/Services/FarmerService';
import { CollectionService } from './Application/Services/CollectionService';
import { PaymentService } from './Application/Services/PaymentService';
import { AuthService } from './Application/Services/AuthService';
import { SaleService, CustomerService } from './Application/Services/SaleService';
import { ReportingService } from './Application/Services/ReportingService';

// Controllers
import { FarmerController } from './API/Controllers/FarmerController';
import { CollectionController } from './API/Controllers/CollectionController';
import { SaleController, ReportingController } from './API/Controllers/SaleController';

// Middlewares
import { authenticate, authorize } from './API/Middleware/AuthMiddleware';
import { ErrorMiddleware } from './API/Middleware/ErrorMiddleware';
import { validateRegistration, validateLogin, validateFarmer } from './API/Middleware/ValidationMiddleware';
import * as useragent from 'express-useragent';

const app = express();

/**
 * --- Security Configuration ---
 * Protecting the app from common web vulnerabilities.
 */

// 1. Helmet: Sets various HTTP headers for security (CSP, HSTS, etc.)
app.use(helmet()); 

// 2. CORS: Cross-Origin Resource Sharing configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-database-id']
}));

// 3. Body Parser: Limit JSON body size to prevent Denial of Service (DoS)
app.use(express.json({ limit: '10kb' })); 

// 4. XSS Protection: Sanitize user input to prevent Cross-Site Scripting
app.use(xss()); 

// 5. HPP: Prevent HTTP Parameter Pollution
app.use(hpp()); 

// 6. NoSQL Injection Protection: Sanitize body, query, and params for MongoDB operators
app.use((req, res, next) => {
  req.body = sanitize(req.body);
  req.query = sanitize(req.query);
  req.params = sanitize(req.params);
  next();
});

// 7. User Agent: Parse device and browser information
app.use(useragent.express());

/**
 * --- Rate Limiting ---
 * Preventing brute-force and DoS attacks.
 */

// General API rate limit
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: 'Too many requests from this IP, please try again after 15 minutes'
});
app.use('/api/', limiter);

// Stricter rate limit for authentication routes
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 attempts per hour
  message: 'Too many login attempts, please try again after an hour'
});
app.use('/api/auth/', authLimiter);

/**
 * --- Dependency Injection ---
 * Initializing repositories, services, and controllers.
 */

// Repositories (Infrastructure Layer)
const farmerRepo = new MongoFarmerRepository();
const collectionRepo = new MongoCollectionRepository();
const rateChartRepo = new MongoRateChartRepository();
const ledgerRepo = new MongoLedgerRepository();
const userRepo = new MongoUserRepository();
const saleRepo = new MongoSaleRepository();
const customerRepo = new MongoCustomerRepository();
const dairyRepo = new MongoDairyRepository();
const settingsRepo = new MongoSettingsRepository();
const shiftSummaryRepo = new MongoShiftSummaryRepository();
const auditRepo = new MongoLoginAuditRepository();

// Services (Application Layer)
const farmerService = new FarmerService(farmerRepo);
const collectionService = new CollectionService(collectionRepo, rateChartRepo, ledgerRepo, farmerRepo, shiftSummaryRepo);
const paymentService = new PaymentService(ledgerRepo, farmerRepo);
const authService = new AuthService(userRepo, dairyRepo, auditRepo);
const saleService = new SaleService(saleRepo, customerRepo);
const customerService = new CustomerService(customerRepo);
const reportingService = new ReportingService(collectionRepo, saleRepo, farmerRepo);

// Controllers (API Layer)
const farmerController = new FarmerController(farmerService);
const collectionController = new CollectionController(collectionService);
const saleController = new SaleController(saleService, customerService);
const reportingController = new ReportingController(reportingService);

/**
 * --- API Routes ---
 */

// Authentication Routes
app.post('/api/auth/register', validateRegistration, async (req, res, next) => {
  try {
    const { username, email, password, role, dairyData, dairyId, databaseId } = req.body;
    const user = await authService.register(username, email, password, role, dairyData, dairyId, databaseId);
    res.status(201).json(user);
  } catch (error) { next(error); }
});

app.post('/api/auth/login', validateLogin, async (req, res, next) => {
  try {
    // Capture device and network info for audit logging
    const auditData = {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      device: {
        browser: (req as any).useragent?.browser,
        os: (req as any).useragent?.os,
        deviceType: (req as any).useragent?.isMobile ? 'Mobile' : ((req as any).useragent?.isTablet ? 'Tablet' : 'Desktop')
      }
    };
    const result = await authService.login(req.body.username, req.body.password, auditData);
    res.json(result);
  } catch (error) { next(error); }
});

// Super Admin Verification
app.post('/api/admin/verify', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const auditData = {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      device: {
        browser: (req as any).useragent?.browser,
        os: (req as any).useragent?.os,
        deviceType: (req as any).useragent?.isMobile ? 'Mobile' : ((req as any).useragent?.isTablet ? 'Tablet' : 'Desktop')
      }
    };
    const result = await authService.loginSuperAdmin(email, password, auditData);
    res.json({ success: true, ...result });
  } catch (error) { next(error); }
});

// Login Audit Logs (Super Admin only)
app.get('/api/admin/login-logs', authenticate, authorize(['super_admin']), async (req, res, next) => {
  try {
    const logs = await auditRepo.getAll();
    res.json(logs);
  } catch (error) { next(error); }
});

// Dairy Management (Super Admin only)
app.get('/api/dairies', authenticate, authorize(['super_admin']), async (req, res, next) => {
  try {
    const dairies = await dairyRepo.getAll();
    res.json(dairies);
  } catch (error) { next(error); }
});

// Farmer Management
app.get('/api/farmers', authenticate, (req, res, next) => farmerController.getAllFarmers(req, res).catch(next));
app.get('/api/farmers/search/:farmerId', authenticate, async (req, res, next) => {
  try {
    const farmer = await farmerRepo.getByFarmerId(req.params.farmerId);
    if (!farmer) return res.status(404).json({ message: 'Farmer not found' });
    res.json(farmer);
  } catch (error) { next(error); }
});
app.get('/api/farmers/:id', authenticate, (req, res, next) => farmerController.getFarmer(req, res).catch(next));
app.post('/api/farmers', authenticate, authorize(['admin', 'super_admin']), validateFarmer, (req, res, next) => farmerController.createFarmer(req, res).catch(next));
app.put('/api/farmers/:id', authenticate, authorize(['admin', 'super_admin']), validateFarmer, (req, res, next) => farmerController.updateFarmer(req, res).catch(next));
app.delete('/api/farmers/:id', authenticate, authorize(['admin', 'super_admin']), (req, res, next) => farmerController.deleteFarmer(req, res).catch(next));
app.get('/api/farmers/:id/summary', authenticate, (req, res, next) => farmerController.getFarmerSummary(req, res).catch(next));

// Milk Collection Routes
app.post('/api/collections', authenticate, (req, res, next) => collectionController.createCollection(req, res).catch(next));
app.put('/api/collections/:id', authenticate, authorize(['admin', 'super_admin']), (req, res, next) => collectionController.updateCollection(req, res).catch(next));
app.get('/api/collections/report', authenticate, (req, res, next) => collectionController.getDailyReport(req, res).catch(next));
app.get('/api/collections/farmer/:farmerId', authenticate, (req, res, next) => collectionController.getByFarmerId(req, res).catch(next));
app.post('/api/shifts/summary', authenticate, (req, res, next) => collectionController.createShiftSummary(req, res).catch(next));
app.get('/api/shifts/summary', authenticate, (req, res, next) => collectionController.getShiftSummary(req, res).catch(next));
app.get('/api/shifts/recent', authenticate, (req, res, next) => collectionController.getRecentShiftSummaries(req, res).catch(next));

// Sales & Customer Routes
app.get('/api/customers', authenticate, (req, res, next) => saleController.getAllCustomers(req, res).catch(next));
app.post('/api/customers', authenticate, authorize(['admin', 'super_admin']), (req, res, next) => saleController.createCustomer(req, res).catch(next));
app.post('/api/sales', authenticate, (req, res, next) => saleController.recordSale(req, res).catch(next));

// Reporting & Analytics Routes
app.get('/api/reports/dashboard', authenticate, (req, res, next) => reportingController.getDashboardStats(req, res).catch(next));
app.get('/api/reports/daily', authenticate, (req, res, next) => reportingController.getDailyReport(req, res).catch(next));
app.get('/api/reports/farmer/:farmerId', authenticate, (req, res, next) => reportingController.getFarmerReport(req, res).catch(next));
app.get('/api/reports/bills', authenticate, (req, res, next) => reportingController.getPeriodicBills(req, res).catch(next));

// Rate Chart Configuration
app.get('/api/rates/settings', authenticate, async (req, res, next) => {
  try {
    const settings = await settingsRepo.get('rateSettings');
    res.json(settings || {});
  } catch (error) { next(error); }
});

app.post('/api/rates/settings', authenticate, authorize(['admin', 'super_admin']), async (req, res, next) => {
  try {
    await settingsRepo.save('rateSettings', req.body);
    res.json({ success: true });
  } catch (error) { next(error); }
});

app.get('/api/rates', authenticate, async (req, res, next) => {
  try {
    const rates = await rateChartRepo.getAll();
    res.json(rates);
  } catch (error) { next(error); }
});

app.post('/api/rates', authenticate, authorize(['admin', 'super_admin']), async (req, res, next) => {
  try {
    const rate = await rateChartRepo.create(req.body);
    res.status(201).json(rate);
  } catch (error) { next(error); }
});

app.put('/api/rates/:id', authenticate, authorize(['admin', 'super_admin']), async (req, res, next) => {
  try {
    const rate = await rateChartRepo.update(req.params.id, req.body);
    res.json(rate);
  } catch (error) { next(error); }
});

app.delete('/api/rates/:id', authenticate, authorize(['admin', 'super_admin']), async (req, res, next) => {
  try {
    await rateChartRepo.delete(req.params.id);
    res.json({ success: true });
  } catch (error) { next(error); }
});

// Ledger & Payment Routes
app.get('/api/ledger', authenticate, async (req, res, next) => {
  try {
    const entries = await ledgerRepo.getAll();
    res.json(entries);
  } catch (error) { next(error); }
});

app.get('/api/ledger/farmer/:farmerId', authenticate, async (req, res, next) => {
  try {
    const entries = await ledgerRepo.getByFarmerId(req.params.farmerId);
    res.json(entries);
  } catch (error) { next(error); }
});

app.post('/api/payments', authenticate, authorize(['admin', 'super_admin']), async (req, res, next) => {
  try {
    await paymentService.recordPayment(req.body);
    res.status(201).json({ message: 'Payment recorded successfully' });
  } catch (error) { next(error); }
});

// User Management (Admin only)
app.get('/api/users', authenticate, async (req, res, next) => {
  try {
    const role = req.query.role as string;
    const users = await userRepo.getAll(role);
    res.json(users);
  } catch (error) { next(error); }
});

app.post('/api/users', authenticate, authorize(['admin', 'super_admin']), async (req, res, next) => {
  try {
    const { username, password, role, dairyData, dairyId, databaseId } = req.body;
    const user = await authService.register(username, password, role, dairyData, dairyId, databaseId);
    res.status(201).json(user);
  } catch (error) { next(error); }
});

app.put('/api/users/:id', authenticate, authorize(['admin', 'super_admin']), async (req, res, next) => {
  try {
    const user = await userRepo.update(req.params.id, req.body);
    res.json(user);
  } catch (error) { next(error); }
});

app.delete('/api/users/:id', authenticate, authorize(['admin', 'super_admin']), async (req, res, next) => {
  try {
    await userRepo.delete(req.params.id);
    res.json({ success: true });
  } catch (error) { next(error); }
});

/**
 * --- Global Error Handling ---
 */
app.use(ErrorMiddleware.handleError);

/**
 * --- System Seeding ---
 * Ensures initial admin and default settings exist.
 */
async function seed() {
  try {
    const rates = await rateChartRepo.getAll();
    if (rates.length === 0) {
      await rateChartRepo.create({ fatMin: 3.0, fatMax: 5.4, snfMin: 8.0, snfMax: 8.5, ratePerLiter: 45 });
      await rateChartRepo.create({ fatMin: 5.5, fatMax: 8.0, snfMin: 8.6, snfMax: 9.5, ratePerLiter: 65 });
      console.log('Rate chart seeded.');
    }
  } catch (error) {
    console.error('Seeding error:', error);
  }
}
seed();

export default app;

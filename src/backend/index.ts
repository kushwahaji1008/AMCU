import express from 'express';
import { 
  MongoFarmerRepository, 
  MongoCollectionRepository, 
  MongoRateChartRepository, 
  MongoLedgerRepository, 
  MongoUserRepository,
  MongoSaleRepository,
  MongoCustomerRepository
} from './Infrastructure/Repositories/MongoRepositories';
import { FarmerService } from './Application/Services/FarmerService';
import { CollectionService } from './Application/Services/CollectionService';
import { PaymentService } from './Application/Services/PaymentService';
import { AuthService } from './Application/Services/AuthService';
import { SaleService, CustomerService } from './Application/Services/SaleService';
import { ReportingService } from './Application/Services/ReportingService';
import { FarmerController } from './API/Controllers/FarmerController';
import { CollectionController } from './API/Controllers/CollectionController';
import { SaleController, ReportingController } from './API/Controllers/SaleController';
import { authenticate, authorize } from './API/Middleware/AuthMiddleware';
import { ErrorMiddleware } from './API/Middleware/ErrorMiddleware';

const app = express();
app.use(express.json());

// 1. Dependency Injection (Manual for simplicity)
const farmerRepo = new MongoFarmerRepository();
const collectionRepo = new MongoCollectionRepository();
const rateChartRepo = new MongoRateChartRepository();
const ledgerRepo = new MongoLedgerRepository();
const userRepo = new MongoUserRepository();
const saleRepo = new MongoSaleRepository();
const customerRepo = new MongoCustomerRepository();

const farmerService = new FarmerService(farmerRepo);
const collectionService = new CollectionService(collectionRepo, rateChartRepo, ledgerRepo);
const paymentService = new PaymentService(ledgerRepo, farmerRepo);
const authService = new AuthService(userRepo);
const saleService = new SaleService(saleRepo, customerRepo);
const customerService = new CustomerService(customerRepo);
const reportingService = new ReportingService(collectionRepo, saleRepo, farmerRepo);

const farmerController = new FarmerController(farmerService);
const collectionController = new CollectionController(collectionService);
const saleController = new SaleController(saleService, customerService);
const reportingController = new ReportingController(reportingService);

// 2. Routes
app.post('/api/auth/register', async (req, res, next) => {
  try {
    const user = await authService.register(req.body.username, req.body.password, req.body.role);
    res.status(201).json(user);
  } catch (error) { next(error); }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const result = await authService.login(req.body.username, req.body.password);
    res.json(result);
  } catch (error) { next(error); }
});

// Farmer Routes
app.get('/api/farmers', authenticate, (req, res, next) => farmerController.getAllFarmers(req, res).catch(next));
app.get('/api/farmers/:id', authenticate, (req, res, next) => farmerController.getFarmer(req, res).catch(next));
app.post('/api/farmers', authenticate, authorize(['admin']), (req, res, next) => farmerController.createFarmer(req, res).catch(next));
app.get('/api/farmers/:id/summary', authenticate, (req, res, next) => farmerController.getFarmerSummary(req, res).catch(next));

// Collection Routes
app.post('/api/collections', authenticate, (req, res, next) => collectionController.createCollection(req, res).catch(next));
app.get('/api/collections/report', authenticate, (req, res, next) => collectionController.getDailyReport(req, res).catch(next));

// Sale & Customer Routes
app.get('/api/customers', authenticate, (req, res, next) => saleController.getAllCustomers(req, res).catch(next));
app.post('/api/customers', authenticate, authorize(['admin']), (req, res, next) => saleController.createCustomer(req, res).catch(next));
app.post('/api/sales', authenticate, (req, res, next) => saleController.recordSale(req, res).catch(next));

// Reporting Routes
app.get('/api/reports/daily', authenticate, (req, res, next) => reportingController.getDailyReport(req, res).catch(next));
app.get('/api/reports/farmer/:farmerId', authenticate, (req, res, next) => reportingController.getFarmerReport(req, res).catch(next));

// Rate Chart Routes (Admin only)
app.post('/api/rates', authenticate, authorize(['admin']), async (req, res, next) => {
  try {
    const rate = await rateChartRepo.create(req.body);
    res.status(201).json(rate);
  } catch (error) { next(error); }
});

// Payment Routes
app.post('/api/payments', authenticate, authorize(['admin']), async (req, res, next) => {
  try {
    await paymentService.recordPayment(req.body);
    res.status(201).json({ message: 'Payment recorded successfully' });
  } catch (error) { next(error); }
});

// 3. Global Error Handling
app.use(ErrorMiddleware.handleError);

// 4. Seed initial data (Optional)
async function seed() {
  try {
    const admin = await userRepo.getByUsername('admin');
    if (!admin) {
      await authService.register('admin', 'admin123', 'admin');
      console.log('Admin user seeded.');
    }

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

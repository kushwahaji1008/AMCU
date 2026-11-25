import { Request, Response, NextFunction } from 'express';
import { SaleService, CustomerService } from '../../Application/Services/SaleService';
import { ReportingService } from '../../Application/Services/ReportingService';
import { AuthRequest } from '../Middleware/AuthMiddleware';
import { ValidationError } from '../../Core/Errors';

function parseDateOrToday(dateStr: unknown): Date {
  if (!dateStr) return new Date();
  const d = new Date(dateStr as string);
  if (Number.isNaN(d.getTime())) {
    throw new ValidationError('Invalid date parameter', 'INVALID_DATE');
  }
  return d;
}

export class SaleController {
  constructor(
    private saleService: SaleService,
    private customerService: CustomerService
  ) {}

  async createCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      const customer = await this.customerService.createCustomer(req.body);
      res.status(201).json(customer);
    } catch (error) {
      next(error);
    }
  }

  async updateCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      const headerVer = req.header('x-expected-version');
      const expectedVersion =
        req.body?.expectedVersion ?? (headerVer !== undefined && !Number.isNaN(Number(headerVer)) ? Number(headerVer) : undefined);
      const payload = expectedVersion !== undefined ? { ...req.body, expectedVersion } : req.body;
      const customer = await this.customerService.updateCustomer(req.params.id, payload);
      res.json(customer);
    } catch (error) {
      next(error);
    }
  }

  async deleteCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      await this.customerService.deleteCustomer(req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  async getAllCustomers(req: Request, res: Response, next: NextFunction) {
    try {
      const customers = await this.customerService.getAllCustomers();
      res.json(customers);
    } catch (error) {
      next(error);
    }
  }

  async recordSale(req: Request, res: Response, next: NextFunction) {
    try {
      const sale = await this.saleService.recordSale(req.body);
      res.status(201).json(sale);
    } catch (error) {
      next(error);
    }
  }

  async recordPayment(req: Request, res: Response, next: NextFunction) {
    try {
      const payment = await this.saleService.recordPayment(req.body);
      res.status(201).json(payment);
    } catch (error) {
      next(error);
    }
  }

  async getRecentPayments(req: Request, res: Response, next: NextFunction) {
    try {
      const rawLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 50;
      const payments = await this.saleService.getRecentPayments(limit);
      res.json(payments);
    } catch (error) {
      next(error);
    }
  }

  async getAllSales(req: Request, res: Response, next: NextFunction) {
    try {
      const sales = await this.saleService.getAllSales();
      res.json(sales);
    } catch (error) {
      next(error);
    }
  }

  async getRecentSales(req: Request, res: Response, next: NextFunction) {
    try {
      const rawLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 20;
      const sales = await this.saleService.getRecentSales(limit);
      res.json(sales);
    } catch (error) {
      next(error);
    }
  }

  async getDailySales(req: Request, res: Response, next: NextFunction) {
    try {
      const date = parseDateOrToday(req.query.date);
      const sales = await this.saleService.getDailySalesReport(date);
      res.json(sales);
    } catch (error) {
      next(error);
    }
  }

  async getCustomerHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const history = await this.saleService.getCustomerHistory(req.params.customerId);
      res.json(history);
    } catch (error) {
      next(error);
    }
  }
}

export class ReportingController {
  constructor(private reportingService: ReportingService) {}

  async getDashboardStats(req: Request, res: Response, next: NextFunction) {
    try {
      const rawDays = req.query.days ? parseInt(req.query.days as string, 10) : 7;
      const days = Number.isFinite(rawDays) ? Math.min(Math.max(rawDays, 1), 365) : 7;
      const stats = await this.reportingService.getDashboardStats(days);
      res.json(stats);
    } catch (error) {
      next(error);
    }
  }

  async getDailyReport(req: Request, res: Response, next: NextFunction) {
    try {
      const date = parseDateOrToday(req.query.date);
      const report = await this.reportingService.getDailyReport(date);
      res.json(report);
    } catch (error) {
      next(error);
    }
  }

  async getFarmerReport(req: Request, res: Response, next: NextFunction) {
    try {
      const report = await this.reportingService.getFarmerWiseReport(req.params.id);
      res.json(report);
    } catch (error) {
      next(error);
    }
  }

  async getPeriodicBills(req: Request, res: Response, next: NextFunction) {
    try {
      const { year, month, period, farmerId } = req.query;
      const bills = await this.reportingService.getPeriodicBills(
        Number(year),
        Number(month),
        Number(period) as 1 | 2 | 3,
        farmerId as string | undefined
      );
      res.json(bills);
    } catch (error) {
      next(error);
    }
  }

  async finalizePeriodicBills(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { year, month, period, dairyId } = req.body;
      const result = await this.reportingService.finalizePeriodicBills(
        Number(year),
        Number(month),
        Number(period) as 1 | 2 | 3,
        (dairyId as string) || req.user?.dairyId || req.user?.databaseId
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
}

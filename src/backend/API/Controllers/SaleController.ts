import { Request, Response } from 'express';
import { SaleService, CustomerService } from '../../Application/Services/SaleService';
import { ReportingService } from '../../Application/Services/ReportingService';

export class SaleController {
  constructor(
    private saleService: SaleService,
    private customerService: CustomerService
  ) {}

  async createCustomer(req: Request, res: Response) {
    const customer = await this.customerService.createCustomer(req.body);
    res.status(201).json(customer);
  }

  async getAllCustomers(req: Request, res: Response) {
    const customers = await this.customerService.getAllCustomers();
    res.json(customers);
  }

  async recordSale(req: Request, res: Response) {
    const sale = await this.saleService.recordSale(req.body);
    res.status(201).json(sale);
  }

  async recordPayment(req: Request, res: Response) {
    const payment = await this.saleService.recordPayment(req.body);
    res.status(201).json(payment);
  }

  async getAllSales(req: Request, res: Response) {
    try {
      const sales = await this.saleService.getAllSales();
      res.json(sales);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }

  async getRecentSales(req: Request, res: Response) {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const sales = await this.saleService.getRecentSales(limit);
      res.json(sales);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }

  async getDailySales(req: Request, res: Response) {
    try {
      const dateStr = req.query.date as string;
      const date = dateStr ? new Date(dateStr) : new Date();
      const sales = await this.saleService.getDailySalesReport(date);
      res.json(sales);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
}

export class ReportingController {
  constructor(private reportingService: ReportingService) {}

  async getDashboardStats(req: Request, res: Response) {
    const days = req.query.days ? parseInt(req.query.days as string) : 7;
    const stats = await this.reportingService.getDashboardStats(days);
    res.json(stats);
  }

  async getDailyReport(req: Request, res: Response) {
    const dateStr = req.query.date as string;
    const date = dateStr ? new Date(dateStr) : new Date();
    const report = await this.reportingService.getDailyReport(date);
    res.json(report);
  }

  async getFarmerReport(req: Request, res: Response) {
    const id = req.params.id;
    const report = await this.reportingService.getFarmerWiseReport(id);
    res.json(report);
  }

  async getPeriodicBills(req: Request, res: Response) {
    const { year, month, period, farmerId } = req.query;
    const bills = await this.reportingService.getPeriodicBills(
      Number(year),
      Number(month),
      Number(period) as 1 | 2 | 3,
      farmerId as string
    );
    res.json(bills);
  }

  async finalizePeriodicBills(req: Request, res: Response) {
    const { year, month, period, dairyId } = req.body;
    const result = await this.reportingService.finalizePeriodicBills(
      Number(year),
      Number(month),
      Number(period) as 1 | 2 | 3,
      dairyId as string
    );
    res.json(result);
  }
}

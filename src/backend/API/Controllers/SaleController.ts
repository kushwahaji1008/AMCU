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
}

export class ReportingController {
  constructor(private reportingService: ReportingService) {}

  async getDashboardStats(req: Request, res: Response) {
    const stats = await this.reportingService.getDashboardStats();
    res.json(stats);
  }

  async getDailyReport(req: Request, res: Response) {
    const dateStr = req.query.date as string;
    const date = dateStr ? new Date(dateStr) : new Date();
    const report = await this.reportingService.getDailyReport(date);
    res.json(report);
  }

  async getFarmerReport(req: Request, res: Response) {
    const farmerId = req.params.farmerId;
    const report = await this.reportingService.getFarmerWiseReport(farmerId);
    res.json(report);
  }
}

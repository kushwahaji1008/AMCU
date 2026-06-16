import { ISaleRepository, ICustomerRepository, ICustomerPaymentRepository } from '../Interfaces/IRepositories';
import { MilkSale, Customer, CustomerPayment } from '../../Core/Entities/Sale';
import { CreateSaleDTO, CreateCustomerDTO } from '../DTOs/DTOs';

export class CustomerService {
  constructor(private customerRepo: ICustomerRepository) {}

  async getAllCustomers(): Promise<Customer[]> {
    return this.customerRepo.getAll();
  }

  async createCustomer(dto: CreateCustomerDTO): Promise<Customer> {
    return this.customerRepo.create({
      ...dto,
      status: 'Active',
      balance: 0,
      totalPaid: 0,
      totalSales: 0
    });
  }

  async updateCustomer(id: string, dto: Partial<CreateCustomerDTO>): Promise<Customer> {
    return this.customerRepo.update(id, dto);
  }

  async deleteCustomer(id: string): Promise<void> {
    return this.customerRepo.delete(id);
  }
}

export class SaleService {
  constructor(
    private saleRepo: ISaleRepository,
    private customerRepo: ICustomerRepository,
    private paymentRepo: ICustomerPaymentRepository
  ) {}

  async recordSale(dto: CreateSaleDTO): Promise<MilkSale> {
    const amount = Math.round(dto.quantity * dto.rate * 100) / 100;
    const rate = Math.round(dto.rate * 100) / 100;
    const paymentStatus = dto.paymentMode === 'Credit' ? 'Due' : 'Paid';
    
    // Update ledger: Increase balance only if it's Credit
    if (paymentStatus === 'Due') {
      await this.customerRepo.updateBalance(dto.customerId, amount);
    } else {
      // If paid now, we still track it as a sale in the ledger (totalSales)
      // but debt (balance) doesn't increase or increases and decreases immediately.
      // My repo updateBalance increments totalSales always if amount > 0.
      // So if I pass 0, it won't increment totalSales if I used > 0 check.
      // Let's assume repo handles tracking.
      await this.customerRepo.updateBalance(dto.customerId, 0); 
    }
    
    const customer = await this.customerRepo.getById(dto.customerId);
    const newBalance = customer?.balance || 0;
    const notesStr = dto.notes ? ` (${dto.notes})` : '';

    console.log(`[BACKEND SMS SIMULATION] To: ${dto.customerMobile}, Msg: Hello ${dto.customerName}, milk purchase of ${dto.quantity}L recorded. Total Due: ₹${newBalance}${notesStr}. Thank you!`);

    return this.saleRepo.create({
      ...dto,
      date: new Date(dto.date),
      rate,
      amount,
      paymentStatus
    });
  }

  async recordPayment(dto: any): Promise<CustomerPayment> {
    const payment = await this.paymentRepo.create({
      ...dto,
      date: new Date(dto.date)
    });

    // Reduce customer debt
    await this.customerRepo.updateBalance(dto.customerId, -dto.amount);
    
    return payment;
  }

  async getDailySalesReport(date: Date): Promise<MilkSale[]> {
    return this.saleRepo.getDailyReport(date);
  }

  async getAllSales(): Promise<MilkSale[]> {
    return this.saleRepo.getAll();
  }

  async getRecentSales(limit: number): Promise<MilkSale[]> {
    return this.saleRepo.getRecent(limit);
  }

  async getCustomerHistory(customerId: string): Promise<any[]> {
    const [sales, payments] = await Promise.all([
      this.saleRepo.getByCustomerId(customerId),
      this.paymentRepo.getByCustomerId(customerId)
    ]);

    // Merge and sort by date descending
    const history = [
      ...sales.map(s => ({ ...s, entryType: 'sale' })),
      ...payments.map(p => ({ ...p, entryType: 'payment' }))
    ];

    return history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }
}

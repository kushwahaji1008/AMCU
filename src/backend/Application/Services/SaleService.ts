import { ISaleRepository, ICustomerRepository } from '../Interfaces/IRepositories';
import { MilkSale, Customer } from '../../Core/Entities/Sale';
import { CreateSaleDTO, CreateCustomerDTO } from '../DTOs/DTOs';

export class CustomerService {
  constructor(private customerRepo: ICustomerRepository) {}

  async getAllCustomers(): Promise<Customer[]> {
    return this.customerRepo.getAll();
  }

  async createCustomer(dto: CreateCustomerDTO): Promise<Customer> {
    return this.customerRepo.create({
      ...dto,
      status: 'active',
    });
  }
}

export class SaleService {
  constructor(
    private saleRepo: ISaleRepository,
    private customerRepo: ICustomerRepository
  ) {}

  async recordSale(dto: CreateSaleDTO): Promise<MilkSale> {
    const totalAmount = dto.quantity * dto.rate;
    return this.saleRepo.create({
      ...dto,
      date: new Date(dto.date),
      totalAmount,
    });
  }

  async getDailySalesReport(date: Date): Promise<MilkSale[]> {
    return this.saleRepo.getDailyReport(date);
  }
}

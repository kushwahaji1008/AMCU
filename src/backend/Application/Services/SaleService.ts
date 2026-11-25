import {
  ISaleRepository,
  ICustomerRepository,
  ICustomerPaymentRepository,
  ISyncConflictRepository,
} from '../Interfaces/IRepositories';
import { MilkSale, Customer, CustomerPayment } from '../../Core/Entities/Sale';
import { CreateSaleDTO, CreateCustomerDTO } from '../DTOs/DTOs';
import { ConflictError, NotFoundError, ValidationError } from '../../Core/Errors';
import { getDairyId, getDatabaseId, getRequestUser, setRequestAuditDiff } from '../../Core/RequestContext';
import { ActivityLogService } from './ActivityLogService';

export class CustomerService {
  constructor(
    private customerRepo: ICustomerRepository,
    private conflictRepo?: ISyncConflictRepository,
    private activityLogService?: ActivityLogService
  ) {}

  async getAllCustomers(): Promise<Customer[]> {
    return this.customerRepo.getAll();
  }

  async createCustomer(dto: CreateCustomerDTO & { defaultSaleRate?: number }): Promise<Customer> {
    const created = await this.customerRepo.create({
      name: dto.name.trim(),
      mobile: dto.mobile.trim(),
      village: dto.village?.trim(),
      address: dto.address?.trim(),
      type: dto.type === 'Commercial' ? 'Commercial' : 'Individual',
      defaultSaleRate:
        dto.defaultSaleRate !== undefined && dto.defaultSaleRate !== ('' as any)
          ? Number(dto.defaultSaleRate)
          : undefined,
      dairyId: dto.dairyId || getDairyId(),
      status: 'Active',
      balance: 0,
      totalPaid: 0,
      totalSales: 0,
      version: 1,
      updatedAt: new Date(),
    });
    setRequestAuditDiff(undefined, created);
    return created;
  }

  async updateCustomer(
    id: string,
    dto: Partial<CreateCustomerDTO & { status?: 'Active' | 'Inactive'; defaultSaleRate?: number; expectedVersion?: number; baseVersion?: number }>
  ): Promise<Customer> {
    const existing = await this.customerRepo.getById(id);
    if (!existing) {
      throw new NotFoundError('Customer not found', 'CUSTOMER_NOT_FOUND');
    }

    const expectedVersion = dto.expectedVersion ?? dto.baseVersion;
    const serverVersion = existing.version ?? 1;

    if (expectedVersion !== undefined && serverVersion !== expectedVersion) {
      let conflictId: string | undefined;
      if (this.conflictRepo) {
        const conflict = await this.conflictRepo.create({
          entityType: 'customer',
          entityId: existing.id,
          operation: 'update',
          localPayload: dto,
          serverPayload: existing,
          localVersion: expectedVersion,
          serverVersion,
          reason: `Customer record version conflict (client v${expectedVersion} vs server v${serverVersion})`,
          status: 'unresolved',
          userId: getRequestUser()?.userId,
          databaseId: getDatabaseId(),
        });
        conflictId = conflict.id;
      }

      if (this.activityLogService) {
        await this.activityLogService
          .log({
            action: 'SYNC_CONFLICT_CUSTOMER',
            targetId: existing.id,
            targetType: 'CUSTOMER',
            beforeValue: existing,
            afterValue: dto,
            operationStatus: 'conflict',
            errorDetails: `Version mismatch: expected ${expectedVersion}, actual ${serverVersion}`,
            details: { conflictId },
            source: 'sync_engine',
          })
          .catch(() => {});
      }

      throw new ConflictError(
        `Sync conflict: Customer "${existing.name}" was updated on server (v${serverVersion}) since your offline copy (v${expectedVersion}).`,
        'VERSION_CONFLICT',
        { conflictId, serverRecord: existing, serverVersion, localVersion: expectedVersion }
      );
    }

    const allowed: Partial<Customer> = {};
    if (dto.name !== undefined) allowed.name = dto.name.trim();
    if (dto.mobile !== undefined) allowed.mobile = dto.mobile.trim();
    if (dto.village !== undefined) allowed.village = dto.village.trim();
    if (dto.address !== undefined) allowed.address = dto.address.trim();
    if (dto.type !== undefined) allowed.type = dto.type;
    if (dto.status !== undefined) allowed.status = dto.status;
    if (dto.defaultSaleRate !== undefined) {
      allowed.defaultSaleRate = dto.defaultSaleRate === ('' as any) ? undefined : Number(dto.defaultSaleRate);
    }

    const updated =
      expectedVersion !== undefined
        ? await this.customerRepo.update(id, allowed, expectedVersion)
        : await this.customerRepo.update(id, allowed);
    setRequestAuditDiff(existing, updated);
    return updated;
  }

  async deleteCustomer(id: string): Promise<void> {
    const existing = await this.customerRepo.getById(id);
    if (!existing) {
      throw new NotFoundError('Customer not found', 'CUSTOMER_NOT_FOUND');
    }
    await this.customerRepo.delete(id);
    setRequestAuditDiff(existing, undefined);
  }
}

export class SaleService {
  constructor(
    private saleRepo: ISaleRepository,
    private customerRepo: ICustomerRepository,
    private paymentRepo: ICustomerPaymentRepository
  ) {}

  async recordSale(dto: CreateSaleDTO & { idempotencyKey?: string }): Promise<MilkSale> {
    const quantity = Number(dto.quantity);
    const rateInput = Number(dto.rate);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new ValidationError('Quantity must be greater than 0.', 'INVALID_QUANTITY');
    }
    if (!Number.isFinite(rateInput) || rateInput < 0) {
      throw new ValidationError('Rate must be a valid non-negative number.', 'INVALID_RATE');
    }

    const saleDate = dto.date ? new Date(dto.date) : new Date();
    if (Number.isNaN(saleDate.getTime())) {
      throw new ValidationError('Invalid sale date.', 'INVALID_DATE');
    }

    const customer = await this.customerRepo.getById(dto.customerId);
    if (!customer) {
      throw new NotFoundError('Customer not found', 'CUSTOMER_NOT_FOUND');
    }

    const rate = Math.round(rateInput * 100) / 100;
    const amount = Math.round(quantity * rate * 100) / 100;
    const paymentStatus = dto.paymentMode === 'Credit' ? 'Due' : 'Paid';
    const reqUser = getRequestUser();

    const sale = await this.saleRepo.create({
      customerId: customer.id,
      customerName: dto.customerName || customer.name,
      customerMobile: dto.customerMobile || customer.mobile,
      date: saleDate,
      milkType: dto.milkType || 'Mixed',
      quantity,
      rate,
      amount,
      paymentMode: dto.paymentMode,
      paymentStatus,
      notes: dto.notes?.trim(),
      operatorId: reqUser?.userId || dto.operatorId || 'system',
      dairyId: dto.dairyId || getDairyId(),
      idempotencyKey: dto.idempotencyKey,
    });

    let updatedCustomer: Customer | null = null;
    try {
      if (this.customerRepo.applySale) {
        updatedCustomer = await this.customerRepo.applySale(customer.id, {
          balanceDelta: paymentStatus === 'Due' ? amount : 0,
          salesDelta: amount,
          paidDelta: paymentStatus === 'Paid' ? amount : 0,
        });
      } else {
        await this.customerRepo.updateBalance(customer.id, paymentStatus === 'Due' ? amount : 0);
      }
    } catch (err) {
      if (sale?.id && this.saleRepo.delete) {
        await Promise.resolve(this.saleRepo.delete(sale.id)).catch(() => {});
      }
      throw err;
    }

    const newBalance = updatedCustomer?.balance ?? (customer.balance || 0) + (paymentStatus === 'Due' ? amount : 0);
    setRequestAuditDiff(
      { customerBalance: customer.balance, totalSales: customer.totalSales },
      { sale, customerBalance: newBalance }
    );

    const notesStr = dto.notes ? ` (${dto.notes})` : '';
    console.log(
      `[BACKEND SMS SIMULATION] To: ${dto.customerMobile || customer.mobile}, Msg: Hello ${dto.customerName || customer.name}, milk purchase of ${quantity}L recorded. Total Due: ₹${newBalance}${notesStr}. Thank you!`
    );

    return sale;
  }

  async recordPayment(dto: any): Promise<CustomerPayment> {
    const amount = Math.round(Number(dto.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ValidationError('Payment amount must be greater than 0.', 'INVALID_AMOUNT');
    }

    const paymentDate = dto.date ? new Date(dto.date) : new Date();
    if (Number.isNaN(paymentDate.getTime())) {
      throw new ValidationError('Invalid payment date.', 'INVALID_DATE');
    }

    const customer = await this.customerRepo.getById(dto.customerId);
    if (!customer) {
      throw new NotFoundError('Customer not found', 'CUSTOMER_NOT_FOUND');
    }

    const reqUser = getRequestUser();
    const payment = await this.paymentRepo.create({
      customerId: customer.id,
      customerName: dto.customerName || customer.name,
      amount,
      date: paymentDate,
      paymentMode: dto.paymentMode || 'Cash',
      notes: dto.notes?.trim(),
      operatorId: reqUser?.userId || dto.operatorId || 'system',
      dairyId: dto.dairyId || getDairyId(),
      idempotencyKey: dto.idempotencyKey,
    });

    try {
      let updatedCustomer: Customer | null = null;
      if (this.customerRepo.recordPaymentBalance) {
        updatedCustomer = await this.customerRepo.recordPaymentBalance(customer.id, amount);
      } else {
        await this.customerRepo.updateBalance(customer.id, -amount);
      }
      setRequestAuditDiff(
        { customerBalance: customer.balance, totalPaid: customer.totalPaid },
        { payment, customerBalance: updatedCustomer?.balance ?? customer.balance - amount }
      );
    } catch (err) {
      if (payment?.id && this.paymentRepo.delete) {
        await Promise.resolve(this.paymentRepo.delete(payment.id)).catch(() => {});
      }
      throw err;
    }

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

  async getRecentPayments(limit: number): Promise<CustomerPayment[]> {
    return this.paymentRepo.getRecent(limit);
  }

  async getCustomerHistory(customerId: string): Promise<any[]> {
    const [sales, payments] = await Promise.all([
      this.saleRepo.getByCustomerId(customerId),
      this.paymentRepo.getByCustomerId(customerId),
    ]);

    const history = [
      ...sales.map((s) => ({ ...s, entryType: 'sale' })),
      ...payments.map((p) => ({ ...p, entryType: 'payment' })),
    ];

    return history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }
}

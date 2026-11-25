import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SaleService, CustomerService } from '../Application/Services/SaleService';
import {
  ISaleRepository,
  ICustomerRepository,
  ICustomerPaymentRepository,
} from '../Application/Interfaces/IRepositories';
import { NotFoundError, ValidationError } from '../Core/Errors';

describe('SaleService & CustomerService Tests', () => {
  let saleService: SaleService;
  let customerService: CustomerService;
  let mockSaleRepo: ISaleRepository;
  let mockCustomerRepo: ICustomerRepository;
  let mockPaymentRepo: ICustomerPaymentRepository;

  beforeEach(() => {
    mockSaleRepo = {
      create: vi.fn().mockImplementation(async (data) => ({
        id: 'sale1',
        createdAt: new Date(),
        ...data,
      })),
      getDailyReport: vi.fn(),
      getAll: vi.fn(),
      getRecent: vi.fn(),
      getByCustomerId: vi.fn(),
      delete: vi.fn(),
    };

    mockCustomerRepo = {
      getAll: vi.fn(),
      getById: vi.fn().mockResolvedValue({
        id: 'cust1',
        name: 'John Doe',
        mobile: '9876543210',
        type: 'Individual',
        status: 'Active',
        balance: 0,
        totalPaid: 0,
        totalSales: 0,
        dairyId: 'dairy1',
        createdAt: new Date(),
      }),
      create: vi.fn().mockImplementation(async (data) => ({
        id: 'cust1',
        createdAt: new Date(),
        ...data,
      })),
      update: vi.fn().mockImplementation(async (id, data) => ({
        id,
        ...data,
      })),
      delete: vi.fn(),
      updateBalance: vi.fn(),
      getTotalBalance: vi.fn(),
    };

    mockPaymentRepo = {
      create: vi.fn().mockImplementation(async (data) => ({
        id: 'pay1',
        createdAt: new Date(),
        ...data,
      })),
      getRecent: vi.fn(),
      getByCustomerId: vi.fn(),
      delete: vi.fn(),
    };

    saleService = new SaleService(mockSaleRepo, mockCustomerRepo, mockPaymentRepo);
    customerService = new CustomerService(mockCustomerRepo);
  });

  describe('CustomerService', () => {
    it('should initialize balance/totals to 0 and whitelist fields on update', async () => {
      await customerService.createCustomer({
        name: '  Alice  ',
        mobile: '9876543210',
        type: 'Commercial',
        dairyId: 'dairy1',
        balance: 9999,
      } as any);

      expect(mockCustomerRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Alice',
          balance: 0,
          totalPaid: 0,
          totalSales: 0,
        })
      );

      await customerService.updateCustomer('cust1', {
        name: 'Alice Updated',
        balance: 0,
      } as any);

      expect(mockCustomerRepo.update).toHaveBeenCalledWith('cust1', {
        name: 'Alice Updated',
      });
    });

    it('should throw NotFoundError when updating or deleting a non-existent customer', async () => {
      vi.mocked(mockCustomerRepo.getById).mockResolvedValueOnce(null);
      await expect(customerService.updateCustomer('missing', { name: 'X' })).rejects.toThrow(NotFoundError);

      vi.mocked(mockCustomerRepo.getById).mockResolvedValueOnce(null);
      await expect(customerService.deleteCustomer('missing')).rejects.toThrow(NotFoundError);
    });
  });

  describe('recordSale', () => {
    it('should calculate amount correctly and update balance for Credit sales', async () => {
      const dto = {
        customerId: 'cust1',
        customerName: 'John Doe',
        customerMobile: '9876543210',
        quantity: 10,
        rate: 55.5,
        milkType: 'Mixed' as const,
        paymentMode: 'Credit' as const,
        date: '2026-04-08',
        operatorId: 'op1',
        dairyId: 'dairy1',
      };

      await saleService.recordSale(dto);

      expect(mockCustomerRepo.updateBalance).toHaveBeenCalledWith('cust1', 555);
      expect(mockSaleRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 555,
          paymentStatus: 'Due',
        })
      );
    });

    it('should use applySale to track totalSales and totalPaid for Cash sales without adding debt', async () => {
      const applySale = vi.fn().mockResolvedValue({ balance: 0, totalSales: 555, totalPaid: 555 });
      mockCustomerRepo.applySale = applySale;

      await saleService.recordSale({
        customerId: 'cust1',
        customerName: 'John Doe',
        customerMobile: '9876543210',
        quantity: 10,
        rate: 55.5,
        milkType: 'Mixed',
        paymentMode: 'Cash',
        date: '2026-04-08',
        operatorId: 'op1',
        dairyId: 'dairy1',
      });

      expect(applySale).toHaveBeenCalledWith('cust1', {
        balanceDelta: 0,
        salesDelta: 555,
        paidDelta: 555,
      });
      expect(mockSaleRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentStatus: 'Paid',
        })
      );
    });

    it('should roll back sale if customer balance update fails', async () => {
      mockCustomerRepo.applySale = vi.fn().mockRejectedValue(new Error('DB failure'));

      await expect(
        saleService.recordSale({
          customerId: 'cust1',
          customerName: 'John Doe',
          customerMobile: '9876543210',
          quantity: 5,
          rate: 50,
          milkType: 'Cow',
          paymentMode: 'Credit',
          date: '2026-04-08',
          operatorId: 'op1',
          dairyId: 'dairy1',
        })
      ).rejects.toThrow('DB failure');

      expect(mockSaleRepo.delete).toHaveBeenCalledWith('sale1');
    });

    it('should reject invalid quantities, rates, and missing customers', async () => {
      await expect(
        saleService.recordSale({
          customerId: 'cust1',
          customerName: 'John Doe',
          customerMobile: '9876543210',
          quantity: 0,
          rate: 50,
          milkType: 'Cow',
          paymentMode: 'Cash',
          date: '2026-04-08',
          operatorId: 'op1',
          dairyId: 'dairy1',
        })
      ).rejects.toThrow(ValidationError);

      vi.mocked(mockCustomerRepo.getById).mockResolvedValueOnce(null);
      await expect(
        saleService.recordSale({
          customerId: 'unknown',
          customerName: 'X',
          customerMobile: '9876543210',
          quantity: 2,
          rate: 50,
          milkType: 'Cow',
          paymentMode: 'Cash',
          date: '2026-04-08',
          operatorId: 'op1',
          dairyId: 'dairy1',
        })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('recordPayment', () => {
    it('should reject non-positive payments and missing customers', async () => {
      await expect(saleService.recordPayment({ customerId: 'cust1', amount: -10 })).rejects.toThrow(
        ValidationError
      );

      vi.mocked(mockCustomerRepo.getById).mockResolvedValueOnce(null);
      await expect(saleService.recordPayment({ customerId: 'missing', amount: 100 })).rejects.toThrow(
        NotFoundError
      );
    });

    it('should record payment and decrement customer balance atomically', async () => {
      const recordPaymentBalance = vi.fn().mockResolvedValue({ balance: 200 });
      mockCustomerRepo.recordPaymentBalance = recordPaymentBalance;

      await saleService.recordPayment({
        customerId: 'cust1',
        amount: 250,
        paymentMode: 'UPI',
      });

      expect(mockPaymentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'cust1',
          amount: 250,
          paymentMode: 'UPI',
        })
      );
      expect(recordPaymentBalance).toHaveBeenCalledWith('cust1', 250);
    });
  });

  describe('getCustomerHistory', () => {
    it('should merge and sort sales and payments descending by date', async () => {
      const mockSales = [
        { id: 's1', date: '2023-10-10T10:00:00Z', amount: 100 },
        { id: 's2', date: '2023-10-12T10:00:00Z', amount: 200 },
      ];
      const mockPayments = [{ id: 'p1', date: '2023-10-11T10:00:00Z', amount: 50 }];

      vi.mocked(mockSaleRepo.getByCustomerId).mockResolvedValue(mockSales as any);
      vi.mocked(mockPaymentRepo.getByCustomerId).mockResolvedValue(mockPayments as any);

      const history = await saleService.getCustomerHistory('cust1');

      expect(history).toHaveLength(3);
      expect(history[0].id).toBe('s2');
      expect(history[1].id).toBe('p1');
      expect(history[2].id).toBe('s1');
      expect(history[0].entryType).toBe('sale');
      expect(history[1].entryType).toBe('payment');
    });
  });
});

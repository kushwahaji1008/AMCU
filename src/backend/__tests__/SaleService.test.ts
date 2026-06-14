import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SaleService } from '../Application/Services/SaleService';
import { ISaleRepository, ICustomerRepository, ICustomerPaymentRepository } from '../Application/Interfaces/IRepositories';

describe('SaleService White-Box Tests', () => {
  let saleService: SaleService;
  let mockSaleRepo: ISaleRepository;
  let mockCustomerRepo: ICustomerRepository;
  let mockPaymentRepo: ICustomerPaymentRepository;

  beforeEach(() => {
    mockSaleRepo = {
      create: vi.fn(),
      getDailyReport: vi.fn(),
      getAll: vi.fn(),
      getRecent: vi.fn(),
      getByCustomerId: vi.fn(),
    } as any;

    mockCustomerRepo = {
      getAll: vi.fn(),
      getById: vi.fn(),
      create: vi.fn(),
      updateBalance: vi.fn(),
      getCount: vi.fn(),
      getTotalBalance: vi.fn(),
    } as any;

    mockPaymentRepo = {
      create: vi.fn(),
      getRecent: vi.fn(),
      getByCustomerId: vi.fn(),
    } as any;

    saleService = new SaleService(mockSaleRepo, mockCustomerRepo, mockPaymentRepo);
  });

  describe('recordSale', () => {
    it('should calculate the amount correctly and update balance for Credit sales', async () => {
      const dto = {
        customerId: 'cust1',
        customerName: 'John Doe',
        customerMobile: '1234567890',
        quantity: 10,
        rate: 55.5,
        milkType: 'Mixed' as const,
        paymentMode: 'Credit' as const,
        date: '2023-10-10',
        shift: 'Morning' as const,
        operatorId: 'op1'
      };

      await saleService.recordSale(dto);

      // Amount should be 10 * 55.5 = 555
      expect(mockCustomerRepo.updateBalance).toHaveBeenCalledWith('cust1', 555);
      expect(mockSaleRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        amount: 555,
        paymentStatus: 'Due'
      }));
    });

    it('should not update balance for Cash sales', async () => {
      const dto = {
        customerId: 'cust1',
        customerName: 'John Doe',
        customerMobile: '1234567890',
        quantity: 10,
        rate: 55.5,
        milkType: 'Mixed' as const,
        paymentMode: 'Cash' as const,
        date: '2023-10-10',
        shift: 'Morning' as const,
        operatorId: 'op1'
      };

      await saleService.recordSale(dto);

      expect(mockCustomerRepo.updateBalance).toHaveBeenCalledWith('cust1', 0);
      expect(mockSaleRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        paymentStatus: 'Paid'
      }));
    });
  });

  describe('getCustomerHistory', () => {
    it('should merge and sort sales and payments correctly', async () => {
      const customerId = 'cust1';
      const mockSales = [
        { id: 's1', date: '2023-10-10T10:00:00Z', amount: 100 },
        { id: 's2', date: '2023-10-12T10:00:00Z', amount: 200 },
      ];
      const mockPayments = [
        { id: 'p1', date: '2023-10-11T10:00:00Z', amount: 50 },
      ];

      vi.mocked(mockSaleRepo.getByCustomerId).mockResolvedValue(mockSales as any);
      vi.mocked(mockPaymentRepo.getByCustomerId).mockResolvedValue(mockPayments as any);

      const history = await saleService.getCustomerHistory(customerId);

      expect(history).toHaveLength(3);
      // Sorted by date descending
      expect(history[0].id).toBe('s2'); // Oct 12
      expect(history[1].id).toBe('p1'); // Oct 11
      expect(history[2].id).toBe('s1'); // Oct 10
      
      expect(history[0].entryType).toBe('sale');
      expect(history[1].entryType).toBe('payment');
    });
  });
});

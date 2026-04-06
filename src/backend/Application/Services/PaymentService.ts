import { ILedgerRepository, IFarmerRepository } from '../Interfaces/IRepositories';

export class PaymentService {
  constructor(
    private ledgerRepo: ILedgerRepository,
    private farmerRepo: IFarmerRepository
  ) {}

  async recordPayment(data: {
    farmerId: string;
    amount: number;
    referenceId: string;
    date: Date;
    description?: string;
    dairyId: string;
  }): Promise<void> {
    // 1. Verify Farmer exists
    const farmer = await this.farmerRepo.getById(data.farmerId);
    if (!farmer) {
      throw new Error('Farmer not found.');
    }

    // 2. Update Farmer Balance
    const newBalance = (farmer.balance || 0) - data.amount;
    await this.farmerRepo.update(data.farmerId, { balance: newBalance });

    // 3. Update Ledger (DEBIT → payment done)
    await this.ledgerRepo.addEntry({
      farmerId: data.farmerId,
      type: 'debit',
      amount: data.amount,
      referenceId: data.referenceId,
      date: data.date,
      description: data.description || `Payment: ₹${data.amount}`,
      balanceAfter: newBalance,
      dairyId: data.dairyId
    });
  }

  async getFarmerBalance(farmerId: string): Promise<{ paid: number; pending: number }> {
    const summary = await this.farmerRepo.getSummary(farmerId);
    return {
      paid: summary.totalPaid,
      pending: summary.pendingAmount,
    };
  }
}

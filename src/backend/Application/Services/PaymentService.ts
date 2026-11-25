import crypto from 'crypto';
import { ILedgerRepository, IFarmerRepository } from '../Interfaces/IRepositories';
import { LedgerEntry } from '../../Core/Entities/Collection';
import { ConflictError, NotFoundError, ValidationError } from '../../Core/Errors';
import { getDairyId, getRequestUser, setRequestAuditDiff } from '../../Core/RequestContext';

export class PaymentService {
  constructor(
    private ledgerRepo: ILedgerRepository,
    private farmerRepo: IFarmerRepository
  ) {}

  async recordPayment(data: {
    farmerInternalId?: string;
    farmerId?: string;
    amount: number;
    referenceId?: string;
    date?: Date | string;
    description?: string;
    dairyId?: string;
    method?: string;
    reference?: string;
    operatorId?: string;
  }): Promise<LedgerEntry> {
    const amount = Math.round(Number(data.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ValidationError('Payment amount must be greater than 0.', 'INVALID_AMOUNT');
    }

    const paymentDate = data.date ? new Date(data.date) : new Date();
    if (Number.isNaN(paymentDate.getTime())) {
      throw new ValidationError('Invalid payment date.', 'INVALID_DATE');
    }

    const farmerKey = data.farmerInternalId || data.farmerId;
    if (!farmerKey) {
      throw new ValidationError('Farmer identifier is required.', 'MISSING_FARMER');
    }

    const farmer =
      (await this.farmerRepo.getById(farmerKey)) ||
      (data.farmerId ? await this.farmerRepo.getByFarmerId(data.farmerId) : null);

    if (!farmer) {
      throw new NotFoundError('Farmer not found.', 'FARMER_NOT_FOUND');
    }

    const referenceId = data.referenceId?.trim() || `PAY-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const existingRef = await this.ledgerRepo.getByReferenceId(referenceId);
    if (existingRef) {
      throw new ConflictError('A payment with this reference ID has already been recorded.', 'DUPLICATE_PAYMENT');
    }

    // Atomic balance decrement to avoid lost-update race conditions
    const updatedFarmer = this.farmerRepo.incrementBalance
      ? await this.farmerRepo.incrementBalance(farmer.id, -amount)
      : await this.farmerRepo.update(farmer.id, { balance: (farmer.balance || 0) - amount });

    const reqUser = getRequestUser();
    const newBalance = Math.round((updatedFarmer.balance ?? (farmer.balance || 0) - amount) * 100) / 100;

    try {
      const entry = await this.ledgerRepo.addEntry({
        farmerInternalId: farmer.id,
        farmerId: farmer.farmerId,
        type: 'debit',
        amount,
        referenceId,
        date: paymentDate,
        description: data.description || `Payment: ₹${amount}`,
        balanceAfter: newBalance,
        dairyId: data.dairyId || getDairyId(),
        method: data.method,
        reference: data.reference,
        operatorId: reqUser?.userId || data.operatorId,
        idempotencyKey: (data as any).idempotencyKey,
      });
      setRequestAuditDiff(
        { farmerBalance: farmer.balance || 0 },
        { farmerBalance: newBalance, ledgerEntry: entry }
      );
      return entry;
    } catch (err) {
      // Compensate balance on ledger failure
      if (this.farmerRepo.incrementBalance) {
        await Promise.resolve(this.farmerRepo.incrementBalance(farmer.id, amount)).catch(() => {});
      } else {
        await Promise.resolve(this.farmerRepo.update(farmer.id, { balance: farmer.balance || 0 })).catch(() => {});
      }
      throw err;
    }
  }

  async getFarmerBalance(farmerInternalId: string): Promise<{ paid: number; pending: number }> {
    const farmer = await this.farmerRepo.getById(farmerInternalId);
    if (!farmer) {
      throw new NotFoundError('Farmer not found.', 'FARMER_NOT_FOUND');
    }
    const summary = await this.farmerRepo.getSummary(farmer.id);
    return {
      paid: summary.totalPaid,
      pending: summary.pendingAmount,
    };
  }
}

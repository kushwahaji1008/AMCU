import {
  ICollectionRepository,
  IRateChartRepository,
  ILedgerRepository,
  IFarmerRepository,
  IShiftSummaryRepository,
  ISettingsRepository,
  ISyncConflictRepository,
} from '../Interfaces/IRepositories';
import { MilkCollection, ShiftSummary } from '../../Core/Entities/Collection';
import { ConflictError, NotFoundError, ValidationError } from '../../Core/Errors';
import { getDairyId, getDatabaseId, getRequestUser, setRequestAuditDiff } from '../../Core/RequestContext';
import { ActivityLogService } from './ActivityLogService';

export class CollectionService {
  constructor(
    private collectionRepo: ICollectionRepository,
    private rateChartRepo: IRateChartRepository,
    private ledgerRepo: ILedgerRepository,
    private farmerRepo: IFarmerRepository,
    private shiftSummaryRepo: IShiftSummaryRepository,
    private settingsRepo?: ISettingsRepository,
    private conflictRepo?: ISyncConflictRepository,
    private activityLogService?: ActivityLogService
  ) {}

  private async resolveRate(fat: number, snf: number, milkType?: string): Promise<number> {
    const chartRate = await this.rateChartRepo.getRate(fat, snf, milkType);
    if (chartRate > 0) return chartRate;

    if (this.settingsRepo) {
      const settings = await this.settingsRepo.get('rateSettings');
      if (settings && typeof settings === 'object') {
        const maxFatForFormula1 = Number(settings.maxFatForFormula1) || 6.0;
        if (fat < maxFatForFormula1) {
          const fatMult = Number(settings.fatMultiplier1) || 3.96;
          const snfMult = Number(settings.snfMultiplier1) || 2.64;
          return fat * fatMult + snf * snfMult;
        } else {
          const fatMult2 = Number(settings.fatMultiplier2) || 7.77;
          const snfKey = snf.toFixed(1);
          const deduction = Number(settings.snfDeductions?.[snfKey]) || 0;
          return Math.max(0, fat * fatMult2 - deduction);
        }
      }
    }

    return 40;
  }

  async createCollection(data: any, options?: { offlineSync?: boolean }): Promise<MilkCollection> {
    const farmerLookupKey = data.farmerInternalId || data.farmerId;
    if (!farmerLookupKey) {
      throw new ValidationError('Farmer identifier is required.', 'MISSING_FARMER');
    }

    const farmer =
      (await this.farmerRepo.getById(farmerLookupKey)) ||
      (data.farmerId ? await this.farmerRepo.getByFarmerId(data.farmerId) : null);

    if (!farmer) {
      throw new NotFoundError('Farmer not found', 'FARMER_NOT_FOUND');
    }

    const quantity = Number(data.quantity);
    const fat = Number(data.fat);
    const snf = Number(data.snf);
    const clr = Number(data.clr) || 0;

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new ValidationError('Quantity must be greater than 0.', 'INVALID_QUANTITY');
    }

    const collectionDate = data.date ? new Date(data.date) : new Date();
    if (Number.isNaN(collectionDate.getTime())) {
      throw new ValidationError('Invalid collection date.', 'INVALID_DATE');
    }

    if (this.collectionRepo.findDuplicatePour) {
      const duplicate = await this.collectionRepo.findDuplicatePour(farmer.id, collectionDate, data.shift);
      if (duplicate) {
        let conflictId: string | undefined;
        if (options?.offlineSync && this.conflictRepo) {
          const conflict = await this.conflictRepo.create({
            entityType: 'collection',
            entityId: duplicate.id,
            operation: 'create',
            localPayload: data,
            serverPayload: duplicate,
            localVersion: 1,
            serverVersion: duplicate.version ?? 1,
            reason: `Duplicate milk pour on ${collectionDate.toISOString().slice(0, 10)} (${data.shift})`,
            status: 'unresolved',
            userId: getRequestUser()?.userId,
            databaseId: getDatabaseId(),
          });
          conflictId = conflict.id;
          await this.activityLogService
            ?.log({
              action: 'SYNC_CONFLICT_COLLECTION',
              targetId: duplicate.id,
              targetType: 'COLLECTION',
              beforeValue: duplicate,
              afterValue: data,
              operationStatus: 'conflict',
              errorDetails: 'Duplicate pour during offline synchronization',
              details: { conflictId },
              source: 'sync_engine',
            })
            .catch(() => {});
        }
        throw new ConflictError(
          `Farmer ${farmer.name} has already recorded a milk pour for the ${data.shift} shift on this date.`,
          'DUPLICATE_POUR',
          conflictId
            ? { conflictId, serverRecord: duplicate, serverVersion: duplicate.version ?? 1, localVersion: 1 }
            : undefined
        );
      }
    }

    const milkType = data.milkType || farmer.cattleType || 'Cow';
    let rate = Number(data.rate);
    if (!Number.isFinite(rate) || rate <= 0) {
      rate = await this.resolveRate(fat, snf, milkType);
    }

    const roundedRate = Math.round(rate * 100) / 100;
    const amount = Math.round(quantity * roundedRate * 100) / 100;
    const reqUser = getRequestUser();

    const created = await this.collectionRepo.create({
      farmerInternalId: farmer.id,
      farmerId: farmer.farmerId,
      farmerCode: farmer.farmerCode || farmer.farmerId,
      farmerName: data.farmerName || farmer.name,
      date: collectionDate,
      shift: data.shift,
      milkType,
      quantity,
      fat,
      snf,
      clr,
      rate: roundedRate,
      amount,
      operatorId: reqUser?.userId || data.operatorId || 'system',
      dairyId: data.dairyId || getDairyId(),
      isManual: Boolean(data.isManual),
      isApproved: data.isApproved !== undefined ? Boolean(data.isApproved) : true,
      idempotencyKey: data.idempotencyKey,
      version: 1,
      updatedAt: new Date(),
    });
    setRequestAuditDiff(undefined, created);
    return created;
  }

  async getDailyReport(date: Date, endDate?: Date): Promise<MilkCollection[]> {
    return this.collectionRepo.getDailyReport(date, endDate);
  }

  async getAllCollections(): Promise<MilkCollection[]> {
    return this.collectionRepo.getAll();
  }

  async updateCollection(
    id: string,
    data: Partial<MilkCollection> & { expectedVersion?: number; baseVersion?: number }
  ): Promise<MilkCollection> {
    const existing = await this.collectionRepo.getById(id);
    if (!existing) {
      throw new NotFoundError('Collection record not found', 'COLLECTION_NOT_FOUND');
    }

    const expectedVersion = data.expectedVersion ?? data.baseVersion;
    const serverVersion = existing.version ?? 1;

    if (expectedVersion !== undefined && serverVersion !== expectedVersion) {
      let conflictId: string | undefined;
      if (this.conflictRepo) {
        const conflict = await this.conflictRepo.create({
          entityType: 'collection',
          entityId: existing.id,
          operation: 'update',
          localPayload: data,
          serverPayload: existing,
          localVersion: expectedVersion,
          serverVersion,
          reason: `Collection record version conflict (client v${expectedVersion} vs server v${serverVersion})`,
          status: 'unresolved',
          userId: getRequestUser()?.userId,
          databaseId: getDatabaseId(),
        });
        conflictId = conflict.id;
      }

      if (this.activityLogService) {
        await this.activityLogService
          .log({
            action: 'SYNC_CONFLICT_COLLECTION',
            targetId: existing.id,
            targetType: 'COLLECTION',
            beforeValue: existing,
            afterValue: data,
            operationStatus: 'conflict',
            errorDetails: `Version mismatch: expected ${expectedVersion}, actual ${serverVersion}`,
            details: { conflictId },
            source: 'sync_engine',
          })
          .catch(() => {});
      }

      throw new ConflictError(
        `Sync conflict: Collection entry was updated on the server (v${serverVersion}) since your offline copy (v${expectedVersion}).`,
        'VERSION_CONFLICT',
        { conflictId, serverRecord: existing, serverVersion, localVersion: expectedVersion }
      );
    }

    const allowed: Partial<MilkCollection> = {};
    if (data.quantity !== undefined) allowed.quantity = Number(data.quantity);
    if (data.fat !== undefined) allowed.fat = Number(data.fat);
    if (data.snf !== undefined) allowed.snf = Number(data.snf);
    if (data.clr !== undefined) allowed.clr = Number(data.clr);
    if (data.rate !== undefined) allowed.rate = Math.round(Number(data.rate) * 100) / 100;
    if (data.milkType !== undefined) allowed.milkType = data.milkType;
    if (data.shift !== undefined) allowed.shift = data.shift;
    if (data.date !== undefined) {
      const d = new Date(data.date);
      if (Number.isNaN(d.getTime())) throw new ValidationError('Invalid date', 'INVALID_DATE');
      allowed.date = d;
    }
    if (data.isManual !== undefined) allowed.isManual = Boolean(data.isManual);
    if (data.isApproved !== undefined) allowed.isApproved = Boolean(data.isApproved);
    if (data.approvedBy !== undefined) allowed.approvedBy = data.approvedBy;
    if (data.approvedAt !== undefined) allowed.approvedAt = data.approvedAt;

    const finalQty = allowed.quantity ?? existing.quantity;
    const finalRate = allowed.rate ?? existing.rate;
    if (allowed.quantity !== undefined || allowed.rate !== undefined) {
      allowed.amount = Math.round(finalQty * finalRate * 100) / 100;
    }

    const updated =
      expectedVersion !== undefined
        ? await this.collectionRepo.update(id, allowed, expectedVersion)
        : await this.collectionRepo.update(id, allowed);
    setRequestAuditDiff(existing, updated);
    return updated;
  }

  async createShiftSummary(data: Omit<ShiftSummary, 'id'>): Promise<ShiftSummary> {
    if (!data.date || !data.shift) {
      throw new ValidationError('Date and shift are required.', 'INVALID_SHIFT_SUMMARY');
    }

    const existing = await this.shiftSummaryRepo.getByDateAndShift(data.date, data.shift);
    if (existing) {
      throw new ConflictError(`Shift summary for ${data.date} (${data.shift}) already exists.`, 'SHIFT_ALREADY_CLOSED');
    }

    const reqUser = getRequestUser();
    return this.shiftSummaryRepo.create({
      date: data.date,
      shift: data.shift,
      totalFarmers: Number(data.totalFarmers) || 0,
      totalQuantity: Math.round((Number(data.totalQuantity) || 0) * 100) / 100,
      avgFat: Math.round((Number(data.avgFat) || 0) * 100) / 100,
      avgSnf: Math.round((Number(data.avgSnf) || 0) * 100) / 100,
      amount: Math.round((Number(data.amount) || 0) * 100) / 100,
      closedAt: data.closedAt ? new Date(data.closedAt) : new Date(),
      closedBy: data.closedBy || reqUser?.username || 'Unknown',
      dairyId: data.dairyId || getDairyId(),
      idempotencyKey: data.idempotencyKey,
    });
  }

  async getShiftSummary(date: string, shift: 'Morning' | 'Evening'): Promise<ShiftSummary | null> {
    return this.shiftSummaryRepo.getByDateAndShift(date, shift);
  }

  async getRecentShiftSummaries(limit: number): Promise<ShiftSummary[]> {
    return this.shiftSummaryRepo.getRecent(limit);
  }

  async getByFarmerId(farmerInternalId: string): Promise<MilkCollection[]> {
    return this.collectionRepo.getByFarmerInternalId(farmerInternalId);
  }
}

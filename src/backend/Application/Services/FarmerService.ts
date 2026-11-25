import { IFarmerRepository, ISyncConflictRepository } from '../Interfaces/IRepositories';
import { Farmer, FarmerSummary } from '../../Core/Entities/Farmer';
import { ConflictError, NotFoundError } from '../../Core/Errors';
import { getDairyId, getDatabaseId, getRequestUser, setRequestAuditDiff } from '../../Core/RequestContext';
import { ActivityLogService } from './ActivityLogService';

export class FarmerService {
  constructor(
    private farmerRepo: IFarmerRepository,
    private conflictRepo?: ISyncConflictRepository,
    private activityLogService?: ActivityLogService
  ) {}

  async getFarmer(id: string): Promise<Farmer | null> {
    return this.farmerRepo.getById(id);
  }

  async getFarmerByCode(farmerId: string): Promise<Farmer | null> {
    return this.farmerRepo.getByFarmerId(farmerId);
  }

  async getAllFarmers(): Promise<Farmer[]> {
    return this.farmerRepo.getAll();
  }

  async createFarmer(farmer: Omit<Farmer, 'id' | 'createdAt'>): Promise<Farmer> {
    const trimmedFarmerId = farmer.farmerId.trim();
    const existing = await this.farmerRepo.getByFarmerId(trimmedFarmerId);
    if (existing) {
      throw new ConflictError(`Farmer with ID "${trimmedFarmerId}" already exists.`, 'FARMER_ID_EXISTS');
    }

    const created = await this.farmerRepo.create({
      farmerId: trimmedFarmerId,
      farmerCode: farmer.farmerCode?.trim() || trimmedFarmerId,
      name: farmer.name.trim(),
      mobile: farmer.mobile.trim(),
      village: farmer.village.trim(),
      cattleType: farmer.cattleType,
      bankAccount: farmer.bankAccount?.trim(),
      ifsc: farmer.ifsc?.trim().toUpperCase(),
      status: farmer.status === 'Inactive' ? 'Inactive' : 'Active',
      balance: 0,
      dairyId: farmer.dairyId || getDairyId(),
      version: 1,
      updatedAt: new Date(),
    });
    setRequestAuditDiff(undefined, created);
    return created;
  }

  async updateFarmer(
    id: string,
    farmer: Partial<Farmer> & { expectedVersion?: number; baseVersion?: number }
  ): Promise<Farmer> {
    const existing = await this.farmerRepo.getById(id);
    if (!existing) {
      throw new NotFoundError('Farmer not found', 'FARMER_NOT_FOUND');
    }

    const expectedVersion = farmer.expectedVersion ?? farmer.baseVersion;
    const serverVersion = existing.version ?? 1;

    if (expectedVersion !== undefined && serverVersion !== expectedVersion) {
      let conflictId: string | undefined;
      if (this.conflictRepo) {
        const conflict = await this.conflictRepo.create({
          entityType: 'farmer',
          entityId: existing.id,
          operation: 'update',
          localPayload: farmer,
          serverPayload: existing,
          localVersion: expectedVersion,
          serverVersion,
          reason: `Farmer record version conflict (client v${expectedVersion} vs server v${serverVersion})`,
          status: 'unresolved',
          userId: getRequestUser()?.userId,
          databaseId: getDatabaseId(),
        });
        conflictId = conflict.id;
      }

      if (this.activityLogService) {
        await this.activityLogService
          .log({
            action: 'SYNC_CONFLICT_FARMER',
            targetId: existing.id,
            targetType: 'FARMER',
            beforeValue: existing,
            afterValue: farmer,
            operationStatus: 'conflict',
            errorDetails: `Version mismatch: expected ${expectedVersion}, actual ${serverVersion}`,
            details: { conflictId },
            source: 'sync_engine',
          })
          .catch(() => {});
      }

      throw new ConflictError(
        `Sync conflict: Farmer "${existing.name}" was modified on the server (v${serverVersion}) since your offline copy (v${expectedVersion}).`,
        'VERSION_CONFLICT',
        { conflictId, serverRecord: existing, serverVersion, localVersion: expectedVersion }
      );
    }

    if (farmer.farmerId && farmer.farmerId.trim() !== existing.farmerId) {
      const conflict = await this.farmerRepo.getByFarmerId(farmer.farmerId.trim());
      if (conflict && conflict.id !== existing.id) {
        throw new ConflictError(`Farmer ID "${farmer.farmerId.trim()}" is already assigned.`, 'FARMER_ID_EXISTS');
      }
    }

    const allowedUpdates: Partial<Farmer> = {};
    if (farmer.farmerId !== undefined) allowedUpdates.farmerId = farmer.farmerId.trim();
    if (farmer.farmerCode !== undefined) allowedUpdates.farmerCode = farmer.farmerCode.trim();
    if (farmer.name !== undefined) allowedUpdates.name = farmer.name.trim();
    if (farmer.mobile !== undefined) allowedUpdates.mobile = farmer.mobile.trim();
    if (farmer.village !== undefined) allowedUpdates.village = farmer.village.trim();
    if (farmer.cattleType !== undefined) allowedUpdates.cattleType = farmer.cattleType;
    if (farmer.bankAccount !== undefined) allowedUpdates.bankAccount = farmer.bankAccount.trim();
    if (farmer.ifsc !== undefined) allowedUpdates.ifsc = farmer.ifsc.trim().toUpperCase();
    if (farmer.status !== undefined) allowedUpdates.status = farmer.status;

    const updated =
      expectedVersion !== undefined
        ? await this.farmerRepo.update(existing.id, allowedUpdates, expectedVersion)
        : await this.farmerRepo.update(existing.id, allowedUpdates);
    setRequestAuditDiff(existing, updated);
    return updated;
  }

  async deleteFarmer(id: string): Promise<void> {
    const existing = await this.farmerRepo.getById(id);
    if (!existing) {
      throw new NotFoundError('Farmer not found', 'FARMER_NOT_FOUND');
    }
    await this.farmerRepo.delete(existing.id);
    setRequestAuditDiff(existing, undefined);
  }

  async getFarmerSummary(id: string): Promise<FarmerSummary> {
    const existing = await this.farmerRepo.getById(id);
    if (!existing) {
      throw new NotFoundError('Farmer not found', 'FARMER_NOT_FOUND');
    }
    return this.farmerRepo.getSummary(existing.id);
  }
}

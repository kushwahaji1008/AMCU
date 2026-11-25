import {
  ISyncConflictRepository,
  IFarmerRepository,
  ICollectionRepository,
  ICustomerRepository,
  IRateChartRepository,
} from '../Interfaces/IRepositories';
import { SyncConflict } from '../../Core/Entities/Audit';
import { NotFoundError, ValidationError } from '../../Core/Errors';
import { ActivityLogService } from './ActivityLogService';

export class SyncConflictService {
  constructor(
    private conflictRepo: ISyncConflictRepository,
    private farmerRepo: IFarmerRepository,
    private collectionRepo: ICollectionRepository,
    private customerRepo: ICustomerRepository,
    private rateRepo: IRateChartRepository,
    private activityLogService?: ActivityLogService
  ) {}

  async listConflicts(status?: SyncConflict['status']): Promise<SyncConflict[]> {
    return this.conflictRepo.getAll(status);
  }

  async resolveConflict(
    conflictId: string,
    resolution: 'keep_server' | 'apply_local' | 'merged',
    resolvedBy: string,
    mergedData?: Record<string, any>
  ): Promise<{ conflict: SyncConflict; appliedRecord?: any }> {
    const conflict = await this.conflictRepo.getById(conflictId);
    if (!conflict) {
      throw new NotFoundError('Sync conflict not found', 'CONFLICT_NOT_FOUND');
    }

    if (conflict.status !== 'unresolved') {
      throw new ValidationError('This sync conflict has already been resolved', 'CONFLICT_ALREADY_RESOLVED');
    }

    let appliedRecord: any = conflict.serverPayload;
    const targetData = resolution === 'merged' ? mergedData : conflict.localPayload;

    if (resolution === 'apply_local' || resolution === 'merged') {
      if (!targetData || typeof targetData !== 'object') {
        throw new ValidationError('Valid data payload is required for applying or merging conflict resolution', 'INVALID_MERGE_PAYLOAD');
      }

      // Strip internal sync metadata before writing to authoritative repository
      const {
        id: _id,
        _id: _mongoId,
        version: _ver,
        expectedVersion: _expVer,
        baseVersion: _baseVer,
        idempotencyKey: _idem,
        createdAt: _created,
        updatedAt: _updated,
        syncStatus: _syncStatus,
        ...cleanPayload
      } = targetData;

      if (conflict.entityType === 'farmer') {
        appliedRecord = await this.farmerRepo.update(conflict.entityId, cleanPayload);
      } else if (conflict.entityType === 'collection') {
        appliedRecord = await this.collectionRepo.update(conflict.entityId, cleanPayload);
      } else if (conflict.entityType === 'customer') {
        appliedRecord = await this.customerRepo.update(conflict.entityId, cleanPayload);
      } else if (conflict.entityType === 'rate') {
        appliedRecord = await this.rateRepo.update(conflict.entityId, cleanPayload);
      }
    }

    const nextStatus: SyncConflict['status'] =
      resolution === 'keep_server'
        ? 'resolved_server'
        : resolution === 'apply_local'
        ? 'resolved_local'
        : 'resolved_merged';

    const resolvedConflict = await this.conflictRepo.resolve(conflictId, nextStatus, resolvedBy);

    if (this.activityLogService) {
      await this.activityLogService
        .log({
          action: 'CONFLICT_RESOLVED',
          targetId: conflict.entityId,
          targetType: conflict.entityType.toUpperCase(),
          beforeValue: conflict.serverPayload,
          afterValue: appliedRecord,
          details: { conflictId, resolution, nextStatus },
          operationStatus: 'success',
          source: 'sync_engine',
          syncStatus: 'online',
        })
        .catch(() => {});
    }

    return { conflict: resolvedConflict, appliedRecord };
  }
}

import { IActivityLogRepository } from '../Interfaces/IRepositories';
import { ActivityLog } from '../../Core/Entities/Audit';
import { getDatabaseId } from '../../Core/RequestContext';

export class ActivityLogService {
  constructor(private activityRepo: IActivityLogRepository) {}

  async log(params: {
    userId: string;
    username: string;
    action: string;
    targetId?: string;
    targetType?: string;
    details?: any;
    ipAddress?: string;
  }): Promise<ActivityLog> {
    return this.activityRepo.create({
      ...params,
      timestamp: new Date(),
      databaseId: getDatabaseId()
    });
  }

  async getAllLogs(limit?: number): Promise<ActivityLog[]> {
    return this.activityRepo.getAll(limit);
  }

  async getUserLogs(userId: string): Promise<ActivityLog[]> {
    return this.activityRepo.getByUserId(userId);
  }
}

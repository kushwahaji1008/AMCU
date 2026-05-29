import { IFarmerRepository } from '../Interfaces/IRepositories';
import { Farmer, FarmerSummary } from '../../Core/Entities/Farmer';

export class FarmerService {
  constructor(private farmerRepo: IFarmerRepository) {}

  async getFarmer(id: string): Promise<Farmer | null> {
    return this.farmerRepo.getById(id);
  }

  async getAllFarmers(): Promise<Farmer[]> {
    return this.farmerRepo.getAll();
  }

  async createFarmer(farmer: Omit<Farmer, 'id' | 'createdAt'>): Promise<Farmer> {
    return this.farmerRepo.create(farmer);
  }

  async updateFarmer(id: string, farmer: Partial<Farmer>): Promise<Farmer> {
    return this.farmerRepo.update(id, farmer);
  }

  async deleteFarmer(id: string): Promise<void> {
    return this.farmerRepo.delete(id);
  }

  async getFarmerSummary(id: string): Promise<FarmerSummary> {
    return this.farmerRepo.getSummary(id);
  }
}

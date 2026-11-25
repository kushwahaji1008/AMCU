import { Request, Response, NextFunction } from 'express';
import { FarmerService } from '../../Application/Services/FarmerService';
import { NotFoundError } from '../../Core/Errors';

export class FarmerController {
  constructor(private farmerService: FarmerService) {}

  async getFarmer(req: Request, res: Response, next: NextFunction) {
    try {
      const farmer = await this.farmerService.getFarmer(req.params.id);
      if (!farmer) throw new NotFoundError('Farmer not found', 'FARMER_NOT_FOUND');
      res.json(farmer);
    } catch (error) {
      next(error);
    }
  }

  async searchByFarmerId(req: Request, res: Response, next: NextFunction) {
    try {
      const farmer = await this.farmerService.getFarmerByCode(req.params.farmerId);
      if (!farmer) throw new NotFoundError('Farmer not found', 'FARMER_NOT_FOUND');
      res.json(farmer);
    } catch (error) {
      next(error);
    }
  }

  async getAllFarmers(req: Request, res: Response, next: NextFunction) {
    try {
      const farmers = await this.farmerService.getAllFarmers();
      res.json(farmers);
    } catch (error) {
      next(error);
    }
  }

  async createFarmer(req: Request, res: Response, next: NextFunction) {
    try {
      const farmer = await this.farmerService.createFarmer(req.body);
      res.status(201).json(farmer);
    } catch (error) {
      next(error);
    }
  }

  async updateFarmer(req: Request, res: Response, next: NextFunction) {
    try {
      const headerVer = req.header('x-expected-version');
      const expectedVersion =
        req.body?.expectedVersion ?? (headerVer !== undefined && !Number.isNaN(Number(headerVer)) ? Number(headerVer) : undefined);
      const payload = expectedVersion !== undefined ? { ...req.body, expectedVersion } : req.body;
      const farmer = await this.farmerService.updateFarmer(req.params.id, payload);
      res.json(farmer);
    } catch (error) {
      next(error);
    }
  }

  async deleteFarmer(req: Request, res: Response, next: NextFunction) {
    try {
      await this.farmerService.deleteFarmer(req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  async getFarmerSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const summary = await this.farmerService.getFarmerSummary(req.params.id);
      res.json(summary);
    } catch (error) {
      next(error);
    }
  }
}

import { Request, Response } from 'express';
import { FarmerService } from '../../Application/Services/FarmerService';

export class FarmerController {
  constructor(private farmerService: FarmerService) {}

  async getFarmer(req: Request, res: Response) {
    try {
      const farmer = await this.farmerService.getFarmer(req.params.id);
      if (!farmer) return res.status(404).json({ message: 'Farmer not found' });
      res.json(farmer);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }

  async getAllFarmers(req: Request, res: Response) {
    try {
      const farmers = await this.farmerService.getAllFarmers();
      res.json(farmers);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }

  async createFarmer(req: Request, res: Response) {
    try {
      const farmer = await this.farmerService.createFarmer(req.body);
      res.status(201).json(farmer);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }

  async updateFarmer(req: Request, res: Response) {
    try {
      const farmer = await this.farmerService.updateFarmer(req.params.id, req.body);
      res.json(farmer);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }

  async deleteFarmer(req: Request, res: Response) {
    try {
      await this.farmerService.deleteFarmer(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }

  async getFarmerSummary(req: Request, res: Response) {
    try {
      const summary = await this.farmerService.getFarmerSummary(req.params.id);
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
}

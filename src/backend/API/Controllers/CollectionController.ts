import { Request, Response } from 'express';
import { CollectionService } from '../../Application/Services/CollectionService';

export class CollectionController {
  constructor(private collectionService: CollectionService) {}

  async createCollection(req: Request, res: Response) {
    try {
      const collection = await this.collectionService.createCollection({
        ...req.body,
        date: new Date(req.body.date),
      });
      res.status(201).json(collection);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }

  async getDailyReport(req: Request, res: Response) {
    try {
      const date = req.query.date ? new Date(req.query.date as string) : new Date();
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      const report = await this.collectionService.getDailyReport(date, endDate);
      res.json(report);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }

  async updateCollection(req: Request, res: Response) {
    try {
      const collection = await this.collectionService.updateCollection(req.params.id, req.body);
      res.json(collection);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }

  async createShiftSummary(req: Request, res: Response) {
    try {
      const summary = await this.collectionService.createShiftSummary(req.body);
      res.status(201).json(summary);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }

  async getShiftSummary(req: Request, res: Response) {
    try {
      const { date, shift } = req.query;
      const summary = await this.collectionService.getShiftSummary(date as string, shift as string);
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }

  async getRecentShiftSummaries(req: Request, res: Response) {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const summaries = await this.collectionService.getRecentShiftSummaries(limit);
      res.json(summaries);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }

  async getByFarmerId(req: Request, res: Response) {
    try {
      const collections = await this.collectionService.getByFarmerId(req.params.farmerInternalId);
      res.json(collections);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
}

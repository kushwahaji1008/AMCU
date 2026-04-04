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
      const report = await this.collectionService.getDailyReport(date);
      res.json(report);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
}

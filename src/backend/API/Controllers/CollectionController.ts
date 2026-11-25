import { Request, Response, NextFunction } from 'express';
import { CollectionService } from '../../Application/Services/CollectionService';
import { ValidationError } from '../../Core/Errors';

function parseOptionalDate(val: unknown, fallback?: Date): Date | undefined {
  if (val === undefined || val === null || val === '') return fallback;
  const d = new Date(val as string);
  if (Number.isNaN(d.getTime())) {
    throw new ValidationError('Invalid date query parameter', 'INVALID_DATE');
  }
  return d;
}

export class CollectionController {
  constructor(private collectionService: CollectionService) {}

  async createCollection(req: Request, res: Response, next: NextFunction) {
    try {
      const date = req.body.date ? new Date(req.body.date) : new Date();
      if (Number.isNaN(date.getTime())) {
        throw new ValidationError('Invalid collection date', 'INVALID_DATE');
      }
      const collection = await this.collectionService.createCollection(
        {
          ...req.body,
          date,
        },
        { offlineSync: req.header('x-offline-sync') === 'true' }
      );
      res.status(201).json(collection);
    } catch (error) {
      next(error);
    }
  }

  async getDailyReport(req: Request, res: Response, next: NextFunction) {
    try {
      const date = parseOptionalDate(req.query.date, new Date())!;
      const endDate = parseOptionalDate(req.query.endDate);
      const report = await this.collectionService.getDailyReport(date, endDate);
      res.json(report);
    } catch (error) {
      next(error);
    }
  }

  async getAllCollections(req: Request, res: Response, next: NextFunction) {
    try {
      const collections = await this.collectionService.getAllCollections();
      res.json(collections);
    } catch (error) {
      next(error);
    }
  }

  async updateCollection(req: Request, res: Response, next: NextFunction) {
    try {
      const headerVer = req.header('x-expected-version');
      const expectedVersion =
        req.body?.expectedVersion ?? (headerVer !== undefined && !Number.isNaN(Number(headerVer)) ? Number(headerVer) : undefined);
      const payload = expectedVersion !== undefined ? { ...req.body, expectedVersion } : req.body;
      const collection = await this.collectionService.updateCollection(req.params.id, payload);
      res.json(collection);
    } catch (error) {
      next(error);
    }
  }

  async createShiftSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const summary = await this.collectionService.createShiftSummary(req.body);
      res.status(201).json(summary);
    } catch (error) {
      next(error);
    }
  }

  async getShiftSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const date = req.query.date as string;
      const shift = req.query.shift as string;
      if (!date || (shift !== 'Morning' && shift !== 'Evening')) {
        throw new ValidationError('Valid date and shift (Morning or Evening) are required', 'INVALID_QUERY');
      }
      const summary = await this.collectionService.getShiftSummary(date, shift);
      res.json(summary);
    } catch (error) {
      next(error);
    }
  }

  async getRecentShiftSummaries(req: Request, res: Response, next: NextFunction) {
    try {
      const rawLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 10;
      const summaries = await this.collectionService.getRecentShiftSummaries(limit);
      res.json(summaries);
    } catch (error) {
      next(error);
    }
  }

  async getByFarmerId(req: Request, res: Response, next: NextFunction) {
    try {
      const collections = await this.collectionService.getByFarmerId(req.params.farmerInternalId);
      res.json(collections);
    } catch (error) {
      next(error);
    }
  }
}

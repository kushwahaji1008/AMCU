const fs = require('fs');

let repoFile = fs.readFileSync('src/backend/Infrastructure/Repositories/MongoRepositories.ts', 'utf-8');

repoFile = repoFile.replace(
  /export class MongoFarmerRepository implements IFarmerRepository \{.*?async getById/s,
  (match) => match.replace("async getById", `
  private async getBalance(farmerInternalId: string, dairyId?: string): Promise<number> {
    try {
      const { getDatabaseId } = require('../../Core/RequestContext');
      const model = await dbManager.getFarmerBalanceModel(getDatabaseId());
      const doc = await model.findOne({ farmerInternalId });
      return doc ? doc.balance : 0;
    } catch(e) { return 0; }
  }
  
  private async updateBalance(farmerInternalId: string, balance: number, dairyId: string): Promise<void> {
    try {
      const { getDatabaseId } = require('../../Core/RequestContext');
      const model = await dbManager.getFarmerBalanceModel(getDatabaseId());
      await model.findOneAndUpdate({ farmerInternalId }, { balance, dairyId }, { upsert: true });
    } catch(e) {}
  }
  
  async getById`)
);

repoFile = repoFile.replace(
  /if \(doc\)\s+return mapDoc<Farmer>\(doc\);/,
  `if (doc) {
      const f = mapDoc<Farmer>(doc);
      f.balance = await this.getBalance(f.id, f.dairyId);
      return f;
    }`
);

repoFile = repoFile.replace(
  /const docByFarmerId = await model\.findOne\(\{ farmerId: id \}\);\n\s*return docByFarmerId \? mapDoc<Farmer>\(docByFarmerId\) : null;/,
  `const docByFarmerId = await model.findOne({ farmerId: id });
    if (docByFarmerId) {
      const f = mapDoc<Farmer>(docByFarmerId);
      f.balance = await this.getBalance(f.id, f.dairyId);
      return f;
    }
    return null;`
);

repoFile = repoFile.replace(
  /return docs\.map\(doc => mapDoc<Farmer>\(doc\)\);/, // in getAll
  `const mapped = docs.map(doc => mapDoc<Farmer>(doc));
    for (const f of mapped) {
      f.balance = await this.getBalance(f.id, f.dairyId);
    }
    return mapped;`
);

repoFile = repoFile.replace(
  /const doc = await model\.create\(farmer\);\n\s*return mapDoc<Farmer>\(doc\);/, // in create
  `const doc = await model.create(farmer);
    const f = mapDoc<Farmer>(doc);
    if (farmer.balance !== undefined) {
      await this.updateBalance(f.id, farmer.balance, f.dairyId);
    }
    f.balance = farmer.balance || 0;
    return f;`
);

repoFile = repoFile.replace(
  /if \(!doc\) throw new Error\('Farmer not found'\);\n\s*return mapDoc<Farmer>\(doc\);/, // in update
  `if (!doc) throw new Error('Farmer not found');
    const f = mapDoc<Farmer>(doc);
    if (farmer.balance !== undefined) {
      await this.updateBalance(f.id, farmer.balance, f.dairyId);
    }
    f.balance = await this.getBalance(f.id, f.dairyId);
    return f;`
);

fs.writeFileSync('src/backend/Infrastructure/Repositories/MongoRepositories.ts', repoFile);
console.log("Updated MongoFarmerRepository to handle balance in FarmerBalanceModel");

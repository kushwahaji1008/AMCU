const fs = require('fs');
let repoFile = fs.readFileSync('src/backend/Infrastructure/Repositories/MongoRepositories.ts', 'utf-8');

repoFile = repoFile.replace(
  /async getByFarmerId.*?return doc \? mapDoc<Farmer>\(doc\) : null;\n  \}/s,
  `async getByFarmerId(farmerId: string): Promise<Farmer | null> {
    const model = await dbManager.getFarmerModel(getDatabaseId());
    const doc = await model.findOne({ farmerId });
    if (doc) {
      const f = mapDoc<Farmer>(doc);
      f.balance = await this.getBalance(f.id, f.dairyId);
      return f;
    }
    return null;
  }`
);
fs.writeFileSync('src/backend/Infrastructure/Repositories/MongoRepositories.ts', repoFile);
console.log("Updated getByFarmerId");

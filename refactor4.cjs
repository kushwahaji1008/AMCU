const fs = require('fs');

let indexFile = fs.readFileSync('src/backend/index.ts', 'utf-8');

if (!indexFile.includes('/api/farmers/balances')) {
  indexFile = indexFile.replace(
    /app\.get\('\/api\/farmers', authenticate,.*?;\n/,
    `$&app.get('/api/farmers/balances', authenticate, async (req, res, next) => {
  try {
    const { getDatabaseId } = require('./Core/RequestContext');
    const { dbManager } = require('./Infrastructure/Persistence/Mongo/DatabaseManager');
    const model = await dbManager.getFarmerBalanceModel(getDatabaseId());
    const balances = await model.find();
    res.json(balances.map((b: any) => ({
      id: b._id.toString(),
      farmerInternalId: b.farmerInternalId,
      balance: b.balance,
      dairyId: b.dairyId
    })));
  } catch(e) { next(e); }
});\n`
  );
  fs.writeFileSync('src/backend/index.ts', indexFile);
}
console.log("Updated backend index");

const fs = require('fs');
let apiFile = fs.readFileSync('src/services/api.ts', 'utf-8');

apiFile = apiFile.replace(
  /await db\.farmers\.put\(\{ \.\.\.data, _id: id \}\);/g,
  `const { balance, ...fData } = data;
      await db.farmers.put({ ...fData, _id: id });
      if (balance !== undefined) {
         try {
           const existingB: any = await db.farmerBalances.get(id);
           await db.farmerBalances.put({ ...existingB, balance, _id: id, farmerInternalId: id });
         } catch(e) {
           await db.farmerBalances.put({ _id: id, farmerInternalId: id, balance });
         }
      }`
);

apiFile = apiFile.replace(
  /await db\.farmers\.put\(doc\);/g, // if it exists
  `const { balance, ...fData } = doc;
      await db.farmers.put(fData);
      if (balance !== undefined) {
         try {
           const existingB: any = await db.farmerBalances.get(doc._id);
           await db.farmerBalances.put({ ...existingB, balance, _id: doc._id, farmerInternalId: doc._id });
         } catch(e) {
           await db.farmerBalances.put({ _id: doc._id, farmerInternalId: doc._id, balance });
         }
      }`
);

fs.writeFileSync('src/services/api.ts', apiFile);
console.log("Updated api.ts to separate balance on put");

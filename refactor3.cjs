const fs = require('fs');

let offlineService = fs.readFileSync('src/services/offlineService.ts', 'utf-8');

if (!offlineService.includes('/farmers/balances')) {
  offlineService = offlineService.replace(
    /\/\/ 1\. Farmers\n.*?await db\.farmers\.bulkDocs\(farmersData\);/s,
    `// 1. Farmers
      const farmersRes = await api.get('/farmers');
      const farmersData = farmersRes.data.map((f: any) => ({ ...f, _id: f.id }));
      await db.farmers.bulkDocs(farmersData);
      
      const balancesRes = await api.get('/farmers/balances');
      const balancesData = balancesRes.data.map((b: any) => ({ ...b, _id: b.farmerInternalId }));
      await db.farmerBalances.bulkDocs(balancesData);`
  );
  fs.writeFileSync('src/services/offlineService.ts', offlineService);
}
console.log("Updated offlineService Sync");

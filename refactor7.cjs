const fs = require('fs');

let offlineService = fs.readFileSync('src/services/offlineService.ts', 'utf-8');

offlineService = offlineService.replace(
  /async getFarmers\(\): Promise<any\[\]> \{\n\s*const result = await db\.farmers\.allDocs\(\{ include_docs: true \}\);\n\s*return result\.rows\.map\(row => row\.doc as any\);\n\s*\}/s,
  `async getFarmers(): Promise<any[]> {
    const result = await db.farmers.allDocs({ include_docs: true });
    const balancesResult = await db.farmerBalances.allDocs({ include_docs: true });
    
    const balancesMap = new Map();
    balancesResult.rows.forEach(r => balancesMap.set(r.id, (r.doc as any).balance));
    
    return result.rows.map(row => {
      const f = row.doc as any;
      f.balance = balancesMap.get(f._id) || 0;
      return f;
    });
  }`
);

offlineService = offlineService.replace(
  /async getFarmerById\(id: string\) \{\n\s*try \{\n\s*return await db\.farmers\.get\(id\);\n\s*\} catch \(e\) \{\n\s*return null;\n\s*\}\n\s*\}/s,
  `async getFarmerById(id: string) {
    try {
      const f: any = await db.farmers.get(id);
      try {
        const b: any = await db.farmerBalances.get(id);
        f.balance = b.balance || 0;
      } catch(e) { f.balance = 0; }
      return f;
    } catch (e) {
      return null;
    }
  }`
);

offlineService = offlineService.replace(
  /async updateFarmerOffline\(id: string, data: any\) \{\n\s*const existing: any = await db\.farmers\.get\(id\);\n\s*return db\.farmers\.put\(\{ \.\.\.existing, \.\.\.data, _id: id \}\);\n\s*\}/s,
  `async updateFarmerOffline(id: string, data: any) {
    const existing: any = await db.farmers.get(id);
    const { balance, ...farmerData } = data;
    await db.farmers.put({ ...existing, ...farmerData, _id: id });
    if (balance !== undefined) {
      try {
         const existingB: any = await db.farmerBalances.get(id);
         await db.farmerBalances.put({ ...existingB, balance, _id: id, farmerInternalId: id });
      } catch(e) {
         await db.farmerBalances.put({ _id: id, farmerInternalId: id, balance });
      }
    }
    return { ...existing, ...data, _id: id };
  }`
);

fs.writeFileSync('src/services/offlineService.ts', offlineService);
console.log("Updated offlineService.ts to use farmerBalances collection on read/write");

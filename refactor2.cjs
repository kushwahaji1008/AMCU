const fs = require('fs');

let offlineService = fs.readFileSync('src/services/offlineService.ts', 'utf-8');

if (!offlineService.includes('farmerBalances: new PouchDB')) {
  offlineService = offlineService.replace(
    /farmers: new PouchDB\('farmers', dbOptions\),/,
    `farmers: new PouchDB('farmers', dbOptions),\n  farmerBalances: new PouchDB('farmer_balances', dbOptions),`
  );
  fs.writeFileSync('src/services/offlineService.ts', offlineService);
}

let api = fs.readFileSync('src/services/api.ts', 'utf-8');
if (!api.includes('getFarmerBalances')) {
  api = api.replace(/getFarmers: .*?\n.*?\n.*?\n.*?\n    \},/s, (match) => {
    return match + `
    getFarmerBalances: async () => {
      try {
        if (isNative && !offlineService.isOnline) {
          const res = await db.farmerBalances.allDocs({ include_docs: true });
          return { data: res.rows.map(r => r.doc) };
        }
        const res = await api.get('/farmers/balances');
        offlineService.syncFromServer().catch(console.error);
        return res;
      } catch (e: any) {
        if (!isNative) throw e;
        const res = await db.farmerBalances.allDocs({ include_docs: true });
        return { data: res.rows.map(r => r.doc) };
      }
    },`;
  });
  fs.writeFileSync('src/services/api.ts', api);
}

let types = fs.readFileSync('src/types.ts', 'utf-8');
if (!types.includes('FarmerBalance')) {
  types = types.replace(/balance: number;.*?\n/, "");
  types += `\nexport interface FarmerBalance {\n  id: string;\n  farmerInternalId: string;\n  balance: number;\n}\n`;
  fs.writeFileSync('src/types.ts', types);
}

console.log("Updated offlineService, api, types");

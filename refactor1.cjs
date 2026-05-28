const fs = require('fs');

// 1. Backend Models.ts
let models = fs.readFileSync('src/backend/Infrastructure/Persistence/Mongo/Models.ts', 'utf-8');
models = models.replace("balance: { type: Number, default: 0 },\n", "");

let dbManager = fs.readFileSync('src/backend/Infrastructure/Persistence/Mongo/DatabaseManager.ts', 'utf-8');

if (!models.includes('FarmerBalanceSchema')) {
  models += `
// --- FarmerBalance Schema ---
export const FarmerBalanceSchema = new Schema({
  farmerInternalId: { type: String, required: true },
  balance: { type: Number, default: 0 },
});
export const FarmerBalanceModel = mongoose.model('FarmerBalance', FarmerBalanceSchema);
`;
  fs.writeFileSync('src/backend/Infrastructure/Persistence/Mongo/Models.ts', models);
}

// 2. DatabaseManager
if (dbManager && !dbManager.includes('FarmerBalanceSchema')) {
  dbManager = dbManager.replace(/import \{.*FarmerSchema.*\} from '\.\/Models';/, 
    (match) => match.replace("FarmerSchema", "FarmerSchema, FarmerBalanceSchema"));
  dbManager = dbManager.replace(/public async getFarmerModel.*?\n  \}/s,
    (match) => match + `\n  public async getFarmerBalanceModel(databaseId: string) {
    const conn = await this.getConnection(databaseId);
    return conn.model('FarmerBalance', FarmerBalanceSchema);
  }`);
  fs.writeFileSync('src/backend/Infrastructure/Persistence/Mongo/DatabaseManager.ts', dbManager);
}

console.log("Updated Models and DatabaseManager");

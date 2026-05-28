const fs = require('fs');

let file = fs.readFileSync('src/services/api.ts', 'utf-8');

file = file.replace(/await db\.(\w+)\.put\((.*?)\);/gs, (match, collection, arg) => {
  return `await safePut(db.${collection}, ${arg});`;
});

fs.writeFileSync('src/services/api.ts', file);

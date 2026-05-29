import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'users',
      columns: [
        { name: 'username', type: 'string' },
        { name: 'password', type: 'string' },
        { name: 'role', type: 'string' },
      ],
    }),
    tableSchema({
      name: 'farmers',
      columns: [
        { name: 'farmer_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'phone', type: 'string', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'collections',
      columns: [
        { name: 'farmer_internal_id', type: 'string', isIndexed: true },
        { name: 'date', type: 'string', isIndexed: true },
        { name: 'shift', type: 'string' },
        { name: 'quantity', type: 'number' },
        { name: 'fat', type: 'number' },
        { name: 'snf', type: 'number' },
        { name: 'amount', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'sales_customers',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'phone', type: 'string', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'sales_records',
      columns: [
        { name: 'customer_id', type: 'string', isIndexed: true },
        { name: 'date', type: 'string', isIndexed: true },
        { name: 'quantity', type: 'number' },
        { name: 'amount', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'rate_settings',
      columns: [
        { name: 'fat_multiplier1', type: 'number' },
        { name: 'snf_multiplier1', type: 'number' },
        { name: 'max_fat', type: 'number' },
        { name: 'fat_multiplier2', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'ledgers',
      columns: [
        { name: 'farmer_internal_id', type: 'string', isIndexed: true },
        { name: 'date', type: 'string', isIndexed: true },
        { name: 'type', type: 'string' },
        { name: 'amount', type: 'number' },
        { name: 'description', type: 'string', isOptional: true },
      ],
    }),
  ],
});

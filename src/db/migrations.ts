import { schemaMigrations } from '@nozbe/watermelondb/Schema/migrations';

export const migrations = schemaMigrations({
  migrations: [
    // Future migrations go here to ensure data is preserved when schema changes
    // e.g.,
    // {
    //   toVersion: 2,
    //   steps: [
    //     addColumns({
    //       table: 'farmers',
    //       columns: [
    //         { name: 'address', type: 'string', isOptional: true },
    //       ],
    //     }),
    //   ],
    // }
  ],
});

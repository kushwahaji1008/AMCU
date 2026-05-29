import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export class User extends Model {
  static table = 'users';
  @field('username') username!: string;
  @field('password') password!: string;
  @field('role') role!: string;
}

export class Farmer extends Model {
  static table = 'farmers';
  @field('farmer_id') farmerId!: string;
  @field('name') name!: string;
  @field('phone') phone?: string;
}

export class Collection extends Model {
  static table = 'collections';
  @field('farmer_internal_id') farmerInternalId!: string;
  @field('date') date!: string;
  @field('shift') shift!: string;
  @field('quantity') quantity!: number;
  @field('fat') fat!: number;
  @field('snf') snf!: number;
  @field('amount') amount!: number;
}

export class SalesCustomer extends Model {
  static table = 'sales_customers';
  @field('name') name!: string;
  @field('phone') phone?: string;
}

export class SalesRecord extends Model {
  static table = 'sales_records';
  @field('customer_id') customerId!: string;
  @field('date') date!: string;
  @field('quantity') quantity!: number;
  @field('amount') amount!: number;
}

export class RateSetting extends Model {
  static table = 'rate_settings';
  @field('fat_multiplier1') fatMultiplier1!: number;
  @field('snf_multiplier1') snfMultiplier1!: number;
  @field('max_fat') maxFat!: number;
  @field('fat_multiplier2') fatMultiplier2!: number;
}

export class Ledger extends Model {
  static table = 'ledgers';
  @field('farmer_internal_id') farmerInternalId!: string;
  @field('date') date!: string;
  @field('type') type!: string;
  @field('amount') amount!: number;
  @field('description') description?: string;
}

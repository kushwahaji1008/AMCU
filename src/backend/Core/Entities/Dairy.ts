export interface Dairy {
  id: string;
  name: string;
  address: string;
  contact: string;
  phone?: string;
  email?: string;
  ownerId: string; // User ID of the admin
  databaseId: string;
  createdAt: Date;
  updatedAt?: Date;
}

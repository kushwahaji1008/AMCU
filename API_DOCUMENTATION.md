# DugdhaSetu API Documentation

This documentation provides details for integrating the DugdhaSetu backend with external applications, such as an Android app.

## Base URL
`https://ais-dev-4h67kdz33fe2gthnuxew5w-657299953648.asia-east1.run.app/api`

## Headers

### Authentication
Most endpoints require a JSON Web Token (JWT).
- **Header**: `Authorization`
- **Value**: `Bearer <your_jwt_token>`

### Multi-Tenancy (Database Context)
The system supports multiple dairies. To specify which dairy's data you want to access:
- **Header**: `x-database-id`
- **Value**: The `databaseId` of the dairy (e.g., `krishna-dairy`). Use `(default)` for the registry database.
- **Note**: Super Admins can switch this header freely. Admins and Operators are restricted to their assigned `databaseId`.

---

## 1. Authentication Endpoints

### Login
Authenticate a user and receive a JWT.
- **URL**: `/auth/login`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "username": "<your_username>",
    "password": "<your_password>"
  }
  ```
- **Response**:
  ```json
  {
    "token": "eyJhbG...",
    "user": {
      "id": "...",
      "username": "admin",
      "role": "admin",
      "databaseId": "default-dairy",
      "status": "active"
    }
  }
  ```

### Super Admin Login
Verify super admin credentials.
- **URL**: `/admin/verify`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "email": "<super_admin_email>",
    "password": "<super_admin_password>"
  }
  ```

---

## 2. Farmer Management

### Get All Farmers
- **URL**: `/farmers`
- **Method**: `GET`
- **Response**: `Array<Farmer>`

### Search Farmer by ID
- **URL**: `/farmers/search/:farmerId`
- **Method**: `GET`

### Create Farmer
- **URL**: `/farmers`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "farmerId": "101",
    "name": "Ram Singh",
    "mobile": "9876543210",
    "village": "Gokul",
    "cattleType": "Cow",
    "bankAccount": "1234567890",
    "ifsc": "SBIN0001234"
  }
  ```

---

## 3. Milk Collection

### Record Collection
- **URL**: `/collections`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "farmerId": "101",
    "date": "2026-04-08",
    "shift": "Morning",
    "milkType": "Cow",
    "quantity": 10.5,
    "fat": 4.2,
    "snf": 8.5,
    "clr": 28
  }
  ```

### Daily Collection Report
- **URL**: `/collections/report?date=2026-04-08`
- **Method**: `GET`

---

## 4. Rate Charts

### Get Current Rates
- **URL**: `/rates`
- **Method**: `GET`

### Update Rate Settings
- **URL**: `/rates/settings`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "calculationMode": "fat-snf",
    "baseRate": 40,
    "fatStandard": 3.5,
    "snfStandard": 8.5
  }
  ```

---

## 5. Payments & Ledger

### Record Payment
- **URL**: `/payments`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "farmerId": "101",
    "amount": 500,
    "method": "Cash",
    "description": "Weekly payment"
  }
  ```

### Get Farmer Ledger
- **URL**: `/ledger/farmer/:farmerId`
- **Method**: `GET`

---

## 6. Dairy Management (Super Admin)

### List All Dairies
- **URL**: `/dairies`
- **Method**: `GET`

### Register New Dairy
- **URL**: `/auth/register`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "username": "newadmin",
    "password": "Password@123",
    "role": "admin",
    "dairyData": {
      "name": "Krishna Dairy",
      "address": "Mathura",
      "contact": "9988776655",
      "databaseId": "krishna-dairy"
    }
  }
  ```

---

## 7. User Management

### List Users
- **URL**: `/users?role=operator`
- **Method**: `GET`

### Update User Status (Activate/Deactivate)
- **URL**: `/users/:id`
- **Method**: `PUT`
- **Body**:
  ```json
  {
    "status": "inactive"
  }
  ```

---

## Data Models (Entities)

### Farmer
```typescript
{
  id: string;
  farmerId: string;
  name: string;
  mobile: string;
  village: string;
  cattleType: 'Cow' | 'Buffalo' | 'Mixed';
  status: 'Active' | 'Inactive';
  balance: number;
}
```

### MilkCollection
```typescript
{
  id: string;
  farmerId: string;
  date: Date;
  shift: 'Morning' | 'Evening';
  milkType: 'Cow' | 'Buffalo' | 'Mixed';
  quantity: number;
  fat: number;
  snf: number;
  rate: number;
  totalAmount: number;
}
```

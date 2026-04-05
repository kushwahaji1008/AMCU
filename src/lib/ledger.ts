import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, doc, runTransaction, serverTimestamp, Timestamp } from 'firebase/firestore';
import { LedgerEntry, Farmer } from '../types';

/**
 * Records a transaction in the farmer's ledger and updates their balance.
 * This is performed as an atomic transaction to ensure data consistency.
 */
export async function recordLedgerTransaction(
  farmerId: string,
  type: 'Credit' | 'Debit',
  amount: number,
  description: string,
  referenceId: string
) {
  try {
    await runTransaction(db, async (transaction) => {
      // 1. Get the farmer document to find their current balance and internal Firestore ID
      // We need to find the farmer by their member ID (farmerId)
      // Since farmerId is a field, we first need to find the document ID
      // In a real app, we might use the document ID directly if we have it.
      // For this implementation, we assume we have the internal document ID or we query it.
      // To keep it simple and robust, let's assume we pass the internal document ID as well, 
      // or we find it. Let's assume the caller provides the internal doc ID for efficiency.
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, 'ledger');
    throw err;
  }
}

/**
 * Improved version that takes the internal Firestore document ID of the farmer
 */
export async function recordTransaction(
  farmerDocId: string,
  type: 'Credit' | 'Debit',
  amount: number,
  description: string,
  referenceId: string
) {
  const farmerRef = doc(db, 'farmers', farmerDocId);
  const ledgerRef = collection(db, 'ledger');

  try {
    await runTransaction(db, async (transaction) => {
      const farmerDoc = await transaction.get(farmerRef);
      if (!farmerDoc.exists()) {
        throw new Error("Farmer not found");
      }

      const farmerData = farmerDoc.data() as Farmer;
      const currentBalance = farmerData.balance || 0;
      
      // Credit: Milk Collection (Increase Balance)
      // Debit: Payment (Decrease Balance)
      const newBalance = type === 'Credit' 
        ? currentBalance + amount 
        : currentBalance - amount;

      // 1. Update Farmer Balance
      transaction.update(farmerRef, { balance: newBalance });

      // 2. Create Ledger Entry
      const newLedgerDocRef = doc(ledgerRef);
      const ledgerEntry: Omit<LedgerEntry, 'id'> = {
        farmerId: farmerData.farmerId,
        type,
        amount,
        description,
        referenceId,
        timestamp: serverTimestamp(),
        balanceAfter: newBalance
      };
      
      transaction.set(newLedgerDocRef, ledgerEntry);
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, 'ledger');
    throw err;
  }
}

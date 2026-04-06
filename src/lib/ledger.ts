import { handleFirestoreError, OperationType } from '../firebase';
import { collection, doc, runTransaction, serverTimestamp, Timestamp, Firestore } from 'firebase/firestore';
import { LedgerEntry, Farmer } from '../types';

/**
 * Improved version that takes the internal Firestore document ID of the farmer
 */
export async function recordTransaction(
  db: Firestore,
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
        dairyId: farmerData.dairyId || '', // Scoped to the dairy
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

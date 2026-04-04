import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, onSnapshot, updateDoc, doc, Timestamp } from 'firebase/firestore';
import { CollectionTransaction } from '../types';
import { CheckCircle2, XCircle, ShieldAlert, Clock, User, Milk, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

export default function Approvals() {
  const [pendingApprovals, setPendingApprovals] = useState<CollectionTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'collections'),
      where('isManual', '==', true),
      where('isApproved', '==', false)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as CollectionTransaction[];
      setPendingApprovals(docs);
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'collections');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleApprove = async (id: string) => {
    try {
      await updateDoc(doc(db, 'collections', id), {
        isApproved: true,
        approvedAt: new Date().toISOString(),
      });
      toast.success('Transaction approved successfully');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'collections');
    }
  };

  const handleReject = async (id: string) => {
    try {
      // For rejection, we might want to mark it as rejected or delete it
      // For now, let's just mark it as rejected
      await updateDoc(doc(db, 'collections', id), {
        isApproved: false,
        isRejected: true,
        rejectedAt: new Date().toISOString(),
      });
      toast.error('Transaction rejected');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'collections');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-stone-900"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-serif font-medium text-stone-900">Pending Approvals</h1>
        <p className="text-stone-500">Review and approve manual milk collection entries</p>
      </div>

      {pendingApprovals.length === 0 ? (
        <div className="bg-white p-12 rounded-3xl border border-stone-100 shadow-sm text-center">
          <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={32} />
          </div>
          <h2 className="text-xl font-serif font-medium text-stone-900 mb-2">All Caught Up!</h2>
          <p className="text-stone-500">There are no pending manual entries requiring approval.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {pendingApprovals.map((txn) => (
            <div key={txn.id} className="bg-white p-6 rounded-3xl border border-stone-100 shadow-sm hover:shadow-md transition-all">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center shrink-0">
                    <ShieldAlert size={24} />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-serif font-medium text-stone-900">{txn.farmerName}</h3>
                      <span className="text-xs font-mono text-stone-400">ID: {txn.farmerId}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
                      <span className="flex items-center gap-1"><Calendar size={14} /> {txn.timestamp ? format(new Date(txn.timestamp.seconds * 1000), 'dd MMM yyyy, hh:mm a') : 'N/A'}</span>
                      <span className="flex items-center gap-1"><Clock size={14} /> {txn.shift} Shift</span>
                      <span className="flex items-center gap-1"><Milk size={14} /> {txn.milkType}</span>
                    </div>
                    <div className="mt-2 p-2 bg-amber-50/50 rounded-lg border border-amber-100/50">
                      <p className="text-xs text-amber-700 font-medium">Reason: {txn.manualReason || 'No reason provided'}</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-8 px-6 py-3 bg-stone-50 rounded-2xl border border-stone-100">
                  <div>
                    <p className="text-[10px] font-medium text-stone-400 uppercase tracking-wider mb-0.5">Quantity</p>
                    <p className="text-lg font-serif font-medium text-stone-900">{txn.quantity} kg</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-stone-400 uppercase tracking-wider mb-0.5">FAT / SNF</p>
                    <p className="text-lg font-serif font-medium text-stone-900">{txn.fat}% / {txn.snf}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-stone-400 uppercase tracking-wider mb-0.5">Amount</p>
                    <p className="text-lg font-serif font-medium text-emerald-600">₹{txn.amount.toFixed(2)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleReject(txn.id!)}
                    className="flex-1 lg:flex-none px-6 py-3 border border-red-100 text-red-600 rounded-xl font-medium hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
                  >
                    <XCircle size={18} />
                    Reject
                  </button>
                  <button
                    onClick={() => handleApprove(txn.id!)}
                    className="flex-1 lg:flex-none px-6 py-3 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 transition-colors flex items-center justify-center gap-2 shadow-sm"
                  >
                    <CheckCircle2 size={18} />
                    Approve
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

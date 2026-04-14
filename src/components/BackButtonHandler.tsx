import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { App } from '@capacitor/app';
import { motion, AnimatePresence } from 'motion/react';
import { LogOut, X, AlertTriangle } from 'lucide-react';

const BackButtonHandler: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  useEffect(() => {
    const backButtonListener = App.addListener('backButton', ({ canGoBack }) => {
      // If we are at the root or login page, show exit confirmation
      if (location.pathname === '/' || location.pathname === '/login') {
        setShowExitConfirm(true);
      } else {
        // Otherwise, follow the in-app hierarchy
        navigate(-1);
      }
    });

    return () => {
      backButtonListener.then(l => l.remove());
    };
  }, [location.pathname, navigate]);

  const handleExit = () => {
    App.exitApp();
  };

  return (
    <AnimatePresence>
      {showExitConfirm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="bg-white dark:bg-stone-900 rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-stone-100 dark:border-stone-800"
          >
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 className="text-xl font-serif font-medium text-stone-900 dark:text-white">Exit App?</h3>
                <p className="text-sm text-stone-500 dark:text-stone-400">Are you sure you want to close DugdhaSetu?</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowExitConfirm(false)}
                className="flex-1 py-3 px-4 rounded-2xl bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 font-medium hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors flex items-center justify-center gap-2"
              >
                <X size={18} />
                Cancel
              </button>
              <button
                onClick={handleExit}
                className="flex-1 py-3 px-4 rounded-2xl bg-red-600 text-white font-medium hover:bg-red-700 transition-colors shadow-lg shadow-red-200 dark:shadow-none flex items-center justify-center gap-2"
              >
                <LogOut size={18} />
                Exit
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default BackButtonHandler;

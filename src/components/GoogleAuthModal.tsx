'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from './Toast';
import { GoogleAccount } from '@/lib/types';
import { localAuth } from '@/lib/localAuth';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function GoogleAuthModal({ isOpen, onClose, onSuccess }: Props) {
  const { googleLogin } = useAuth();
  const { showToast } = useToast();
  const [savedAccounts, setSavedAccounts] = useState<GoogleAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<GoogleAccount | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSavedAccounts(localAuth.getSavedGoogleAccounts());
      setSelectedAccount(null);
      setShowAddForm(false);
      setNewName('');
      setNewEmail('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectAccount = (account: GoogleAccount) => {
    setSelectedAccount(account);
  };

  const handleConfirm = async () => {
    if (!selectedAccount) return;
    localAuth.saveGoogleAccount(selectedAccount.email, selectedAccount.name);
    await completeLogin(selectedAccount.email, selectedAccount.name);
  };

  const handleAddAndLogin = async () => {
    const name = newName.trim() || 'Google User';
    let email = newEmail.trim();
    if (!email) {
      email = name.toLowerCase().replace(/\s+/g, '.') + '@gmail.com';
    }
    localAuth.saveGoogleAccount(email, name);
    await completeLogin(email, name);
  };

  const completeLogin = async (email: string, name: string) => {
    // Try Firebase real auth first
    const result = await googleLogin();
    if (result.user) {
      // Firebase worked
      onClose();
      showToast(`Signed in as ${name} 🎉`, 'success');
      onSuccess?.();
      return;
    }
    
    // Fallback to local auth
    const localResult = localAuth.googleLogin(email, name);
    if (localResult.user) {
      // Update the auth context user
      window.location.reload();
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[10000] flex items-center justify-center p-6"
      onClick={handleOverlayClick}
    >
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-modal-in">
        {/* Header */}
        <div className="text-center px-8 pt-8 pb-6 border-b border-gray-100">
          <div className="text-4xl mb-3">🔵</div>
          <h3 className="text-xl font-serif font-semibold text-gray-800">Choose an account</h3>
          <p className="text-sm text-gray-500 mt-1">to continue to Paws & Co.</p>
        </div>

        {!showAddForm ? (
          <>
            {/* Saved accounts */}
            <div className="px-8 pt-4 pb-2">
              {savedAccounts.map((acc) => (
                <div
                  key={acc.email}
                  onClick={() => handleSelectAccount(acc)}
                  className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all mb-3 ${
                    selectedAccount?.email === acc.email
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-gray-200 bg-gray-50 hover:border-orange-300'
                  }`}
                >
                  <div className="w-11 h-11 rounded-full bg-gray-200 flex items-center justify-center text-xl flex-shrink-0">
                    👤
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-gray-800 truncate">{acc.name}</h4>
                    <p className="text-xs text-gray-500 truncate">{acc.email}</p>
                  </div>
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all text-[10px] ${
                      selectedAccount?.email === acc.email
                        ? 'bg-orange-500 border-orange-500 text-white'
                        : 'border-gray-300'
                    }`}
                  >
                    {selectedAccount?.email === acc.email && '✓'}
                  </div>
                </div>
              ))}
            </div>

            {/* Use another account */}
            <div className="px-8 pb-4">
              <button
                onClick={() => setShowAddForm(true)}
                className="flex items-center gap-4 p-4 rounded-xl w-full hover:bg-gray-50 text-gray-500 hover:text-orange-600 transition-all"
              >
                <div className="w-11 h-11 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center text-xl flex-shrink-0">
                  +
                </div>
                <span className="text-sm font-medium">Use another account</span>
              </button>
            </div>

            {/* Continue button */}
            {selectedAccount && (
              <div className="px-8 pb-8 pt-4 border-t border-gray-100">
                <button
                  onClick={handleConfirm}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 px-6 rounded-full transition-all hover:shadow-lg"
                >
                  Continue as {selectedAccount.name.split(' ')[0]}
                </button>
              </div>
            )}
          </>
        ) : (
          /* Add account form */
          <div className="p-8">
            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Full Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Your name"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl bg-gray-50 focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-100 transition-all text-sm"
              />
            </div>
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Email Address</label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="google.user@gmail.com"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl bg-gray-50 focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-100 transition-all text-sm"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowAddForm(false)}
                className="flex-1 py-3 px-6 rounded-full border-2 border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleAddAndLogin}
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 px-6 rounded-full transition-all hover:shadow-lg"
              >
                Add Account
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

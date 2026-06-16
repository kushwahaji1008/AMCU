import React, { useState, useEffect } from 'react';
import { Users, Plus, Search, Trash2, Shield, UserCheck, UserX, Mail, Key, AlertCircle } from 'lucide-react';
import { useAuth, UserProfile } from '../AuthContext';
import { userApi } from '../services/api';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { useErrorHandler } from '../hooks/useErrorHandler';

export default function UserManagement() {
  const { profile } = useAuth();
  const { handleError } = useErrorHandler();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [activeTab, setActiveTab] = useState<'Operators' | 'Admins'>(profile?.role === 'super_admin' ? 'Admins' : 'Operators');
  const [isAdding, setIsAdding] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  const [newUser, setNewUser] = useState({
    username: '',
    displayName: '',
    password: '',
    databaseId: '', // For SuperAdmin to assign a specific database
  });

  const [resetPasswordUser, setResetPasswordUser] = useState<UserProfile | null>(null);
  const [resetPassValue, setResetPassValue] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);

  /**
   * Validates password strength according to requirements.
   * Returns array of validation errors (empty if valid).
   */
  const validatePassword = (password: string): string[] => {
    const errors: string[] = [];
    
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }
    
    return errors;
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPasswordUser) return;
    
    // Validate password strength
    const errors = validatePassword(resetPassValue);
    if (errors.length > 0) {
      setPasswordErrors(errors);
      toast.error('Password does not meet requirements');
      return;
    }

    setResetLoading(true);
    try {
      await userApi.update(resetPasswordUser.uid, { password: resetPassValue });
      toast.success(`Password for ${resetPasswordUser.displayName} reset successfully!`);
      setResetPasswordUser(null);
      setResetPassValue('');
      setPasswordErrors([]);
    } catch (err) {
      handleError(err, 'Failed to reset password');
    } finally {
      setResetLoading(false);
    }
  };

  const fetchUsers = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const role = activeTab === 'Admins' ? 'admin' : 'operator';
      const response = await userApi.getAll(role);
      // Filter by dairyId on frontend if not super_admin
      let filtered = Array.isArray(response.data) ? response.data : [];
      if (profile.role !== 'super_admin') {
        filtered = filtered.filter((u: any) => u.dairyId === profile.dairyId);
      }
      setUsers(filtered.map((u: any) => ({
        uid: u.id,
        email: u.username,
        displayName: u.username, // Use username as display name for now
        role: u.role,
        status: u.status || 'active',
        dairyId: u.dairyId,
        databaseId: u.databaseId,
        photoURL: '',
        createdAt: u.createdAt
      })));
    } catch (err) {
      handleError(err, 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [profile, activeTab]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    // Check operator limit for admins
    if (profile.role === 'admin' && users.length >= 3) {
      toast.error('You can have at most 3 operators.');
      return;
    }

    // Validate password strength
    if (!newUser.password) {
      toast.error('Password is required');
      return;
    }

    const passwordErrors = validatePassword(newUser.password);
    if (passwordErrors.length > 0) {
      toast.error('Password does not meet requirements: ' + passwordErrors[0]);
      return;
    }

    setLoading(true);
    try {
      const userData = {
        username: newUser.username,
        email: newUser.username,
        password: newUser.password, // Require password - no default
        role: profile.role === 'super_admin' && activeTab === 'Admins' ? 'admin' : 'operator',
        dairyId: profile.role === 'super_admin' && activeTab === 'Admins' ? (newUser.databaseId || '') : profile.dairyId,
        databaseId: profile.role === 'super_admin' && activeTab === 'Admins' ? (newUser.databaseId || '(default)') : profile.databaseId,
      };

      await userApi.create(userData);
      
      toast.success('User profile created successfully!');
      setIsAdding(false);
      setNewUser({ username: '', displayName: '', password: '', databaseId: '' });
      fetchUsers();
    } catch (err: any) {
      handleError(err, 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  const toggleUserStatus = async (user: any) => {
    try {
      const newStatus = user.status === 'active' ? 'inactive' : 'active';
      await userApi.update(user.uid, { status: newStatus });
      toast.success(`User ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully`);
      fetchUsers();
    } catch (err) {
      handleError(err, 'Failed to update user status');
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    try {
      await userApi.delete(id);
      toast.success('User deleted successfully');
      fetchUsers();
    } catch (err) {
      handleError(err, 'Failed to delete user');
    }
  };

  const filteredUsers = users.filter(u => 
    (u.displayName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-serif font-medium text-stone-900 dark:text-white">User Management</h1>
          <p className="text-stone-500 dark:text-stone-400">
            {profile?.role === 'super_admin' ? 'Global System Administration' : `Manage Operators for ${profile?.displayName}`}
          </p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 px-6 py-3 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-xl font-medium hover:bg-stone-800 dark:hover:bg-stone-100 transition-colors"
        >
          <Plus size={18} />
          Add {profile?.role === 'super_admin' && activeTab === 'Admins' ? 'Admin' : 'Operator'}
        </button>
      </div>

      {isAdding && (
        <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm animate-in fade-in slide-in-from-top-4">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-serif font-medium">New {activeTab === 'Admins' ? 'Admin' : 'Operator'}</h2>
            <button onClick={() => setIsAdding(false)} className="text-stone-400 hover:text-stone-600">
              <UserX size={20} />
            </button>
          </div>
          <form onSubmit={handleAddUser} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-500 uppercase tracking-wider">Full Name</label>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
                <input
                  required
                  type="text"
                  value={newUser.displayName}
                  onChange={(e) => setNewUser({...newUser, displayName: e.target.value})}
                  className="w-full pl-10 pr-4 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none text-sm dark:text-white"
                  placeholder="John Doe"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-500 uppercase tracking-wider">Username / Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
                <input
                  required
                  type="text"
                  value={newUser.username}
                  onChange={(e) => setNewUser({...newUser, username: e.target.value})}
                  className="w-full pl-10 pr-4 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none text-sm dark:text-white"
                  placeholder="john@example.com"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-500 uppercase tracking-wider">Password *</label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
                <input
                  required
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                  className="w-full pl-10 pr-4 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none text-sm dark:text-white"
                  placeholder="••••••••"
                />
              </div>
              <p className="text-xs text-stone-400 mt-1">Min 8 chars: uppercase, lowercase, number, special char</p>
            </div>
            {profile?.role === 'super_admin' && activeTab === 'Admins' && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-stone-500 uppercase tracking-wider">Database ID / Society ID</label>
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
                  <input
                    required
                    type="text"
                    value={newUser.databaseId}
                    onChange={(e) => setNewUser({...newUser, databaseId: e.target.value})}
                    className="w-full pl-10 pr-4 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none text-sm dark:text-white"
                    placeholder="amul-dairy-01"
                  />
                </div>
              </div>
            )}
            <div className="flex items-end">
              <button
                disabled={loading}
                type="submit"
                className="w-full py-2 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-xl font-medium hover:bg-stone-800 dark:hover:bg-stone-100 transition-colors disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create User Profile'}
              </button>
            </div>
          </form>
          {profile?.role === 'admin' && (
            <p className="mt-4 text-xs text-stone-400 italic">
              Note: You can have at most 3 operators. Current: {users.length}/3
            </p>
          )}
        </div>
      )}

      <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm overflow-hidden">
        {profile?.role === 'super_admin' && (
          <div className="flex border-b border-stone-100 dark:border-stone-800">
            {(['Admins', 'Operators'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "flex-1 py-4 text-sm font-medium transition-colors",
                  activeTab === tab 
                    ? "text-stone-900 dark:text-white border-b-2 border-stone-900 dark:border-white" 
                    : "text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-400"
                )}
              >
                {tab}
              </button>
            ))}
          </div>
        )}

        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 dark:text-stone-500" size={18} />
              <input
                type="text"
                placeholder="Search users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none text-sm dark:text-white"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-stone-100 dark:border-stone-800">
                  <th className="py-4 px-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">User</th>
                  <th className="py-4 px-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Role</th>
                  <th className="py-4 px-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Database / Society ID</th>
                  <th className="py-4 px-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider">Status</th>
                  <th className="py-4 px-4 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50 dark:divide-stone-800">
                {filteredUsers.map((user) => (
                  <tr key={user.uid} className="group hover:bg-stone-50/50 dark:hover:bg-stone-800/50 transition-colors">
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-stone-500 font-bold text-xs">
                          {user.displayName.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-stone-900 dark:text-white">{user.displayName}</p>
                          <p className="text-xs text-stone-400">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className={cn(
                        "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                        user.role === 'admin' ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                      )}>
                        {user.role}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-xs font-mono text-stone-400">
                      {user.databaseId || user.dairyId || 'Global'}
                    </td>
                    <td className="py-4 px-4">
                      <span className={cn(
                        "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                        user.status === 'active' 
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" 
                          : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      )}>
                        {user.status}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <div className="flex justify-end gap-2">
                        {profile?.role === 'super_admin' && (
                          <button 
                            onClick={() => setResetPasswordUser(user)}
                            className="p-2 text-stone-400 hover:text-amber-500 transition-colors"
                            title="Reset Password"
                          >
                            <Key size={18} />
                          </button>
                        )}
                        <button 
                          onClick={() => toggleUserStatus(user)}
                          className={cn(
                            "p-2 transition-colors",
                            user.status === 'active' ? "text-stone-400 hover:text-red-600" : "text-stone-400 hover:text-green-600"
                          )}
                          title={user.status === 'active' ? 'Deactivate' : 'Activate'}
                        >
                          {user.status === 'active' ? <UserX size={18} /> : <UserCheck size={18} />}
                        </button>
                        <button 
                          onClick={() => handleDeleteUser(user.uid)}
                          className="p-2 text-stone-400 hover:text-red-600 transition-colors"
                          title="Delete User"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-stone-400 dark:text-stone-500 italic text-sm">
                      No users found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {resetPasswordUser && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-stone-900 w-full max-w-md p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2">
                <Key className="text-amber-500 w-5 h-5 animate-pulse" />
                <h2 className="text-xl font-serif font-medium text-stone-900 dark:text-white">Reset Password</h2>
              </div>
              <button 
                type="button"
                onClick={() => { setResetPasswordUser(null); setResetPassValue(''); setPasswordErrors([]); }} 
                className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 transition-colors"
                title="Close"
              >
                <UserX size={20} />
              </button>
            </div>
            
            <p className="text-sm text-stone-500 dark:text-stone-400 mb-6">
              Set a new password for <strong className="text-stone-800 dark:text-white">{resetPasswordUser.displayName}</strong> ({resetPasswordUser.email}). The user will need to use this new password on their next login.
            </p>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-400 uppercase tracking-widest px-1">New Password</label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
                  <input
                    required
                    type="password"
                    value={resetPassValue}
                    onChange={(e) => {
                      setResetPassValue(e.target.value);
                      // Real-time validation as user types
                      if (e.target.value) {
                        setPasswordErrors(validatePassword(e.target.value));
                      } else {
                        setPasswordErrors([]);
                      }
                    }}
                    className="w-full pl-10 pr-4 py-3 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none text-sm dark:text-white focus:border-stone-300"
                    placeholder="Enter new strong password"
                  />
                </div>
              </div>

              {/* Password Requirements Display */}
              {resetPassValue && (
                <div className="bg-stone-50 dark:bg-stone-800/50 p-4 rounded-lg border border-stone-200 dark:border-stone-700 space-y-2">
                  <p className="text-xs font-semibold text-stone-700 dark:text-stone-300 flex items-center gap-2">
                    <AlertCircle size={14} />
                    Password Requirements:
                  </p>
                  <ul className="text-xs space-y-1">
                    <li className={cn(
                      "flex items-center gap-2",
                      resetPassValue.length >= 8 ? "text-green-600 dark:text-green-400" : "text-stone-500 dark:text-stone-400"
                    )}>
                      {resetPassValue.length >= 8 ? '✓' : '○'} At least 8 characters
                    </li>
                    <li className={cn(
                      "flex items-center gap-2",
                      /[A-Z]/.test(resetPassValue) ? "text-green-600 dark:text-green-400" : "text-stone-500 dark:text-stone-400"
                    )}>
                      {/[A-Z]/.test(resetPassValue) ? '✓' : '○'} One uppercase letter (A-Z)
                    </li>
                    <li className={cn(
                      "flex items-center gap-2",
                      /[a-z]/.test(resetPassValue) ? "text-green-600 dark:text-green-400" : "text-stone-500 dark:text-stone-400"
                    )}>
                      {/[a-z]/.test(resetPassValue) ? '✓' : '○'} One lowercase letter (a-z)
                    </li>
                    <li className={cn(
                      "flex items-center gap-2",
                      /[0-9]/.test(resetPassValue) ? "text-green-600 dark:text-green-400" : "text-stone-500 dark:text-stone-400"
                    )}>
                      {/[0-9]/.test(resetPassValue) ? '✓' : '○'} One number (0-9)
                    </li>
                    <li className={cn(
                      "flex items-center gap-2",
                      /[!@#$%^&*(),.?":{}|<>]/.test(resetPassValue) ? "text-green-600 dark:text-green-400" : "text-stone-500 dark:text-stone-400"
                    )}>
                      {/[!@#$%^&*(),.?":{}|<>]/.test(resetPassValue) ? '✓' : '○'} One special character (!@#$%^&*...)
                    </li>
                  </ul>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => { setResetPasswordUser(null); setResetPassValue(''); setPasswordErrors([]); }}
                  disabled={resetLoading}
                  className="px-5 py-2.5 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 rounded-xl font-medium hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors text-sm disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetLoading || passwordErrors.length > 0}
                  className="px-5 py-2.5 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-xl font-medium hover:bg-stone-800 dark:hover:bg-stone-100 transition-colors text-sm flex items-center gap-2 disabled:opacity-50"
                >
                  {resetLoading ? 'Resetting...' : 'Reset Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
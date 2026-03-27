import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types';
import { User, Mail, Phone, Shield, ShieldAlert } from 'lucide-react';

const ZZPs: React.FC = () => {
  const [zzps, setZzps] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchZZPs();
  }, []);

  const fetchZZPs = async () => {
    setLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'users'));
      const list = querySnapshot.docs.map(doc => ({ uid: doc.id, ...(doc.data() as any) } as any as UserProfile));
      setZzps(list);
    } catch (error) {
      console.error('Error fetching ZZPs:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleRole = async (user: UserProfile) => {
    const newRole = user.role === 'admin' ? 'zzp' : 'admin';
    if (window.confirm(`Weet u zeker dat u de rol van ${user.firstName} wilt veranderen naar ${newRole}?`)) {
      try {
        await updateDoc(doc(db, 'users', user.uid), { role: newRole });
        fetchZZPs();
      } catch (error) {
        console.error('Error updating role:', error);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">ZZP'ers & Gebruikers</h1>
      </div>

      {loading ? (
        <div>Laden...</div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {zzps.map((zzp) => (
            <div key={zzp.uid} className="rounded-xl border bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-pink-100 text-pink-600">
                    <User className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{zzp.firstName} {zzp.lastName}</h3>
                    <span className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                      zzp.role === 'admin' ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800"
                    )}>
                      {zzp.role === 'admin' ? <Shield className="mr-1 h-3 w-3" /> : null}
                      {zzp.role}
                    </span>
                  </div>
                </div>
                <button 
                  onClick={() => toggleRole(zzp)}
                  className="text-xs text-gray-400 hover:text-pink-600"
                  title="Rol wijzigen"
                >
                  {zzp.role === 'admin' ? <ShieldAlert className="h-5 w-5" /> : <Shield className="h-5 w-5" />}
                </button>
              </div>
              <div className="mt-4 space-y-2 text-sm text-gray-600">
                <p className="flex items-center space-x-2">
                  <Mail className="h-4 w-4 text-gray-400" />
                  <span>{zzp.email}</span>
                </p>
                <p className="flex items-center space-x-2">
                  <Phone className="h-4 w-4 text-gray-400" />
                  <span>{zzp.phone || 'Geen telefoonnummer'}</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}

export default ZZPs;

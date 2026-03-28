import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthProvider';
import { TimeRegistration, Assignment } from '../types';
import { 
  Clock, 
  CheckCircle2, 
  Calendar, 
  Briefcase, 
  ChevronRight,
  AlertCircle
} from 'lucide-react';
import { format, startOfMonth, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';

const Dashboard: React.FC = () => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    pendingHours: 0,
    approvedHours: 0,
    totalThisMonth: 0,
    activeAssignments: 0
  });
  const [recentRegistrations, setRecentRegistrations] = useState<TimeRegistration[]>([]);

  useEffect(() => {
    if (profile?.uid) {
      fetchDashboardData();
    }
  }, [profile]);

  const fetchDashboardData = async () => {
    try {
      // 1. Query aanpassen van 'zzpId' naar 'uid'
      const regsQuery = query(
        collection(db, 'timeRegistrations'),
        where('uid', '==', profile?.uid) // CRUCIAL: Moet 'uid' zijn voor de nieuwe Rules
      );

      const assignmentsQuery = query(
        collection(db, 'assignments'),
        where('status', '==', 'active')
      );

      const [regsSnap, assignmentsSnap] = await Promise.all([
        getDocs(regsQuery),
        getDocs(assignmentsQuery)
      ]);

      const regs = regsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TimeRegistration));
      const currentMonth = format(new Date(), 'yyyy-MM');

      const dashboardStats = regs.reduce((acc, reg) => {
        if (reg.status === 'pending') acc.pendingHours += reg.totalHours;
        if (reg.status === 'approved') acc.approvedHours += reg.totalHours;
        if (reg.date.startsWith(currentMonth)) acc.totalThisMonth += reg.totalHours;
        return acc;
      }, { pendingHours: 0, approvedHours: 0, totalThisMonth: 0, activeAssignments: assignmentsSnap.size });

      setStats(dashboardStats);
      
      // Sorteer recentste handmatig als de index nog niet klaar is
      const sortedRegs = regs
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 5);
        
      setRecentRegistrations(sortedRegs);
    } catch (error) {
      console.error('Fout bij laden dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-12 text-center text-pink-600 font-bold">Dashboard laden...</div>;

  const cards = [
    { label: 'Wachtend', value: `${stats.pendingHours.toFixed(1)}`, icon: Clock, color: 'text-orange-600', bg: 'bg-orange-50' },
    { label: 'Goedgekeurd', value: `${stats.approvedHours.toFixed(1)}`, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Deze maand', value: `${stats.totalThisMonth.toFixed(1)}`, icon: Calendar, color: 'text-pink-600', bg: 'bg-pink-50' },
    { label: 'Opdrachten', value: `${stats.activeAssignments}`, icon: Briefcase, color: 'text-blue-600', bg: 'bg-blue-50' },
  ];

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 py-8">
      <header>
        <h1 className="text-4xl font-black text-gray-900 flex items-center gap-3">
          Welkom, 👋
        </h1>
        <p className="text-gray-500 font-bold mt-1 uppercase tracking-widest text-sm">
          Overzicht voor <span className="text-pink-600">{format(new Date(), 'MMMM yyyy', { locale: nl })}</span>
        </p>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card) => (
          <div key={card.label} className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
            <div className={`w-12 h-12 ${card.bg} rounded-2xl flex items-center justify-center mb-6`}>
              <card.icon className={`h-6 w-6 ${card.color}`} />
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-1">{card.label}</p>
            <div className="flex items-baseline space-x-1">
              <span className="text-3xl font-black text-gray-900">{card.value}</span>
              {card.label.includes('uur') && <span className="text-gray-400 font-bold">uur</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recente uren */}
        <div className="lg:col-span-2 bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-8 border-b border-gray-50 flex justify-between items-center">
            <h2 className="font-black text-gray-900 uppercase tracking-widest text-sm flex items-center gap-2">
              <Clock className="h-4 w-4 text-pink-600" />
              Recente Registraties
            </h2>
          </div>
          <div className="divide-y divide-gray-50">
            {recentRegistrations.map((reg) => (
              <div key={reg.id} className="p-6 hover:bg-gray-50 transition-colors flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="bg-gray-100 h-12 w-12 rounded-2xl flex flex-col items-center justify-center text-gray-500">
                    <span className="text-[10px] font-black leading-none">{format(parseISO(reg.date), 'MMM', { locale: nl }).toUpperCase()}</span>
                    <span className="text-lg font-black leading-none">{format(parseISO(reg.date), 'dd')}</span>
                  </div>
                  <div>
                    <p className="font-black text-gray-900">{reg.totalHours.toFixed(1)} uur gewerkt</p>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">{reg.status}</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-300" />
              </div>
            ))}
            {recentRegistrations.length === 0 && (
              <div className="p-20 text-center">
                <AlertCircle className="h-12 w-12 text-gray-100 mx-auto mb-4" />
                <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Nog geen uren geregistreerd</p>
              </div>
            )}
          </div>
        </div>

        {/* Info Card */}
        <div className="bg-gradient-to-br from-pink-500 to-pink-600 rounded-[2.5rem] p-10 text-white shadow-xl shadow-pink-100 relative overflow-hidden group">
          <div className="relative z-10">
            <h3 className="text-2xl font-black mb-4">Hulp nodig?</h3>
            <p className="text-pink-100 font-bold mb-8 opacity-90">Heb je vragen over je uitbetaling of urenregistratie? Neem contact op met support.</p>
            <button className="w-full bg-white text-pink-600 font-black py-4 rounded-2xl hover:bg-pink-50 transition-colors shadow-lg">
              Contact Support
            </button>
          </div>
          <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700"></div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthProvider';
import { TimeRegistration, Client } from '../types';
import { Download, Calendar, User, TrendingUp, Percent } from 'lucide-react';
import { format, startOfMonth, endOfMonth, parseISO, isWithinInterval } from 'date-fns';
import { nl } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const Reports: React.FC = () => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [registrations, setRegistrations] = useState<TimeRegistration[]>([]);
  const [zzps, setZzps] = useState<any[]>([]); 
  const [assignments, setAssignments] = useState<any[]>([]);

  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [selectedZzpId, setSelectedZzpId] = useState<string>('all');

  useEffect(() => { fetchData(); }, [profile]);

  const fetchData = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const isAdmin = profile.role === 'admin';
      // FILTER: We halen alleen uren op met status 'approved'
      const regsQuery = isAdmin 
        ? query(collection(db, 'timeRegistrations'), where('status', '==', 'approved'))
        : query(collection(db, 'timeRegistrations'), where('uid', '==', profile.uid), where('status', '==', 'approved'));

      const [zzpsSnap, assignmentsSnap, regsSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'assignments')),
        getDocs(regsQuery)
      ]);

      setZzps(zzpsSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() })));
      setAssignments(assignmentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setRegistrations(regsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TimeRegistration)));
      
      if (!isAdmin) setSelectedZzpId(profile.uid);
    } catch (error) { 
      console.error('Data fetch error:', error); 
    } finally { 
      setLoading(false); 
    }
  };

  // Logica om de fee te berekenen op basis van de gekoppelde assignment
  const getCalculationDetails = (reg: TimeRegistration) => {
    const assignment = assignments.find(a => a.id === reg.assignmentId);
    const rate = Number(assignment?.rate) || 0;
    const hours = Number(reg.duration) || 0;
    const fee = (hours * rate) * 0.10;
    return { rate, hours, fee };
  };

  const filteredRegistrations = registrations.filter(reg => {
    const regDate = parseISO(reg.date);
    const monthStart = startOfMonth(parseISO(`${selectedMonth}-01`));
    const monthEnd = endOfMonth(monthStart);
    const matchesMonth = isWithinInterval(regDate, { start: monthStart, end: monthEnd });
    const matchesZzp = selectedZzpId === 'all' || reg.uid === selectedZzpId;
    return matchesMonth && matchesZzp;
  });

  const totalHours = filteredRegistrations.reduce((acc, reg) => acc + (Number(reg.duration) || 0), 0);
  const totalFee = filteredRegistrations.reduce((acc, reg) => acc + getCalculationDetails(reg).fee, 0);

  const generatePDF = () => {
    const doc = new jsPDF();
    doc.text(`Fee Rapportage - ${selectedMonth}`, 14, 20);
    
    const tableData = filteredRegistrations.map(reg => {
      const { fee } = getCalculationDetails(reg);
      const zzp = zzps.find(z => z.uid === reg.uid);
      return [
        reg.date,
        zzp?.displayName || zzp?.email || 'Onbekend',
        `${reg.duration}u`,
        `€ ${fee.toFixed(2)}`
      ];
    });

    autoTable(doc, {
      startY: 30,
      head: [['Datum', 'ZZP\'er', 'Uren', 'Fee (10%)']],
      body: tableData,
      foot: [['Totaal', '', `${totalHours.toFixed(1)}u`, `€ ${totalFee.toFixed(2)}`]]
    });

    doc.save(`Rapport_${selectedMonth}.pdf`);
  };

  if (loading) return <div className="p-10 text-center font-bold">Laden...</div>;

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto font-sans">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-black uppercase">Rapportage</h1>
          <p className="text-gray-500">Fee berekening (10%) op basis van goedgekeurde uren.</p>
        </div>
        <button onClick={generatePDF} className="bg-black text-white px-6 py-3 rounded-xl flex gap-2 font-bold uppercase text-xs">
          <Download size={16} /> Export Fee PDF
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white p-6 rounded-3xl border">
        <div className="space-y-1">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Maand</label>
          <input type="month" className="w-full p-4 bg-gray-50 rounded-xl font-bold" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">ZZP'er</label>
          <select className="w-full p-4 bg-gray-50 rounded-xl font-bold" value={selectedZzpId} onChange={(e) => setSelectedZzpId(e.target.value)}>
            <option value="all">Alle ZZP'ers</option>
            {zzps.filter(z => z.role === 'zzp').map(z => <option key={z.uid} value={z.uid}>{z.displayName || z.email}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-pink-600 p-8 rounded-[2rem] text-white flex justify-between items-center">
          <div>
            <p className="text-xs font-bold opacity-80 uppercase">Totaal Uren</p>
            <p className="text-4xl font-black">{totalHours.toFixed(1)}u</p>
          </div>
          <TrendingUp size={40} className="opacity-20" />
        </div>
        <div className="bg-white p-8 rounded-[2rem] border flex justify-between items-center">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase">Totaal Fee (10%)</p>
            <p className="text-4xl font-black text-pink-600">€ {totalFee.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</p>
          </div>
          <Percent size={40} className="text-pink-600 opacity-10" />
        </div>
      </div>

      <div className="bg-white rounded-3xl border overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-[10px] font-black uppercase text-gray-400">
            <tr>
              <th className="px-6 py-4">Datum</th>
              <th className="px-6 py-4">ZZP'er</th>
              <th className="px-6 py-4 text-right">Uren</th>
              <th className="px-6 py-4 text-right">Fee Bedrag</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredRegistrations.map(reg => {
              const { fee } = getCalculationDetails(reg);
              const zzp = zzps.find(z => z.uid === reg.uid);
              return (
                <tr key={reg.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 font-bold">{format(parseISO(reg.date), 'dd MMM yyyy', { locale: nl })}</td>
                  <td className="px-6 py-4 text-gray-600 font-medium">{zzp?.displayName || zzp?.email}</td>
                  <td className="px-6 py-4 text-right font-black">{Number(reg.duration).toFixed(1)}u</td>
                  <td className="px-6 py-4 text-right font-black text-pink-600">€ {fee.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Reports;

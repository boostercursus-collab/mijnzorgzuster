import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthProvider';
import { TimeRegistration, Client } from '../types';
import { Download, Calendar, User, Building2, TrendingUp, Percent } from 'lucide-react';
import { format, startOfMonth, endOfMonth, parseISO, isWithinInterval } from 'date-fns';
import { nl } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logo from '../pages/MIJNZORGZUSTER.jpg';

const Reports: React.FC = () => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [registrations, setRegistrations] = useState<TimeRegistration[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [zzps, setZzps] = useState<any[]>([]); 
  const [assignments, setAssignments] = useState<any[]>([]);

  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [selectedZzpId, setSelectedZzpId] = useState<string>('all');
  const [selectedClientId, setSelectedClientId] = useState<string>('all');

  useEffect(() => { fetchData(); }, [profile]);

  const fetchData = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const isAdmin = profile.role === 'admin';
      const regsQuery = isAdmin 
        ? query(collection(db, 'timeRegistrations'), where('status', '==', 'approved'))
        : query(collection(db, 'timeRegistrations'), where('uid', '==', profile.uid), where('status', '==', 'approved'));

      const [clientsSnap, zzpsSnap, assignmentsSnap, regsSnap] = await Promise.all([
        getDocs(collection(db, 'clients')),
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'assignments')),
        getDocs(regsQuery)
      ]);

      setClients(clientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client)));
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

  const getFeeData = (reg: TimeRegistration, percentage: number = 0.10) => {
    const assignment = assignments.find(a => String(a.id) === String(reg.assignmentId));
    const rate = assignment ? Number(assignment.rate) : 0;
    const hours = Number(reg.duration) || 0;
    const fee = (hours * rate) * percentage;
    const client = clients.find(c => c.id === assignment?.clientId);
    return { rate, hours, fee, assignment, clientName: client?.name || 'Onbekend' };
  };

  const filteredRegistrations = registrations.filter(reg => {
    const regDate = parseISO(reg.date);
    const monthStart = startOfMonth(parseISO(`${selectedMonth}-01`));
    const monthEnd = endOfMonth(monthStart);
    const matchesMonth = isWithinInterval(regDate, { start: monthStart, end: monthEnd });
    const matchesZzp = selectedZzpId === 'all' || reg.uid === selectedZzpId;
    const { assignment } = getFeeData(reg);
    const matchesClient = selectedClientId === 'all' || (assignment && assignment.clientId === selectedClientId);
    return matchesMonth && matchesZzp && matchesClient;
  });

  const totalHours = filteredRegistrations.reduce((acc, reg) => acc + (Number(reg.duration) || 0), 0);
  const totalFeeInternal = filteredRegistrations.reduce((acc, reg) => acc + getFeeData(reg, 0.10).fee, 0);

  const generatePDF = () => {
    const doc = new jsPDF();
    
    // Logo toevoegen
    doc.addImage(logo, 'JPEG', 14, 10, 30, 20);

    // Titels
    doc.setFontSize(18);
    doc.text('Urenrapportage Mijnzorgzuster.nl', 14, 40);
    doc.setFontSize(10);
    doc.text(`Periode: ${selectedMonth}`, 14, 48);
    doc.text(`Export datum: ${format(new Date(), 'dd-MM-yyyy HH:mm')}`, 14, 54);

    let totalExternalFee = 0;
    const tableData = filteredRegistrations.map(reg => {
      const { fee, clientName } = getFeeData(reg, 0.05); // 5% voor PDF
      totalExternalFee += fee;
      const zzp = zzps.find(z => z.uid === reg.uid);
      return [
        format(parseISO(reg.date), 'dd-MM-yyyy'),
        zzp?.displayName || zzp?.email || 'Onbekend',
        clientName, // Opdrachtgever toegevoegd
        `${Number(reg.duration).toFixed(1)}u`,
        `€ ${fee.toFixed(2)}`
      ];
    });

    autoTable(doc, {
      startY: 60,
      head: [['Datum', 'ZZP\'er', 'Opdrachtgever', 'Uren', 'Fee (5%)']],
      body: tableData,
      foot: [['Totaal', '', '', `${totalHours.toFixed(1)}u`, `€ ${totalExternalFee.toFixed(2)}`]],
      headStyles: { fillColor: [219, 39, 119] },
      footStyles: { fillColor: [243, 244, 246], textColor: [0, 0, 0], fontStyle: 'bold' },
      theme: 'striped'
    });

    doc.save(`Urenrapportage_${selectedMonth}.pdf`);
  };

  if (loading) return <div className="p-10 text-center font-bold text-pink-600 tracking-widest">LADEN...</div>;

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-black uppercase">Rapportage</h1>
          <p className="text-gray-500 font-medium">Interne marge controle (10%) en PDF export (5%).</p>
        </div>
        <button onClick={generatePDF} className="bg-black text-white px-8 py-4 rounded-2xl flex gap-2 text-xs font-black uppercase shadow-xl hover:opacity-80 transition-all">
          <Download size={18} /> Export Fee PDF (5%)
        </button>
      </header>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-white p-8 rounded-[2.5rem] border shadow-sm">
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-2 flex items-center gap-2"><Calendar size={14}/> Maand</label>
          <input type="month" className="w-full p-5 bg-gray-50 rounded-2xl font-bold outline-none" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-2 flex items-center gap-2"><User size={14}/> ZZP'er</label>
          <select className="w-full p-5 bg-gray-50 rounded-2xl font-bold outline-none" value={selectedZzpId} onChange={(e) => setSelectedZzpId(e.target.value)}>
            <option value="all">Alle ZZP'ers</option>
            {zzps.filter(z => z.role === 'zzp').map(z => <option key={z.uid} value={z.uid}>{z.displayName || z.email}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-2 flex items-center gap-2"><Building2 size={14}/> Opdrachtgever</label>
          <select className="w-full p-5 bg-gray-50 rounded-2xl font-bold outline-none" value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)}>
            <option value="all">Alle Opdrachtgevers</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-pink-600 p-8 rounded-[2.5rem] text-white shadow-xl flex items-center justify-between">
          <div><p className="text-[10px] font-black uppercase opacity-80 mb-1">Totaal Uren</p><p className="text-4xl font-black">{totalHours.toFixed(1)}u</p></div>
          <TrendingUp size={80} className="opacity-10" />
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] border shadow-sm flex items-center justify-between">
          <div><p className="text-[10px] font-black uppercase text-gray-400 mb-1 tracking-widest">Totaal Fee (10%)</p><p className="text-4xl font-black text-pink-600">€ {totalFeeInternal.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</p></div>
          <Percent size={48} className="text-pink-600 opacity-10" />
        </div>
      </div>

      {/* On-screen Table */}
      <div className="bg-white rounded-[2.5rem] border shadow-sm overflow-hidden">
        <div className="px-8 py-6 bg-gray-50/50 border-b flex justify-between items-center">
          <h2 className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Detail Overzicht</h2>
          <span className="bg-pink-100 text-pink-600 text-[10px] font-black px-3 py-1 rounded-full">INTERNE MARGE: 10%</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="text-[10px] font-black uppercase text-gray-400">
              <tr>
                <th className="px-8 py-5">Datum</th>
                <th className="px-8 py-5">ZZP'er</th>
                <th className="px-8 py-5">Opdrachtgever</th>
                <th className="px-8 py-5 text-right">Uren</th>
                <th className="px-8 py-5 text-right">Fee (10%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredRegistrations.map(reg => {
                const { fee, clientName } = getFeeData(reg, 0.10);
                const zzp = zzps.find(z => z.uid === reg.uid);
                return (
                  <tr key={reg.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-8 py-5 font-bold text-gray-700">{format(parseISO(reg.date), 'dd MMM yyyy', { locale: nl })}</td>
                    <td className="px-8 py-5 text-gray-600 font-medium">{zzp?.displayName || zzp?.email}</td>
                    <td className="px-8 py-5 text-gray-600 font-medium">{clientName}</td>
                    <td className="px-8 py-5 text-right font-black">{Number(reg.duration).toFixed(1)}u</td>
                    <td className="px-8 py-5 text-right font-black text-pink-600">€ {fee.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Reports;

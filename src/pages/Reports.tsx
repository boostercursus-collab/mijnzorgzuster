import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthProvider';
import { TimeRegistration, Assignment, Client } from '../types';
import { Download, Calendar, User, Building2, TrendingUp, Percent } from 'lucide-react';
import { format, startOfMonth, endOfMonth, parseISO, isWithinInterval } from 'date-fns';
import { nl } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const Reports: React.FC = () => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [registrations, setRegistrations] = useState<TimeRegistration[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [zzps, setZzps] = useState<any[]>([]); 
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [selectedZzpId, setSelectedZzpId] = useState<string>('all');
  const [selectedClientId, setSelectedClientId] = useState<string>('all');

  useEffect(() => { 
    fetchData(); 
  }, [profile]);

  const getUserDisplayName = (user: any) => user?.displayName || user?.email || 'Onbekend';

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
      setAssignments(assignmentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
      setRegistrations(regsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TimeRegistration)));
      
      if (!isAdmin) setSelectedZzpId(profile.uid);
    } catch (error) { 
      console.error('Data fetch error:', error); 
    } finally { 
      setLoading(false); 
    }
  };

  const filteredRegistrations = registrations.filter(reg => {
    const regDate = parseISO(reg.date);
    const monthStart = startOfMonth(parseISO(`${selectedMonth}-01`));
    const monthEnd = endOfMonth(monthStart);
    const matchesMonth = isWithinInterval(regDate, { start: monthStart, end: monthEnd });
    const matchesZzp = selectedZzpId === 'all' || reg.uid === selectedZzpId;
    const assignment = assignments.find(a => a.id === reg.assignmentId);
    const matchesClient = selectedClientId === 'all' || (assignment && assignment.clientId === selectedClientId);
    return matchesMonth && matchesZzp && matchesClient;
  });

  const totalHours = filteredRegistrations.reduce((acc, reg) => acc + (Number(reg.duration) || 0), 0);

  const totalCommission = filteredRegistrations.reduce((acc, reg) => {
    const assignment = assignments.find(a => a.id === reg.assignmentId);
    const rateValue = Number(assignment?.rate) || 0;
    const duration = Number(reg.duration) || 0;
    return acc + ((duration * rateValue) * 0.10);
  }, 0);

  const generatePDF = async () => {
    const doc = new jsPDF();
    const logoUrl = '/MIJNZORGZUSTER.jpg';
    
    try {
      const img = new Image();
      img.src = logoUrl;
      doc.addImage(img, 'JPEG', 14, 10, 45, 15);
    } catch (e) { 
      console.warn("Logo niet geladen"); 
    }

    doc.setFontSize(20);
    doc.setTextColor(219, 39, 119); 
    doc.text('Fee Overzicht (10%)', 14, 35);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Periode: ${selectedMonth}`, 14, 42);

    const tableBody = filteredRegistrations.map(reg => {
      const assignment = assignments.find(a => a.id === reg.assignmentId);
      const zzp = zzps.find(z => z.uid === reg.uid);
      const rateValue = Number(assignment?.rate) || 0;
      const fee = (Number(reg.duration) * rateValue) * 0.10;

      return [
        format(parseISO(reg.date), 'dd-MM-yyyy'),
        getUserDisplayName(zzp),
        `${reg.duration}u`,
        `€ ${fee.toFixed(2)}`
      ];
    });

    autoTable(doc, {
      startY: 50,
      head: [['Datum', 'ZZP\'er', 'Uren', 'Fee (10%)']],
      body: tableBody,
      foot: [['TOTAAL', '', `${totalHours.toFixed(1)}u`, `€ ${totalCommission.toFixed(2)}`]],
      headStyles: { fillColor: [219, 39, 119] },
      theme: 'striped'
    });

    doc.save(`Fee_Rapport_${selectedMonth}.pdf`);
  };

  if (loading) return <div className="p-10 text-center font-bold text-pink-600 tracking-widest uppercase">Laden...</div>;

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tight">Rapportage</h1>
          <p className="text-gray-500 font-medium text-lg">Fee berekening (10%) op basis van uurtarief.</p>
        </div>
        <button 
          onClick={generatePDF} 
          className="bg-[#111827] text-white px-8 py-4 rounded-2xl flex gap-2 text-xs font-black uppercase shadow-xl hover:bg-black transition-all"
        >
          <Download size={18} /> Export Fee PDF
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white p-8 rounded-[2.5rem] border shadow-sm">
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-2 flex items-center gap-2">
            <Calendar size={14}/> Maand
          </label>
          <input 
            type="month" 
            className="w-full p-5 bg-gray-50 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-pink-600" 
            value={selectedMonth} 
            onChange={(e) => setSelectedMonth(e.target.value)} 
          />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-2 flex items-center gap-2">
            <User size={14}/> ZZP'er
          </label>
          <select 
            className="w-full p-5 bg-gray-50 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-pink-600" 
            value={selectedZzpId} 
            onChange={(e) => setSelectedZzpId(e.target.value)}
          >
            <option value="all">Alle ZZP'ers</option>
            {zzps.filter(z => z.role === 'zzp').map(z => (
              <option key={z.uid} value={z.uid}>{getUserDisplayName(z)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-pink-600 p-8 rounded-[2.5rem] text-white shadow-xl flex items-center justify-between group overflow-hidden relative">
          <div className="relative z-10">
            <p className="text-[10px] font-black uppercase opacity-80 mb-1">Totaal Uren</p>
            <p className="text-4xl font-black">{totalHours.toFixed(1)}u</p>
          </div>
          <TrendingUp size={80} className="absolute -right-5 opacity-10 group-hover:scale-110 transition-transform" />
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] border shadow-sm flex items-center justify-between group">
          <div>
            <p className="text-[10px] font-black uppercase text-gray-400 mb-1 tracking-widest">Totaal Fee (10%)</p>
            <p className="text-4xl font-black text-pink-600">€ {totalCommission.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</p>
          </div>
          <Percent size={48} className="text-pink-600 opacity-10 group-hover:rotate-12 transition-transform" />
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border shadow-sm overflow-hidden">
        <div className="px-8 py-6 bg-gray-50/50 border-b flex justify-between items-center">
          <h2 className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Preview Fee Data</h2>
          <span className="bg-pink-100 text-pink-600 text-[10px] font-black px-3 py-1 rounded-full uppercase">Rate Based</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="text-[10px] font-black uppercase text-gray-400">
              <tr>
                <th className="px-8 py-5 text-center">Datum</th>
                <th className="px-8 py-5">ZZP'er</th>
                <th className="px-8 py-5 text-right">Uren</th>
                <th className="px-8 py-5 text-right">Fee Bedrag</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredRegistrations.map(reg => {
                const assignment = assignments.find(a => a.id === reg.assignmentId);
                const zzp = zzps.find(z => z.uid === reg.uid);
                const rateValue = Number(assignment?.rate) || 0;
                const lineFee = (Number(reg.duration) * rateValue) * 0.10

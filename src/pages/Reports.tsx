import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthProvider';
import { TimeRegistration, Assignment, Client } from '../types';
import { Download, Calendar, User, Building2, TrendingUp, Calculator, Percent } from 'lucide-react';
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

  useEffect(() => { fetchData(); }, [profile]);

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
      setAssignments(assignmentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Assignment)));
      setRegistrations(regsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TimeRegistration)));
      
      if (!isAdmin) setSelectedZzpId(profile.uid);
    } catch (error) { console.error('Error:', error); } finally { setLoading(false); }
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

  const totalHours = filteredRegistrations.reduce((acc, reg) => acc + (parseFloat(String(reg.duration)) || 0), 0);

  // BEREKENING: (Uren * Tarief) / 10 (oftewel 10% commissie)
  const totalCommission = filteredRegistrations.reduce((acc, reg) => {
    const assignment = assignments.find(a => a.id === reg.assignmentId);
    const hourlyRate = parseFloat(String(assignment?.hourlyRate)) || 0;
    const duration = parseFloat(String(reg.duration)) || 0;
    const lineTotal = duration * hourlyRate;
    return acc + (lineTotal / 10);
  }, 0);

  const loadImage = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = url;
      img.onload = () => resolve(img);
      img.onerror = reject;
    });
  };

  const generatePDF = async () => {
    const doc = new jsPDF();
    const logoUrl = '/MIJNZORGZUSTER.jpg'; 
    
    try {
      const img = await loadImage(logoUrl);
      doc.addImage(img, 'JPEG', 14, 10, 45, 15);
    } catch (e) { console.warn("Logo niet gevonden"); }

    doc.setFontSize(22);
    doc.setTextColor(219, 39, 119); 
    doc.text('Commissie Overzicht (10%)', 14, 38);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Periode: ${format(parseISO(`${selectedMonth}-01`), 'MMMM yyyy', { locale: nl })}`, 14, 46);
    doc.text(`Export datum: ${format(new Date(), 'dd-MM-yyyy HH:mm')}`, 14, 51);

    const tableData = filteredRegistrations.map(reg => {
      const assignment = assignments.find(a => a.id === reg.assignmentId);
      const zzp = zzps.find(z => z.uid === reg.uid);
      const client = clients.find(c => c.id === assignment?.clientId);
      const duration = parseFloat(String(reg.duration)) || 0;
      const hourlyRate = parseFloat(String(assignment?.hourlyRate)) || 0;
      const commission = (duration * hourlyRate) / 10;
      
      return [
        format(parseISO(reg.date), 'dd-MM-yyyy'),
        getUserDisplayName(zzp),
        client?.name || 'Onbekend',
        `${duration.toFixed(1)}u`,
        `€ ${commission.toFixed(2)}`
      ];
    });

    autoTable(doc, {
      startY: 58,
      head: [['Datum', 'ZZP\'er', 'Opdrachtgever', 'Uren', 'Fee (10%)']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [219, 39, 119] },
      foot: [['TOTAAL COMMISSIE', '', '', `${totalHours.toFixed(1)}u`, `€ ${totalCommission.toFixed(2)}`]],
      footStyles: { fillColor: [243, 244, 246], textColor: [0, 0, 0], fontStyle: 'bold' }
    });

    doc.save(`Commissie_Rapport_${selectedMonth}.pdf`);
  };

  if (loading) return <div className="p-20 text-center animate-pulse text-pink-600 font-bold text-xs tracking-widest uppercase">Laden...</div>;

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 py-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tight uppercase">Rapportage</h1>
          <p className="text-gray-500 font-medium text-lg">Fee berekening (10%) op basis van goedgekeurde uren.</p>
        </div>
        <button 
          onClick={generatePDF} 
          disabled={filteredRegistrations.length === 0}
          className="flex items-center justify-center gap-3 rounded-2xl bg-[#111827] px-8 py-4 text-white font-black hover:bg-black disabled:opacity-30 transition-all shadow-xl uppercase tracking-widest text-xs"
        >
          <Download size={20} />
          <span>Export Fee PDF</span>
        </button>
      </header>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
        <FilterSelect label="Maand" icon={<Calendar size={16}/>} type="month" value={selectedMonth} onChange={setSelectedMonth} />
        {profile?.role === 'admin' && (
          <FilterSelect 
            label="ZZP'er" 
            icon={<User size={16}/>} 
            value={selectedZzpId} 
            onChange={setSelectedZzpId} 
            options={zzps.filter(z => z.role === 'zzp').map(z => ({ value: z.uid, label: getUserDisplayName(z) }))} 
            allowAll 
          />
        )}
        <FilterSelect 
          label="Opdrachtgever" 
          icon={<Building2 size={16}/>} 
          value={selectedClientId} 
          onChange={setSelectedClientId} 
          options={clients.map(c => ({ value: c.id, label: c.name }))} 
          allowAll 
        />
      </div>

      {/* Statistieken */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-pink-600 p-8 rounded-[2.5rem] text-white shadow-lg flex items-center justify-between group overflow-hidden relative">
          <div className="relative z-10">
            <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-1">Totaal Uren</p>
            <p className="text-4xl font-black">{totalHours.toFixed(1)}u</p>
          </div>
          <TrendingUp size={80} className="absolute -right-5 opacity-10 group-hover:scale-110 transition-transform" />
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex items-center justify-between group">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Totaal Fee (10%)</p>
            <p className="text-4xl font-black text-pink-600">€ {totalCommission.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</p>
          </div>
          <Percent size={40} className="text-pink-600 opacity-20 group-hover:rotate-12 transition-transform" />
        </div>
      </div>

      {/* Tabel */}
      <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-8 py-6 border-b border-gray-50 bg-gray-50/30 flex justify-between items-center">
          <h2 className="font-black text-gray-900 uppercase tracking-widest text-[10px]">Preview Fee Data</h2>
          <span className="text-[10px] font-black text-pink-600 bg-pink-50 px-3 py-1 rounded-full uppercase">Fee: 10%</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-white text-[10px] font-black uppercase tracking-widest text-gray-400">
              <tr>
                <th className="px-8 py-5">Datum</th>
                <th className="px-8 py-5">ZZP'er</th>
                <th className="px-8 py-5 text-right">Uren</th>
                <th className="px-8 py-5 text-right">Fee Bedrag</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredRegistrations.map((reg) => {
                const zzp = zzps.find(z => z.uid === reg.uid);
                const assignment = assignments.find(a => a.id === reg.assignmentId);
                const duration = parseFloat(String(reg.duration)) || 0;
                const hourlyRate = parseFloat(String(assignment?.hourlyRate)) || 0;
                const fee = (duration * hourlyRate) / 10;

                return (
                  <tr key={reg.id} className="hover:bg-gray-50/50">
                    <td className="px-8 py-5 font-bold text-gray-700">{format(parseISO(reg.date), 'dd MMM yyyy', { locale: nl })}</td>
                    <td className="px-8 py-5 text-gray-600 font-medium">{getUserDisplayName(zzp)}</td>
                    <td className="px-8 py-5 text-right font-black">{duration.toFixed(1)}u</td>
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

const FilterSelect = ({ label, icon, value, onChange, options = [], type = "select", allowAll = false }: any) => (
  <div className="space-y-2">
    <label className="flex items-center gap-2 text-[10px] font-black uppercase text-gray-400 tracking-widest ml-2">
      {icon} {label}
    </label>
    {type === "month" ? (
      <input type="month" value={value} onChange={(e) => onChange(e.target.value)} className="w-full p-5 bg-gray-50 rounded-2xl font-bold border-none focus:ring-2 focus:ring-pink-600 outline-none" />
    ) : (
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full p-5 bg-gray-50 rounded-2xl font-bold border-none focus:ring-2 focus:ring-pink-600 outline-none">
        {allowAll && <option value="all">Alle {label}s</option>}
        {options.map((opt: any) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
    )}
  </div>
);

export default Reports;

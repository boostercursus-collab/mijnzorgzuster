import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthProvider';
import { TimeRegistration, Assignment, Client } from '../types';
import { FileText, Download, Calendar, User, Building2, TrendingUp, Calculator } from 'lucide-react';
import { format, startOfMonth, endOfMonth, parseISO, isWithinInterval } from 'date-fns';
import { nl } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Importeer het logo zodat het pad tijdens de build wordt opgelost
import logoImage from '/src/pages/MIJNZORGZUSTER.jpg';

const Reports: React.FC = () => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [registrations, setRegistrations] = useState<TimeRegistration[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [zzps, setZzps] = useState<any[]>([]); 
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  // Filters
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [selectedZzpId, setSelectedZzpId] = useState<string>('all');
  const [selectedClientId, setSelectedClientId] = useState<string>('all');

  useEffect(() => {
    fetchData();
  }, [profile]);

  const getUserDisplayName = (user: any) => {
    if (!user) return 'Onbekend';
    return user.displayName || user.email || 'Gebruiker';
  };

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

    } catch (error) {
      console.error('Error fetching report data:', error);
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

  const showFee = profile?.role === 'admin' && (selectedClientId !== 'all' || selectedZzpId !== 'all');

  const totalHours = filteredRegistrations.reduce((acc, reg) => acc + (parseFloat(String(reg.duration)) || 0), 0);
  const totalAmount = filteredRegistrations.reduce((acc, reg) => {
    const assignment = assignments.find(a => a.id === reg.assignmentId);
    const rate = parseFloat(String(assignment?.hourlyRate)) || 0;
    return acc + ((parseFloat(String(reg.duration)) || 0) * rate);
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
    const monthLabel = format(parseISO(`${selectedMonth}-01`), 'MMMM yyyy', { locale: nl });
    
    try {
      // Gebruik de geïmporteerde logoImage variabele
      const img = await loadImage(logoImage);
      // Positie: x=14, y=10 | Grootte: breedte=45, hoogte=auto (15)
      doc.addImage(img, 'JPEG', 14, 10, 45, 15);
    } catch (e) {
      console.error("Logo kon niet worden geladen uit lokale bron:", e);
    }

    doc.setFontSize(22);
    doc.setTextColor(219, 39, 119); 
    doc.text('Urenrapportage', 14, 38);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Periode: ${monthLabel}`, 14, 46);
    doc.text(`Export datum: ${format(new Date(), 'dd-MM-yyyy HH:mm')}`, 14, 51);

    const tableData = filteredRegistrations.map(reg => {
      const assignment = assignments.find(a => a.id === reg.assignmentId);
      const zzpInfo = zzps.find(z => z.uid === reg.uid);
      const clientInfo = clients.find(c => c.id === assignment?.clientId);
      const duration = parseFloat(String(reg.duration)) || 0;
      const rate = parseFloat(String(assignment?.hourlyRate)) || 0;
      const total = duration * rate;
      
      const row = [
        format(parseISO(reg.date), 'dd-MM-yyyy'),
        getUserDisplayName(zzpInfo),
        clientInfo?.name || 'Onbekend',
        duration.toFixed(1) + 'u',
      ];

      if (showFee) row.push(`€ ${(total * 0.05).toFixed(2)}`);
      row.push(`€ ${total.toFixed(2)}`);
      return row;
    });

    const head = ['Datum', 'ZZP\'er', 'Opdrachtgever', 'Uren'];
    if (showFee) head.push('Fee (5%)');
    head.push('Subtotaal');

    autoTable(doc, {
      startY: 58,
      head: [head],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [219, 39, 119], fontStyle: 'bold' },
      foot: [[
        'TOTAAL', 
        '', 
        '', 
        `${totalHours.toFixed(1)}u`, 
        ...(showFee ? [`€ ${(totalAmount * 0.05).toFixed(2)}`] : []),
        `€ ${totalAmount.toFixed(2)}`
      ]],
      footStyles: { fillColor: [243, 244, 246], textColor: [17, 24, 39], fontStyle: 'bold' },
      styles: { fontSize: 9 },
    });

    doc.save(`Rapportage_${selectedMonth}.pdf`);
  };

  if (loading) return <div className="p-20 text-center text-pink-600 font-black uppercase tracking-widest animate-pulse">Rapporten laden...</div>;

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 py-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tight uppercase">Rapportage</h1>
          <p className="text-gray-500 font-medium text-lg">Maandoverzicht van goedgekeurde uren.</p>
        </div>
        <button
          onClick={generatePDF}
          disabled={filteredRegistrations.length === 0}
          className="flex items-center justify-center gap-3 rounded-2xl bg-[#111827] px-8 py-4 text-white font-black hover:bg-black disabled:opacity-30 transition-all shadow-xl uppercase tracking-widest text-xs"
        >
          <Download size={20} />
          <span>Export PDF</span>
        </button>
      </header>

      {/* Filter Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm transition-all hover:shadow-md">
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
        <FilterSelect label="Opdrachtgever" icon={<Building2 size={16}/>} value={selectedClientId} onChange={setSelectedClientId} options={clients.map(c => ({ value: c.id, label: c.name }))} allowAll />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-pink-600 p-8 rounded-[2.5rem] text-white shadow-lg flex items-center justify-between group overflow-hidden relative">
          <div className="relative z-10">
            <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-1">Totaal Uren (Selectie)</p>
            <p className="text-4xl font-black">{totalHours.toFixed(1)}u</p>
          </div>
          <TrendingUp size={80} className="absolute -right-5 opacity-10 group-hover:scale-110 transition-transform" />
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex items-center justify-between group">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Totaal Bedrag</p>
            <p className="text-4xl font-black text-gray-900">€ {totalAmount.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</p>
          </div>
          <Calculator size={40} className="text-pink-600 opacity-20 group-hover:rotate-12 transition-transform" />
        </div>
      </div>

      {/* Preview Table */}
      <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-8 py-6 border-b border-gray-50 bg-gray-50/30">
          <h2 className="font-black text-gray-900 uppercase tracking-widest text-[10px]">Preview goedgekeurde uren</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-white text-[10px] font-black uppercase tracking-widest text-gray-400">
              <tr>
                <th className="px-8 py-5">Datum</th>
                <th className="px-8 py-5">ZZP'er</th>
                <th className="px-8 py-5 text-right">Uren</th>
                <th className="px-8 py-5 text-right">Subtotaal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredRegistrations.map((reg) => {
                const zzp = zzps.find(z => z.uid === reg.uid);
                const assignment = assignments.find(a => a.id === reg.assignmentId);
                const duration = parseFloat(String(reg.duration)) || 0;
                const rate = parseFloat(String(assignment?.hourlyRate)) || 0;
                const total = duration * rate;

                return (
                  <tr key={reg.id} className="hover:bg-gray-50/50">
                    <td className="px-8 py-5 font-bold text-gray-700">{format(parseISO(reg.date), 'dd MMM yyyy', { locale: nl })}</td>
                    <td className="px-8 py-5 text-gray-600 font-medium">{getUserDisplayName(zzp)}</td>
                    <td className="px-8 py-5 text-right font-black">{duration.toFixed(1)}u</td>
                    <td className="px-8 py-5 text-right font-black text-pink-600">€ {total.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</td>
                  </tr>
                );
              })}
              {filteredRegistrations.length === 0 && (
                <tr><td colSpan={4} className="px-8 py-20 text-center text-gray-400 font-bold uppercase tracking-widest text-xs">Geen data voor deze selectie.</td></tr>
              )}
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

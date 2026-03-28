import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthProvider';
import { TimeRegistration, Assignment, Client, UserProfile } from '../types';
import { FileText, Download, Calendar, User, Building2, TrendingUp } from 'lucide-react';
import { format, startOfMonth, endOfMonth, parseISO, isWithinInterval } from 'date-fns';
import { nl } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const Reports: React.FC = () => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [registrations, setRegistrations] = useState<TimeRegistration[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [zzps, setZzps] = useState<UserProfile[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  // Filters
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [selectedZzpId, setSelectedZzpId] = useState<string>('all');
  const [selectedClientId, setSelectedClientId] = useState<string>('all');

  useEffect(() => {
    fetchData();
  }, [profile]);

  const fetchData = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const isAdmin = profile.role === 'admin';
      
      // Queries configureren op basis van rol
      const regsQuery = isAdmin 
        ? query(collection(db, 'timeRegistrations'), where('status', '==', 'approved'))
        : query(collection(db, 'timeRegistrations'), where('uid', '==', profile.uid), where('status', '==', 'approved'));

      const [clientsSnap, zzpsSnap, assignmentsSnap, regsSnap] = await Promise.all([
        getDocs(collection(db, 'clients')),
        isAdmin ? getDocs(query(collection(db, 'users'), where('role', '==', 'zzp'))) : Promise.resolve({ docs: [] }),
        getDocs(collection(db, 'assignments')),
        getDocs(regsQuery)
      ]);

      setClients(clientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client)));
      setZzps(zzpsSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)));
      setAssignments(assignmentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Assignment)));
      setRegistrations(regsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TimeRegistration)));
      
      // Als ZZP'er, zet de filter vast op eigen ID
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

  // Fee alleen tonen als er een specifieke selectie is gemaakt (niet bij "alles")
  const showFee = profile?.role === 'admin' && ((selectedClientId !== 'all') || (selectedZzpId !== 'all'));

  const generatePDF = async () => {
    const doc = new jsPDF();
    const monthLabel = format(parseISO(`${selectedMonth}-01`), 'MMMM yyyy', { locale: nl });
    
    // Header & Logo
    doc.setFontSize(22);
    doc.setTextColor(219, 39, 119); // Pink-600
    doc.text('Urenrapportage', 14, 25);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Periode: ${monthLabel}`, 14, 33);
    doc.text(`Export datum: ${format(new Date(), 'dd-MM-yyyy HH:mm')}`, 14, 38);

    const activeZzp = zzps.find(z => z.uid === selectedZzpId) || (profile?.role === 'zzp' ? profile : null);
    if (activeZzp) doc.text(`ZZP'er: ${activeZzp.firstName} ${activeZzp.lastName}`, 14, 46);

    const tableData = filteredRegistrations.map(reg => {
      const assignment = assignments.find(a => a.id === reg.assignmentId);
      const zzpInfo = zzps.find(z => z.uid === reg.uid) || (profile?.uid === reg.uid ? profile : null);
      const clientInfo = clients.find(c => c.id === assignment?.clientId);
      const duration = Number(reg.duration) || 0;
      const total = duration * (assignment?.hourlyRate || 0);
      
      const row = [
        format(parseISO(reg.date), 'dd-MM-yyyy'),
        zzpInfo ? `${zzpInfo.firstName} ${zzpInfo.lastName}` : 'Onbekend',
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
      startY: 55,
      head: [head],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [219, 39, 119], fontStyle: 'bold' },
      styles: { fontSize: 9 },
    });

    doc.save(`Rapportage_${selectedMonth}.pdf`);
  };

  if (loading) return <div className="p-12 text-center text-pink-600 font-bold">Rapporten genereren...</div>;

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 py-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-gray-900">Rapportage</h1>
          <p className="text-gray-500 font-medium">Download overzichten van goedgekeurde uren.</p>
        </div>
        <button
          onClick={generatePDF}
          disabled={filteredRegistrations.length === 0}
          className="flex items-center justify-center gap-3 rounded-2xl bg-[#111827] px-8 py-4 text-white font-bold hover:bg-black disabled:opacity-30 transition-all shadow-xl"
        >
          <Download size={20} />
          <span>Export naar PDF</span>
        </button>
      </header>

      {/* Filter Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
        <FilterSelect 
          label="Maand" 
          icon={<Calendar size={16}/>} 
          type="month" 
          value={selectedMonth} 
          onChange={setSelectedMonth} 
        />
        
        {profile?.role === 'admin' && (
          <FilterSelect 
            label="ZZP'er" 
            icon={<User size={16}/>} 
            value={selectedZzpId} 
            onChange={setSelectedZzpId}
            options={zzps.map(z => ({ value: z.uid, label: `${z.firstName} ${z.lastName}` }))}
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

      {/* Preview Table */}
      <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-8 py-6 border-b border-gray-50 flex justify-between items-center">
          <h2 className="font-black text-gray-900 uppercase tracking-widest text-sm">Preview goedgekeurde uren</h2>
          <TrendingUp className="text-pink-600" size={20} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50/50 text-[10px] font-black uppercase tracking-widest text-gray-400">
              <tr>
                <th className="px-8 py-4">Datum</th>
                <th className="px-8 py-4">ZZP'er</th>
                <th className="px-8 py-4 text-right">Uren</th>
                <th className="px-8 py-4 text-right">Totaal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredRegistrations.map((reg) => {
                const zzp = zzps.find(z => z.uid === reg.uid) || (profile?.uid === reg.uid ? profile : null);
                const assignment = assignments.find(a => a.id === reg.assignmentId);
                const total = (Number(reg.duration) || 0) * (assignment?.hourlyRate || 0);

                return (
                  <tr key={reg.id} className="hover:bg-gray-50/50">
                    <td className="px-8 py-5 font-bold">{format(parseISO(reg.date), 'dd MMM yyyy', { locale: nl })}</td>
                    <td className="px-8 py-5 text-gray-600 font-medium">{zzp?.firstName} {zzp?.lastName}</td>
                    <td className="px-8 py-5 text-right font-black">{reg.duration}u</td>
                    <td className="px-8 py-5 text-right font-black text-pink-600">€ {total.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</td>
                  </tr>
                );
              })}
              {filteredRegistrations.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-8 py-20 text-center text-gray-400 font-bold uppercase tracking-widest text-xs">
                    Geen goedgekeurde data voor deze selectie.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// Hulpsysteem voor filters
const FilterSelect = ({ label, icon, value, onChange, options = [], type = "select", allowAll = false }: any) => (
  <div className="space-y-2">
    <label className="flex items-center gap-2 text-[10px] font-black uppercase text-gray-400 tracking-widest">
      {icon} {label}
    </label>
    {type === "month" ? (
      <input type="month" value={value} onChange={(e) => onChange(e.target.value)} className="w-full p-4 bg-gray-50 rounded-2xl font-bold border-none focus:ring-2 focus:ring-pink-600" />
    ) : (
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full p-4 bg-gray-50 rounded-2xl font-bold border-none focus:ring-2 focus:ring-pink-600">
        {allowAll && <option value="all">Alle {label}s</option>}
        {options.map((opt: any) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
    )}
  </div>
);

export default Reports;

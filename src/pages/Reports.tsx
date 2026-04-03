import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthProvider';
import { TimeRegistration, Assignment, Client } from '../types';
import { Download, Calendar, User, Building2, TrendingUp, Calculator } from 'lucide-react';
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
    } catch (error) { console.error('Error fetching data:', error); } finally { setLoading(false); }
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
  const totalAmount = filteredRegistrations.reduce((acc, reg) => {
    const assignment = assignments.find(a => a.id === reg.assignmentId);
    return acc + ((parseFloat(String(reg.duration)) || 0) * (parseFloat(String(assignment?.hourlyRate)) || 0));
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
    const logoUrl = '/MIJNZORGZUSTER.jpg'; // Verwijst naar public map
    
    try {
      const img = await loadImage(logoUrl);
      doc.addImage(img, 'JPEG', 14, 10, 45, 15);
    } catch (e) { console.warn("Logo niet gevonden in public map"); }

    doc.setFontSize(22);
    doc.setTextColor(219, 39, 119); 
    doc.text('Urenrapportage', 14, 38);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Periode: ${format(parseISO(`${selectedMonth}-01`), 'MMMM yyyy', { locale: nl })}`, 14, 46);
    doc.text(`Export datum: ${format(new Date(), 'dd-MM-yyyy HH:mm')}`, 14, 51);

    const tableData = filteredRegistrations.map(reg => {
      const assignment = assignments.find(a => a.id === reg.assignmentId);
      const zzp = zzps.find(z => z.uid === reg.uid);
      const client = clients.find(c => c.id === assignment?.clientId);
      const duration = parseFloat(String(reg.duration)) || 0;
      const total = duration * (parseFloat(String(assignment?.hourlyRate)) || 0);
      return [format(parseISO(reg.date), 'dd-MM-yyyy'), getUserDisplayName(zzp), client?.name || 'Onbekend', `${duration.toFixed(1)}u`, `€ ${total.toFixed(2)}` ];
    });

    autoTable(doc, {
      startY: 58,
      head: [['Datum', 'ZZP\'er', 'Opdrachtgever', 'Uren', 'Subtotaal']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [219, 39, 119] },
      foot: [['TOTAAL', '', '', `${totalHours.toFixed(1)}u`, `€ ${totalAmount.toFixed(2)}`]],
      footStyles: { fillColor: [243, 244, 246], textColor: [0, 0, 0] }
    });

    doc.save(`Rapportage_${selectedMonth}.pdf`);
  };

  if (loading) return <div className="p-20 text-center animate-pulse">Laden...</div>;

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 py-8">
      <header className="flex justify-between items-center">
        <h1 className="text-4xl font-black uppercase">Rapportage</h1>
        <button onClick={generatePDF} className="bg-black text-white px-8 py-4 rounded-2xl flex gap-2 text-xs font-black">
          <Download size={18} /> EXPORT PDF
        </button>
      </header>
      {/* Rest van je UI componenten (Filters, Stats, Tabel) */}
    </div>
  );
};

export default Reports;

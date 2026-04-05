import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthProvider';
import { TimeRegistration, Client } from '../types';
import { Download, Calendar, User, Building2, TrendingUp, Percent, FileText } from 'lucide-react';
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

  const generateInvoice = () => {
    const doc = new jsPDF();
    const selectedClient = clients.find(c => c.id === selectedClientId);
    const selectedZzp = zzps.find(z => z.uid === selectedZzpId);
    
    doc.addImage(logo, 'JPEG', 14, 10, 35, 22);
    
    doc.setFontSize(20);
    doc.setTextColor(219, 39, 119);
    doc.text('FACTUUR', 140, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text(`Factuurnummer: ${format(new Date(), 'yyyyMM')}-${Math.floor(1000 + Math.random() * 9000)}`, 140, 28);
    doc.text(`Datum: ${format(new Date(), 'dd-MM-yyyy')}`, 140, 33);

    // Afzender
    doc.setFont(undefined, 'bold');
    doc.text('Mijnzorgzuster.nl', 14, 45);
    doc.setFont(undefined, 'normal');
    doc.text('Administratie@mijnzorgzuster.nl', 14, 50);

    // Ontvanger (ZZP of Opdrachtgever)
    doc.setFont(undefined, 'bold');
    doc.text('Factuur aan:', 14, 65);
    doc.setFont(undefined, 'normal');
    if (selectedZzpId !== 'all' && selectedZzp) {
      doc.text(selectedZzp.displayName || selectedZzp.email, 14, 70);
      doc.text('ZZP Dienstverlener', 14, 75);
    } else if (selectedClientId !== 'all' && selectedClient) {
      doc.text(selectedClient.name, 14, 70);
      doc.text(selectedClient.email || '', 14, 75);
    } else {
      doc.text('Verzamel-factuur', 14, 70);
    }

    let subtotal = 0;
    const invoiceRows = filteredRegistrations.map(reg => {
      const { fee, clientName } = getFeeData(reg, 0.05);
      subtotal += fee;
      const zzp = zzps.find(z => z.uid === reg.uid);
      return [
        format(parseISO(reg.date), 'dd-MM-yyyy'),
        `Bemiddelingsfee uren: ${zzp?.displayName || 'ZZP'} @ ${clientName}`,
        `${Number(reg.duration).toFixed(1)}u`,
        `€ ${fee.toFixed(2)}`
      ];
    });

    autoTable(doc, {
      startY: 85,
      head: [['Datum', 'Omschrijving', 'Uren', 'Bedrag']],
      body: invoiceRows,
      headStyles: { fillColor: [31, 41, 55] },
      columnStyles: { 3: { halign: 'right' } }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    const btw = subtotal * 0.21;
    doc.text('Subtotaal:', 140, finalY);
    doc.text(`€ ${subtotal.toFixed(2)}`, 190, finalY, { align: 'right' });
    doc.text('BTW (21%):', 140, finalY + 7);
    doc.text(`€ ${btw.toFixed(2)}`, 190, finalY + 7, { align: 'right' });
    doc.setFont(undefined, 'bold');
    doc.text('Totaal te betalen:', 140, finalY + 15);
    doc.text(`€ ${(subtotal + btw).toFixed(2)}`, 190, finalY + 15, { align: 'right' });

    doc.save(`Factuur_Mijnzorgzuster_${selectedMonth}.pdf`);
  };

  const generatePDF = () => {
    const doc = new jsPDF();
    doc.addImage(logo, 'JPEG', 14, 10, 30, 20);
    doc.setFontSize(18);
    doc.text('Urenrapportage Mijnzorgzuster.nl', 14, 40);
    const tableData = filteredRegistrations.map(reg => {
      const { fee, clientName } = getFeeData(reg, 0.05);
      const zzp = zzps.find(z => z.uid === reg.uid);
      return [format(parseISO(reg.date), 'dd-MM-yyyy'), zzp?.displayName || 'Onbekend', clientName, `${Number(reg.duration).toFixed(1)}u`, `€ ${fee.toFixed(2)}` ];
    });
    autoTable(doc, {
      startY: 55,
      head: [['Datum', 'ZZP\'er', 'Opdrachtgever', 'Uren', 'Fee (5%)']],
      body: tableData,
      headStyles: { fillColor: [219, 39, 119] }
    });
    doc.save(`Urenrapportage_${selectedMonth}.pdf`);
  };

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto font-sans">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tight">Rapportage</h1>
          <p className="text-gray-500 font-medium italic">Financieel overzicht & Facturatie</p>
        </div>
        <div className="flex gap-3">
          <button onClick={generateInvoice} className="bg-white border-2 border-black text-black px-6 py-4 rounded-2xl flex gap-2 text-xs font-black uppercase hover:bg-gray-50 transition-all shadow-sm">
            <FileText size={18} /> Factuur PDF (5%)
          </button>
          <button onClick={generatePDF} className="bg-black text-white px-6 py-4 rounded-2xl flex gap-2 text-xs font-black uppercase shadow-xl hover:opacity-80 transition-all">
            <Download size={18} /> Uren PDF
          </button>
        </div>
      </header>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-white p-8 rounded-[2.5rem] border shadow-sm">
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-2 flex items-center gap-2"><Calendar size={14}/> Periode</label>
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

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-pink-600 p-8 rounded-[2.5rem] text-white shadow-xl flex items-center justify-between">
          <div><p className="text-[10px] font-black uppercase opacity-80">Totaal Uren</p><p className="text-4xl font-black">{totalHours.toFixed(1)}u</p></div>
          <TrendingUp size={60} className="opacity-20" />
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] border shadow-sm flex items-center justify-between">
          <div><p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Interne Marge (10%)</p><p className="text-4xl font-black text-pink-600">€ {totalFeeInternal.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</p></div>
          <Percent size={48} className="text-pink-600 opacity-10" />
        </div>
      </div>

      {/* Preview Table */}
      <div className="bg-white rounded-[2.5rem] border shadow-sm overflow-hidden">
        <div className="px-8 py-5 bg-gray-50 border-b flex justify-between items-center">
           <h2 className="text-[10px] font-black uppercase text-gray-400">Preview goedgekeurde uren</h2>
           <span className="text-[10px] font-bold text-pink-600">Alleen status: Akkoord</span>
        </div>
        <table className="w-full text-left">
          <thead className="text-[10px] font-black uppercase text-gray-400 border-b">
            <tr>
              <th className="px-8 py-4">Datum</th>
              <th className="px-8 py-4">ZZP'er</th>
              <th className="px-8 py-4">Opdrachtgever</th>
              <th className="px-8 py-4 text-right">Uren</th>
              <th className="px-8 py-4 text-right">Marge (10%)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filteredRegistrations.map(reg => {
              const { fee, clientName } = getFeeData(reg, 0.10);
              const zzp = zzps.find(z => z.uid === reg.uid);
              return (
                <tr key={reg.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-8 py-4 font-bold">{format(parseISO(reg.date), 'dd MMM yyyy', { locale: nl })}</td>
                  <td className="px-8 py-4 text-gray-600">{zzp?.displayName || zzp?.email}</td>
                  <td className="px-8 py-4 text-gray-600">{clientName}</td>
                  <td className="px-8 py-4 text-right font-black">{Number(reg.duration).toFixed(1)}u</td>
                  <td className="px-8 py-4 text-right font-black text-pink-600">€ {fee.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</td>
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

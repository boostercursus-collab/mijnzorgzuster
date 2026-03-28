import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthProvider';
import { TimeRegistration, Assignment, Client, UserProfile } from '../types';
import { FileText, Download, Filter, Calendar, User, Building2 } from 'lucide-react';
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
    const fetchData = async () => {
      try {
        const [clientsSnap, zzpsSnap, assignmentsSnap, regsSnap] = await Promise.all([
          getDocs(collection(db, 'clients')),
          getDocs(query(collection(db, 'users'), where('role', '==', 'zzp'))),
          getDocs(collection(db, 'assignments')),
          getDocs(query(collection(db, 'timeRegistrations'), where('status', '==', 'approved')))
        ]);

        setClients(clientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client)));
        setZzps(zzpsSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)));
        setAssignments(assignmentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Assignment)));
        setRegistrations(regsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TimeRegistration)));
      } catch (error) {
        console.error('Error fetching report data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const filteredRegistrations = registrations.filter(reg => {
    const regDate = parseISO(reg.date);
    const monthStart = startOfMonth(parseISO(`${selectedMonth}-01`));
    const monthEnd = endOfMonth(monthStart);
    
    const matchesMonth = isWithinInterval(regDate, { start: monthStart, end: monthEnd });
    // Aangepast naar .uid
    const matchesZzp = selectedZzpId === 'all' || reg.uid === selectedZzpId;
    
    const assignment = assignments.find(a => a.id === reg.assignmentId);
    const matchesClient = selectedClientId === 'all' || (assignment && assignment.clientId === selectedClientId);

    return matchesMonth && matchesZzp && matchesClient;
  });

  const showFee = (selectedClientId !== 'all' && selectedZzpId === 'all') || (selectedZzpId !== 'all' && selectedClientId === 'all');

  const generatePDF = async () => {
    const doc = new jsPDF();
    const monthLabel = format(parseISO(`${selectedMonth}-01`), 'MMMM yyyy', { locale: nl });
    
    try {
      const logoUrl = 'https://mijnzorgzuster.nl/wp-content/uploads/2026/03/cropped-MIJNZORGZUSTER-2.jpg';
      const img = new Image();
      img.src = logoUrl;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
      doc.addImage(img, 'PNG', 14, 10, 40, 15);
    } catch (e) {
      console.error('Could not load logo for PDF', e);
    }

    doc.setFontSize(20);
    doc.setTextColor(219, 39, 119); 
    doc.text('Urenrapportage / Factuurbasis', 14, 35);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Periode: ${monthLabel}`, 14, 43);
    doc.text(`Gegenereerd op: ${format(new Date(), 'dd-MM-yyyy HH:mm')}`, 14, 48);
    doc.setFont('helvetica', 'bold');
    doc.text('Mijnzorgzuster.nl', 14, 53);
    doc.setFont('helvetica', 'normal');

    const zzp = zzps.find(z => z.uid === selectedZzpId);
    const client = clients.find(c => c.id === selectedClientId);

    if (zzp) doc.text(`ZZP'er: ${zzp.firstName} ${zzp.lastName}`, 14, 60);
    if (client) doc.text(`Opdrachtgever: ${client.name}`, 14, 65);

    const tableData = filteredRegistrations.map(reg => {
      const assignment = assignments.find(a => a.id === reg.assignmentId);
      // Gebruik uid ipv zzpId
      const zzpInfo = zzps.find(z => z.uid === reg.uid);
      const clientInfo = clients.find(c => c && assignment && c.id === assignment.clientId);
      const total = reg.totalHours * (assignment?.hourlyRate || 0);
      const fee = total * 0.05;
      
      const row = [
        format(parseISO(reg.date), 'dd-MM-yyyy'),
        zzpInfo ? `${zzpInfo.firstName} ${zzpInfo.lastName}` : 'Onbekend',
        clientInfo ? clientInfo.name : 'Onbekend',
        assignment ? assignment.title : 'Onbekend',
        reg.totalHours.toFixed(1),
      ];

      if (showFee) {
        row.push(`€ ${fee.toFixed(2)}`);
      }

      row.push(`€ ${total.toFixed(2)}`);
      return row;
    });

    const totalHours = filteredRegistrations.reduce((sum, reg) => sum + reg.totalHours, 0);
    const totalAmount = filteredRegistrations.reduce((sum, reg) => {
      const assignment = assignments.find(a => a.id === reg.assignmentId);
      return sum + (reg.totalHours * (assignment?.hourlyRate || 0));
    }, 0);
    const totalFee = totalAmount * 0.05;

    const head = ['Datum', 'ZZP\'er', 'Opdrachtgever', 'Opdracht', 'Uren'];
    if (showFee) head.push('Fee (5%)');
    head.push('Totaal');

    const foot = ['', '', '', 'TOTAAL', totalHours.toFixed(1)];
    if (showFee) foot.push(`€ ${totalFee.toFixed(2)}`);
    foot.push(`€ ${totalAmount.toFixed(2)}`);

    autoTable(doc, {
      startY: 75,
      head: [head],
      body: tableData,
      foot: [foot],
      theme: 'striped',
      headStyles: { fillColor: [219, 39, 119] },
      footStyles: { fillColor: [243, 244, 246], textColor: [0, 0, 0], fontStyle: 'bold' }
    });

    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        'Mijnzorgzuster.nl - Uw partner in zorgbemiddeling',
        doc.internal.pageSize.width / 2,
        doc.internal.pageSize.height - 10,
        { align: 'center' }
      );
    }

    doc.save(`Rapportage_${selectedMonth}_${zzp?.lastName || 'ZZP'}.pdf`);
  };

  if (loading) return <div className="p-12 text-center text-pink-600 font-bold">Rapporten laden...</div>;

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 py-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900">Rapportage & Facturatie</h1>
          <p className="text-gray-500">Genereer PDF rapportages op basis van goedgekeurde uren.</p>
        </div>
        <button
          onClick={generatePDF}
          disabled={filteredRegistrations.length === 0}
          className="flex items-center justify-center space-x-2 rounded-2xl bg-pink-600 px-6 py-3 text-white font-bold hover:bg-pink-700 disabled:opacity-50 transition-all shadow-lg shadow-pink-100"
        >
          <Download className="h-5 w-5" />
          <span>Download PDF</span>
        </button>
      </header>

      {/* Filters */}
      <div className="grid grid-cols-1 gap-6 rounded-[2rem] border border-gray-100 bg-white p-8 shadow-sm md:grid-cols-3">
        <div className="space-y-2">
          <label className="flex items-center space-x-2 text-xs font-black uppercase text-gray-400 tracking-widest">
            <Calendar className="h-4 w-4" />
            <span>Maand</span>
          </label>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-full rounded-xl border-gray-100 bg-gray-50 font-bold focus:border-pink-500 focus:ring-pink-500 py-3"
          />
        </div>

        <div className="space-y-2">
          <label className="flex items-center space-x-2 text-xs font-black uppercase text-gray-400 tracking-widest">
            <User className="h-4 w-4" />
            <span>ZZP'er</span>
          </label>
          <select
            value={selectedZzpId}
            onChange={(e) => setSelectedZzpId(e.target.value)}
            className="w-full rounded-xl border-gray-100 bg-gray-50 font-bold focus:border-pink-500 focus:ring-pink-500 py-3"
          >
            <option value="all">Alle ZZP'ers</option>
            {zzps.map(zzp => (
              <option key={zzp.uid} value={zzp.uid}>{zzp.firstName} {zzp.lastName}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="flex items-center space-x-2 text-xs font-black uppercase text-gray-400 tracking-widest">
            <Building2 className="h-4 w-4" />
            <span>Opdrachtgever</span>
          </label>
          <select
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            className="w-full rounded-xl border-gray-100 bg-gray-50 font-bold focus:border-pink-500 focus:ring-pink-500 py-3"
          >
            <option value="all">Alle Opdrachtgevers</option>
            {clients.map(client => (
              <option key={client.id} value={client.id}>{client.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Preview Table */}
      <div className="overflow-hidden rounded-[2rem] border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-50 bg-gray-50/50 px-8 py-5">
          <h2 className="font-black text-gray-900 uppercase tracking-widest text-sm">Preview ({filteredRegistrations.length} registraties)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-white text-[10px] font-black uppercase tracking-widest text-gray-400">
              <tr>
                <th className="px-8 py-4">Datum</th>
                <th className="px-8 py-4">ZZP'er</th>
                <th className="px-8 py-4">Opdrachtgever</th>
                <th className="px-8 py-4 text-right">Uren</th>
                {showFee && <th className="px-8 py-4 text-right">Fee (5%)</th>}
                <th className="px-8 py-4 text-right">Totaal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredRegistrations.map((reg) => {
                const zzp = zzps.find(z => z.uid === reg.uid);
                const assignment = assignments.find(a => a.id === reg.assignmentId);
                const client = clients.find(c => c.id === assignment?.clientId);
                const total = (reg.totalHours * (assignment?.hourlyRate || 0));
                const fee = total * 0.05;

                return (
                  <tr key={reg.id} className="hover:bg-pink-50/5 transition-colors">
                    <td className="whitespace-nowrap px-8 py-5 font-bold text-gray-900">{format(parseISO(reg.date), 'dd-MM-yyyy')}</td>
                    <td className="px-8 py-5 font-medium">{zzp ? `${zzp.firstName} ${zzp.lastName}` : '-'}</td>
                    <td className="px-8 py-5 text-gray-500">{client?.name || '-'}</td>
                    <td className="px-8 py-5 text-right font-black text-gray-900">{reg.totalHours.toFixed(1)}u</td>
                    {showFee && (
                      <td className="px-8 py-5 text-right font-bold text-pink-600">
                        € {fee.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}
                      </td>
                    )}
                    <td className="px-8 py-5 text-right font-black text-gray-900">
                      € {total.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                );
              })}
              {filteredRegistrations.length === 0 && (
                <tr>
                  <td colSpan={showFee ? 6 : 5} className="px-8 py-16 text-center text-gray-400 font-bold uppercase tracking-widest text-xs">
                    Geen goedgekeurde uren gevonden voor deze selectie.
                  </td>
                </tr>
              )}
            </tbody>
            {filteredRegistrations.length > 0 && (
              <tfoot className="bg-gray-900 text-white">
                <tr>
                  <td colSpan={3} className="px-8 py-5 text-right font-black uppercase tracking-widest text-xs">Totaaloverzicht</td>
                  <td className="px-8 py-5 text-right font-black">
                    {filteredRegistrations.reduce((sum, r) => sum + r.totalHours, 0).toFixed(1)}u
                  </td>
                  {showFee && (
                    <td className="px-8 py-5 text-right font-black text-pink-400">
                      € {filteredRegistrations.reduce((sum, reg) => {
                        const assignment = assignments.find(a => a.id === reg.assignmentId);
                        return sum + (reg.totalHours * (assignment?.hourlyRate || 0) * 0.05);
                      }, 0).toLocaleString('nl-NL', { minimumFractionDigits: 2 })}
                    </td>
                  )}
                  <td className="px-8 py-5 text-right font-black">
                    € {filteredRegistrations.reduce((sum, reg) => {
                      const assignment = assignments.find(a => a.id === reg.assignmentId);
                      return sum + (reg.totalHours * (assignment?.hourlyRate || 0));
                    }, 0).toLocaleString('nl-NL', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};

export default Reports;

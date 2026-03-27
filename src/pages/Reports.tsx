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
    const matchesZzp = selectedZzpId === 'all' || reg.zzpId === selectedZzpId;
    
    const assignment = assignments.find(a => a.id === reg.assignmentId);
    const matchesClient = selectedClientId === 'all' || (assignment && assignment.clientId === selectedClientId);

    return matchesMonth && matchesZzp && matchesClient;
  });

  const showFee = (selectedClientId !== 'all' && selectedZzpId === 'all') || (selectedZzpId !== 'all' && selectedClientId === 'all');

  const generatePDF = async () => {
    const doc = new jsPDF();
    const monthLabel = format(parseISO(`${selectedMonth}-01`), 'MMMM yyyy', { locale: nl });
    
    // Add Logo
    try {
      const logoUrl = 'https://www.mijnezorgzuster.nl/wp-content/uploads/2021/04/Logo-Mijn-Zorgzuster-RGB-1.png';
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

    // Header
    doc.setFontSize(20);
    doc.setTextColor(219, 39, 119); // Pink-600
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

    // Table Data
    const tableData = filteredRegistrations.map(reg => {
      const assignment = assignments.find(a => a.id === reg.assignmentId);
      const zzp = zzps.find(z => z.uid === reg.zzpId);
      const client = clients.find(c => c && assignment && c.id === assignment.clientId);
      const total = reg.totalHours * (assignment?.hourlyRate || 0);
      const fee = total * 0.05;
      
      const row = [
        format(parseISO(reg.date), 'dd-MM-yyyy'),
        zzp ? `${zzp.firstName} ${zzp.lastName}` : 'Onbekend',
        client ? client.name : 'Onbekend',
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

    // Footer
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

  if (loading) return <div className="p-8 text-center">Laden...</div>;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rapportage & Facturatie</h1>
          <p className="text-gray-600">Genereer PDF rapportages voor gewerkte uren.</p>
        </div>
        <button
          onClick={generatePDF}
          disabled={filteredRegistrations.length === 0}
          className="flex items-center space-x-2 rounded-lg bg-pink-600 px-4 py-2 text-white hover:bg-pink-700 disabled:opacity-50 transition-colors"
        >
          <Download className="h-5 w-5" />
          <span>Download PDF</span>
        </button>
      </header>

      {/* Filters */}
      <div className="grid grid-cols-1 gap-4 rounded-xl border bg-white p-6 shadow-sm md:grid-cols-3">
        <div className="space-y-2">
          <label className="flex items-center space-x-2 text-sm font-medium text-gray-700">
            <Calendar className="h-4 w-4" />
            <span>Maand</span>
          </label>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-full rounded-lg border-gray-300 shadow-sm focus:border-pink-500 focus:ring-pink-500"
          />
        </div>

        <div className="space-y-2">
          <label className="flex items-center space-x-2 text-sm font-medium text-gray-700">
            <User className="h-4 w-4" />
            <span>ZZP'er</span>
          </label>
          <select
            value={selectedZzpId}
            onChange={(e) => setSelectedZzpId(e.target.value)}
            className="w-full rounded-lg border-gray-300 shadow-sm focus:border-pink-500 focus:ring-pink-500"
          >
            <option value="all">Alle ZZP'ers</option>
            {zzps.map(zzp => (
              <option key={zzp.uid} value={zzp.uid}>{zzp.firstName} {zzp.lastName}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="flex items-center space-x-2 text-sm font-medium text-gray-700">
            <Building2 className="h-4 w-4" />
            <span>Opdrachtgever</span>
          </label>
          <select
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            className="w-full rounded-lg border-gray-300 shadow-sm focus:border-pink-500 focus:ring-pink-500"
          >
            <option value="all">Alle Opdrachtgevers</option>
            {clients.map(client => (
              <option key={client.id} value={client.id}>{client.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Preview Table */}
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="border-b bg-gray-50 p-4">
          <h2 className="font-semibold text-gray-900">Preview ({filteredRegistrations.length} registraties)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase text-gray-500">
              <tr>
                <th className="px-6 py-3">Datum</th>
                <th className="px-6 py-3">ZZP'er</th>
                <th className="px-6 py-3">Opdrachtgever</th>
                <th className="px-6 py-3 text-right">Uren</th>
                {showFee && <th className="px-6 py-3 text-right">Fee (5%)</th>}
                <th className="px-6 py-3 text-right">Totaal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredRegistrations.map((reg) => {
                const zzp = zzps.find(z => z.uid === reg.zzpId);
                const assignment = assignments.find(a => a.id === reg.assignmentId);
                const client = clients.find(c => c.id === assignment?.clientId);
                const total = (reg.totalHours * (assignment?.hourlyRate || 0));
                const fee = total * 0.05;

                return (
                  <tr key={reg.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-6 py-4">{format(parseISO(reg.date), 'dd-MM-yyyy')}</td>
                    <td className="px-6 py-4">{zzp ? `${zzp.firstName} ${zzp.lastName}` : '-'}</td>
                    <td className="px-6 py-4">{client?.name || '-'}</td>
                    <td className="px-6 py-4 text-right font-medium">{reg.totalHours.toFixed(1)}</td>
                    {showFee && (
                      <td className="px-6 py-4 text-right font-medium text-pink-600">
                        € {fee.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}
                      </td>
                    )}
                    <td className="px-6 py-4 text-right font-medium text-gray-900">
                      € {total.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                );
              })}
              {filteredRegistrations.length === 0 && (
                <tr>
                  <td colSpan={showFee ? 6 : 5} className="px-6 py-8 text-center text-gray-500">
                    Geen goedgekeurde uren gevonden voor deze selectie.
                  </td>
                </tr>
              )}
            </tbody>
            {filteredRegistrations.length > 0 && (
              <tfoot className="bg-gray-50 font-bold">
                <tr>
                  <td colSpan={3} className="px-6 py-4 text-right">TOTAAL</td>
                  <td className="px-6 py-4 text-right">
                    {filteredRegistrations.reduce((sum, r) => sum + r.totalHours, 0).toFixed(1)}
                  </td>
                  {showFee && (
                    <td className="px-6 py-4 text-right text-pink-600">
                      € {filteredRegistrations.reduce((sum, reg) => {
                        const assignment = assignments.find(a => a.id === reg.assignmentId);
                        return sum + (reg.totalHours * (assignment?.hourlyRate || 0) * 0.05);
                      }, 0).toLocaleString('nl-NL', { minimumFractionDigits: 2 })}
                    </td>
                  )}
                  <td className="px-6 py-4 text-right text-gray-900">
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

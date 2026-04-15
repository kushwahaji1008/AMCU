import React, { useState, useEffect } from 'react';
import { FileText, Download, Calendar, Search, User, Building2, ChevronRight, ChevronLeft, Printer, DollarSign, ShoppingCart, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { useLanguage } from '../LanguageContext';
import { reportApi, farmerApi, collectionApi } from '../services/api';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { pdfService } from '../services/pdfService';

export default function Billing() {
  const { profile } = useAuth();
  const { t } = useLanguage();
  const [view, setView] = useState<'menu' | 'farmer' | 'dairy' | 'payment' | 'purchase'>('menu');
  const [loading, setLoading] = useState(false);
  const [bills, setBills] = useState<any[]>([]);
  const [farmers, setFarmers] = useState<any[]>([]);
  const [selectedFarmerId, setSelectedFarmerId] = useState<string>('');
  
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [period, setPeriod] = useState<1 | 2 | 3>(1);

  // Purchase Book State
  const [purchaseDate, setPurchaseDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [purchaseShift, setPurchaseShift] = useState<'Morning' | 'Evening'>('Morning');
  const [purchaseData, setPurchaseData] = useState<any[]>([]);

  useEffect(() => {
    if (profile?.role === 'admin' || profile?.role === 'super_admin') {
      farmerApi.getAll().then(res => setFarmers(res.data)).catch(console.error);
    }
  }, [profile]);

  const fetchBills = async () => {
    setLoading(true);
    try {
      const res = await reportApi.getBills(year, month, period, selectedFarmerId || undefined);
      setBills(res.data);
    } catch (error) {
      console.error(error);
      toast.error('Failed to fetch bills');
    } finally {
      setLoading(false);
    }
  };

  const fetchPurchaseBook = async () => {
    setLoading(true);
    try {
      const res = await collectionApi.getDailyReport(purchaseDate);
      // Filter by shift
      const filtered = (res.data || []).filter((c: any) => c.shift === purchaseShift);
      setPurchaseData(filtered);
    } catch (error) {
      console.error(error);
      toast.error('Failed to fetch purchase book');
    } finally {
      setLoading(false);
    }
  };

  const handleFinalizeBills = async () => {
    if (bills.length === 0) {
      toast.error('No bills to finalize. Please view the register first.');
      return;
    }

    if (!window.confirm(`Are you sure you want to finalize and post ${bills.length} bills to the ledger? This will update farmer balances.`)) {
      return;
    }

    setLoading(true);
    try {
      const response = await reportApi.finalizeBills({
        year,
        month,
        period,
        dairyId: profile?.dairyId || ''
      });
      
      const { count, totalBills } = response.data;
      if (count === 0) {
        toast.info('All bills for this period were already finalized.');
      } else if (count < totalBills) {
        toast.success(`${count} new bills finalized. ${totalBills - count} were already finalized.`);
      } else {
        toast.success('All bills finalized and posted to ledger successfully');
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to finalize bills');
    } finally {
      setLoading(false);
    }
  };

  const downloadPurchasePDF = async () => {
    if (purchaseData.length === 0) {
      toast.error('No purchase data to export');
      return;
    }
    
    try {
      const doc = new jsPDF();
      const dairyName = profile?.dairyName || 'DugdhaSetu';
      const dairyAddress = profile?.address || '';
      const dairyContact = profile?.phone || '';
      
      // Header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text(dairyName, 105, 15, { align: 'center' });
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      if (dairyAddress) doc.text(dairyAddress, 105, 20, { align: 'center' });
      if (dairyContact) doc.text(`Contact: ${dairyContact}`, 105, 24, { align: 'center' });
      
      doc.line(14, 28, 196, 28);
      
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Milk Purchase Register', 105, 35, { align: 'center' });
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Date: ${format(new Date(purchaseDate), 'dd/MM/yyyy')}`, 14, 42);
      doc.text(`Shift: ${purchaseShift}`, 105, 42, { align: 'center' });
      doc.text(`Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 196, 42, { align: 'right' });
      
      // Table
      const tableData = purchaseData.map((c: any, index: number) => [
        index + 1,
        c.farmerName || c.farmerId,
        c.lacto || '-',
        c.quantity.toFixed(2),
        c.fat.toFixed(1),
        c.snf.toFixed(1),
        c.rate.toFixed(2),
        (c.amount || 0).toFixed(2)
      ]);

      const totalQty = purchaseData.reduce((sum, c) => sum + (c.quantity || 0), 0);
      const totalAmt = purchaseData.reduce((sum, c) => sum + (c.amount || 0), 0);

      autoTable(doc, {
        startY: 48,
        head: [['S.No', 'Farmer Name', 'Lacto', 'Qty (L)', 'Fat', 'SNF', 'Rate', 'Amount']],
        body: tableData,
        foot: [[
          'Total', '', '', 
          totalQty.toFixed(2), 
          '', 
          '', 
          '',
          totalAmt.toFixed(2)
        ]],
        theme: 'grid',
        headStyles: { fillColor: [41, 37, 36], textColor: 255, fontSize: 9 },
        bodyStyles: { fontSize: 8 },
        footStyles: { fillColor: [245, 245, 244], textColor: [41, 37, 36], fontStyle: 'bold', fontSize: 9 }
      });

      await pdfService.saveAndOpen(doc, `Purchase_Book_${purchaseDate}_${purchaseShift}.pdf`);
      toast.success('Purchase Register downloaded');
    } catch (error) {
      console.error('PDF generation failed:', error);
      toast.error('Failed to generate PDF');
    }
  };

  const getDaysInPeriod = () => {
    const days = [];
    let start = 1;
    let end = 10;
    if (period === 2) { start = 11; end = 20; }
    if (period === 3) { 
      start = 21; 
      end = new Date(year, month + 1, 0).getDate(); 
    }
    for (let i = start; i <= end; i++) {
      days.push(i);
    }
    return days;
  };

  const downloadPaymentPDF = async () => {
    if (bills.length === 0) {
      toast.error('No payment data to export');
      return;
    }

    try {
      const doc = new jsPDF('l', 'mm', 'a4');
      const dairyName = profile?.dairyName || 'DugdhaSetu';
      const dairyAddress = profile?.address || '';
      const periodLabel = periods.find(p => p.id === period)?.label || '';
      const monthLabel = months[month];

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text(dairyName, 148, 12, { align: 'center' });
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      if (dairyAddress) doc.text(dairyAddress, 148, 17, { align: 'center' });
      
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(`Payment Register - ${monthLabel} ${year} (${periodLabel})`, 148, 25, { align: 'center' });

      const days = getDaysInPeriod();
      const head = [
        [
          { content: 'S.No', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
          { content: 'Farmer Name', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
          ...days.map(d => ({ content: `${d}`, colSpan: 2, styles: { halign: 'center' } })),
          { content: 'Total', colSpan: 2, styles: { halign: 'center' } }
        ],
        [
          ...days.flatMap(() => [
            { content: 'M', styles: { halign: 'center' } },
            { content: 'E', styles: { halign: 'center' } }
          ]),
          { content: 'Qty', styles: { halign: 'center' } },
          { content: 'Amt', styles: { halign: 'center' } }
        ]
      ];

      const body: any[] = [];
      bills.forEach((bill, idx) => {
        const qtyRow: any[] = [
          { content: `${idx + 1}`, rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
          { content: `${bill.farmerName}`, rowSpan: 2, styles: { valign: 'middle' } },
        ];
        const amtRow: any[] = [];

        days.forEach(day => {
          const dateStr = format(new Date(year, month, day), 'yyyy-MM-dd');
          const morning = bill.collections.find((c: any) => {
            const cDate = new Date(c.date);
            return format(cDate, 'yyyy-MM-dd') === dateStr && c.shift === 'Morning';
          });
          const evening = bill.collections.find((c: any) => {
            const cDate = new Date(c.date);
            return format(cDate, 'yyyy-MM-dd') === dateStr && c.shift === 'Evening';
          });

          qtyRow.push({ content: morning ? morning.quantity.toFixed(1) : '-', styles: { halign: 'center' } });
          qtyRow.push({ content: evening ? evening.quantity.toFixed(1) : '-', styles: { halign: 'center' } });

          amtRow.push({ content: morning ? (morning.amount || 0).toFixed(0) : '-', styles: { halign: 'center' } });
          amtRow.push({ content: evening ? (evening.amount || 0).toFixed(0) : '-', styles: { halign: 'center' } });
        });

        qtyRow.push({ content: bill.totalQuantity.toFixed(1), styles: { halign: 'center', fontStyle: 'bold' } });
        amtRow.push({ content: (bill.amount || 0).toFixed(0), styles: { halign: 'center', fontStyle: 'bold' } });

        body.push(qtyRow);
        body.push(amtRow);
      });

      autoTable(doc, {
        head: head as any,
        body: body,
        startY: 32,
        theme: 'grid',
        styles: { fontSize: 6, cellPadding: 1 },
        headStyles: { fillColor: [41, 37, 36], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 245, 245] },
      });

      await pdfService.saveAndOpen(doc, `Payment_Register_${monthLabel}_${periodLabel}.pdf`);
      toast.success('Payment Register downloaded');
    } catch (error) {
      console.error('PDF generation failed:', error);
      toast.error('Failed to generate PDF');
    }
  };

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const numberToWords = (num: number) => {
    const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    const inWords = (n: any): string => {
      if ((n = n.toString()).length > 9) return 'overflow';
      let n_arr = ('000000000' + n).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
      if (!n_arr) return '';
      let str = '';
      str += (Number(n_arr[1]) !== 0) ? (a[Number(n_arr[1])] || b[Number(n_arr[1][0])] + ' ' + a[Number(n_arr[1][1])]) + 'Crore ' : '';
      str += (Number(n_arr[2]) !== 0) ? (a[Number(n_arr[2])] || b[Number(n_arr[2][0])] + ' ' + a[Number(n_arr[2][1])]) + 'Lakh ' : '';
      str += (Number(n_arr[3]) !== 0) ? (a[Number(n_arr[3])] || b[Number(n_arr[3][0])] + ' ' + a[Number(n_arr[3][1])]) + 'Thousand ' : '';
      str += (Number(n_arr[4]) !== 0) ? (a[Number(n_arr[4])] || b[Number(n_arr[4][0])] + ' ' + a[Number(n_arr[4][1])]) + 'Hundred ' : '';
      str += (Number(n_arr[5]) !== 0) ? ((str !== '') ? 'And ' : '') + (a[Number(n_arr[5])] || b[Number(n_arr[5][0])] + ' ' + a[Number(n_arr[5][1])]) : '';
      return str;
    };

    const whole = Math.floor(num);
    const fraction = Math.round((num - whole) * 100);
    let res = inWords(whole) + 'Rupees ';
    if (fraction > 0) {
      res += 'And ' + inWords(fraction) + 'Paise ';
    } else {
      res += 'And Zero Paise ';
    }
    return res + 'Only';
  };

  const generateSimpleBillPDF = (doc: jsPDF, bill: any) => {
    const dairyName = profile?.dairyName || 'DugdhaSetu';
    const dairyAddress = profile?.address || '';
    
    // Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text(dairyName, 105, 15, { align: 'center' });
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    if (dairyAddress) doc.text(dairyAddress, 105, 20, { align: 'center' });
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Milk Bill', 105, 28, { align: 'center' });
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Period: ${format(new Date(bill.startDate), 'dd MMM yyyy')} to ${format(new Date(bill.endDate), 'dd MMM yyyy')}`, 105, 34, { align: 'center' });
    
    doc.line(14, 38, 196, 38);
    
    // Farmer Info
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`Farmer: ${bill.farmerName}`, 14, 45);
    doc.setFont('helvetica', 'normal');
    doc.text(`ID: ${bill.farmerId}`, 14, 50);
    doc.text(`Village: ${bill.village}`, 14, 55);
    
    doc.text(`Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 196, 45, { align: 'right' });
    
    // Table
    const tableData = bill.collections.map((c: any) => [
      format(new Date(c.date), 'dd/MM/yyyy'),
      c.shift,
      c.milkType,
      c.quantity.toFixed(2),
      c.fat.toFixed(1),
      c.snf.toFixed(1),
      c.rate.toFixed(2),
      (c.amount || 0).toFixed(2)
    ]);

    autoTable(doc, {
      startY: 60,
      head: [['Date', 'Shift', 'Type', 'Qty (L)', 'Fat', 'SNF', 'Rate', 'Amount']],
      body: tableData,
      foot: [[
        'Total', '', '', 
        bill.totalQuantity.toFixed(2), 
        bill.avgFat.toFixed(1), 
        bill.avgSnf.toFixed(1), 
        '', 
        (bill.amount || 0).toFixed(2)
      ]],
      theme: 'grid',
      headStyles: { fillColor: [41, 37, 36], textColor: 255 },
      footStyles: { fillColor: [245, 245, 244], textColor: [41, 37, 36], fontStyle: 'bold' },
      styles: { fontSize: 9 }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Net Payable: Rs. ${(bill.amount || 0).toFixed(2)}`, 196, finalY, { align: 'right' });
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.text(`In words: ${numberToWords(Math.round(bill.amount || 0))}`, 14, finalY + 5);
  };

  const generateDetailedBillPDF = (doc: jsPDF, bill: any) => {
    const pageWidth = doc.internal.pageSize.width;
    
    // Helper for centered text
    const centerText = (text: string, y: number, size = 10, style = 'normal') => {
      doc.setFont('helvetica', style);
      doc.setFontSize(size);
      doc.text(text, pageWidth / 2, y, { align: 'center' });
    };

    // Header section
    centerText(profile?.dairyName || 'DAIRY MANAGEMENT SYSTEM', 15, 12, 'bold');
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Society: ${profile?.dairyId || '63006'}    ${profile?.dairyName || 'EKDANGA'}`, 14, 25);
    doc.text(`Route: 313 R31 KHAIRATIYA BMC`, 120, 25);
    doc.text(`Bill No.  ${Math.floor(Math.random() * 1000)}`, 180, 25);
    
    // Bank info removed as requested
    
    doc.text(`Farmer: ${bill.farmerName} (${bill.farmerId})`, 14, 32);
    doc.text(`Milk Bill Date From: ${format(new Date(bill.startDate), 'dd/MM/yyyy')} To ${format(new Date(bill.endDate), 'dd/MM/yyyy')}`, 14, 37);
    doc.text(`Head Load Rate: 0.00`, 160, 37);

    // Prepare Table Data
    const days = [];
    const start = new Date(bill.startDate);
    const end = new Date(bill.endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      days.push(new Date(d));
    }

    const tableRows: any[] = [];
    let cowQty = 0;
    let cowValue = 0;
    let bufQty = 0;
    let bufValue = 0;

    days.forEach(date => {
      const dateStr = format(date, 'yyyy-MM-dd');
      const morning = bill.collections.find((c: any) => format(new Date(c.date), 'yyyy-MM-dd') === dateStr && c.shift === 'Morning');
      const evening = bill.collections.find((c: any) => format(new Date(c.date), 'yyyy-MM-dd') === dateStr && c.shift === 'Evening');

      if (morning?.milkType === 'Cow' || evening?.milkType === 'Cow') {
        cowQty += (morning?.quantity || 0) + (evening?.quantity || 0);
        cowValue += (morning?.amount || 0) + (evening?.amount || 0);
      } else if (morning?.milkType === 'Buffalo' || evening?.milkType === 'Buffalo') {
        bufQty += (morning?.quantity || 0) + (evening?.quantity || 0);
        bufValue += (morning?.amount || 0) + (evening?.amount || 0);
      }

      tableRows.push([
        format(date, 'dd-MM'),
        morning ? morning.quantity.toFixed(1) : '0.0',
        morning ? morning.fat.toFixed(1) : '0.0',
        morning ? (morning.quantity * morning.fat / 100).toFixed(3) : '0.000',
        morning ? morning.snf.toFixed(1) : '0.0',
        morning ? (morning.amount || 0).toFixed(2) : '0.00',
        '|',
        evening ? evening.quantity.toFixed(1) : '0.0',
        evening ? evening.fat.toFixed(1) : '0.0',
        evening ? (evening.quantity * evening.fat / 100).toFixed(3) : '0.000',
        evening ? evening.snf.toFixed(1) : '0.0',
        evening ? (evening.amount || 0).toFixed(2) : '0.00'
      ]);
    });

    autoTable(doc, {
      startY: 45,
      head: [
        [{ content: 'MORNING', colSpan: 6, styles: { halign: 'center' } }, { content: '', styles: { cellPadding: 0 } }, { content: 'EVENING', colSpan: 5, styles: { halign: 'center' } }],
        ['Date', 'QTY', 'Fat%', 'Kg.Fat', 'SNF%', 'Value Rs.', '', 'QTY', 'Fat%', 'Kg.Fat', 'SNF%', 'Value Rs.']
      ],
      body: [
        [{ content: 'Milk Collection Details', colSpan: 12, styles: { halign: 'center', fontStyle: 'bold', fontSize: 7 } }],
        ...tableRows
      ],
      theme: 'plain',
      styles: { fontSize: 7, cellPadding: 1, lineWidth: 0.1, lineColor: [200, 200, 200] },
      headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.1, lineColor: [0, 0, 0] },
      columnStyles: {
        0: { cellWidth: 15 },
        1: { cellWidth: 15, halign: 'right' },
        2: { cellWidth: 12, halign: 'right' },
        3: { cellWidth: 15, halign: 'right' },
        4: { cellWidth: 12, halign: 'right' },
        5: { cellWidth: 18, halign: 'right' },
        6: { cellWidth: 2, halign: 'center' },
        7: { cellWidth: 15, halign: 'right' },
        8: { cellWidth: 12, halign: 'right' },
        9: { cellWidth: 15, halign: 'right' },
        10: { cellWidth: 12, halign: 'right' },
        11: { cellWidth: 18, halign: 'right' },
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 5;

    // Summary Section
    doc.setFontSize(7);
    doc.text('G Qty    S Qty    C Qty    TOT. Qty    Value', 40, finalY);
    doc.line(14, finalY + 1, 100, finalY + 1);
    
    doc.text('Buf:', 14, finalY + 5);
    doc.text(`${bufQty.toFixed(1)}`, 75, finalY + 5, { align: 'right' });
    doc.text(`${bufValue.toFixed(2)}`, 100, finalY + 5, { align: 'right' });
    
    doc.text('Cow:', 14, finalY + 9);
    doc.text(`${cowQty.toFixed(1)}`, 75, finalY + 9, { align: 'right' });
    doc.text(`${cowValue.toFixed(2)}`, 100, finalY + 9, { align: 'right' });
    
    doc.line(14, finalY + 10, 100, finalY + 10);
    doc.text('All:', 14, finalY + 14);
    doc.text(`${(bufQty + cowQty).toFixed(1)}`, 75, finalY + 14, { align: 'right' });
    doc.text(`${(bufValue + cowValue).toFixed(2)}`, 100, finalY + 14, { align: 'right' });

    // Right Side Summary
    const rightX = 140;
    doc.text(`Total Milk Value Rs.:`, rightX, finalY + 5);
    doc.text(`${(bufValue + cowValue).toFixed(2)}`, 196, finalY + 5, { align: 'right' });
    
    const commission = (bufValue + cowValue) * 0.025;
    doc.text(`Total Earning Amount Rs.:`, rightX, finalY + 9);
    doc.text(`${commission.toFixed(2)}`, 196, finalY + 9, { align: 'right' });
    
    doc.line(rightX, finalY + 10, 196, finalY + 10);
    const grossTotal = (bufValue + cowValue) + commission;
    doc.text(`Gross Total Amount Rs.:`, rightX, finalY + 14);
    doc.text(`${grossTotal.toFixed(2)}`, 196, finalY + 14, { align: 'right' });
    
    const deductions = 0;
    doc.text(`Total Deduction Amount Rs.:`, rightX, finalY + 18);
    doc.text(`${deductions.toFixed(2)}`, 196, finalY + 18, { align: 'right' });
    
    doc.line(rightX, finalY + 19, 196, finalY + 19);
    const netTotal = grossTotal - deductions;
    doc.text(`Net Total Amount Rs.:`, rightX, finalY + 23);
    doc.text(`${netTotal.toFixed(2)}`, 196, finalY + 23, { align: 'right' });
    
    const rounded = Math.round(netTotal) - netTotal;
    doc.text(`Rounded Amount :`, rightX, finalY + 27);
    doc.text(`${rounded.toFixed(2)}`, 196, finalY + 27, { align: 'right' });
    
    doc.setFont('helvetica', 'bold');
    doc.text(`Net Payable Amount Rs.:`, rightX, finalY + 32);
    doc.text(`${Math.round(netTotal).toFixed(2)}`, 196, finalY + 32, { align: 'right' });
    doc.setFont('helvetica', 'normal');

    centerText(numberToWords(Math.round(netTotal)), finalY + 40, 8, 'italic');

    // Bottom Table
    autoTable(doc, {
      startY: finalY + 45,
      head: [['Ed Desc', 'GPNO', 'Narr', 'Cr Amount', 'Rate', 'Qty', 'Amt Booked', 'Dr Amt', 'B.F.Amount']],
      body: [
        ['SOC. COMMISSION', '', `${format(start, 'dd.MM')} TO ${format(end, 'dd.MM.yyyy')}`, commission.toFixed(2), '0.025', (bufValue + cowValue).toFixed(2), '', '', ''],
      ],
      theme: 'grid',
      styles: { fontSize: 6, cellPadding: 1 },
      headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.1, lineColor: [0, 0, 0] },
      foot: [['TOTAL Credit/Debit :', '', '', commission.toFixed(2), '', '', '', commission.toFixed(2), commission.toFixed(2)]],
      footStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.1, lineColor: [0, 0, 0] }
    });
  };

  const downloadAllPDF = async () => {
    if (bills.length === 0) return;
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      bills.forEach((bill, index) => {
        if (index > 0) doc.addPage();
        generateDetailedBillPDF(doc, bill);
      });
      await pdfService.saveAndOpen(doc, `Dairy_Consolidated_Bills_${format(new Date(bills[0].startDate), 'yyyyMMdd')}.pdf`);
      toast.success('PDF downloaded successfully');
    } catch (error) {
      console.error('PDF generation failed:', error);
      toast.error('Failed to generate PDF');
    }
  };

  const downloadPDF = async (bill: any) => {
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      generateSimpleBillPDF(doc, bill);
      await pdfService.saveAndOpen(doc, `Farmer_Bill_${bill.farmerId}_${format(new Date(bill.startDate), 'yyyyMMdd')}.pdf`);
      toast.success('PDF downloaded successfully');
    } catch (error) {
      console.error('PDF generation failed:', error);
      toast.error('Failed to generate PDF');
    }
  };

  const periods = [
    { id: 1, label: '01 to 10' },
    { id: 2, label: '11 to 20' },
    { id: 3, label: '21 to End' }
  ];

  const menuItems = [
    { id: 'farmer', title: 'Farmer Bill', icon: User, color: 'bg-blue-500', description: 'Individual 10-day milk bills' },
    { id: 'dairy', title: 'Dairy Bill', icon: Building2, color: 'bg-purple-500', description: 'All farmers consolidated bill' },
    { id: 'payment', title: 'Payment Book', icon: DollarSign, color: 'bg-green-500', description: 'Record of payments to farmers' },
    { id: 'purchase', title: 'Purchase Book', icon: ShoppingCart, color: 'bg-orange-500', description: 'Record of milk purchases' },
  ];

  if (view === 'menu') {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-serif font-medium text-stone-900 dark:text-white">{t('bills')}</h1>
          <p className="text-stone-500 dark:text-stone-400">Select a section to manage bills and records</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setView(item.id as any)}
              className="group p-8 bg-white dark:bg-stone-900 rounded-[2rem] border border-stone-100 dark:border-stone-800 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all text-left"
            >
              <div className={cn(
                "w-16 h-16 rounded-2xl flex items-center justify-center mb-6 text-white transition-transform group-hover:scale-110",
                item.color
              )}>
                <item.icon size={32} />
              </div>
              <h3 className="text-xl font-serif font-medium text-stone-900 dark:text-white mb-2">{item.title}</h3>
              <p className="text-sm text-stone-500 dark:text-stone-400">{item.description}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Back button for sub-views
  const BackButton = () => (
    <button 
      onClick={() => setView('menu')}
      className="flex items-center gap-2 text-stone-500 hover:text-stone-900 dark:hover:text-white transition-colors mb-4"
    >
      <ChevronLeft size={20} />
      Back to Menu
    </button>
  );

  return (
    <div className="space-y-8">
      <BackButton />
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-serif font-medium text-stone-900 dark:text-white">
            {view === 'farmer' ? 'Farmer Bill' : view === 'dairy' ? 'Dairy Bill' : view === 'payment' ? 'Payment Book' : 'Purchase Book'}
          </h1>
          <p className="text-stone-500 dark:text-stone-400">
            {view === 'farmer' ? 'Generate individual 10-day cycle bills' : 
             view === 'dairy' ? 'Consolidated dairy billing reports' :
             view === 'purchase' ? 'Daily milk collection register' :
             'Record of payments to farmers'}
          </p>
        </div>
        {(view === 'farmer' || view === 'dairy') && bills.length > 0 && (profile?.role === 'admin' || profile?.role === 'super_admin') && (
          <button 
            onClick={view === 'dairy' ? downloadAllPDF : () => {}}
            className="flex items-center gap-2 px-6 py-3 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-xl font-medium hover:bg-stone-800 dark:hover:bg-stone-100 transition-colors"
          >
            <Download size={18} />
            {view === 'dairy' ? 'Download All Bills' : 'Download Report'}
          </button>
        )}
        {view === 'purchase' && purchaseData.length > 0 && (
          <button 
            onClick={downloadPurchasePDF}
            className="flex items-center gap-2 px-6 py-3 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-xl font-medium hover:bg-stone-800 dark:hover:bg-stone-100 transition-colors"
          >
            <Printer size={18} />
            Print Register
          </button>
        )}
      </div>

      {(view === 'farmer' || view === 'dairy' || view === 'payment') && (
        <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-500 uppercase tracking-wider">Month</label>
              <select 
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="w-full px-4 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none text-sm dark:text-white"
              >
                {months.map((m, i) => (
                  <option key={m} value={i}>{m}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-500 uppercase tracking-wider">Period</label>
              <select 
                value={period}
                onChange={(e) => setPeriod(Number(e.target.value) as 1 | 2 | 3)}
                className="w-full px-4 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none text-sm dark:text-white"
              >
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
            {(view === 'farmer' && (profile?.role === 'admin' || profile?.role === 'super_admin')) && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-stone-500 uppercase tracking-wider">Farmer (Optional)</label>
                <select 
                  value={selectedFarmerId}
                  onChange={(e) => setSelectedFarmerId(e.target.value)}
                  className="w-full px-4 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none text-sm dark:text-white"
                >
                  <option value="">All Farmers</option>
                  {farmers.map(f => (
                    <option key={f.farmerId} value={f.farmerId}>{f.farmerId} - {f.name}</option>
                  ))}
                </select>
              </div>
            )}
            <button 
              onClick={fetchBills}
              disabled={loading}
              className="w-full py-2 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-xl font-medium hover:bg-stone-800 dark:hover:bg-stone-100 transition-colors disabled:opacity-50"
            >
              {loading ? 'Generating...' : view === 'payment' ? 'View Register' : 'Generate Bills'}
            </button>
          </div>
        </div>
      )}

      {view === 'purchase' && (
        <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-500 uppercase tracking-wider">Date</label>
              <input 
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full px-4 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none text-sm dark:text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-500 uppercase tracking-wider">Shift</label>
              <select 
                value={purchaseShift}
                onChange={(e) => setPurchaseShift(e.target.value as 'Morning' | 'Evening')}
                className="w-full px-4 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl focus:outline-none text-sm dark:text-white"
              >
                <option value="Morning">Morning</option>
                <option value="Evening">Evening</option>
              </select>
            </div>
            <button 
              onClick={fetchPurchaseBook}
              disabled={loading}
              className="w-full py-2 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-xl font-medium hover:bg-stone-800 dark:hover:bg-stone-100 transition-colors disabled:opacity-50"
            >
              {loading ? 'Fetching...' : 'View Register'}
            </button>
          </div>
        </div>
      )}

      {view === 'purchase' && purchaseData.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 mt-8">
          <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm">
            <p className="text-sm text-stone-500 mb-1">Total Milk</p>
            <h3 className="text-2xl font-bold text-stone-900 dark:text-white">
              {purchaseData.reduce((sum, c) => sum + c.quantity, 0).toFixed(2)} <span className="text-sm font-normal text-stone-500">Liters</span>
            </h3>
          </div>
          <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm">
            <p className="text-sm text-stone-500 mb-1">Average Fat</p>
            <h3 className="text-2xl font-bold text-stone-900 dark:text-white">
              {purchaseData.length > 0 
                ? (purchaseData.reduce((sum, c) => sum + c.fat, 0) / purchaseData.length).toFixed(1)
                : '0.0'} <span className="text-sm font-normal text-stone-500">%</span>
            </h3>
          </div>
          <div className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm">
            <p className="text-sm text-stone-500 mb-1">Total Amount</p>
            <h3 className="text-2xl font-bold text-stone-900 dark:text-white">
              ₹{purchaseData.reduce((sum, c) => sum + (c.amount || 0), 0).toFixed(2)}
            </h3>
          </div>
        </div>
      )}

      {view === 'payment' && (
        <div className="space-y-6 mt-8">
          {bills.length > 0 ? (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-serif font-medium text-stone-900 dark:text-white">
                  Payment Register - {months[month]} ({periods.find(p => p.id === period)?.label})
                </h2>
                <div className="flex gap-3">
                  <button 
                    onClick={handleFinalizeBills}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-stone-900 dark:bg-white text-white dark:text-stone-900 rounded-xl hover:bg-stone-800 dark:hover:bg-stone-100 transition-colors"
                  >
                    <CheckCircle2 size={18} />
                    {loading ? 'Finalizing...' : 'Finalize & Post to Ledger'}
                  </button>
                  <button 
                    onClick={downloadPaymentPDF}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors"
                  >
                    <Printer size={18} />
                    Print Register
                  </button>
                </div>
              </div>

              <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-stone-900 text-white">
                        <th rowSpan={2} className="px-4 py-3 text-xs font-bold uppercase border border-stone-800 text-center align-middle">S.No</th>
                        <th rowSpan={2} className="px-4 py-3 text-xs font-bold uppercase border border-stone-800 text-center align-middle">Farmer Name</th>
                        {getDaysInPeriod().map(day => (
                          <th key={day} colSpan={2} className="px-2 py-2 text-[10px] font-bold uppercase border border-stone-800 text-center">{day}</th>
                        ))}
                        <th colSpan={2} className="px-4 py-3 text-xs font-bold uppercase border border-stone-800 text-center">Total</th>
                      </tr>
                      <tr className="bg-stone-800 text-white">
                        {getDaysInPeriod().map(day => (
                          <React.Fragment key={`shift-${day}`}>
                            <th className="px-1 py-1 text-[9px] font-bold border border-stone-700 text-center">M</th>
                            <th className="px-1 py-1 text-[9px] font-bold border border-stone-700 text-center">E</th>
                          </React.Fragment>
                        ))}
                        <th className="px-2 py-2 text-[10px] font-bold border border-stone-700 text-center">Qty</th>
                        <th className="px-2 py-2 text-[10px] font-bold border border-stone-700 text-center">Amt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bills.map((bill, idx) => (
                        <React.Fragment key={bill.id}>
                          <tr className="hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors border-t border-stone-100 dark:border-stone-800">
                            <td rowSpan={2} className="px-4 py-2 text-xs text-stone-500 text-center border-r border-stone-100 dark:border-stone-800">{idx + 1}</td>
                            <td rowSpan={2} className="px-4 py-2 text-xs font-medium text-stone-900 dark:text-white border-r border-stone-100 dark:border-stone-800">{bill.farmerName}</td>
                            {getDaysInPeriod().map(day => {
                              const dateStr = format(new Date(year, month, day), 'yyyy-MM-dd');
                              const morning = bill.collections.find((c: any) => {
                                const cDate = new Date(c.date);
                                return format(cDate, 'yyyy-MM-dd') === dateStr && c.shift === 'Morning';
                              });
                              const evening = bill.collections.find((c: any) => {
                                const cDate = new Date(c.date);
                                return format(cDate, 'yyyy-MM-dd') === dateStr && c.shift === 'Evening';
                              });
                              return (
                                <React.Fragment key={`qty-${day}`}>
                                  <td className="px-1 py-1 text-[10px] text-stone-600 dark:text-stone-400 text-center border-r border-stone-50 dark:border-stone-800/50">{morning ? morning.quantity.toFixed(1) : '-'}</td>
                                  <td className="px-1 py-1 text-[10px] text-stone-600 dark:text-stone-400 text-center border-r border-stone-50 dark:border-stone-800/50">{evening ? evening.quantity.toFixed(1) : '-'}</td>
                                </React.Fragment>
                              );
                            })}
                            <td className="px-2 py-2 text-xs font-bold text-stone-900 dark:text-white text-center border-r border-stone-100 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-800/30">{bill.totalQuantity.toFixed(1)}</td>
                            <td rowSpan={2} className="px-2 py-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 text-center bg-emerald-50/30 dark:bg-emerald-900/10">₹{(bill.amount || 0).toLocaleString()}</td>
                          </tr>
                          <tr className="hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors border-b border-stone-100 dark:border-stone-800">
                            {getDaysInPeriod().map(day => {
                              const dateStr = format(new Date(year, month, day), 'yyyy-MM-dd');
                              const morning = bill.collections.find((c: any) => {
                                const cDate = new Date(c.date);
                                return format(cDate, 'yyyy-MM-dd') === dateStr && c.shift === 'Morning';
                              });
                              const evening = bill.collections.find((c: any) => {
                                const cDate = new Date(c.date);
                                return format(cDate, 'yyyy-MM-dd') === dateStr && c.shift === 'Evening';
                              });
                              return (
                                <React.Fragment key={`amt-${day}`}>
                                  <td className="px-1 py-1 text-[9px] text-stone-400 dark:text-stone-500 text-center border-r border-stone-50 dark:border-stone-800/50 italic">{morning ? `₹${(morning.amount || 0).toFixed(0)}` : '-'}</td>
                                  <td className="px-1 py-1 text-[9px] text-stone-400 dark:text-stone-500 text-center border-r border-stone-50 dark:border-stone-800/50 italic">{evening ? `₹${(evening.amount || 0).toFixed(0)}` : '-'}</td>
                                </React.Fragment>
                              );
                            })}
                            <td className="px-2 py-2 text-[10px] font-medium text-stone-500 dark:text-stone-400 text-center border-r border-stone-100 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-800/30">Amt</td>
                          </tr>
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : !loading && (
            <div className="py-20 text-center">
              <div className="w-16 h-16 bg-stone-100 dark:bg-stone-800 rounded-full flex items-center justify-center mx-auto mb-4 text-stone-400">
                <FileText size={32} />
              </div>
              <h3 className="text-lg font-medium text-stone-900 dark:text-white">No register data available</h3>
              <p className="text-stone-500">Select a period and click "View Register" to see results.</p>
            </div>
          )}
        </div>
      )}

      {(view === 'farmer' || view === 'dairy') && (
        <div className="space-y-4">
          {bills.map((bill) => (
          <div key={bill.id} className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm overflow-hidden">
            <div className="p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-stone-50 dark:border-stone-800">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-stone-100 dark:bg-stone-800 rounded-2xl flex items-center justify-center text-stone-500">
                  <User size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-stone-900 dark:text-white">{bill.farmerName}</h3>
                  <p className="text-sm text-stone-500">ID: {bill.farmerId} • Village: {bill.village}</p>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-xs text-stone-400 uppercase tracking-wider">Total Amount</p>
                  <p className="text-xl font-serif font-medium text-stone-900 dark:text-white">₹{(bill.amount || 0).toLocaleString()}</p>
                </div>
                <button 
                  onClick={() => downloadPDF(bill)}
                  className="p-3 bg-stone-50 dark:bg-stone-800 text-stone-600 dark:text-stone-300 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
                >
                  <Download size={20} />
                </button>
              </div>
            </div>
            <div className="p-6 bg-stone-50/50 dark:bg-stone-800/20">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-white dark:bg-stone-900 rounded-2xl border border-stone-100 dark:border-stone-800">
                  <p className="text-[10px] text-stone-400 uppercase tracking-wider mb-1">Total Quantity</p>
                  <p className="text-lg font-medium">{bill.totalQuantity.toFixed(2)} L</p>
                </div>
                <div className="p-4 bg-white dark:bg-stone-900 rounded-2xl border border-stone-100 dark:border-stone-800">
                  <p className="text-[10px] text-stone-400 uppercase tracking-wider mb-1">Avg Fat</p>
                  <p className="text-lg font-medium">{bill.avgFat.toFixed(1)}%</p>
                </div>
                <div className="p-4 bg-white dark:bg-stone-900 rounded-2xl border border-stone-100 dark:border-stone-800">
                  <p className="text-[10px] text-stone-400 uppercase tracking-wider mb-1">Avg SNF</p>
                  <p className="text-lg font-medium">{bill.avgSnf.toFixed(1)}%</p>
                </div>
                <div className="p-4 bg-white dark:bg-stone-900 rounded-2xl border border-stone-100 dark:border-stone-800">
                  <p className="text-[10px] text-stone-400 uppercase tracking-wider mb-1">Collections</p>
                  <p className="text-lg font-medium">{bill.collections.length} entries</p>
                </div>
              </div>
            </div>
          </div>
        ))}

        {bills.length === 0 && !loading && (
          <div className="py-20 text-center">
            <div className="w-16 h-16 bg-stone-100 dark:bg-stone-800 rounded-full flex items-center justify-center mx-auto mb-4 text-stone-400">
              <FileText size={32} />
            </div>
            <h3 className="text-lg font-medium text-stone-900 dark:text-white">No bills generated</h3>
            <p className="text-stone-500">Select a period and click "Generate Bills" to see results.</p>
          </div>
        )}
      </div>
      )}

      {view === 'purchase' && (
        <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-stone-50 dark:bg-stone-800/50 border-b border-stone-100 dark:border-stone-800">
                  <th className="px-6 py-4 text-xs font-medium text-stone-500 uppercase tracking-wider">S.No</th>
                  <th className="px-6 py-4 text-xs font-medium text-stone-500 uppercase tracking-wider">Farmer Name</th>
                  <th className="px-6 py-4 text-xs font-medium text-stone-500 uppercase tracking-wider">Lacto</th>
                  <th className="px-6 py-4 text-xs font-medium text-stone-500 uppercase tracking-wider">Qty (L)</th>
                  <th className="px-6 py-4 text-xs font-medium text-stone-500 uppercase tracking-wider">Fat</th>
                  <th className="px-6 py-4 text-xs font-medium text-stone-500 uppercase tracking-wider">Rate</th>
                  <th className="px-6 py-4 text-xs font-medium text-stone-500 uppercase tracking-wider">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50 dark:divide-stone-800">
                {purchaseData.map((c, index) => (
                  <tr key={c.id || index} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/30 transition-colors">
                    <td className="px-6 py-4 text-sm text-stone-600 dark:text-stone-400">{index + 1}</td>
                    <td className="px-6 py-4 text-sm font-medium text-stone-900 dark:text-white">{c.farmerName} <span className="text-[10px] text-stone-400 font-mono">({c.farmerId})</span></td>
                    <td className="px-6 py-4 text-sm text-stone-600 dark:text-stone-400">{c.lacto || '-'}</td>
                    <td className="px-6 py-4 text-sm text-stone-900 dark:text-white font-medium">{c.quantity.toFixed(2)}</td>
                    <td className="px-6 py-4 text-sm text-stone-600 dark:text-stone-400">{c.fat.toFixed(1)}</td>
                    <td className="px-6 py-4 text-sm text-stone-600 dark:text-stone-400">₹{c.rate.toFixed(2)}</td>
                    <td className="px-6 py-4 text-sm text-stone-900 dark:text-white font-medium">₹{(c.amount || 0).toFixed(2)}</td>
                  </tr>
                ))}
                {purchaseData.length > 0 && (
                  <tr key="total-row" className="bg-stone-50/50 dark:bg-stone-800/30 font-bold">
                    <td colSpan={3} className="px-6 py-4 text-sm text-right">Total:</td>
                    <td className="px-6 py-4 text-sm">{purchaseData.reduce((sum, c) => sum + c.quantity, 0).toFixed(2)} L</td>
                    <td colSpan={2}></td>
                    <td className="px-6 py-4 text-sm">₹{purchaseData.reduce((sum, c) => sum + (c.amount || 0), 0).toFixed(2)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {purchaseData.length === 0 && !loading && (
            <div className="py-20 text-center">
              <div className="w-16 h-16 bg-stone-100 dark:bg-stone-800 rounded-full flex items-center justify-center mx-auto mb-4 text-stone-400">
                <ShoppingCart size={32} />
              </div>
              <h3 className="text-lg font-medium text-stone-900 dark:text-white">No entries found</h3>
              <p className="text-stone-500">Select a date and shift to view the register.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

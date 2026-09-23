// LoanStatement.js - TMG Foundation themed
import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import { formatPayMode } from '../utils/formatters';
import MpesaPaymentModal from './MpesaPaymentModal';

const LOAN_OUTSTANDING_TOLERANCE = 1;

function LoanStatement() {
  const [memberData, setMemberData] = useState(null);
  const [loanData, setLoanData] = useState([]);
  const [allLoansRaw, setAllLoansRaw] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [headerData, setHeaderData] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [statementLoading, setStatementLoading] = useState(false);
  const [pdfBlob, setPdfBlob] = useState(null);
  const [mpesaLoan, setMpesaLoan] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // --- TMG FOUNDATION BRAND COLORS ---
  const colors = {
    primary: '#1B3A6B',
    primaryDark: '#12294C',
    accent: '#E31E24',
    accentDark: '#C4181D',
    softBlue: '#EEF3FA',
    softRed: '#FDECEC',
  };
  const brandColor = colors.primary;

  const normalizeMemberProfile = (profile) => {
    const member = profile?.data && typeof profile.data === 'object' ? profile.data : profile || {};
    return {
      holdersName: member.holdersName || member.holders_name || member.name || member.memberName || member.member_name || '',
      accNo: member.accNo || member.acc_no || member.memberNo || member.member_no || '',
      emailAdd: member.emailAdd || member.email_add || member.email || '',
      tel1: member.tel1 || member.phone || member.mobileNo || member.mobile_no || '',
      idNo: member.idNo || member.id_no || member.idNumber || member.id_number || '',
    };
  };

  const formatDateOnly = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      if (dateString.includes('T')) {
        const datePart = dateString.split('T')[0];
        const [year, month, day] = datePart.split('-');
        return `${day}/${month}/${year}`;
      }
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;
      return date.toLocaleDateString('en-GB');
    } catch {
      return dateString;
    }
  };

  const processLoanData = (responseData) => {
    let loans = [];

    if (responseData && responseData.success === true && Array.isArray(responseData.data)) {
      loans = responseData.data;
    } else if (Array.isArray(responseData)) {
      loans = responseData;
    } else if (responseData && responseData.data && Array.isArray(responseData.data)) {
      loans = responseData.data;
    } else if (responseData && responseData.loans && Array.isArray(responseData.loans)) {
      loans = responseData.loans;
    } else if (responseData && responseData.instant && Array.isArray(responseData.instant)) {
      loans = responseData.instant;
    } else if (responseData && (responseData.loanNo || responseData.amount)) {
      loans = [responseData];
    }

    setAllLoansRaw(loans);

    const getOutstandingValue = (loan) => Number(
      loan?.outStanding ??
      loan?.outstanding ??
      loan?.outstandingBalance ??
      loan?.outstanding_balance ??
      loan?.outstandingAmount ??
      loan?.outstanding_amount ??
      loan?.total ??
      loan?.amount ??
      loan?.balance ??
      0
    );
    const cleanOutstandingValue = (loan) => {
      const outstanding = getOutstandingValue(loan);
      return Math.abs(outstanding) < LOAN_OUTSTANDING_TOLERANCE ? 0 : outstanding;
    };

    const activeLoans = loans.filter(loan => {
      const outstanding = cleanOutstandingValue(loan);
      const isPending = Boolean(loan.isPending);
      return isPending || outstanding !== 0;
    });

    const formattedLoans = activeLoans.map((item, index) => ({
      id: index,
      loanNo: item.loanNo || 'N/A',
      purpose: item.loanPurpose || 'N/A',
      sdate: formatDateOnly(item.startDate),
      edate: formatDateOnly(item.endDate),
      rawStartDate: item.startDate || null,
      rawEndDate: item.endDate || null,
      period: item.period !== null && item.period !== undefined ? item.period : 'N/A',
      originalAmount: parseFloat(item.amount) || 0,
      balance: cleanOutstandingValue(item),
      monthlyRepayment: Number(item.repayment || item.monthlyRepayment || item.monthly_repayment || 0),
      totalRepayable: Number(item.total ?? item.totalRepayable ?? item.total_repayable ?? 0),
      payMode: item.payMode || item.wstation || 'N/A',
      interestRate: item.interest ?? item.interestRate ?? item.interest_rate ?? 0,
      status: item.status || (item.isPending ? 'Pending Approval' : cleanOutstandingValue(item) < 0 ? 'Credit Balance' : 'Active'),
      isPending: Boolean(item.isPending),
    }));

    setLoanData(formattedLoans);

    if (formattedLoans.length === 0 && loans.length > 0) {
      setError(`✓ No open loan balances found. All ${loans.length} loan(s) have been fully settled.`);
    } else if (loans.length === 0) {
      setError('No loan records found in the system.');
    } else {
      setError('');
    }
  };

  const fetchHeaderConfig = async (token) => {
    try {
      const response = await fetch('/api/v1/header/1', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setHeaderData(data);
        return data;
      }
    } catch (err) {
      console.error('Error fetching header config:', err);
    }
    const fallbackHeader = {
      organisationName: 'THE METRO GROUP FOUNDATION',
      boxNo: '808',
      postalCode: '00515, Buru Buru Nairobi',
      mainTelNo: '0785278786 or 0705767392',
      email: 'info@tmgfoundation.org'
    };
    setHeaderData(fallbackHeader);
    return fallbackHeader;
  };

  const handleViewStatement = async (loan) => {
    setSelectedLoan(loan);
    setStatementLoading(true);
    setShowModal(true);

    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
    }
    setPdfBlob(null);

    try {
      const token = localStorage.getItem('authToken');
      const memberNumber = localStorage.getItem('memberNumber');

      const response = await fetch('/api/v1/loan-statement-direct', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          loanNo: loan.loanNo,
          memberNo: memberNumber,
          startDate: loan.rawStartDate || loan.sdate,
          endDate: loan.rawEndDate || loan.edate,
          principalAmount: loan.originalAmount,
          outstandingBalance: loan.balance,
          purpose: loan.purpose,
          period: loan.period,
          payMode: loan.payMode,
          interestRate: loan.interestRate,
          status: loan.status,
          isPending: loan.isPending,
        })
      });

      if (response.ok) {
        const blob = await response.blob();
        setPdfBlob(blob);
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);
      } else {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData.message || 'Failed to generate statement');
      }
    } catch (err) {
      console.error('Error generating statement:', err);
      setError('Failed to generate loan statement. Please try again.');
    } finally {
      setStatementLoading(false);
    }
  };

  const handleDownloadStatement = () => {
    if (pdfBlob && selectedLoan) {
      const downloadUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `loan-statement-${selectedLoan.loanNo}-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);
    } else if (pdfUrl) {
      fetch(pdfUrl)
        .then(res => res.blob())
        .then(blob => {
          const downloadUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.download = `loan-statement-${selectedLoan.loanNo}-${new Date().toISOString().split('T')[0]}.pdf`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(downloadUrl);
        })
        .catch(err => console.error('Download failed:', err));
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedLoan(null);
    setPdfBlob(null);
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
    }
  };

  const handleMainPDFDownload = async () => {
    try {
      const pdf = new jsPDF('l', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 12;
      const tableWidth = pageWidth - (margin * 2);
      // TMG blue for PDF header fill
      const brandRgb = [27, 58, 107];
      let y = 14;

      const drawText = (text, x, yPos, options = {}) => {
        pdf.text(String(text ?? ''), x, yPos, options);
      };

      const drawHeader = () => {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(13);
        drawText(headerData?.organisationName || 'THE METRO GROUP FOUNDATION', pageWidth / 2, y, { align: 'center' });
        y += 6;
        pdf.setFontSize(10);
        drawText('Member Loan Statement Summary', pageWidth / 2, y, { align: 'center' });
        y += 5;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        drawText(`Generated: ${new Date().toLocaleDateString('en-GB')}`, pageWidth / 2, y, { align: 'center' });
        y += 8;
        pdf.setDrawColor(0, 0, 0);
        pdf.line(margin, y, pageWidth - margin, y);
        y += 6;
      };

      const drawInfoTable = (title, rows) => {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        drawText(title, margin, y);
        y += 3;

        const widths = [32, 106, 32, 106];
        const rowHeight = 8;
        rows.forEach((row) => {
          let x = margin;
          row.forEach((cell, index) => {
            pdf.rect(x, y, widths[index], rowHeight);
            pdf.setFont('helvetica', index % 2 === 0 ? 'bold' : 'normal');
            pdf.setFontSize(7.5);
            const value = String(cell ?? '');
            const lines = pdf.splitTextToSize(value, widths[index] - 3);
            drawText(lines[0] || '', x + 1.5, y + 5.2);
            x += widths[index];
          });
          y += rowHeight;
        });
        y += 6;
      };

      const loanColumns = [
        { label: 'Loan No', key: 'loanNo', width: 28, align: 'left' },
        { label: 'Purpose', key: 'purpose', width: 38, align: 'left' },
        { label: 'Start Date', key: 'sdate', width: 22, align: 'left' },
        { label: 'End Date', key: 'edate', width: 22, align: 'left' },
        { label: 'Period', key: 'period', width: 16, align: 'center' },
        { label: 'Interest', key: 'interest', width: 24, align: 'right' },
        { label: 'Pay Mode', key: 'payMode', width: 26, align: 'left' },
        { label: 'Principal (KES)', key: 'principal', width: 32, align: 'right' },
        { label: 'Monthly (KES)', key: 'monthly', width: 31, align: 'right' },
        { label: 'Outstanding (KES)', key: 'outstanding', width: 34, align: 'right' },
        { label: 'Status', key: 'status', width: tableWidth - 273, align: 'left' },
      ];

      const drawLoanTableHeader = () => {
        pdf.setFillColor(...brandRgb);
        pdf.setTextColor(255, 255, 255);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7.2);
        let x = margin;
        loanColumns.forEach((column) => {
          pdf.rect(x, y, column.width, 9, 'F');
          drawText(column.label, x + 1.5, y + 5.8, {
            width: column.width - 3,
            align: column.align,
          });
          x += column.width;
        });
        pdf.setTextColor(0, 0, 0);
        y += 9;
      };

      const drawLoanRow = (row, bold = false) => {
        if (y > pageHeight - 24) {
          pdf.addPage();
          y = 14;
          drawLoanTableHeader();
        }

        const rowHeight = 8;
        let x = margin;
        pdf.setFont('helvetica', bold ? 'bold' : 'normal');
        pdf.setFontSize(7.2);
        loanColumns.forEach((column) => {
          pdf.rect(x, y, column.width, rowHeight);
          const value = String(row[column.key] ?? '');
          const lines = pdf.splitTextToSize(value, column.width - 3);
          drawText(lines[0] || '', x + 1.5, y + 5.2, {
            width: column.width - 3,
            align: column.align,
          });
          x += column.width;
        });
        y += rowHeight;
      };

      drawHeader();
      drawInfoTable('MEMBER INFORMATION', [
        ['Name', memberData?.holdersName || memberData?.name || 'N/A', 'Member No', memberData?.accNo || memberData?.memberNo || 'N/A'],
        ['Email', memberData?.emailAdd || memberData?.email || 'N/A', 'Phone', memberData?.tel1 || memberData?.phone || 'N/A'],
        ['ID No', memberData?.idNo || memberData?.idNumber || 'N/A', 'Print Date', new Date().toLocaleDateString('en-GB')],
      ]);

      drawInfoTable('LOAN SUMMARY', [
        ['Open Balances', loanData.length, 'Total Principal', `KES ${formatCurrency(totalLoanAmount)}`],
        ['Net Outstanding', `KES ${formatCurrency(totalOutstanding)}`, 'Report Status', 'Outstanding balances >= KES 1'],
      ]);

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      drawText('LOAN INFORMATION', margin, y);
      y += 4;
      drawLoanTableHeader();

      loanData.forEach((loan) => {
        drawLoanRow({
          loanNo: loan.loanNo,
          purpose: loan.purpose,
          sdate: loan.sdate,
          edate: loan.edate,
          period: loan.period,
          interest: formatInterest(loan.interestRate),
          payMode: formatPayMode(loan.payMode),
          principal: formatCurrency(loan.originalAmount),
          monthly: loan.monthlyRepayment > 0 ? formatCurrency(loan.monthlyRepayment) : 'N/A',
          outstanding: formatCurrency(loan.balance),
          status: loan.status,
        });
      });

      drawLoanRow({
        loanNo: '',
        purpose: 'TOTAL OPEN BALANCES',
        sdate: '',
        edate: '',
        period: '',
        interest: '',
        payMode: '',
        principal: formatCurrency(totalLoanAmount),
        monthly: '',
        outstanding: formatCurrency(totalOutstanding),
        status: '',
      }, true);

      y += 8;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      drawText('Note: This statement shows loans with ledger outstanding balances of KES 1 or more. Sub-shilling rounding residues are treated as settled.', margin, y);

      pdf.save(`loan-summary-${memberData?.accNo || 'member'}-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('Error generating PDF:', err);
      setError('We could not generate the PDF right now. Please try again.');
    }
  };

  const formatCurrency = (value) => {
    if (value === undefined || value === null) return 'N/A';
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatInterest = (value) => {
    if (value === undefined || value === null || value === '') return 'N/A';
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return String(value);
    return numeric > 100 ? `KES ${formatCurrency(numeric)}` : `${numeric.toFixed(2)}%`;
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError('');

      try {
        let token = localStorage.getItem('authToken');
        let memberNumber = localStorage.getItem('memberNumber');

        const cachedProfile = localStorage.getItem('memberProfile');
        if (cachedProfile) {
          try {
            setMemberData(normalizeMemberProfile(JSON.parse(cachedProfile)));
          } catch (parseErr) {
            console.error('Failed to parse cached member profile:', parseErr);
          }
        }

        if (!token) {
          const storedMemberData = localStorage.getItem('memberData');
          if (storedMemberData) {
            const parsed = JSON.parse(storedMemberData);
            token = parsed.token || parsed.accessToken;
            memberNumber = memberNumber || parsed.accNo || parsed.memberNo;
          }
        }

        if (!token) {
          setError('Your session needs a refresh. Please log in again to view loans.');
          setLoading(false);
          return;
        }

        if (!memberNumber) {
          setError('We could not find your member number. Please log in again.');
          setLoading(false);
          return;
        }

        await fetchHeaderConfig(token);

        try {
          const memberResponse = await fetch(`/api/v1/member/${memberNumber}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
          });

          if (memberResponse.ok) {
            const member = normalizeMemberProfile(await memberResponse.json());
            setMemberData(member);
            localStorage.setItem('memberProfile', JSON.stringify(member));
          }
        } catch (err) {
          console.error('Error fetching member data:', err);
        }

        const instantUrl = `/api/v1/instant/${memberNumber}`;
        const instantResponse = await fetch(instantUrl, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
        });

        if (instantResponse.ok) {
          const instantData = await instantResponse.json();

          let pendingData = { data: [] };
          try {
            const pendingResponse = await fetch(`/api/v1/loan-applications/${memberNumber}`, {
              method: 'GET',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
            });

            if (pendingResponse.ok) {
              pendingData = await pendingResponse.json();
            }
          } catch (pendingErr) {
            console.error('Error fetching pending loans:', pendingErr);
          }

          const activeLoans = Array.isArray(instantData?.data)
            ? instantData.data
            : Array.isArray(instantData)
              ? instantData
              : [];

          const pendingLoans = Array.isArray(pendingData?.data) ? pendingData.data : [];

          processLoanData({
            data: [...activeLoans, ...pendingLoans]
          });
        } else {
          try {
            const pendingResponse = await fetch(`/api/v1/loan-applications/${memberNumber}`, {
              method: 'GET',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
            });

            if (pendingResponse.ok) {
              const pendingData = await pendingResponse.json();
              processLoanData(pendingData);
            } else {
              setError('We could not refresh your loan balances right now. Please try again.');
              setLoanData([]);
            }
          } catch (pendingErr) {
            console.error('Failed to fetch pending loans:', pendingErr);
            setError('We could not refresh your loan balances right now. Please try again.');
            setLoanData([]);
          }
        }

      } catch (err) {
        console.error('Error fetching data:', err);
        setError('We could not reach the server right now. Please check your connection and try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [refreshKey]);

  useEffect(() => {
    const refreshAfterMpesa = (event) => {
      const purpose = event?.detail?.purpose;
      if (purpose && purpose !== 'loan_repayment') return;
      setLoading(true);
      setRefreshKey((key) => key + 1);
    };

    window.addEventListener('mpesa:payment-success', refreshAfterMpesa);
    return () => window.removeEventListener('mpesa:payment-success', refreshAfterMpesa);
  }, []);

  const totalLoanAmount = loanData.reduce((sum, loan) => sum + (loan.originalAmount || 0), 0);
  const totalOutstanding = loanData.reduce((sum, loan) => sum + (loan.balance || 0), 0);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading active loan information...</p>
        <style>{`
          .loading-container { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 400px; background: white; border-radius: 12px; padding: 2rem; }
          .loading-spinner { width: 50px; height: 50px; border: 4px solid #e2e8f0; border-top-color: ${brandColor}; border-radius: 50%; animation: spin 1s linear infinite; }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  return (
    <>
      <div className="report-container">
        <div className="report-header">
          <h1>{headerData?.organisationName || 'THE METRO GROUP FOUNDATION'}</h1>
          <p>Member Loan Statement Summary</p>
          {headerData && (
            <div className="contact-info">
              <small>{headerData.boxNo || ''} {headerData.postalCode ? `| ${headerData.postalCode}` : ''}</small>
              <br />
              <small>Tel: {headerData.mainTelNo || 'N/A'} | Email: {headerData.email || 'N/A'}</small>
            </div>
          )}
          <p style={{ fontSize: '0.7rem', marginTop: '0.5rem' }}>Generated: {new Date().toLocaleDateString('en-GB')}</p>
        </div>

        <div className="member-section">
          <table className="info-table">
            <tbody>
              <tr>
                <td className="info-label">Name:</td>
                <td className="info-value"><strong>{memberData?.holdersName || memberData?.name || 'N/A'}</strong> {memberData?.accNo ? `(${memberData.accNo})` : ''}</td>
                <td className="info-label">Member No:</td>
                <td className="info-value"><strong>{memberData?.accNo || memberData?.memberNo || 'N/A'}</strong></td>
              </tr>
              <tr>
                <td className="info-label">Email:</td>
                <td className="info-value">{memberData?.emailAdd || memberData?.email || 'N/A'}</td>
                <td className="info-label">Tel:</td>
                <td className="info-value">{memberData?.tel1 || memberData?.phone || 'N/A'}</td>
              </tr>
              <tr>
                <td className="info-label">ID No:</td>
                <td className="info-value"><strong>{memberData?.idNo || memberData?.idNumber || 'N/A'}</strong></td>
                <td className="info-label">Print Date:</td>
                <td className="info-value"><strong>{new Date().toLocaleDateString('en-GB')}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="loan-summary-strip">
          <div>
            <span>Open balances</span>
            <strong>{loanData.length}</strong>
          </div>
          <div>
            <span>Total principal</span>
            <strong>{formatCurrency(totalLoanAmount)}</strong>
          </div>
          <div>
            <span>Net outstanding</span>
            <strong>{formatCurrency(totalOutstanding)}</strong>
          </div>
        </div>

        <div className="table-section">
          <div className="table-responsive">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Loan No</th>
                  <th>Purpose</th>
                  <th>Start Date</th>
                  <th>End Date</th>
                  <th>Period (Months)</th>
                  <th>Interest</th>
                  <th>Pay Mode</th>
                  <th>Principal (KES)</th>
                  <th>Monthly Repayment (KES)</th>
                  <th>Outstanding Balance (KES)</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {loanData.length > 0 ? loanData.map((loan, idx) => (
                  <tr key={loan.id || idx}>
                    <td data-label="Loan No"><strong>{loan.loanNo}</strong></td>
                    <td data-label="Purpose"><strong>{loan.purpose}</strong></td>
                    <td data-label="Start Date">{loan.sdate}</td>
                    <td data-label="End Date">{loan.edate}</td>
                    <td data-label="Period">{loan.period}</td>
                    <td data-label="Interest" className="amount"><strong>{formatInterest(loan.interestRate)}</strong></td>
                    <td data-label="Pay Mode"><strong>{formatPayMode(loan.payMode)}</strong></td>
                    <td data-label="Principal" className="amount"><strong>{formatCurrency(loan.originalAmount)}</strong></td>
                    <td data-label="Monthly Repayment" className="amount"><strong>{loan.monthlyRepayment > 0 ? formatCurrency(loan.monthlyRepayment) : 'N/A'}</strong></td>
                    <td data-label="Outstanding Balance" className="amount outstanding-cell">
                      {formatCurrency(loan.balance)}
                    </td>
                    <td data-label="Status">
                      {loan.status}
                    </td>
                    <td data-label="Action" className="action-cell">
                      <button
                        className="view-stmt-btn"
                        onClick={() => handleViewStatement(loan)}
                      >
                        {loan.isPending ? 'View Summary' : 'View Statement'}
                      </button>
                      {!loan.isPending && Number(loan.balance) > 0 && (
                        <button
                          className="mpesa-pay-btn"
                          onClick={() => setMpesaLoan(loan)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                            <path d="M12 2 3 7v6c0 5 3.8 8.7 9 9 5.2-.3 9-4 9-9V7l-9-5Z" fill="currentColor" opacity="0.22" />
                            <path d="M8.5 12.2 11 14.7l4.7-5.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          Pay via M-Pesa
                        </button>
                      )}
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="12" style={{ textAlign: 'center', padding: '2rem' }}>
                      <div className="statement-empty-state">
                        <strong>No open loan balances right now</strong>
                        <span>{error || 'You do not have any loan with a non-zero balance at the moment.'}</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
              {loanData.length > 0 && (
                <tfoot>
                  <tr className="total-row">
                    <td colSpan="7"><strong>TOTAL OPEN BALANCES</strong></td>
                    <td className="amount"><strong>{formatCurrency(totalLoanAmount)}</strong></td>
                    <td></td>
                    <td className="amount"><strong>{formatCurrency(totalOutstanding)}</strong></td>
                    <td></td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        <div className="report-footer">
          <p><strong>Note:</strong> This statement shows loans with ledger outstanding balances of KES 1 or more.</p>
          <p>Sub-shilling rounding residues are treated as settled and kept out of this summary.</p>
          <p>For any queries, please contact the office at {headerData?.email || 'info@tmgfoundation.org'}.</p>
        </div>
      </div>

      <div className="download-section">
        <button onClick={handleMainPDFDownload} className="download-btn" disabled={loanData.length === 0}>
          📄 Download PDF Summary
        </button>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedLoan?.isPending ? 'Loan Application Summary' : 'Loan Statement'} - {selectedLoan?.loanNo}</h2>
              <button className="modal-close" onClick={handleCloseModal}>×</button>
            </div>
            <div className="modal-body">
              {statementLoading ? (
                <div className="modal-loading">
                  <div className="loading-spinner-small"></div>
                  <p>Generating detailed loan statement...</p>
                </div>
              ) : pdfUrl ? (
                <iframe
                  src={`${pdfUrl}#toolbar=1&navpanes=1&scrollbar=1&view=FitH`}
                  title={`${selectedLoan?.isPending ? 'Loan Application Summary' : 'Loan Statement'} ${selectedLoan?.loanNo}`}
                  className="pdf-viewer"
                  frameBorder="0"
                />
              ) : (
                <div className="error-container">
                  <p>Failed to load statement. Please try again.</p>
                </div>
              )}
            </div>
            <div className="modal-footer">
              {pdfBlob && (
                <button onClick={handleDownloadStatement} className="download-stmt-btn">
                  📄 Download PDF
                </button>
              )}
              <button className="close-modal-btn" onClick={handleCloseModal}>Close</button>
            </div>
          </div>
        </div>
      )}

      <MpesaPaymentModal
        isOpen={!!mpesaLoan}
        onClose={() => setMpesaLoan(null)}
        memberNo={localStorage.getItem('memberNumber')}
        purpose="loan_repayment"
        accountReference={mpesaLoan?.loanNo}
        defaultAmount={mpesaLoan?.monthlyRepayment > 0 ? mpesaLoan.monthlyRepayment : mpesaLoan?.balance}
        defaultPhone={memberData?.tel1}
      />

      <style>{`
        .report-container {
          background: white;
          padding: 2rem;
          border-radius: 16px;
          max-width: 1400px;
          margin: 0 auto;
          font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          box-shadow: 0 4px 16px rgba(18, 41, 76, 0.06);
        }
        .report-header {
          text-align: center;
          margin-bottom: 2rem;
          padding-bottom: 1rem;
          border-bottom: 2px solid ${colors.primary};
        }
        .report-header h1 {
          font-size: 1.25rem;
          margin: 0;
          color: ${colors.primary};
          font-weight: 800;
          letter-spacing: 0.3px;
        }
        .report-header p {
          color: #4a5568;
          margin: 0.25rem 0 0;
          font-size: 0.9rem;
        }
        .contact-info {
          font-size: 0.7rem;
          margin-top: 0.5rem;
          color: #718096;
        }

        .table-responsive {
          width: 100%;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }

        .info-table, .report-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 1rem;
        }

        .info-table td {
          border: 1px solid #e2e8f0;
          padding: 0.5rem;
          font-size: 0.78rem;
        }

        .info-label {
          background: ${colors.softBlue};
          color: ${colors.primary};
          font-weight: 700;
          width: 15%;
        }

        .info-value {
          color: #1a202c;
          width: 35%;
        }

        .loan-summary-strip {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.75rem;
          margin-bottom: 1rem;
        }

        .loan-summary-strip div {
          border: 1px solid rgba(27, 58, 107, 0.15);
          border-radius: 14px;
          padding: 0.9rem;
          background: linear-gradient(135deg, ${colors.softBlue}, #ffffff);
        }

        .loan-summary-strip span,
        .loan-summary-strip strong {
          display: block;
        }

        .loan-summary-strip span {
          color: #64748b;
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .loan-summary-strip strong {
          margin-top: 0.35rem;
          color: ${colors.primary};
          font-size: 1rem;
          font-weight: 800;
        }

        .statement-empty-state {
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          gap: 0.35rem;
          color: ${colors.primary};
          background: ${colors.softBlue};
          border: 1px solid rgba(27, 58, 107, 0.2);
          border-radius: 16px;
          padding: 1rem 1.25rem;
          max-width: 440px;
        }

        .statement-empty-state strong {
          font-size: 0.95rem;
        }

        .statement-empty-state span {
          color: #4b5563;
          line-height: 1.5;
        }

        .report-table td, .report-table th {
          border: 1px solid #e2e8f0;
          padding: 0.6rem 0.5rem;
          font-size: 0.78rem;
        }

        .report-table th {
          background: ${colors.primary};
          color: white;
          font-weight: 700;
          white-space: nowrap;
          text-align: left;
          letter-spacing: 0.3px;
        }

        .report-table td {
          word-break: break-word;
          color: #1a202c;
        }

        .report-table tbody tr:nth-child(even) {
          background: #fafbfd;
        }

        .report-table tbody tr:hover {
          background: ${colors.softBlue};
        }

        .amount {
          text-align: right;
        }

        .outstanding-cell {
          color: ${colors.accent};
          font-weight: 700;
        }

        .view-stmt-btn {
          background: ${colors.primary};
          color: white;
          border: none;
          padding: 0.35rem 0.85rem;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.7rem;
          font-weight: 700;
          white-space: nowrap;
          transition: all 0.2s;
        }

        .view-stmt-btn:hover {
          background: ${colors.primaryDark};
          transform: translateY(-1px);
          box-shadow: 0 4px 10px rgba(27, 58, 107, 0.25);
        }

        .mpesa-pay-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          background: linear-gradient(135deg, #27ae60, #1e8e4a);
          color: #fff;
          border: none;
          padding: 0.32rem 0.85rem;
          border-radius: 100px;
          cursor: pointer;
          font-size: 0.7rem;
          font-weight: 700;
          white-space: nowrap;
          box-shadow: 0 8px 16px rgba(39, 174, 96, 0.24);
          transition: transform 0.15s, box-shadow 0.15s;
        }

        .mpesa-pay-btn svg {
          width: 13px;
          height: 13px;
          flex-shrink: 0;
        }

        .mpesa-pay-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 20px rgba(39, 174, 96, 0.32);
        }

        .total-row {
          background: ${colors.softBlue} !important;
          font-weight: 800;
          color: ${colors.primary};
        }

        .total-row td {
          border-color: rgba(27, 58, 107, 0.2);
          color: ${colors.primary};
        }

        .report-footer {
          margin-top: 1rem;
          text-align: center;
          font-size: 0.72rem;
          color: #64748b;
          line-height: 1.6;
        }

        .report-footer strong {
          color: ${colors.primary};
        }

        .download-section {
          text-align: center;
          margin-top: 1rem;
        }

        .download-btn {
          background: linear-gradient(135deg, ${colors.primary}, ${colors.primaryDark});
          color: white;
          border: none;
          padding: 0.7rem 1.75rem;
          border-radius: 10px;
          cursor: pointer;
          font-weight: 700;
          font-size: 0.85rem;
          box-shadow: 0 6px 16px rgba(27, 58, 107, 0.25);
          transition: all 0.2s;
        }

        .download-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 22px rgba(27, 58, 107, 0.35);
        }

        .download-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(18, 41, 76, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal-container {
          background: white;
          border-radius: 14px;
          width: 90%;
          max-width: 1200px;
          height: 90vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 1.25rem;
          border-bottom: 2px solid ${colors.primary};
          background: ${colors.softBlue};
        }

        .modal-header h2 {
          margin: 0;
          font-size: 1.1rem;
          color: ${colors.primary};
        }

        .modal-close {
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          font-weight: bold;
          color: ${colors.primary};
          line-height: 1;
        }

        .modal-close:hover {
          color: ${colors.accent};
        }

        .modal-body {
          flex: 1;
          overflow: auto;
          padding: 0;
          min-height: 0;
        }

        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 1rem;
          padding: 1rem;
          border-top: 1px solid #e2e8f0;
        }

        .download-stmt-btn, .close-modal-btn {
          padding: 0.55rem 1.15rem;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.85rem;
          font-weight: 700;
          transition: all 0.2s;
        }

        .download-stmt-btn {
          background: linear-gradient(135deg, ${colors.primary}, ${colors.primaryDark});
          color: white;
        }

        .download-stmt-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(27, 58, 107, 0.25);
        }

        .close-modal-btn {
          background: #6b7280;
          color: white;
        }

        .close-modal-btn:hover {
          background: #4b5563;
        }

        .pdf-viewer {
          width: 100%;
          height: 100%;
          border: none;
        }

        .modal-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          gap: 1rem;
        }

        .loading-spinner-small {
          width: 40px;
          height: 40px;
          border: 3px solid #e2e8f0;
          border-top-color: ${colors.primary};
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        .error-container {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: ${colors.accent};
        }

        .action-cell {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 768px) {
          .report-container {
            padding: 1rem;
          }

          .loan-summary-strip {
            grid-template-columns: 1fr;
          }

          .report-table thead {
            display: none;
          }

          .report-table,
          .report-table tbody,
          .report-table tr,
          .report-table td {
            display: block;
          }

          .report-table tr {
            margin-bottom: 1rem;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 0.5rem;
            background: white;
          }

          .report-table td {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.5rem;
            border: none;
            border-bottom: 1px solid #f0f4f8;
          }

          .report-table td:last-child {
            border-bottom: none;
          }

          .report-table td::before {
            content: attr(data-label);
            font-weight: 700;
            width: 40%;
            min-width: 120px;
            color: ${colors.primary};
            font-size: 0.72rem;
            text-transform: uppercase;
            letter-spacing: 0.3px;
          }

          .report-table td.amount {
            justify-content: flex-end;
          }

          .report-table td.amount::before {
            text-align: left;
          }

          .action-cell {
            justify-content: center;
          }

          .modal-container {
            width: 95%;
            height: 85vh;
          }
        }

        @media print {
          .download-section, .modal-overlay { display: none; }
        }
      `}</style>
    </>
  );
}

export default LoanStatement;
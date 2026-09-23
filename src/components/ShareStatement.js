// ShareStatement.js - TMG Foundation themed
import React, { useRef, useState, useEffect } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import Alert from './Alert';

function ShareStatement() {
  const reportRef = useRef();
  const [memberData, setMemberData] = useState(null);
  const [shareTransactions, setShareTransactions] = useState([]);
  const [totals, setTotals] = useState({ totalSavings: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [headerData, setHeaderData] = useState(null);
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

  const processSavingsData = (data) => {
    let transactions = [];
    const apiTotalSavings = data && typeof data === 'object' && !Array.isArray(data)
      ? Number(data.totalSavings ?? data.total ?? data.balance)
      : NaN;

    if (Array.isArray(data)) {
      transactions = data;
    } else if (data && typeof data === 'object') {
      if (data.transactions) transactions = data.transactions;
      else if (data.data) transactions = data.data;
      else if (data.savings) transactions = data.savings;
      else if (data.savingsTransactions) transactions = data.savingsTransactions;
      else if (data.statement) transactions = data.statement;
      else {
        transactions = Object.values(data).filter(item => item && typeof item === 'object' && item.inputDate);
      }
    }

    const formattedTransactions = transactions.map((item, index) => ({
      id: index,
      inputDate: item?.inputDate || item?.date || item?.transactionDate || 'N/A',
      narration: item?.narration || item?.description || item?.type || 'Savings Transaction',
      ref: item?.refNo || item?.reference || item?.ref || item?.transactionId || `SAV${index + 1}`,
      savings: parseFloat(item?.savings || item?.amount || item?.deposit || item?.credit || 0),
      runningAmt: parseFloat(item?.runningTotal || item?.runningAmt || item?.runningBalance || item?.balance || 0)
    }));

    setShareTransactions(formattedTransactions);

    let totalSavings = Number.isFinite(apiTotalSavings) ? apiTotalSavings : 0;
    if (!Number.isFinite(apiTotalSavings) && formattedTransactions.length > 0) {
      const lastTransaction = formattedTransactions[formattedTransactions.length - 1];
      totalSavings = lastTransaction.runningAmt || 0;

      if (totalSavings === 0) {
        totalSavings = formattedTransactions.reduce((sum, t) => sum + (t.savings || 0), 0);
      }
    }

    const nextTotals = { totalSavings };
    setTotals(nextTotals);
    localStorage.setItem('savingsTransactions', JSON.stringify({
      transactions: formattedTransactions,
      totals: nextTotals
    }));
  };

  const fetchHeaderConfig = async (token) => {
    try {
      const response = await fetch('/api/v1/header/1', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
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

  const safeFormatNumber = (value) => {
    if (value === undefined || value === null || isNaN(value)) {
      return '0.00';
    }
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  useEffect(() => {
    const cachedMember = localStorage.getItem('memberProfile');

    if (cachedMember) {
      try {
        setMemberData(JSON.parse(cachedMember));
      } catch (e) {
        console.error('Error loading cached member:', e);
      }
    }

    const fetchData = async () => {
      setError('');

      try {
        let token = localStorage.getItem('authToken');
        let memberNumber = localStorage.getItem('memberNumber');

        if (!token) {
          const storedMemberData = localStorage.getItem('memberData');
          if (storedMemberData) {
            const parsed = JSON.parse(storedMemberData);
            token = parsed.token || parsed.accessToken;
            memberNumber = memberNumber || parsed.accNo || parsed.memberNo;
          }
        }

        if (!token) {
          setError('Your session needs a refresh. Please log in again to view savings.');
          setLoading(false);
          return;
        }

        if (!memberNumber) {
          setError('We could not find your member number. Please log in again.');
          setLoading(false);
          return;
        }

        await fetchHeaderConfig(token);

        const memberResponse = await fetch(`/api/v1/member/${memberNumber}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });

        if (memberResponse.ok) {
          const member = await memberResponse.json();
          setMemberData(member);
          localStorage.setItem('memberProfile', JSON.stringify(member));
        } else {
          const cachedProfile = localStorage.getItem('memberProfile');
          if (cachedProfile) {
            setMemberData(JSON.parse(cachedProfile));
          } else {
            setError('We could not refresh your member details. Showing available statement data.');
          }
        }

        const savingsUrl = `/api/v1/savings/${memberNumber}`;

        const savingsResponse = await fetch(savingsUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });

        if (savingsResponse.ok) {
          const savingsData = await savingsResponse.json();

          if (savingsData && (Array.isArray(savingsData) ? savingsData.length > 0 : Object.keys(savingsData).length > 0)) {
            processSavingsData(savingsData);
          } else {
            setError('No savings records were found for this member.');
            setShareTransactions([]);
            setTotals({ totalSavings: 0 });
          }
        } else if (savingsResponse.status === 404) {
          setError('No savings records were found for this member.');
          setShareTransactions([]);
          setTotals({ totalSavings: 0 });
        } else {
          setError('We could not refresh your savings statement right now. Please try again.');
          setShareTransactions([]);
          setTotals({ totalSavings: 0 });
        }

      } catch (err) {
        console.error('Error fetching data:', err);
        const cachedSavings = localStorage.getItem('savingsTransactions');
        if (cachedSavings) {
          try {
            const parsed = JSON.parse(cachedSavings);
            setShareTransactions(parsed.transactions || []);
            setTotals(parsed.totals || { totalSavings: 0 });
            setError('We could not refresh your statement, so we are showing the last saved copy.');
          } catch {
            setError('We could not reach the server right now. Please check your connection and try again.');
            setShareTransactions([]);
            setTotals({ totalSavings: 0 });
          }
        } else {
          setError('We could not reach the server right now. Please check your connection and try again.');
          setShareTransactions([]);
          setTotals({ totalSavings: 0 });
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [refreshKey]);

  useEffect(() => {
    const refreshAfterMpesa = (event) => {
      const purpose = event?.detail?.purpose;
      if (purpose && purpose !== 'member_deposit') return;
      localStorage.removeItem('savingsTransactions');
      setLoading(true);
      setRefreshKey((key) => key + 1);
    };

    window.addEventListener('mpesa:payment-success', refreshAfterMpesa);
    return () => window.removeEventListener('mpesa:payment-success', refreshAfterMpesa);
  }, []);

  const handleDownloadPDF = async () => {
    const element = reportRef.current;
    const canvas = await html2canvas(element, {
      scale: 2,
      backgroundColor: '#ffffff',
      logging: false,
      useCORS: true
    });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgWidth = 210;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
    pdf.save(`savings-statement-${memberData?.accNo || 'member'}-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  if (loading && !memberData && shareTransactions.length === 0) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading savings information...</p>
        <style>{`
          .loading-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 400px;
            background: white;
            border-radius: 12px;
            padding: 2rem;
          }
          .loading-spinner {
            width: 50px;
            height: 50px;
            border: 4px solid #e2e8f0;
            border-top-color: ${brandColor};
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
          .loading-container p {
            margin-top: 1rem;
            color: #4a5568;
          }
        `}</style>
      </div>
    );
  }

  return (
    <>
      <div ref={reportRef} className="report-container">
        <div className="report-header">
          <h1>{headerData?.organisationName || 'THE METRO GROUP FOUNDATION'}</h1>
          <p>Deposits/Savings Statement</p>
          {headerData && (
            <div className="contact-info">
              <small>{headerData.boxNo} | {headerData.postalCode}</small>
              <br />
              <small>Tel: {headerData.mainTelNo} | Email: {headerData.email}</small>
            </div>
          )}
          <p style={{ fontSize: '0.7rem', marginTop: '0.5rem' }}>
            Generated: {new Date().toLocaleDateString()}
          </p>
        </div>

        <div className="member-section">
          <table className="info-table">
            <tbody>
              <tr>
                <td className="info-label">Name:</td>
                <td className="info-value"><strong>{memberData?.holdersName || memberData?.name || 'N/A'}</strong></td>
                <td className="info-label">Member No:</td>
                <td className="info-value"><strong>{memberData?.accNo || memberData?.memberNo || 'N/A'}</strong></td>
              </tr>
              <tr>
                <td className="info-label">Tel:</td>
                <td className="info-value">{memberData?.tel1 || memberData?.phone || 'N/A'}</td>
                <td className="info-label">ID No:</td>
                <td className="info-value"><strong>{memberData?.idNo || memberData?.idNumber || 'N/A'}</strong></td>
              </tr>
              <tr>
                <td className="info-label">Email:</td>
                <td className="info-value" colSpan="3">{memberData?.emailAdd || memberData?.email || 'N/A'}</td>
              </tr>
              <tr>
                <td className="info-label">Print Date:</td>
                <td className="info-value" colSpan="3"><strong>{new Date().toLocaleDateString()}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="table-section">
          <table className="report-table">
            <thead>
              <tr>
                <th>Input Date</th>
                <th>Narration</th>
                <th>Ref</th>
                <th>Savings (KES)</th>
                <th>Running Amt (KES)</th>
              </tr>
            </thead>
            <tbody>
              {shareTransactions.length > 0 ? (
                shareTransactions.map((transaction, idx) => (
                  <tr key={transaction.id || idx}>
                    <td className="date-cell"><strong>{transaction.inputDate || 'N/A'}</strong></td>
                    <td className="narration-cell"><strong>{transaction.narration || 'N/A'}</strong></td>
                    <td>{transaction.ref || 'N/A'}</td>
                    <td className="amount credit-cell"><strong>{safeFormatNumber(transaction.savings)}</strong></td>
                    <td className="amount"><strong>{safeFormatNumber(transaction.runningAmt)}</strong></td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" style={{ padding: '1.5rem' }}>
                    <div className="empty-state">
                      <strong>No savings transactions yet</strong>
                      <span>Your savings deposits will appear here once they begin.</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
            {shareTransactions.length > 0 && (
              <tfoot>
                <tr className="total-row">
                  <td colSpan="3"><strong>TOTAL SAVINGS</strong></td>
                  <td className="amount"><strong>{safeFormatNumber(totals.totalSavings)}</strong></td>
                  <td className="amount"><strong>{safeFormatNumber(totals.totalSavings)}</strong></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="report-footer">
          <p><strong>Note:</strong> This statement shows your savings/deposit transactions.</p>
          <p>For any queries, please contact the office at {headerData?.email || 'info@tmgfoundation.org'}.</p>
        </div>
      </div>

      <div className="download-section">
        <button onClick={handleDownloadPDF} className="download-btn" disabled={shareTransactions.length === 0}>
          📄 Download PDF Statement
        </button>
      </div>

      {error && (
        <div style={{ maxWidth: '1200px', margin: '1rem auto' }}>
          <Alert type="warning" title="Savings statement notice">
            {error}
          </Alert>
        </div>
      )}

      <style>{`
        .report-container {
          background: white;
          padding: 2rem;
          border-radius: 16px;
          box-shadow: 0 4px 16px rgba(18, 41, 76, 0.06);
          font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          max-width: 1200px;
          margin: 0 auto;
          transform: translateZ(0);
          backface-visibility: hidden;
          -webkit-font-smoothing: antialiased;
        }

        .report-header {
          text-align: center;
          margin-bottom: 2rem;
          padding-bottom: 1rem;
          border-bottom: 2px solid ${colors.primary};
        }

        .report-header h1 {
          font-size: 1.25rem;
          font-weight: 800;
          margin: 0;
          letter-spacing: 0.3px;
          color: ${colors.primary};
        }

        .report-header p {
          font-size: 0.95rem;
          margin: 0.25rem 0 0;
          color: #4a5568;
          font-weight: 600;
        }

        .contact-info {
          font-size: 0.72rem;
          color: #718096;
          margin-top: 0.5rem;
        }

        .info-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 1.5rem;
          font-size: 0.85rem;
        }

        .info-table td {
          padding: 0.6rem 0.75rem;
          border: 1px solid #e2e8f0;
        }

        .info-label {
          font-weight: 700;
          background-color: ${colors.softBlue};
          width: 100px;
          color: ${colors.primary};
        }

        .info-value {
          color: #1a202c;
          font-weight: 500;
        }

        .info-value strong {
          font-weight: 700;
          color: #1a202c;
        }

        .table-section {
          margin-bottom: 1.5rem;
          overflow-x: auto;
        }

        .report-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.78rem;
        }

        .report-table th {
          border: 1px solid rgba(27, 58, 107, 0.15);
          padding: 0.75rem 0.6rem;
          text-align: left;
          font-weight: 700;
          background: ${colors.primary};
          color: white;
          font-size: 0.72rem;
          letter-spacing: 0.3px;
          white-space: nowrap;
        }

        .report-table td {
          border: 1px solid #e2e8f0;
          padding: 0.6rem;
          color: #1a202c;
          font-weight: 500;
          background: white;
        }

        .report-table tbody tr:nth-child(even) td {
          background: #fafbfd;
        }

        .report-table tbody tr:hover td {
          background: ${colors.softBlue};
        }

        .report-table td.amount {
          text-align: right;
          padding-right: 0.75rem;
          font-weight: 600;
        }

        .report-table td strong {
          font-weight: 700;
          color: #1a202c;
        }

        .report-table td.date-cell,
        .report-table td.narration-cell {
          font-weight: 600;
        }

        .report-table td.credit-cell strong {
          color: #15803d;
        }

        .empty-state {
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          gap: 0.35rem;
          color: ${colors.primary};
          background: ${colors.softBlue};
          border: 1px dashed rgba(27, 58, 107, 0.3);
          border-radius: 10px;
          padding: 1rem 1.25rem;
          max-width: 440px;
        }

        .empty-state strong { font-size: 0.95rem; }
        .empty-state span { color: #4b5563; line-height: 1.5; font-size: 0.82rem; }

        .total-row td {
          background: ${colors.softBlue} !important;
          font-weight: 800;
          border-top: 2px solid ${colors.primary};
          border-bottom: 2px solid ${colors.primary};
          color: ${colors.primary};
        }

        .total-row td strong {
          color: ${colors.primary};
        }

        .report-footer {
          margin-top: 2rem;
          padding-top: 1rem;
          border-top: 1px solid #e2e8f0;
          text-align: center;
          font-size: 0.72rem;
          color: #64748b;
          line-height: 1.6;
        }

        .report-footer p {
          margin: 0.25rem 0;
          font-weight: 500;
        }

        .report-footer p strong {
          font-weight: 800;
          color: ${colors.primary};
        }

        .download-section {
          display: flex;
          justify-content: center;
          margin-top: 1.5rem;
        }

        .download-btn {
          padding: 0.75rem 2rem;
          background: linear-gradient(135deg, ${colors.primary}, ${colors.primaryDark});
          color: white;
          border: none;
          border-radius: 10px;
          font-size: 0.9rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 6px 16px rgba(27, 58, 107, 0.25);
        }

        .download-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 22px rgba(27, 58, 107, 0.35);
        }

        .download-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        @media print {
          .download-section {
            display: none;
          }

          .report-container {
            padding: 0;
            box-shadow: none;
          }

          .report-table th,
          .report-table td {
            border: 1px solid #000 !important;
          }
        }

        @media (max-width: 768px) {
          .report-container {
            padding: 1rem;
          }

          .report-table {
            font-size: 0.68rem;
          }

          .report-table th,
          .report-table td {
            padding: 0.4rem;
          }

          .info-table td {
            display: block;
            width: 100%;
          }

          .info-label {
            width: auto;
          }
        }
      `}</style>
    </>
  );
}

export default ShareStatement;
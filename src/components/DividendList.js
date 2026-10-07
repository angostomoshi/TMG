// DividendList.js - TMG Foundation themed (responsive)
import React, { useRef, useState, useEffect } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const CONTACT = {
  phone: '0739393584',
  phoneHref: 'tel:+254739393584',
  email: 'info@tmg.ke',
  emailHref: 'mailto:info@tmg.ke'
};

function DividendList() {
  const reportRef = useRef();
  const [memberData, setMemberData] = useState(null);
  const [dividendTransactions, setDividendTransactions] = useState([]);
  const [totals, setTotals] = useState({ totalDividends: 0, totalPaid: 0, netDividend: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [headerData, setHeaderData] = useState(null);

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

  const processDividendData = (data) => {
    let transactions = [];

    if (Array.isArray(data)) {
      transactions = data;
    } else if (data && typeof data === 'object') {
      if (data.inputDate || data.dividend !== undefined) {
        transactions = [data];
      } else if (data.transactions) {
        transactions = data.transactions;
      } else if (data.dividends) {
        transactions = data.dividends;
      } else if (data.data) {
        transactions = data.data;
      }
    }

    const formattedTransactions = transactions.map((item, index) => ({
      id: index,
      date: item.inputDate || item.date || item.transactionDate || 'N/A',
      narration: item.narration || item.description || 'Dividend Payment',
      ref: item.refNo || item.reference || item.ref || `DIV${index + 1}`,
      dividend: parseFloat(item.dividend || item.dividendAmount || 0),
      paid: parseFloat(item.paid || item.withholdingTax || item.tax || 0),
      runningAmt: parseFloat(item.runningTotal || item.balance || item.netAmount || 0)
    }));

    setDividendTransactions(formattedTransactions);

    const totalDiv = formattedTransactions.reduce((sum, t) => sum + t.dividend, 0);
    const totalPaid = formattedTransactions.reduce((sum, t) => sum + t.paid, 0);
    const finalRunningAmount = formattedTransactions.length > 0
      ? formattedTransactions[formattedTransactions.length - 1].runningAmt
      : totalDiv - totalPaid;
    const nextTotals = {
      totalDividends: totalDiv,
      totalPaid: totalPaid,
      netDividend: finalRunningAmount
    };

    setTotals(nextTotals);
    localStorage.setItem('dividendTransactions', JSON.stringify({
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
      mainTelNo: CONTACT.phone,
      email: CONTACT.email
    };
    setHeaderData(fallbackHeader);
    return fallbackHeader;
  };

  useEffect(() => {
    const cachedTransactions = localStorage.getItem('dividendTransactions');
    const cachedMember = localStorage.getItem('memberProfile');

    if (cachedTransactions) {
      try {
        const parsed = JSON.parse(cachedTransactions);
        setDividendTransactions(parsed.transactions || []);
        setTotals(parsed.totals || { totalDividends: 0, totalPaid: 0, netDividend: 0 });
        setLoading(false);
      } catch (e) {}
    }

    if (cachedMember) {
      try {
        setMemberData(JSON.parse(cachedMember));
      } catch (e) {}
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

        if (!memberNumber) {
          const urlParams = new URLSearchParams(window.location.search);
          memberNumber = urlParams.get('memberNo') || urlParams.get('accNo');
        }

        if (!token) {
          setError('Authentication required. Please login again.');
          setLoading(false);
          return;
        }

        if (!memberNumber) {
          setError('Member number not found. Please login again.');
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
            setError('Failed to fetch member data');
          }
        }

        const dividendUrl = `/api/v1/dividend/${memberNumber}`;

        try {
          const dividendResponse = await fetch(dividendUrl, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            }
          });

          if (dividendResponse.ok) {
            const dividendData = await dividendResponse.json();
            processDividendData(dividendData);
          } else {
            const errorText = await dividendResponse.text();
            console.error(`Dividend endpoint returned ${dividendResponse.status}:`, errorText);
            setError('We could not fetch dividend data for this member right now.');
            setDividendTransactions([]);
            setTotals({ totalDividends: 0, totalPaid: 0, netDividend: 0 });
          }
        } catch (err) {
          console.error('Error in dividend fetch:', err);
          setError('Network error. Unable to fetch dividend data.');
          setDividendTransactions([]);
          setTotals({ totalDividends: 0, totalPaid: 0, netDividend: 0 });
        }

      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Network error. Please check your connection.');

        const cachedProfile = localStorage.getItem('memberProfile');
        if (cachedProfile) {
          setMemberData(JSON.parse(cachedProfile));
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
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
    pdf.save(`dividend-statement-${memberData?.accNo || 'member'}-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const formatAmount = (value) =>
    Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (loading && !memberData && dividendTransactions.length === 0) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading dividend information...</p>
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
            margin: 1rem;
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
          <p>Dividend Statement</p>
          {headerData && (
            <div className="contact-info">
              <small>{headerData.boxNo} | {headerData.postalCode}</small>
              <br />
              <small>Tel: {headerData.mainTelNo} | Email: {headerData.email}</small>
            </div>
          )}
          <p className="generated-date">
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
                <td className="info-label">Email:</td>
                <td className="info-value">{memberData?.emailAdd || memberData?.email || 'N/A'}</td>
                <td className="info-label">Tel:</td>
                <td className="info-value">{memberData?.tel1 || memberData?.phone || 'N/A'}</td>
              </tr>
              <tr>
                <td className="info-label">ID No:</td>
                <td className="info-value"><strong>{memberData?.idNo || memberData?.idNumber || 'N/A'}</strong></td>
                <td className="info-label">Print Date:</td>
                <td className="info-value"><strong>{new Date().toLocaleDateString()}</strong></td>
              </tr>
            </tbody>
          </table>

          {/* Mobile-friendly member info cards (only visible on small screens) */}
          <div className="member-cards">
            <div className="member-card">
              <span className="member-card-label">Name</span>
              <span className="member-card-value">{memberData?.holdersName || memberData?.name || 'N/A'}</span>
            </div>
            <div className="member-card">
              <span className="member-card-label">Member No</span>
              <span className="member-card-value">{memberData?.accNo || memberData?.memberNo || 'N/A'}</span>
            </div>
            <div className="member-card">
              <span className="member-card-label">Email</span>
              <span className="member-card-value">{memberData?.emailAdd || memberData?.email || 'N/A'}</span>
            </div>
            <div className="member-card">
              <span className="member-card-label">Tel</span>
              <span className="member-card-value">{memberData?.tel1 || memberData?.phone || 'N/A'}</span>
            </div>
            <div className="member-card">
              <span className="member-card-label">ID No</span>
              <span className="member-card-value">{memberData?.idNo || memberData?.idNumber || 'N/A'}</span>
            </div>
            <div className="member-card">
              <span className="member-card-label">Print Date</span>
              <span className="member-card-value">{new Date().toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        <div className="table-section">
          {/* Desktop / tablet table */}
          <table className="report-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Narration</th>
                <th>Reference</th>
                <th>Dividend (KES)</th>
                <th>WHT (KES)</th>
                <th>Net Amount (KES)</th>
              </tr>
            </thead>
            <tbody>
              {dividendTransactions.length > 0 ? (
                dividendTransactions.map((transaction, idx) => (
                  <tr key={transaction.id || idx}>
                    <td><strong>{transaction.date}</strong></td>
                    <td><strong>{transaction.narration}</strong></td>
                    <td>{transaction.ref}</td>
                    <td className="amount"><strong>{formatAmount(transaction.dividend)}</strong></td>
                    <td className="amount wht-cell">{formatAmount(transaction.paid)}</td>
                    <td className="amount"><strong>{formatAmount(transaction.runningAmt)}</strong></td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="empty-cell">
                    <div className="empty-state">
                      <strong>No dividend transactions yet</strong>
                      <span>Dividend payments will appear here once declared.</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
            {dividendTransactions.length > 0 && (
              <tfoot>
                <tr className="total-row">
                  <td colSpan="3"><strong>TOTAL</strong></td>
                  <td className="amount"><strong>{formatAmount(totals.totalDividends)}</strong></td>
                  <td className="amount"><strong>{formatAmount(totals.totalPaid)}</strong></td>
                  <td className="amount"><strong>{formatAmount(totals.netDividend)}</strong></td>
                </tr>
              </tfoot>
            )}
          </table>

          {/* Mobile card list (only visible on small screens) */}
          {dividendTransactions.length > 0 && (
            <div className="mobile-tx-list">
              {dividendTransactions.map((transaction, idx) => (
                <div className="mobile-tx-card" key={transaction.id || idx}>
                  <div className="mobile-tx-row mobile-tx-head">
                    <strong>{transaction.narration}</strong>
                    <span className="mobile-tx-date">{transaction.date}</span>
                  </div>
                  <div className="mobile-tx-row">
                    <span className="mobile-tx-label">Reference</span>
                    <span className="mobile-tx-value">{transaction.ref}</span>
                  </div>
                  <div className="mobile-tx-row">
                    <span className="mobile-tx-label">Dividend</span>
                    <span className="mobile-tx-value">{formatAmount(transaction.dividend)}</span>
                  </div>
                  <div className="mobile-tx-row">
                    <span className="mobile-tx-label">WHT</span>
                    <span className="mobile-tx-value mobile-tx-wht">{formatAmount(transaction.paid)}</span>
                  </div>
                  <div className="mobile-tx-row mobile-tx-total">
                    <span className="mobile-tx-label">Net Amount</span>
                    <span className="mobile-tx-value">{formatAmount(transaction.runningAmt)}</span>
                  </div>
                </div>
              ))}

              <div className="mobile-totals">
                <div className="mobile-totals-row">
                  <span>Total Dividend</span>
                  <strong>{formatAmount(totals.totalDividends)}</strong>
                </div>
                <div className="mobile-totals-row">
                  <span>Total WHT</span>
                  <strong>{formatAmount(totals.totalPaid)}</strong>
                </div>
                <div className="mobile-totals-row mobile-totals-net">
                  <span>Net Dividend</span>
                  <strong>{formatAmount(totals.netDividend)}</strong>
                </div>
              </div>
            </div>
          )}

          {dividendTransactions.length === 0 && (
            <div className="mobile-empty">
              <div className="empty-state">
                <strong>No dividend transactions yet</strong>
                <span>Dividend payments will appear here once declared.</span>
              </div>
            </div>
          )}
        </div>

        <div className="report-footer">
          <p><strong>Note:</strong> Withholding Tax (WHT) applies to dividend payments as per government regulations.</p>
          <p>This is a computer-generated document and requires no signature.</p>
          <p>For any queries, please contact the office at <a href={CONTACT.emailHref}>{CONTACT.email}</a> or call <a href={CONTACT.phoneHref}>{CONTACT.phone}</a>.</p>
        </div>
      </div>

      <div className="download-section">
        <button onClick={handleDownloadPDF} className="download-btn">
          📄 Download PDF Statement
        </button>
      </div>

      {error && (
        <div className="error-message">
          <span>⚠️</span> {error}
        </div>
      )}

      <style>{`
        * { box-sizing: border-box; }

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
          overflow-x: hidden;
        }

        /* Report Header */
        .report-header {
          text-align: center;
          margin-bottom: 2rem;
          padding-bottom: 1rem;
          border-bottom: 2px solid ${colors.primary};
        }

        .report-header h1 {
          font-size: clamp(1rem, 2vw + 0.5rem, 1.25rem);
          font-weight: 800;
          margin: 0;
          letter-spacing: 0.3px;
          color: ${colors.primary};
          word-break: break-word;
        }

        .report-header p {
          font-size: clamp(0.85rem, 1vw + 0.5rem, 0.95rem);
          margin: 0.25rem 0 0;
          color: #4a5568;
          font-weight: 600;
        }

        .report-header .generated-date {
          font-size: 0.7rem;
          margin-top: 0.5rem;
        }

        .contact-info {
          font-size: 0.72rem;
          color: #718096;
          margin-top: 0.5rem;
          line-height: 1.5;
        }

        /* Member Info Table (desktop/tablet) */
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
          white-space: nowrap;
        }

        .info-value {
          color: #1a202c;
          font-weight: 500;
          word-break: break-word;
        }

        .info-value strong {
          font-weight: 700;
          color: #1a202c;
        }

        /* Mobile member cards - hidden on desktop */
        .member-cards { display: none; }

        /* Report Table */
        .table-section {
          margin-bottom: 1.5rem;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }

        .report-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.78rem;
          min-width: 640px;
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
          white-space: nowrap;
        }

        .report-table td strong {
          font-weight: 700;
          color: #1a202c;
        }

        .report-table td.wht-cell {
          color: ${colors.accent};
          font-weight: 600;
        }

        .empty-cell { padding: 1.5rem !important; text-align: center; }

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
          text-align: center;
        }

        .empty-state strong { font-size: 0.95rem; }

        .empty-state span {
          color: #4b5563;
          line-height: 1.5;
          font-size: 0.82rem;
        }

        .total-row td {
          background: ${colors.softBlue} !important;
          font-weight: 800;
          border-top: 2px solid ${colors.primary};
          border-bottom: 2px solid ${colors.primary};
          color: ${colors.primary};
        }

        .total-row td strong { color: ${colors.primary}; }

        /* Mobile transaction list - hidden on desktop */
        .mobile-tx-list,
        .mobile-empty { display: none; }

        /* Report Footer */
        .report-footer {
          margin-top: 2rem;
          padding-top: 1rem;
          border-top: 1px solid #e2e8f0;
          text-align: center;
          font-size: 0.72rem;
          color: #64748b;
          line-height: 1.6;
          word-break: break-word;
        }

        .report-footer p {
          margin: 0.25rem 0;
          font-weight: 500;
        }

        .report-footer p strong {
          font-weight: 800;
          color: ${colors.primary};
        }

        .report-footer a {
          color: ${colors.accent};
          font-weight: 600;
          text-decoration: none;
          word-break: break-all;
        }

        .report-footer a:hover { text-decoration: underline; }

        /* Download Button Section */
        .download-section {
          display: flex;
          justify-content: center;
          margin-top: 1.5rem;
          padding: 0 1rem;
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
          font-family: inherit;
          width: 100%;
          max-width: 340px;
        }

        .download-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 22px rgba(27, 58, 107, 0.35);
        }

        .download-btn:focus-visible {
          outline: 3px solid ${colors.accent};
          outline-offset: 3px;
        }

        .error-message {
          margin: 1rem auto 0;
          padding: 0.75rem 1rem;
          background: ${colors.softRed};
          border-left: 4px solid ${colors.accent};
          border-radius: 8px;
          color: #991b1b;
          font-size: 0.85rem;
          display: flex;
          align-items: flex-start;
          gap: 0.5rem;
          max-width: 1200px;
          font-weight: 500;
          line-height: 1.5;
        }

        /* ====== RESPONSIVE BREAKPOINTS ====== */

        /* Large tablets */
        @media (max-width: 1024px) {
          .report-container { padding: 1.5rem; }
        }

        /* Tablets */
        @media (max-width: 768px) {
          .report-container {
            padding: 1.25rem;
            margin: 0.5rem;
            border-radius: 12px;
          }

          .report-header { margin-bottom: 1.5rem; }

          .report-table {
            font-size: 0.68rem;
          }

          .report-table th,
          .report-table td {
            padding: 0.45rem 0.5rem;
          }
        }

        /* Phones: switch to card layouts */
        @media (max-width: 640px) {
          .report-container {
            padding: 1rem;
            margin: 0.5rem;
            border-radius: 12px;
          }

          .report-header h1 { font-size: 1rem; }
          .report-header p { font-size: 0.85rem; }
          .contact-info { font-size: 0.68rem; }

          /* Hide desktop info table, show member cards */
          .info-table { display: none; }
          .member-cards {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0.5rem;
            margin-bottom: 1.25rem;
          }
          .member-card {
            background: ${colors.softBlue};
            border-radius: 10px;
            padding: 0.6rem 0.75rem;
            display: flex;
            flex-direction: column;
            gap: 0.15rem;
            min-width: 0;
          }
          .member-card-label {
            font-size: 0.62rem;
            text-transform: uppercase;
            letter-spacing: 0.6px;
            font-weight: 800;
            color: ${colors.primary};
            opacity: 0.75;
          }
          .member-card-value {
            font-size: 0.82rem;
            font-weight: 600;
            color: #1a202c;
            word-break: break-word;
          }

          /* Hide desktop table, show mobile cards */
          .report-table { display: none; }
          .mobile-tx-list { display: flex; flex-direction: column; gap: 0.75rem; }
          .mobile-empty { display: block; }

          .mobile-tx-card {
            background: white;
            border: 1px solid #e2e8f0;
            border-left: 4px solid ${colors.primary};
            border-radius: 12px;
            padding: 0.85rem 0.9rem;
            display: flex;
            flex-direction: column;
            gap: 0.4rem;
            box-shadow: 0 2px 8px rgba(18, 41, 76, 0.05);
          }

          .mobile-tx-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 0.75rem;
            font-size: 0.8rem;
          }

          .mobile-tx-head {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.15rem;
            padding-bottom: 0.5rem;
            border-bottom: 1px dashed #e2e8f0;
            margin-bottom: 0.15rem;
          }

          .mobile-tx-head strong {
            color: ${colors.primary};
            font-size: 0.9rem;
            font-weight: 700;
            word-break: break-word;
          }

          .mobile-tx-date {
            font-size: 0.72rem;
            color: #718096;
            font-weight: 600;
          }

          .mobile-tx-label {
            color: #64748b;
            font-weight: 600;
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.4px;
          }

          .mobile-tx-value {
            color: #1a202c;
            font-weight: 700;
            text-align: right;
            word-break: break-word;
          }

          .mobile-tx-wht { color: ${colors.accent}; }

          .mobile-tx-total {
            border-top: 1px dashed #e2e8f0;
            padding-top: 0.5rem;
            margin-top: 0.15rem;
          }

          .mobile-tx-total .mobile-tx-value {
            color: ${colors.primary};
            font-size: 0.9rem;
          }

          .mobile-totals {
            background: ${colors.softBlue};
            border-radius: 12px;
            padding: 0.85rem 0.9rem;
            display: flex;
            flex-direction: column;
            gap: 0.4rem;
            border: 1px solid rgba(27, 58, 107, 0.15);
          }

          .mobile-totals-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 0.8rem;
            color: #334155;
            font-weight: 600;
          }

          .mobile-totals-row strong {
            color: ${colors.primary};
            font-weight: 800;
          }

          .mobile-totals-net {
            border-top: 1px solid rgba(27, 58, 107, 0.2);
            padding-top: 0.5rem;
            margin-top: 0.1rem;
          }

          .mobile-totals-net strong {
            color: ${colors.accent};
            font-size: 0.9rem;
          }

          .report-footer {
            font-size: 0.7rem;
            margin-top: 1.5rem;
          }

          .download-btn {
            font-size: 0.85rem;
            padding: 0.75rem 1rem;
          }
        }

        /* Small phones */
        @media (max-width: 420px) {
          .report-container { padding: 0.85rem; margin: 0.4rem; }

          .member-cards { grid-template-columns: 1fr; }

          .mobile-tx-card { padding: 0.75rem 0.8rem; }
          .mobile-tx-head strong { font-size: 0.85rem; }

          .mobile-tx-row { font-size: 0.75rem; }
          .mobile-tx-label { font-size: 0.68rem; }

          .mobile-totals-row { font-size: 0.75rem; }

          .report-footer { font-size: 0.65rem; }
        }

        /* Very small phones */
        @media (max-width: 340px) {
          .report-container { padding: 0.75rem; }
          .report-header h1 { font-size: 0.9rem; }
          .member-card-value { font-size: 0.75rem; }
          .mobile-tx-row { font-size: 0.72rem; }
        }

        /* Print Styles */
        @media print {
          .download-section,
          .error-message { display: none !important; }

          .report-container {
            padding: 0;
            box-shadow: none;
            max-width: 100%;
            margin: 0;
            border-radius: 0;
          }

          .member-cards,
          .mobile-tx-list,
          .mobile-empty { display: none !important; }

          .info-table,
          .report-table { display: table !important; }

          .report-table th,
          .report-table td {
            border: 1px solid #000 !important;
          }

          .report-table { min-width: 0; }
        }

        /* Reduced motion */
        @media (prefers-reduced-motion: reduce) {
          .download-btn,
          .loading-spinner {
            transition: none !important;
            animation: none !important;
          }
          .download-btn:hover { transform: none; }
        }
      `}</style>
    </>
  );
}

export default DividendList;
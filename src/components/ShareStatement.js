// ShareStatement.js - Fast loading, no blinking, bold content - FIXED
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
  const brandColor = '#00a3b5';

  // Process savings data from API response - FIXED to handle the exact data structure
  const processSavingsData = (data) => {
    console.log('Processing savings data:', data);
    
    let transactions = [];
    const apiTotalSavings = data && typeof data === 'object' && !Array.isArray(data)
      ? Number(data.totalSavings ?? data.total ?? data.balance)
      : NaN;
    
    // Handle array directly (most common case)
    if (Array.isArray(data)) {
      transactions = data;
    } 
    // Handle object with transactions property
    else if (data && typeof data === 'object') {
      if (data.transactions) transactions = data.transactions;
      else if (data.data) transactions = data.data;
      else if (data.savings) transactions = data.savings;
      else if (data.savingsTransactions) transactions = data.savingsTransactions;
      else if (data.statement) transactions = data.statement;
      else {
        // If none of the above, try to extract values from the object itself
        transactions = Object.values(data).filter(item => item && typeof item === 'object' && item.inputDate);
      }
    }
    
    // Format transactions correctly based on the actual field names
    const formattedTransactions = transactions.map((item, index) => ({
      id: index,
      inputDate: item?.inputDate || item?.date || item?.transactionDate || 'N/A',
      narration: item?.narration || item?.description || item?.type || 'Savings Transaction',
      ref: item?.refNo || item?.reference || item?.ref || item?.transactionId || `SAV${index + 1}`,
      savings: parseFloat(item?.savings || item?.amount || item?.deposit || item?.credit || 0),
      runningAmt: parseFloat(item?.runningTotal || item?.runningAmt || item?.runningBalance || item?.balance || 0)
    }));
    
    setShareTransactions(formattedTransactions);
    
    // Calculate totals - use the last transaction's runningTotal or sum all savings
    let totalSavings = Number.isFinite(apiTotalSavings) ? apiTotalSavings : 0;
    if (!Number.isFinite(apiTotalSavings) && formattedTransactions.length > 0) {
      // Use the last transaction's running amount if available
      const lastTransaction = formattedTransactions[formattedTransactions.length - 1];
      totalSavings = lastTransaction.runningAmt || 0;
      
      // If runningAmt is 0 but we have savings, calculate sum
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

  // Fetch header configuration
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
        console.log('Header config:', data);
        setHeaderData(data);
        return data;
      }
    } catch (err) {
      console.error('Error fetching header config:', err);
    }
    return null;
  };

  // Helper function to safely format numbers
  const safeFormatNumber = (value) => {
    if (value === undefined || value === null || isNaN(value)) {
      return '0.00';
    }
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Main data fetch - with immediate cached data
  useEffect(() => {
    const cachedMember = localStorage.getItem('memberProfile');

    if (cachedMember) {
      try {
        setMemberData(JSON.parse(cachedMember));
      } catch(e) {
        console.error('Error loading cached member:', e);
      }
    }

    const fetchData = async () => {
      setError('');
      
      try {
        // Get authentication token
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
        
        console.log('Fetching data for member:', memberNumber);
        
        // Fetch header configuration
        await fetchHeaderConfig(token);
        
        // Fetch member data
        const memberResponse = await fetch(`/api/v1/member/${memberNumber}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (memberResponse.ok) {
          const member = await memberResponse.json();
          console.log('Member data:', member);
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
        
        // Fetch savings data from correct endpoint
        const savingsUrl = `/api/v1/savings/${memberNumber}`;
        console.log('Fetching savings from:', savingsUrl);
        
        const savingsResponse = await fetch(savingsUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (savingsResponse.ok) {
          const savingsData = await savingsResponse.json();
          console.log('Savings data received:', savingsData);
          
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

  // Show minimal loading only if no data at all
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
      {/* Report Content */}
      <div ref={reportRef} className="report-container">
        {/* Header */}
        <div className="report-header">
          <h1>{headerData?.organisationName || 'METROPOLITAN HOSPITAL SACCO LTD'}</h1>
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

        {/* Member Information */}
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

        {/* Savings Statement Table */}
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
                    <td className="amount"><strong>{safeFormatNumber(transaction.savings)}</strong></td>
                    <td className="amount"><strong>{safeFormatNumber(transaction.runningAmt)}</strong></td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '2rem', fontWeight: 'bold' }}>
                    No savings transactions found
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

        {/* Footer Note */}
        <div className="report-footer">
          <p><strong>Note:</strong> This statement shows your savings/deposit transactions.</p>
          <p>For any queries, please contact the Sacco office.</p>
        </div>
      </div>

      {/* Download Button */}
      <div className="download-section">
        <button onClick={handleDownloadPDF} className="download-btn" disabled={shareTransactions.length === 0}>
          📄 Download PDF Statement
        </button>
      </div>
      {error && (
        <Alert type="warning" title="Savings statement notice">
          {error}
        </Alert>
      )}

      <style>{`
        .report-container {
          background: white;
          padding: 2rem;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          font-family: 'Courier New', 'Monaco', monospace;
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
          border-bottom: 2px solid #000;
        }

        .report-header h1 {
          font-size: 1.25rem;
          font-weight: bold;
          margin: 0;
          letter-spacing: 1px;
          color: #000;
        }

        .report-header p {
          font-size: 0.9rem;
          margin: 0.25rem 0 0;
          color: #000;
          font-weight: bold;
        }

        .contact-info {
          font-size: 0.7rem;
          color: #333;
          margin-top: 0.5rem;
          font-weight: bold;
        }

        .info-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 1.5rem;
          font-size: 0.85rem;
        }

        .info-table td {
          padding: 0.75rem;
          border: 1px solid #000;
        }

        .info-label {
          font-weight: bold;
          background-color: #f0f0f0;
          width: 100px;
          color: #000;
        }

        .info-value {
          color: #000;
          font-weight: 500;
        }

        .info-value strong {
          font-weight: 800;
          color: #000;
        }

        .table-section {
          margin-bottom: 1.5rem;
          overflow-x: auto;
        }

        .report-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.8rem;
        }

        .report-table th {
          border: 2px solid #000;
          padding: 0.75rem;
          text-align: center;
          font-weight: 800;
          background: #f0f0f0;
          color: #000;
          font-size: 0.85rem;
        }

        .report-table td {
          border: 1px solid #000;
          padding: 0.6rem;
          color: #000;
          font-weight: 500;
        }

        .report-table td.amount {
          text-align: right;
          padding-right: 0.75rem;
          font-weight: 600;
        }

        .report-table td strong {
          font-weight: 800;
          color: #000;
        }

        .report-table td.date-cell,
        .report-table td.narration-cell {
          font-weight: 600;
        }

        .total-row {
          background: #f0f0f0;
          font-weight: 800;
        }

        .total-row td {
          font-weight: 800;
          border-top: 2px solid #000;
          border-bottom: 2px solid #000;
          color: #000;
        }

        .report-footer {
          margin-top: 2rem;
          padding-top: 1rem;
          border-top: 1px solid #000;
          text-align: center;
          font-size: 0.7rem;
          color: #333;
        }

        .report-footer p {
          margin: 0.25rem 0;
          font-weight: 500;
        }

        .report-footer p strong {
          font-weight: 800;
          color: #000;
        }

        .download-section {
          display: flex;
          justify-content: center;
          margin-top: 1.5rem;
        }

        .download-btn {
          padding: 0.75rem 2rem;
          background: ${brandColor};
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .download-btn:hover:not(:disabled) {
          background: #008a9a;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 163, 181, 0.3);
        }

        .download-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .error-message {
          margin-top: 1rem;
          padding: 0.75rem 1rem;
          background: #fed7d7;
          border-left: 4px solid #e53e3e;
          border-radius: 6px;
          color: #742a2a;
          font-size: 0.875rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          max-width: 1200px;
          margin-left: auto;
          margin-right: auto;
          font-weight: 500;
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
          
          .error-message {
            display: none;
          }
        }

        @media (max-width: 768px) {
          .report-container {
            padding: 1rem;
          }
          
          .report-table {
            font-size: 0.7rem;
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


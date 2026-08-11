// ShareCapital.js - Fast loading, no blinking, bold content - FIXED
import React, { useRef, useState, useEffect } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

function ShareCapital() {
  const reportRef = useRef();
  const [memberData, setMemberData] = useState(null);
  const [shareTransactions, setShareTransactions] = useState([]);
  const [totals, setTotals] = useState({ totalShares: 0, totalSharesPurchased: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [headerData, setHeaderData] = useState(null);
  const brandColor = '#00a3b5';

  // Process share capital data from API response
  const processShareData = (data) => {
    console.log('Processing share capital data:', data);
    
    let transactions = [];
    const parseAmount = (value) => {
      const parsed = Number(String(value ?? 0).replace(/,/g, ''));
      return Number.isFinite(parsed) ? parsed : 0;
    };
    
    if (Array.isArray(data)) {
      transactions = data;
    } else if (data && typeof data === 'object') {
      if (data.transactions) transactions = data.transactions;
      else if (data.data) transactions = data.data;
      else if (data.shareTransactions) transactions = data.shareTransactions;
      else if (data.shares) transactions = data.shares;
      else if (data.shareCapital) transactions = data.shareCapital;
    }
    
    // Format transactions correctly based on the actual field names from the API
    const parseDateForSort = (value) => {
      if (!value || value === 'N/A') return 0;
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
        const [day, month, year] = value.split('/');
        return new Date(Number(year), Number(month) - 1, Number(day)).getTime();
      }
      const time = new Date(value).getTime();
      return Number.isNaN(time) ? 0 : time;
    };

    const formattedTransactions = transactions.map((item, index) => {
      // Calculate net amount (credit - debit)
      const creditAmount = parseAmount(item?.credit);
      const debitAmount = parseAmount(item?.debit);
      const netAmount = creditAmount - debitAmount;
      
      // Determine narration based on item type
      let narration = item?.item || item?.narration || item?.description || 'Share Transaction';
      
      return {
        id: item?.id || index,
        inputDate: item?.date || item?.inputDate || item?.transactionDate || 'N/A',
        narration: narration,
        ref: item?.referenceNo || item?.refNo || item?.reference || item?.ref || `SH${index + 1}`,
        savings: netAmount, // Use net amount for savings column
        credit: creditAmount,
        debit: debitAmount,
        runningAmt: parseAmount(item?.runningAmt ?? item?.runningTotal ?? item?.balance ?? item?.runningBalance)
      };
    }).sort((a, b) => parseDateForSort(a.inputDate) - parseDateForSort(b.inputDate));

    let runningAmount = 0;
    const transactionsWithRunningAmount = formattedTransactions.map((transaction) => {
      runningAmount += transaction.savings || 0;
      return {
        ...transaction,
        runningAmt: runningAmount
      };
    });
    
    setShareTransactions(transactionsWithRunningAmount);
    
    // Calculate totals
    const totalSharesPurchased = transactionsWithRunningAmount.reduce((sum, t) => sum + (t.savings > 0 ? t.savings : 0), 0);
    const totalShares = transactionsWithRunningAmount.length > 0 
      ? transactionsWithRunningAmount[transactionsWithRunningAmount.length - 1].runningAmt
      : 0;
    
    setTotals({
      totalShares: totalShares,
      totalSharesPurchased: totalSharesPurchased
    });
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
    // First, try to load cached data immediately
    const cachedShares = localStorage.getItem('shareTransactions');
    const cachedMember = localStorage.getItem('memberProfile');
    
    if (cachedShares) {
      try {
        const parsed = JSON.parse(cachedShares);
        setShareTransactions(parsed.transactions || []);
        setTotals(parsed.totals || { totalShares: 0, totalSharesPurchased: 0 });
        setLoading(false);
      } catch(e) {
        console.error('Error loading cached shares:', e);
      }
    }
    
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
          setError('Authentication required. Please login again.');
          setLoading(false);
          return;
        }
        
        if (!memberNumber) {
          setError('Member number not found. Please login again.');
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
            setError('Failed to fetch member data');
          }
        }
        
        // Fetch share capital data from correct endpoint
        const shareUrl = `/api/v1/shareCapital/${memberNumber}`;
        console.log('Fetching share capital from:', shareUrl);
        
        const shareResponse = await fetch(shareUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (shareResponse.ok) {
          const shareData = await shareResponse.json();
          console.log('Share capital data received:', shareData);
          
          if (shareData && (Array.isArray(shareData) ? shareData.length > 0 : Object.keys(shareData).length > 0)) {
            processShareData(shareData);
          } else {
            setError('No share capital records found for this member');
            setShareTransactions([]);
            setTotals({ totalShares: 0, totalSharesPurchased: 0 });
          }
        } else if (shareResponse.status === 404) {
          setError('No share capital records found for this member');
          setShareTransactions([]);
          setTotals({ totalShares: 0, totalSharesPurchased: 0 });
        } else {
          setError(`Failed to fetch share capital data: ${shareResponse.status}`);
          setShareTransactions([]);
          setTotals({ totalShares: 0, totalSharesPurchased: 0 });
        }
        
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Network error. Unable to fetch share capital data.');
        setShareTransactions([]);
        setTotals({ totalShares: 0, totalSharesPurchased: 0 });
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
    pdf.save(`share-capital-${memberData?.accNo || 'member'}-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  // Show minimal loading only if no data at all
  if (loading && !memberData && shareTransactions.length === 0) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading share capital information...</p>
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
          <p>Share Capital Statement</p>
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

        {/* Share Capital Table */}
        <div className="table-section">
          <table className="report-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description / Item</th>
                <th>Reference No</th>
                <th>Credit (KES)</th>
                <th>Debit (KES)</th>
                <th>Net Amount (KES)</th>
                <th>Running Amt (KES)</th>
              </tr>
            </thead>
            <tbody>
              {shareTransactions.length > 0 ? (
                shareTransactions.map((transaction, idx) => (
                  <tr key={transaction.id || idx}>
                    <td className="date-cell"><strong>{transaction.inputDate || 'N/A'}</strong></td>
                    <td className="narration-cell"><strong>{transaction.narration || 'N/A'}</strong></td>
                    <td><strong>{transaction.ref || 'N/A'}</strong></td>
                    <td className="amount"><strong>{safeFormatNumber(transaction.credit)}</strong></td>
                    <td className="amount"><strong>{safeFormatNumber(transaction.debit)}</strong></td>
                    <td className="amount"><strong>{safeFormatNumber(transaction.savings)}</strong></td>
                    <td className="amount"><strong>{safeFormatNumber(transaction.runningAmt)}</strong></td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '2rem', fontWeight: 'bold' }}>
                    No share capital transactions found
                  </td>
                </tr>
              )}
            </tbody>
            {shareTransactions.length > 0 && (
              <tfoot>
                <tr className="total-row">
                  <td colSpan="3"><strong>TOTAL</strong></td>
                  <td className="amount"><strong>{safeFormatNumber(shareTransactions.reduce((sum, t) => sum + t.credit, 0))}</strong></td>
                  <td className="amount"><strong>{safeFormatNumber(shareTransactions.reduce((sum, t) => sum + t.debit, 0))}</strong></td>
                  <td className="amount"><strong>{safeFormatNumber(totals.totalShares)}</strong></td>
                  <td className="amount"><strong>{safeFormatNumber(shareTransactions[shareTransactions.length - 1]?.runningAmt || totals.totalShares)}</strong></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Footer Note */}
        <div className="report-footer">
          <p><strong>Note:</strong> This statement shows your share capital transactions.</p>
          <p>For any queries, please contact the Sacco office.</p>
        </div>
      </div>

      {/* Download Button */}
      <div className="download-section">
        <button onClick={handleDownloadPDF} className="download-btn" disabled={shareTransactions.length === 0}>
          📄 Download PDF Statement
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="error-message">
          <span>⚠️</span> {error}
        </div>
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

export default ShareCapital;

// DividendList.js - Complete working version with no blinking, time removed
import React, { useRef, useState, useEffect } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

function DividendList() {
  const reportRef = useRef();
  const [memberData, setMemberData] = useState(null);
  const [dividendTransactions, setDividendTransactions] = useState([]);
  const [totals, setTotals] = useState({ totalDividends: 0, totalPaid: 0, netDividend: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [headerData, setHeaderData] = useState(null);
  const brandColor = '#00a3b5';

  // Function to process dividend data from the API response
  const processDividendData = (data) => {
    console.log('Processing dividend data:', data);
    
    // Handle the exact response structure from /api/v1/dividend/MS967
    let transactions = [];
    
    if (Array.isArray(data)) {
      transactions = data;
    } else if (data && typeof data === 'object') {
      // If it's a single object, wrap it in an array
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
    
    // Format transactions based on the actual API response structure
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
    
    // Calculate totals
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

  // Main data fetch - with immediate cached data
  useEffect(() => {
    // First, try to load cached data immediately
    const cachedTransactions = localStorage.getItem('dividendTransactions');
    const cachedMember = localStorage.getItem('memberProfile');
    
    if (cachedTransactions) {
      try {
        const parsed = JSON.parse(cachedTransactions);
        setDividendTransactions(parsed.transactions || []);
        setTotals(parsed.totals || { totalDividends: 0, totalPaid: 0, netDividend: 0 });
        setLoading(false);
      } catch(e) {}
    }
    
    if (cachedMember) {
      try {
        setMemberData(JSON.parse(cachedMember));
      } catch(e) {}
    }

    const fetchData = async () => {
      setError('');
      
      try {
        // Get authentication token
        let token = localStorage.getItem('authToken');
        let memberNumber = localStorage.getItem('memberNumber');
        
        // If no token, try to get from memberData
        if (!token) {
          const storedMemberData = localStorage.getItem('memberData');
          if (storedMemberData) {
            const parsed = JSON.parse(storedMemberData);
            token = parsed.token || parsed.accessToken;
            memberNumber = memberNumber || parsed.accNo || parsed.memberNo;
          }
        }
        
        // Try to get member number from URL or session
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
        
        console.log('Using Member Number:', memberNumber);
        console.log('Using Token:', token.substring(0, 20) + '...');
        
        // Fetch header configuration first
        await fetchHeaderConfig(token);
        
        // Fetch member profile (works with 200 OK)
        console.log('Fetching member data for:', memberNumber);
        const memberResponse = await fetch(`/api/v1/member/${memberNumber}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (memberResponse.ok) {
          const member = await memberResponse.json();
          console.log('Member data received:', member);
          setMemberData(member);
          localStorage.setItem('memberProfile', JSON.stringify(member));
        } else {
          console.error('Failed to fetch member data:', memberResponse.status);
          // Try cached data
          const cachedProfile = localStorage.getItem('memberProfile');
          if (cachedProfile) {
            setMemberData(JSON.parse(cachedProfile));
          } else {
            setError('Failed to fetch member data');
          }
        }

        const dividendUrl = `/api/v1/dividend/${memberNumber}`;
        console.log('Fetching dividend data from:', dividendUrl);
        
        try {
          const dividendResponse = await fetch(dividendUrl, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            }
          });
          
          console.log('Dividend Response Status:', dividendResponse.status);
          
          if (dividendResponse.ok) {
            const dividendData = await dividendResponse.json();
            console.log('Dividend data received:', dividendData);
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

        // Try to use cached member data
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

  // Show minimal loading only if no data at all
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
          <p>Dividend Statement</p>
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
        </div>

        {/* Dividends Table */}
        <div className="table-section">
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
                    <td className="amount"><strong>{transaction.dividend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                    <td className="amount">{transaction.paid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="amount"><strong>{transaction.runningAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center' }}>No dividend transactions found</td>
                </tr>
              )}
            </tbody>
            {dividendTransactions.length > 0 && (
              <tfoot>
                <tr className="total-row">
                  <td colSpan="3"><strong>TOTAL</strong></td>
                  <td className="amount"><strong>{totals.totalDividends.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                  <td className="amount"><strong>{totals.totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                  <td className="amount"><strong>{totals.netDividend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Footer Note */}
        <div className="report-footer">
          <p><strong>Note:</strong> Withholding Tax (WHT) applies to dividend payments as per government regulations.</p>
          <p>This is a computer-generated document and requires no signature.</p>
          <p>For any queries, please contact the Sacco office.</p>
        </div>
      </div>

      {/* Download Button Below Report */}
      <div className="download-section">
        <button onClick={handleDownloadPDF} className="download-btn">
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
          /* Prevent any blinking or repainting */
          transform: translateZ(0);
          backface-visibility: hidden;
          -webkit-font-smoothing: antialiased;
        }

        /* Report Header */
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
          font-size: 1rem;
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

        /* Member Info Table */
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

        /* Report Table */
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

        /* Report Footer */
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

        /* Download Button Section */
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

        .download-btn:hover {
          background: #008a9a;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 163, 181, 0.3);
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

        /* Print Styles */
        @media print {
          .download-section {
            display: none;
          }
          
          .report-container {
            padding: 0;
            box-shadow: none;
            max-width: 100%;
          }
          
          .report-table th,
          .report-table td {
            border: 1px solid #000 !important;
          }
          
          .error-message {
            display: none;
          }
        }

        /* Responsive */
        @media (max-width: 768px) {
          .report-container {
            padding: 1rem;
            margin: 0.5rem;
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
            display: inline-block;
            width: auto;
            margin-right: 0.5rem;
          }
        }
      `}</style>
    </>
  );
}

export default DividendList;

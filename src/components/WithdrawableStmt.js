import React, { useRef, useState, useEffect } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import MpesaPaymentModal from './MpesaPaymentModal';

function WithdrawableStmt() {
  const reportRef = useRef();
  const [memberData, setMemberData] = useState(null);
  const [withdrawableData, setWithdrawableData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [headerData, setHeaderData] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfBlob, setPdfBlob] = useState(null);
  const [statementLoading, setStatementLoading] = useState(false);
  const [mpesaAccount, setMpesaAccount] = useState(null);
  
  const brandColor = '#00a3b5';

  const processWithdrawableData = (data) => {
    console.log('Raw API response:', JSON.stringify(data, null, 2));
    
    let items = [];
    if (Array.isArray(data)) {
      items = data;
    } else if (data && typeof data === 'object') {
      if (data.data && Array.isArray(data.data)) items = data.data;
      else if (data.withdrawable) items = data.withdrawable;
      else if (data.accNo || data.outStanding) items = [data];
    }
    
    const formattedItems = items.map((item, index) => ({
      id: index,
      accNo: item.accNo,
      name: item.holdersName,
      regDate: item.regDate,
      curDate: item.curDate,
      outStanding: item.outStanding,
      tel1: item.tel1,
      emailAdd: item.emailAdd,
      idNo: item.idNo,
      postalAddress: item.postalAddress
    }));
    
    console.log('Formatted withdrawable data:', formattedItems);
    setWithdrawableData(formattedItems);
    
    const totalOutstanding = formattedItems.reduce((sum, item) => sum + (item.outStanding || 0), 0);
    
    if (formattedItems.length > 0) {
      localStorage.setItem('withdrawableData', JSON.stringify({ items: formattedItems, totals: { totalOutstanding } }));
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
    return {
      organisationName: 'METROPOLITAN HOSPITAL SACCO LTD',
      boxNo: 'P.O. Box 12345',
      postalCode: '00100',
      mainTelNo: '020-1234567',
      email: 'info@metro-sacco.com'
    };
  };

  const handleDownloadPDF = () => {
    if (pdfBlob && selectedAccount) {
      const fileName = `withdrawable-statement-${selectedAccount.accNo}-${new Date().toISOString().split('T')[0]}.pdf`;
      
      const downloadUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setTimeout(() => {
        URL.revokeObjectURL(downloadUrl);
      }, 100);
    } else {
      console.error('No PDF blob available for download');
      setError('Your PDF is not ready yet. Please wait for the statement to finish loading.');
    }
  };

  const handleViewStatement = async (account) => {
    setSelectedAccount(account);
    setStatementLoading(true);
    setShowModal(true);
    
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
      setPdfBlob(null);
    }
    
    try {
      const token = localStorage.getItem('authToken');
      const memberNumber = localStorage.getItem('memberNumber');
      
      console.log('Generating withdrawable statement for account:', account.accNo);
      
      const response = await fetch('/api/v1/withdrawable-statement-direct', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          accountNo: account.accNo,
          memberNo: memberNumber,
          startDate: account.regDate || '2024-01-01',
          endDate: new Date().toISOString().split('T')[0]
        })
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);
        setPdfBlob(blob);
      } else {
        const errorData = await response.json();
        setError(errorData.message || errorData.error || 'Failed to generate statement');
        console.error('Error response:', errorData);
      }
    } catch (err) {
      console.error('Error generating statement:', err);
      setError('Failed to generate withdrawable statement. Please try again.');
    } finally {
      setStatementLoading(false);
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedAccount(null);
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
      setPdfBlob(null);
    }
  };

  const handleMainPDFDownload = async () => {
    const element = reportRef.current;
    if (!element) return;
    
    try {
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
      pdf.save(`withdrawable-summary-${memberData?.accNo || 'member'}-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('Error generating PDF:', err);
      setError('We could not generate the PDF right now. Please try again.');
    }
  };

  const formatRawValue = (value) => {
    if (value === undefined || value === null) return 'N/A';
    if (typeof value === 'number') return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return String(value);
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
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
        await fetchHeaderConfig(token);
        
        try {
          const memberResponse = await fetch(`/api/v1/member/${memberNumber}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
          });
          
          if (memberResponse.ok) {
            const member = await memberResponse.json();
            setMemberData(member);
            localStorage.setItem('memberProfile', JSON.stringify(member));
          }
        } catch (err) {
          console.error('Error fetching member data:', err);
        }
        
        const withdrawableUrl = `/api/v1/withDrawable/${memberNumber}`;
        console.log('Fetching from:', withdrawableUrl);
        
        const response = await fetch(withdrawableUrl, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log('RAW API RESPONSE:', JSON.stringify(data, null, 2));
          
          if (Array.isArray(data)) {
            processWithdrawableData(data);
          } else if (data && data.data && Array.isArray(data.data)) {
            processWithdrawableData(data.data);
          } else if (data && data.data) {
            processWithdrawableData([data.data]);
          } else {
            setError('No withdrawable records found');
            setWithdrawableData([]);
          }
        } else {
          console.error('Failed to fetch withdrawable:', response.status);
          setError('Unable to fetch withdrawable data.');
          setWithdrawableData([]);
        }
        
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Network error. Unable to fetch withdrawable data.');
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
  }, []);

  const totalOutstanding = withdrawableData.reduce((sum, item) => sum + (item.outStanding || 0), 0);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading withdrawable information...</p>
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
      <div ref={reportRef} className="report-container">
        <div className="report-header">
          <h1>{headerData?.organisationName || 'METROPOLITAN HOSPITAL SACCO LTD'}</h1>
          <p>Withdrawable Deposit Statement</p>
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

        <div className="table-section">
          <table className="report-table">
            <thead>
              <tr>
                <th>Account No</th>
                <th>Name</th>
                <th>Registration Date</th>
                <th>Current Date</th>
                <th>Outstanding (KES)</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {withdrawableData.length > 0 ? withdrawableData.map((item, idx) => (
                <tr key={item.id || idx}>
                  <td><strong>{item.accNo || 'N/A'}</strong></td>
                  <td><strong>{item.name || 'N/A'}</strong></td>
                  <td>{item.regDate || 'N/A'}</td>
                  <td>{item.curDate || 'N/A'}</td>
                  <td className="amount"><strong>{formatRawValue(item.outStanding)}</strong></td>
                  <td className="action-cell" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      className="view-stmt-btn"
                      onClick={() => handleViewStatement(item)}
                      style={{ backgroundColor: brandColor }}
                    >
                      View Statement
                    </button>
                    <button
                      className="view-stmt-btn"
                      onClick={() => setMpesaAccount(item)}
                      style={{ backgroundColor: '#27ae60' }}
                    >
                      Deposit via M-Pesa
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>No withdrawable records found</td>
                </tr>
              )}
            </tbody>
            {withdrawableData.length > 0 && (
              <tfoot>
                <tr className="total-row">
                  <td colSpan="4"><strong>TOTAL OUTSTANDING</strong></td>
                  <td className="amount"><strong>{formatRawValue(totalOutstanding)}</strong></td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="report-footer">
          <p><strong>Note:</strong> This statement shows your withdrawable deposits and outstanding amounts.</p>
          <p>For any queries, please contact the Sacco office.</p>
        </div>
      </div>

      <div className="download-section">
        <button onClick={handleMainPDFDownload} className="download-btn" disabled={withdrawableData.length === 0}>
          📄 Download PDF Summary
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {showModal && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Withdrawable Statement - {selectedAccount?.accNo}</h2>
              <button className="modal-close" onClick={handleCloseModal}>×</button>
            </div>
            <div className="modal-body">
              {statementLoading ? (
                <div className="modal-loading">
                  <div className="loading-spinner-small"></div>
                  <p>Generating statement...</p>
                </div>
              ) : pdfUrl ? (
                <iframe
                  src={`${pdfUrl}#toolbar=1&navpanes=1&scrollbar=1&view=FitH`}
                  title={`Withdrawable Statement ${selectedAccount?.accNo}`}
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
              {pdfUrl && (
                <button 
                  onClick={handleDownloadPDF}
                  className="download-stmt-btn"
                >
                  ⬇️ Download PDF
                </button>
              )}
              <button className="close-modal-btn" onClick={handleCloseModal}>Close</button>
            </div>
          </div>
        </div>
      )}

      <MpesaPaymentModal
        isOpen={!!mpesaAccount}
        onClose={() => setMpesaAccount(null)}
        memberNo={localStorage.getItem('memberNumber')}
        purpose="savings"
        accountReference={mpesaAccount?.accNo}
        defaultPhone={memberData?.tel1 || memberData?.phone}
        onSuccess={() => window.location.reload()}
      />

      <style>{`
        .report-container {
          background: white;
          padding: 2rem;
          border-radius: 8px;
          max-width: 1400px;
          margin: 0 auto;
          font-family: monospace;
        }
        .report-header {
          text-align: center;
          margin-bottom: 2rem;
          padding-bottom: 1rem;
          border-bottom: 2px solid #000;
        }
        .report-header h1 { font-size: 1.25rem; margin: 0; }
        .contact-info { font-size: 0.7rem; margin-top: 0.5rem; }
        .info-table, .report-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 1rem;
        }
        .info-table td, .report-table td, .report-table th {
          border: 1px solid #000;
          padding: 0.5rem;
        }
        .report-table th {
          background: #f0f0f0;
          font-weight: bold;
        }
        .amount {
          text-align: right;
        }
        .view-stmt-btn {
          background: ${brandColor};
          color: white;
          border: none;
          padding: 0.3rem 0.8rem;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.7rem;
        }
        .view-stmt-btn:hover {
          opacity: 0.9;
        }
        .total-row {
          background: #f0f0f0;
          font-weight: bold;
        }
        .report-footer {
          margin-top: 1rem;
          text-align: center;
          font-size: 0.7rem;
        }
        .download-section {
          text-align: center;
          margin-top: 1rem;
        }
        .download-btn {
          background: ${brandColor};
          color: white;
          border: none;
          padding: 0.5rem 1.5rem;
          border-radius: 4px;
          cursor: pointer;
        }
        .download-btn:hover {
          opacity: 0.9;
        }
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .modal-container {
          background: white;
          border-radius: 8px;
          width: 90%;
          max-width: 1200px;
          height: 90vh;
          display: flex;
          flex-direction: column;
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          border-bottom: 2px solid ${brandColor};
        }
        .modal-close {
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          font-weight: bold;
        }
        .modal-close:hover {
          color: ${brandColor};
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
          border-top: 1px solid #ddd;
        }
        .download-stmt-btn, .close-modal-btn {
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          text-decoration: none;
          display: inline-block;
          font-size: 0.9rem;
        }
        .download-stmt-btn {
          background: ${brandColor};
          color: white;
        }
        .download-stmt-btn:hover {
          opacity: 0.9;
        }
        .close-modal-btn {
          background: #666;
          color: white;
        }
        .close-modal-btn:hover {
          background: #555;
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
          border-top-color: ${brandColor};
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        .error-container {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #e53e3e;
        }
        .error-message {
          margin-top: 1rem;
          padding: 0.75rem;
          background: #fed7d7;
          border-left: 4px solid #e53e3e;
          color: #742a2a;
        }
        .action-cell {
          text-align: center;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @media print {
          .download-section, .modal-overlay { display: none; }
        }
      `}</style>
    </>
  );
}

export default WithdrawableStmt;

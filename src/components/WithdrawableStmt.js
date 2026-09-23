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

  const processWithdrawableData = (data) => {
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
          setError('Your session needs a refresh. Please log in again to view withdrawable deposits.');
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
            const member = await memberResponse.json();
            setMemberData(member);
            localStorage.setItem('memberProfile', JSON.stringify(member));
          }
        } catch (err) {
          console.error('Error fetching member data:', err);
        }

        const withdrawableUrl = `/api/v1/withDrawable/${memberNumber}`;

        const response = await fetch(withdrawableUrl, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
          const data = await response.json();

          if (Array.isArray(data)) {
            processWithdrawableData(data);
          } else if (data && data.data && Array.isArray(data.data)) {
            processWithdrawableData(data.data);
          } else if (data && data.data) {
            processWithdrawableData([data.data]);
          } else {
            setError('No withdrawable records were found for this member.');
            setWithdrawableData([]);
          }
        } else {
          console.error('Failed to fetch withdrawable:', response.status);
          setError('We could not refresh your withdrawable deposits right now. Please try again.');
          setWithdrawableData([]);
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
      if (purpose && purpose !== 'withdrawable_deposit') return;
      localStorage.removeItem('withdrawableData');
      setLoading(true);
      setRefreshKey((key) => key + 1);
    };

    window.addEventListener('mpesa:payment-success', refreshAfterMpesa);
    return () => window.removeEventListener('mpesa:payment-success', refreshAfterMpesa);
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
          <h1>{headerData?.organisationName || 'THE METRO GROUP FOUNDATION'}</h1>
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
                  <td className="action-cell">
                    <button
                      className="view-stmt-btn"
                      onClick={() => handleViewStatement(item)}
                    >
                      View Statement
                    </button>
                    <button
                      className="mpesa-pay-btn"
                      onClick={() => setMpesaAccount(item)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M12 2 3 7v6c0 5 3.8 8.7 9 9 5.2-.3 9-4 9-9V7l-9-5Z" fill="currentColor" opacity="0.22" />
                        <path d="M8.5 12.2 11 14.7l4.7-5.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Deposit via M-Pesa
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>
                    <div className="empty-state">
                      <strong>No withdrawable records found</strong>
                      <span>Withdrawable deposits will appear here once available.</span>
                    </div>
                  </td>
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
          <p>For any queries, please contact the office at {headerData?.email || 'info@tmgfoundation.org'}.</p>
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
        purpose="withdrawable_deposit"
        accountReference={mpesaAccount?.accNo}
        defaultPhone={memberData?.tel1 || memberData?.phone}
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
          font-weight: 600;
        }
        .contact-info { font-size: 0.72rem; margin-top: 0.5rem; color: #718096; }

        .info-table, .report-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 1rem;
        }

        .info-table td {
          border: 1px solid #e2e8f0;
          padding: 0.5rem 0.75rem;
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

        .report-table td, .report-table th {
          border: 1px solid #e2e8f0;
          padding: 0.6rem 0.5rem;
          font-size: 0.78rem;
        }

        .report-table th {
          background: ${colors.primary};
          color: white;
          font-weight: 700;
          text-align: left;
          white-space: nowrap;
          letter-spacing: 0.3px;
        }

        .report-table td {
          color: #1a202c;
        }

        .report-table tbody tr:nth-child(even) td {
          background: #fafbfd;
        }

        .report-table tbody tr:hover td {
          background: ${colors.softBlue};
        }

        .amount {
          text-align: right;
          font-weight: 600;
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
          transition: all 0.2s;
          white-space: nowrap;
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

        .total-row td {
          background: ${colors.softBlue} !important;
          font-weight: 800;
          border-top: 2px solid ${colors.primary};
          border-bottom: 2px solid ${colors.primary};
          color: ${colors.primary};
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

        .report-footer {
          margin-top: 1rem;
          text-align: center;
          font-size: 0.72rem;
          color: #64748b;
          line-height: 1.6;
        }

        .report-footer strong { color: ${colors.primary}; }

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
          inset: 0;
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
          font-size: 1.05rem;
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
          text-decoration: none;
          display: inline-block;
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
        .error-message {
          margin: 1rem auto 0;
          padding: 0.75rem 1rem;
          background: ${colors.softRed};
          border-left: 4px solid ${colors.accent};
          color: #991b1b;
          border-radius: 8px;
          max-width: 1400px;
          font-size: 0.85rem;
          font-weight: 500;
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
        @media print {
          .download-section, .modal-overlay { display: none; }
        }
      `}</style>
    </>
  );
}

export default WithdrawableStmt;
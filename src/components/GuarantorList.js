// GuarantorList.js - TMG Foundation themed
import React, { useRef, useState, useEffect } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import Alert from './Alert';

function GuarantorList() {
  const reportRef = useRef();
  const [memberData, setMemberData] = useState(null);
  const [guarantorData, setGuarantorData] = useState([]);
  const [totals, setTotals] = useState({ totalLoanAmount: 0, totalAmountGuaranteed: 0, totalOutstanding: 0 });
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

  const processGuarantorData = (data) => {
    let guarantors = [];

    if (data && data.data && Array.isArray(data.data)) {
      guarantors = data.data;
    } else if (Array.isArray(data)) {
      guarantors = data;
    } else if (data && typeof data === 'object') {
      if (data.guarantors) guarantors = data.guarantors;
      else if (data.guarantorList) guarantors = data.guarantorList;
      else if (data.guarantorDetails) guarantors = data.guarantorDetails;
    }

    const formattedGuarantors = guarantors.map((item, index) => ({
      id: item.id || index,
      curDate: item.curDate || item.inputDate || item.date || 'N/A',
      loanNo: item.loanNo || item.loanNumber || 'N/A',
      loanPurpose: item.loanPurpose || item.purpose || item.loanType || 'N/A',
      memberName: item.memberName || item.name || item.borrowerName || 'N/A',
      lamount: parseFloat(item.lamount || item.loanAmount || item.principal || 0),
      amountGuaranteed: parseFloat(item.amountGuaranteed || item.amtGuaranteed || item.guaranteedAmount || 0),
      outstanding: parseFloat(item.outstanding || item.loanBalance || item.balance || 0),
      guarantorType: item.guarantorType || item.level || item.guarantorLevel || 'N/A'
    }));

    setGuarantorData(formattedGuarantors);

    const totalLoanAmount = formattedGuarantors.reduce((sum, g) => sum + g.lamount, 0);
    const totalAmountGuaranteed = formattedGuarantors.reduce((sum, g) => sum + g.amountGuaranteed, 0);
    const totalOutstanding = formattedGuarantors.reduce((sum, g) => sum + g.outstanding, 0);

    setTotals({
      totalLoanAmount,
      totalAmountGuaranteed,
      totalOutstanding
    });
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

  useEffect(() => {
    const cachedGuarantors = localStorage.getItem('guarantorTransactions');
    const cachedMember = localStorage.getItem('memberProfile');

    if (cachedGuarantors) {
      try {
        const parsed = JSON.parse(cachedGuarantors);
        setGuarantorData(parsed.guarantors || []);
        setTotals(parsed.totals || { totalLoanAmount: 0, totalAmountGuaranteed: 0, totalOutstanding: 0 });
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

        const guarantorResponse = await fetch(`/api/v1/guarantor/${memberNumber}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });
        let guarantorDataRes = null;

        if (guarantorResponse && guarantorResponse.ok) {
          guarantorDataRes = await guarantorResponse.json();

          if (guarantorDataRes && (guarantorDataRes.data?.length > 0 || (Array.isArray(guarantorDataRes) && guarantorDataRes.length > 0))) {
            processGuarantorData(guarantorDataRes);
            const currentGuarantors = { guarantors: guarantorDataRes, totals };
            localStorage.setItem('guarantorTransactions', JSON.stringify(currentGuarantors));
          } else {
            setError('There are no guarantor records available for this member right now.');
            setGuarantorData([]);
            setTotals({ totalLoanAmount: 0, totalAmountGuaranteed: 0, totalOutstanding: 0 });
          }
        } else {
          setError('We could not find any guarantor data for this member right now.');
          setGuarantorData([]);
          setTotals({ totalLoanAmount: 0, totalAmountGuaranteed: 0, totalOutstanding: 0 });
        }

      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Network error. Unable to fetch guarantor data.');
        setGuarantorData([]);
        setTotals({ totalLoanAmount: 0, totalAmountGuaranteed: 0, totalOutstanding: 0 });
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
    pdf.save(`guarantor-statement-${memberData?.accNo || 'member'}-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  if (loading && !memberData && guarantorData.length === 0) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading guarantor information...</p>
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
          <p>Guarantor Statement</p>
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
                <td className="info-label">Email:</td>
                <td className="info-value">{memberData?.emailAdd || memberData?.email || 'N/A'}</td>
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

        <div className="table-section">
          <table className="report-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Loan No</th>
                <th>Loan Purpose</th>
                <th>Borrower Name</th>
                <th>Loan Amount (KES)</th>
                <th>Amount Guaranteed (KES)</th>
                <th>Outstanding Balance (KES)</th>
                <th>Guarantor Type</th>
              </tr>
            </thead>
            <tbody>
              {guarantorData.length > 0 ? (
                guarantorData.map((item, idx) => (
                  <tr key={item.id || idx}>
                    <td className="date-cell"><strong>{item.curDate}</strong></td>
                    <td className="loan-cell"><strong>{item.loanNo}</strong></td>
                    <td className="purpose-cell">{item.loanPurpose}</td>
                    <td className="name-cell"><strong>{item.memberName}</strong></td>
                    <td className="amount"><strong>{item.lamount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                    <td className="amount"><strong>{item.amountGuaranteed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                    <td className="amount outstanding-cell"><strong>{item.outstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                    <td className="center"><strong className="level-badge">{item.guarantorType}</strong></td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="8" style={{ padding: '1.5rem' }}>
                    <div className="empty-state">
                      <strong>No guarantor records yet</strong>
                      <span>You are not currently listed as a guarantor on any loan.</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
            {guarantorData.length > 0 && (
              <tfoot>
                <tr className="total-row">
                  <td colSpan="4"><strong>TOTAL</strong></td>
                  <td className="amount"><strong>{totals.totalLoanAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                  <td className="amount"><strong>{totals.totalAmountGuaranteed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                  <td className="amount"><strong>{totals.totalOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="report-footer">
          <p><strong>Note:</strong> This guarantor statement shows all loans you have guaranteed for other members.</p>
          <p>Please ensure you understand your obligations as a guarantor.</p>
          <p>For any queries, please contact the office at {headerData?.email || 'info@tmgfoundation.org'}.</p>
        </div>
      </div>

      <div className="download-section">
        <button onClick={handleDownloadPDF} className="download-btn" disabled={guarantorData.length === 0}>
          📄 Download PDF Statement
        </button>
      </div>

      {error && (
        <div style={{ maxWidth: '1400px', margin: '1rem auto' }}>
          <Alert type="warning">
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
          max-width: 1400px;
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

        .report-table td.center {
          text-align: center;
        }

        .report-table td.date-cell,
        .report-table td.loan-cell,
        .report-table td.name-cell {
          font-weight: 600;
        }

        .report-table td.outstanding-cell {
          color: ${colors.accent};
          font-weight: 700;
        }

        .report-table td.outstanding-cell strong {
          color: ${colors.accent};
        }

        .level-badge {
          display: inline-block;
          padding: 0.2rem 0.55rem;
          border-radius: 6px;
          font-weight: 700;
          background: ${colors.softRed};
          color: ${colors.accent};
          font-size: 0.68rem;
          letter-spacing: 0.3px;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
          min-height: 120px;
          text-align: center;
          color: #374151;
          background: ${colors.softBlue};
          border: 1px dashed rgba(27, 58, 107, 0.3);
          border-radius: 10px;
          padding: 1.25rem;
        }

        .empty-state strong {
          color: ${colors.primary};
          font-size: 0.95rem;
        }

        .empty-state span {
          font-size: 0.82rem;
          line-height: 1.5;
        }

        .total-row td {
          background: ${colors.softBlue} !important;
          font-weight: 800;
          border-top: 2px solid ${colors.primary};
          border-bottom: 2px solid ${colors.primary};
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

          .error-message {
            display: none;
          }
        }

        @media (max-width: 768px) {
          .report-container {
            padding: 1rem;
          }

          .report-table {
            font-size: 0.65rem;
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

          .empty-state {
            min-height: 100px;
            padding: 1rem;
          }
        }
      `}</style>
    </>
  );
}

export default GuarantorList;
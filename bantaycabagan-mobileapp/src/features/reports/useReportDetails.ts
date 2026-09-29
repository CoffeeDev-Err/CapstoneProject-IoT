import { useCallback, useEffect, useRef, useState } from 'react';
import type { PoliceReport } from '../../types/operations';
import { fetchPoliceReport } from '../../services/operationsApi';
import { requestErrorMessage } from '../../utils/requestFeedback';

export function useReportDetails(token: string | null, reports: PoliceReport[]) {
  const reportsRef = useRef(reports);
  reportsRef.current = reports;
  const [reportId, openReport] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<PoliceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const refresh = useCallback(() => setReload((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    const cachedReport = reportsRef.current.find((report) => report.id === reportId) || null;
    setSelectedReport(cachedReport);
    setError('');
    if (!reportId || !token) { setLoading(false); return; }
    setLoading(true);
    fetchPoliceReport(reportId, token).then(({ report }) => {
      if (active) setSelectedReport(report);
    }).catch((failure) => {
      if (active) setError(requestErrorMessage(failure, { action: 'open this report' }));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reportId, reload, token]);
  useEffect(() => {
    const updated = reports.find((report) => report.id === reportId);
    if (updated) setSelectedReport((current) => current && (updated.revision || 0) > (current.revision || 0) ? updated : current);
  }, [reportId, reports, selectedReport?.revision]);
  return { reportId, openReport, selectedReport: selectedReport?.id === reportId ? selectedReport : null, loading, error, refresh };
}

import { useCallback, useEffect, useState } from 'react';

import { loadReportDraft } from '../../services/offlineReportQueue';

export function useReportDraftReminder(currentPersonnelId: string) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let active = true;
    setVisible(false);
    if (currentPersonnelId) {
      loadReportDraft(currentPersonnelId)
        .then((draft) => {
          if (active && draft) setVisible(true);
        })
        .catch(() => undefined);
    }
    return () => { active = false; };
  }, [currentPersonnelId]);

  const dismiss = useCallback(() => setVisible(false), []);

  return { visible, dismiss };
}

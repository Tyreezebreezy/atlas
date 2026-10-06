import { useCallback, useEffect, useState } from 'react';
import { useStorage } from '../storage/StorageContext';
import { loadGymsData, type GymsData } from './equipmentActions';

/**
 * vNext Handoff 04B. Loads the places and equipment, and a `reload` for after a
 * write. `data` is null until the first load finishes (and while there is no
 * storage yet), so a screen shows its loading state rather than an empty list
 * that is only empty because it has not loaded.
 */
export function useGymsData() {
  const storage = useStorage();
  const [data, setData] = useState<GymsData | null>(null);

  const reload = useCallback(async () => {
    if (!storage) return;
    setData(await loadGymsData(storage));
  }, [storage]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { storage, data, reload };
}

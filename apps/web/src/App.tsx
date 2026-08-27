import { GymModeProvider } from './gym/GymModeContext';
import { NavShell } from './nav/NavShell';
import { UpdatePrompt } from './pwa/UpdatePrompt';
import { StorageProvider } from './storage/StorageContext';

export function App() {
  return (
    <StorageProvider>
      <GymModeProvider>
        <NavShell />
        <UpdatePrompt />
      </GymModeProvider>
    </StorageProvider>
  );
}

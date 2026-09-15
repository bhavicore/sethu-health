import { useEffect, useState } from 'react';
import './App.css';
import Landing from './views/Landing';
import PhcView from './views/PhcView';
import ChcView from './views/ChcView';
import DeskView from './views/DeskView';
import DoctorConsoleView from './views/DoctorConsoleView';
import InventoryView from './views/InventoryView';
import AuditLogView from './views/AuditLogView';
import SyncStatusBar from './components/SyncStatusBar';
import { initSyncEngine } from './lib/sync';

const NAV_ITEMS = [
  { role: 'desk', label: 'Desk' },
  { role: 'doctor', label: 'Doctor' },
  { role: 'inventory', label: 'Inventory' },
  { role: 'chc', label: 'CHC' },
  { role: 'audit', label: 'Audit Trail' },
  { role: 'phc', label: 'Referral (legacy)' },
];

export default function App() {
  const [role, setRole] = useState(null);
  const [activePatientId, setActivePatientId] = useState(null);
  const [doctorName, setDoctorName] = useState('Dr. Anitha Selvam');
  const [doctorRegNo, setDoctorRegNo] = useState('TN-MC-44210');

  useEffect(() => {
    const stop = initSyncEngine();
    return stop;
  }, []);

  function sendToDoctor(patientId) {
    setActivePatientId(patientId);
    setRole('doctor');
  }

  return (
    <div className="app">
      <nav className="app__nav">
        <button className="app__logo" onClick={() => setRole(null)}>
          SETHU
        </button>
        {role && (
          <div className="app__nav-links">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.role}
                className={role === item.role ? 'app__nav-link app__nav-link--active' : 'app__nav-link'}
                onClick={() => setRole(item.role)}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
        <SyncStatusBar />
      </nav>

      <main className="app__main">
        {!role && <Landing onSelect={setRole} />}
        {role === 'desk' && <DeskView onSendToDoctor={sendToDoctor} />}
        {role === 'doctor' && (
          <DoctorConsoleView
            activePatientId={activePatientId}
            doctorName={doctorName}
            doctorRegNo={doctorRegNo}
            onDoctorIdentityChange={({ doctorName: n, doctorRegNo: r }) => { setDoctorName(n); setDoctorRegNo(r); }}
          />
        )}
        {role === 'inventory' && <InventoryView facilityId="phc-1" />}
        {role === 'chc' && <ChcView />}
        {role === 'audit' && <AuditLogView />}
        {role === 'phc' && <PhcView />}
      </main>
    </div>
  );
}

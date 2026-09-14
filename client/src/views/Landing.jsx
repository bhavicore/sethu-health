const CHOICES = [
  { role: 'desk', title: 'Registration Desk', desc: 'Look up a returning patient or register a new one, before the doctor sees them.' },
  { role: 'doctor', title: 'Doctor Console', desc: 'History first, then dictate. The agent drafts, flags, and never blocks.' },
  { role: 'inventory', title: 'PHC Inventory', desc: 'Stock, usage trends, surge flags, and agent-drafted indents.' },
  { role: 'chc', title: 'CHC', desc: 'Scan referral cards, review incoming indents, manage CHC stock.' },
  { role: 'phc', title: 'Referral (legacy demo)', desc: 'The original offline QR referral-card bridge between a PHC and a CHC.' },
];

export default function Landing({ onSelect }) {
  return (
    <div className="landing">
      <div className="landing__brand">
        <h1>SETHU</h1>
        <p>An honest prototype: consultation, inventory, and offline referral — for rural India</p>
      </div>
      <div className="landing__choices">
        {CHOICES.map((c) => (
          <button key={c.role} className="landing__choice" onClick={() => onSelect(c.role)}>
            <span className="landing__choice-title">{c.title}</span>
            <span className="landing__choice-desc">{c.desc}</span>
          </button>
        ))}
      </div>
      <p className="landing__footnote">Synthetic demo data only. Doctors and Medical Officers approve everything.</p>
    </div>
  );
}

export default function Landing({ onSelect }) {
  return (
    <div className="landing">
      <div className="landing__brand">
        <h1>SETHU</h1>
        <p>Offline-first digital health records for rural India</p>
      </div>
      <div className="landing__choices">
        <button className="landing__choice" onClick={() => onSelect('phc')}>
          <span className="landing__choice-title">PHC Staff</span>
          <span className="landing__choice-desc">Log a patient visit and generate a referral card</span>
        </button>
        <button className="landing__choice" onClick={() => onSelect('chc')}>
          <span className="landing__choice-title">CHC Doctor</span>
          <span className="landing__choice-desc">Scan a referral card and see history instantly</span>
        </button>
      </div>
      <p className="landing__footnote">No login needed. Works offline.</p>
    </div>
  );
}

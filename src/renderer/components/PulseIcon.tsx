const paths = {
  today: 'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5',
  inbox: 'M4 4h16l2 12v4H2v-4L4 4zM2 15h6l2 3h4l2-3h6',
  calendar: 'M5 5h14a2 2 0 0 1 2 2v13H3V7a2 2 0 0 1 2-2zM7 3v4m10-4v4M3 11h18m-13 5h2m4 0h2',
  wins: 'M8 3h8v7a4 4 0 0 1-8 0V3zM8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4m-4 2v6m-4 0h8',
  search: 'm15 15 6 6',
  plus: 'M12 5v14M5 12h14',
  play: 'm8 4 12 8-12 8V4z',
  atlas: 'M3 9v6m4-10v14m5-16v18m5-16v14m4-10v6',
  settings: 'M4 6h16M4 12h16M4 18h16',
  chevron: 'm9 5 7 7-7 7',
  check: 'm5 12 5 5L20 7',
};
export function PulseIcon({ name }: { name: keyof typeof paths }) {
  return (
    <svg className="pulse-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[name]} />
      {name === 'today' && <circle cx="12" cy="12" r="4" />}
      {name === 'search' && <circle cx="10" cy="10" r="6" />}
      {name === 'settings' && (
        <>
          <circle cx="8" cy="6" r="2" />
          <circle cx="16" cy="12" r="2" />
          <circle cx="10" cy="18" r="2" />
        </>
      )}
    </svg>
  );
}

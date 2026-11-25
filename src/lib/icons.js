// Interface icons, drawn here so the app needs no icon font and works offline.
// All are 24x24 line icons that take the current text color.

const line = (body, extra = '') =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;

export const ui = {
  close: line('<path d="M6 6l12 12M18 6L6 18"/>'),
  chevronRight: line('<path d="M9 5l7 7-7 7"/>'),
  chevronLeft: line('<path d="M15 5l-7 7 7 7"/>'),
  send: line('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  list: line('<path d="M8 6.5h12M8 12h12M8 17.5h12"/><circle cx="4" cy="6.5" r=".6" fill="currentColor"/><circle cx="4" cy="12" r=".6" fill="currentColor"/><circle cx="4" cy="17.5" r=".6" fill="currentColor"/>'),
  map: line('<path d="M9 4.5L3.5 6.5v13L9 17.5l6 2 5.5-2v-13L15 6.5l-6-2z"/><path d="M9 4.5v13M15 6.5v13"/>'),
  locate: `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M20.5 3.5L3.8 10.4c-.5.2-.4.9.1 1l6.6 1.9 1.9 6.6c.1.5.8.6 1 .1L20.5 3.5z" fill="currentColor"/></svg>`,
  search: line('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>'),
  plus: line('<path d="M12 5v14M5 12h14"/>'),
  minus: line('<path d="M5 12h14"/>'),
  play: `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M8 5.5v13a.8.8 0 0 0 1.2.7l10.6-6.5a.8.8 0 0 0 0-1.4L9.2 4.8A.8.8 0 0 0 8 5.5z" fill="currentColor"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/></svg>`,
  tape: line('<path d="M6 3.5h12v17l-2.4-1.6-2.4 1.6-2.4-1.6-2.4 1.6L6 20.5v-17z"/><path d="M9.5 8.5h5M9.5 12h5"/>'),
  functions: line('<path d="M10.5 5.5c-2 0-2.6 1.2-2.9 3.2L6.4 17c-.3 1.6-1 2.3-2.4 2.3"/><path d="M4.8 10.5h5.4"/><path d="M13 12.5l6 6.5M19 12.5l-6 6.5"/>'),
  backspace: line('<path d="M9 5.5h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9L3 12l6-6.5z"/><path d="M12 9.5l5 5M17 9.5l-5 5"/>'),
  gear: line('<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>'),
  book: line('<path d="M12 6.5C10.3 5 7.800 4.500 4 4.500v13c3.800 0 6.300.5 8 2 1.700-1.500 4.200-2 8-2v-13c-3.800 0-6.300.5-8 2z"/><path d="M12 6.5v13"/>'),
  calendar: line('<rect x="4" y="5.500" width="16" height="14.500" rx="2.500"/><path d="M4 10h16M8.500 3.500v4M15.500 3.500v4"/>'),
  eye: line('<path d="M2.500 12s3.500-6.500 9.500-6.500 9.500 6.500 9.500 6.500-3.500 6.500-9.500 6.500S2.500 12 2.500 12z"/><circle cx="12" cy="12" r="2.800"/>'),
  sun: line('<circle cx="12" cy="12" r="4"/><path d="M12 2.500v2.500M12 19v2.500M2.500 12H5M19 12h2.500M5.300 5.300l1.800 1.800M16.900 16.900l1.800 1.800M5.300 18.700l1.800-1.800M16.900 7.100l1.800-1.800"/>'),
  door: line('<path d="M6 20.500V5a1.500 1.500 0 0 1 1.500-1.500h9A1.500 1.500 0 0 1 18 5v15.500"/><path d="M3.500 20.500h17"/><circle cx="14.300" cy="12.500" r=".7" fill="currentColor"/>'),
  sunset: line('<path d="M12 3.500v5M9.500 6.500L12 9l2.500-2.500"/><path d="M6.500 17.500a5.500 5.500 0 0 1 11 0"/><path d="M2.500 17.500h2M19.500 17.500h2M3.500 21h17"/>'),
  wind: line('<path d="M3 9h10.500a2.800 2.800 0 1 0-2.700-3.500"/><path d="M3 13.500h15.500a2.800 2.800 0 1 1-2.700 3.500"/><path d="M3 18h6"/>'),
  drop: line('<path d="M12 3.500s6 6.200 6 10.700a6 6 0 0 1-12 0C6 9.700 12 3.500 12 3.500z"/>'),
  chat: line('<path d="M4.500 5.500h15a1.500 1.500 0 0 1 1.500 1.500v8.500a1.500 1.500 0 0 1-1.500 1.500H11l-4.500 3.500v-3.500h-2A1.500 1.500 0 0 1 3 15.500V7a1.500 1.500 0 0 1 1.500-1.500z"/>'),
  thermo: line('<path d="M10 14V5.500a2 2 0 0 1 4 0V14a4 4 0 1 1-4 0z"/><path d="M12 10.500v6"/>'),
  hand: line('<path d="M8.500 12.500v-6a1.500 1.500 0 0 1 3 0v4.500-6a1.500 1.500 0 0 1 3 0v6-4.500a1.500 1.500 0 0 1 3 0V15c0 3.300-2.500 5.800-5.800 5.800-2.500 0-4-1-5.300-3L4 13.800a1.400 1.400 0 0 1 2.300-1.500l2.200 2.400"/>'),
  visibility: line('<path d="M2.500 12s3.500-6.500 9.500-6.500 9.500 6.500 9.500 6.500-3.500 6.500-9.500 6.500S2.500 12 2.500 12z"/><circle cx="12" cy="12" r="2.800"/>'),
  gauge: line('<path d="M4.200 17.500a9 9 0 1 1 15.600 0"/><path d="M12 13l4-5"/><circle cx="12" cy="13.500" r="1.200" fill="currentColor"/>'),
  lungs: line('<path d="M3 8.500h7M3 12.500h12M3 16.500h9"/><path d="M14.500 8.500h6.500M18.500 12.500h2.500M15.500 16.500h5.500"/>'),
  battery: line('<rect x="2.500" y="7.500" width="17" height="9" rx="2.500"/><path d="M22 10.500v3"/>'),
  moon: line('<path d="M20 14.500A8.500 8.500 0 1 1 9.500 4a7 7 0 0 0 10.500 10.500z"/>'),
  alert: line('<path d="M12 4l9 15.500H3L12 4z"/><path d="M12 10v4.500"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>'),
  trophy: line('<path d="M8 4.500h8v5a4 4 0 0 1-8 0v-5z"/><path d="M8 6.500H5a3 3 0 0 0 3 4M16 6.500h3a3 3 0 0 1-3 4"/><path d="M12 13.500v3.500M8.500 20h7M9.500 17h5"/>'),
  check: line('<path d="M5 12.500l4.500 4.500L19 7.500"/>'),
};

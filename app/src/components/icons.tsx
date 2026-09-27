// Простые линейные иконки 24x24 для навигации и шапки.
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

export const Icons = {
  today: <svg viewBox="0 0 24 24" {...P}><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M8 3v4M16 3v4M3.5 10h17M8 14h3" /></svg>,
  funnel: <svg viewBox="0 0 24 24" {...P}><path d="M4 5h16l-6 8v5l-4 2v-7z" /></svg>,
  inbox: <svg viewBox="0 0 24 24" {...P}><path d="M4 13l2.5-7h11L20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /><path d="M4 13h4.5l1 2h5l1-2H20" /></svg>,
  study: <svg viewBox="0 0 24 24" {...P}><path d="M3 5.5c2.5-1.5 5.5-1.5 9 .5 3.5-2 6.5-2 9-.5V19c-2.5-1.5-5.5-1.5-9 .5-3.5-2-6.5-2-9-.5z" /><path d="M12 6v13.5" /></svg>,
  train: <svg viewBox="0 0 24 24" {...P}><rect x="6" y="3.5" width="13" height="17" rx="2.5" /><path d="M4 7v11a3 3 0 0 0 3 3h9M10 9h5M10 13h5" /></svg>,
  stats: <svg viewBox="0 0 24 24" {...P}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>,
  bell: <svg viewBox="0 0 24 24" {...P}><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>,
  logout: <svg viewBox="0 0 24 24" {...P}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10" /></svg>,
}

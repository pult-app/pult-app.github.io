// Линейные иконки 24x24 (дизайн v4, макет «Пульт: редизайн» в Claude Design).
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

export const Icons = {
  today: <svg viewBox="0 0 24 24" {...P}><path d="M4 11l8-7 8 7v9H4z" /><path d="M10 20v-5h4v5" /></svg>,
  funnel: <svg viewBox="0 0 24 24" {...P}><path d="M3 5h18l-7 8v6l-4-2v-4z" /></svg>,
  inbox: <svg viewBox="0 0 24 24" {...P}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>,
  study: <svg viewBox="0 0 24 24" {...P}><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 21V5" /></svg>,
  more: <svg viewBox="0 0 24 24" {...P}><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>,
  bell: <svg viewBox="0 0 24 24" {...P}><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>,
  logout: <svg viewBox="0 0 24 24" {...P}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10" /></svg>,
  spark: <svg viewBox="0 0 24 24" {...P}><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></svg>,
  arrow: <svg viewBox="0 0 24 24" {...P} strokeWidth={2}><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>,
  back: <svg viewBox="0 0 24 24" {...P} strokeWidth={2}><path d="M15 6l-6 6 6 6" /></svg>,
  check: <svg viewBox="0 0 24 24" {...P} strokeWidth={2.6}><path d="M5 12l5 5 9-10" /></svg>,
  external: <svg viewBox="0 0 24 24" {...P} strokeWidth={2}><path d="M7 17L17 7" /><path d="M8 7h9v9" /></svg>,
}

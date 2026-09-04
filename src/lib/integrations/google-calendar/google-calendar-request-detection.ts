// Pure, dependency-free — same reasoning as gmail/gmail-request-detection.ts.
// Deliberately distinct from any internal-METRIX-Calendar navigation trigger
// (business-navigation's calendar.root): this is "read my connected Google
// Calendar for evidence", not "open the Workspace calendar view".
export function isExplicitGoogleCalendarRequest(message: string): boolean {
  const lower = message.toLocaleLowerCase("tr-TR");
  const calendarTerm = /(takvim|toplant|görüşme|randevu|etkinlik|ajanda|program)/i.test(lower);
  const action = /(bul|ara|bak|kontrol|göster|var mı|ne var|bugün|yarın|hafta|önümüzdeki|yaklaşan)/i.test(lower);
  return calendarTerm && action;
}

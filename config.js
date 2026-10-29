// Supabase-Zugang. Leer lassen = App läuft nur lokal auf dem Gerät, mit Vorschau-Login.
// Werte aus Supabase → Project Settings → API ("Project URL" und "Publishable" bzw. "anon public" Key).
// Dieser Key darf öffentlich sein: die Daten schützt die Row Level Security in supabase/schema.sql.
// Den "Secret"/"service_role"-Key NIE hier eintragen.
// stravaClientId (optional): Client-ID der eigenen Strava-API-App. Das Secret NIE hier eintragen –
// es wird in der App unter Menü → Strava eingegeben und bleibt nur auf dem Gerät.
// vapidPublicKey (optional): öffentlicher Schlüssel für den Wochenbericht per Push (privater nur als Supabase-Secret, siehe SETUP.md).
// garminLoginUrl (optional): Adresse des Garmin-Login-Servers auf Vercel (Ordner garmin-login/, siehe SETUP.md),
// z. B. "https://hyrox-garmin-login.vercel.app/api/login".
window.HX_CONFIG = {
  supabaseUrl: "https://mwhbjrulzxiwtjvcwojo.supabase.co",
  supabaseAnonKey: "sb_publishable_srJQv2rw2Njbv10g_eYioA_igQMR1vN",
  stravaClientId: "",
  vapidPublicKey: "BOwB9H2CeGF-CKjztQ6Q6t7a-NRclS8Aq_JgQ3YK_wWJSYxGWV4HWP7dxnB9sYwipUn5K0qedTnsLngHF9R5PN0",
  // nutritionUrl (optional): Adresse der Ernährungs-App; damit gibt es unter Garmin einen Knopf, der die Tagesschritte dorthin übergibt.
  nutritionUrl: "",
  garminLoginUrl: "https://hyrox-garmin-login.vercel.app/api/login"
};

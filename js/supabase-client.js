// Supabase client — configuration centrale.
// Remplace les deux valeurs ci-dessous par celles de ton projet Supabase
// (Dashboard -> Settings -> API).
(function (global) {
  "use strict";

  const SUPABASE_URL = "https://ktilbvibboqvkujstzed.supabase.co/rest/v1";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0aWxidmliYm9xdmt1anN0emVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxMTk0MDcsImV4cCI6MjA5OTY5NTQwN30.aLo0E_uM6a7rEl9t2sEBPY_gZalXDwmDI_QSkhHTMqs";

  if (!global.supabase) {
    console.error("Le SDK Supabase (supabase-js) n'est pas chargé. Vérifie la balise <script> dans index.html.");
    return;
  }

  global.sb = global.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    }
  });
})(window);

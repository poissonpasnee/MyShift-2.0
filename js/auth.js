// Auth gate — écran de connexion/inscription par numéro de compte.
// S'affiche par-dessus #app tant qu'aucune session valide n'existe.
(function () {
  "use strict";

  const FAKE_DOMAIN = "@myshift.local";
  const MIN_PASSWORD_LEN = 6;

  function accountNumberToEmail(num) {
    return num.trim() + FAKE_DOMAIN;
  }

  function generateAccountNumber() {
    return String(Math.floor(10000000 + Math.random() * 90000000));
  }

  function setError(msg) {
    const el = document.getElementById("auth-error");
    el.textContent = msg || "";
    el.classList.toggle("hidden", !msg);
  }

  function setBusy(busy) {
    document.querySelectorAll("#auth-gate button").forEach((b) => (b.disabled = busy));
  }

  // -----------------------------------------------------------------
  // Sign up: generates a fresh account number, retries on collision
  // -----------------------------------------------------------------
  async function signUp(password) {
    setBusy(true);
    setError("");
    try {
      let lastError = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const accountNumber = generateAccountNumber();
        const { data, error } = await sb.auth.signUp({
          email: accountNumberToEmail(accountNumber),
          password: password
        });
        if (!error) {
          showAccountNumberScreen(accountNumber);
          return;
        }
        lastError = error;
        // "User already registered" -> collision, retry with a new number.
        if (!/already/i.test(error.message)) break;
      }
      setError(lastError ? lastError.message : "Impossible de créer le compte.");
    } finally {
      setBusy(false);
    }
  }

  async function signIn(accountNumber, password) {
    setBusy(true);
    setError("");
    try {
      const { error } = await sb.auth.signInWithPassword({
        email: accountNumberToEmail(accountNumber),
        password: password
      });
      if (error) {
        setError("Numéro de compte ou mot de passe incorrect.");
        return;
      }
      hideGate();
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await sb.auth.signOut();
    showGate();
  }

  function accountNumberFromEmail(email) {
    if (!email) return null;
    const idx = email.indexOf(FAKE_DOMAIN);
    return idx > -1 ? email.slice(0, idx) : email;
  }

  // Populates the "Mon compte" row in the drawer with the current
  // user's account number, so it can be found again at any time.
  async function refreshAccountNumberDisplay() {
    const { data } = await sb.auth.getUser();
    const el = document.getElementById("drawer-account-number");
    if (el) el.textContent = accountNumberFromEmail(data && data.user ? data.user.email : null) || "—";
  }

  // -----------------------------------------------------------------
  // UI plumbing
  // -----------------------------------------------------------------
  function showGate() {
    document.getElementById("auth-gate").classList.remove("hidden");
    showPane("signin");
  }

  function hideGate() {
    document.getElementById("auth-gate").classList.add("hidden");
    refreshAccountNumberDisplay();
  }

  function showPane(name) {
    document.getElementById("auth-pane-signin").classList.toggle("hidden", name !== "signin");
    document.getElementById("auth-pane-signup").classList.toggle("hidden", name !== "signup");
    document.getElementById("auth-pane-created").classList.toggle("hidden", name !== "created");
    setError("");
  }

  function showAccountNumberScreen(accountNumber) {
    document.getElementById("auth-created-number").textContent = accountNumber;
    showPane("created");
  }

  // -----------------------------------------------------------------
  // Wire up events once DOM is ready
  // -----------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", async () => {
    document.getElementById("auth-link-to-signup").addEventListener("click", () => showPane("signup"));
    document.getElementById("auth-link-to-signin").addEventListener("click", () => showPane("signin"));

    document.getElementById("auth-signin-btn").addEventListener("click", () => {
      const number = document.getElementById("auth-signin-number").value.trim();
      const password = document.getElementById("auth-signin-password").value;
      if (!number || !password) return setError("Renseigne ton numéro de compte et ton mot de passe.");
      signIn(number, password);
    });

    document.getElementById("auth-signup-btn").addEventListener("click", () => {
      const password = document.getElementById("auth-signup-password").value;
      const confirm = document.getElementById("auth-signup-password-confirm").value;
      if (password.length < MIN_PASSWORD_LEN) return setError(`Le mot de passe doit faire au moins ${MIN_PASSWORD_LEN} caractères.`);
      if (password !== confirm) return setError("Les mots de passe ne correspondent pas.");
      signUp(password);
    });

    document.getElementById("auth-created-continue").addEventListener("click", () => {
      hideGate();
    });

    document.getElementById("btn-logout").addEventListener("click", async () => {
      if (confirm("Se déconnecter ?")) {
        await signOut();
      }
    });

    // Restore existing session if any (Supabase persists it in localStorage).
    const { data } = await sb.auth.getSession();
    if (data && data.session) {
      hideGate();
    } else {
      showGate();
    }

    // Only react to sign-out here. Sign-in/sign-up close the gate explicitly
    // (via signIn() or the "continue" button) — auto-hiding on every
    // SIGNED_IN event would close the "account created" screen before the
    // person has had a chance to read and note their account number.
    sb.auth.onAuthStateChange((_event, session) => {
      if (!session) showGate();
    });
  });
})();

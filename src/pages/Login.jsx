import React, { useState } from "react";
import { useGoogleLogin } from "@react-oauth/google";

function Login({ onLogin }) {
  const [error, setError]       = useState("");
  const [cargando, setCargando] = useState(false);

  const login = useGoogleLogin({
    onSuccess: async (respuesta) => {
      setCargando(true); setError("");
      try {
        localStorage.setItem("google_token", respuesta.access_token);
        const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${respuesta.access_token}` },
        });
        const usuario = await res.json();
        onLogin({
          nombre: usuario.name,
          email:  usuario.email,
          foto:   usuario.picture,
          token:  respuesta.access_token,
        });
      } catch (err) {
        setError("Error al iniciar sesión. Inténtalo de nuevo.");
      } finally {
        setCargando(false);
      }
    },
    onError: () => {
      setError("Error al conectar con Google.");
      setCargando(false);
    },
    scope: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/drive.file",
    ].join(" "),
  });

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Logo */}
        <div className="login-logo-wrap">
          <svg viewBox="0 0 24 24">
            <path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/>
          </svg>
        </div>

        <h1>LogiConta</h1>
        <p>Control de clases y contabilidad</p>

        {error && (
          <div className="alerta alerta-error" style={{ marginBottom: "20px", textAlign: "left" }}>
            {error}
          </div>
        )}

        {cargando ? (
          <div className="loading">
            <div className="spinner"></div>
            Conectando...
          </div>
        ) : (
          <button className="btn-google" onClick={() => login()}>
            <img
              src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
              alt="Google"
            />
            Entrar con Google
          </button>
        )}

        <p className="login-note">Solo accesible con tu cuenta de Google autorizada</p>
      </div>
    </div>
  );
}

export default Login;

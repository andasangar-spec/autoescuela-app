import React, { useState } from "react";
import { useGoogleLogin } from "@react-oauth/google";

function Login({ onLogin }) {
  const [error, setError]     = useState("");
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
        <div className="logo">🚗</div>
        <h1>AutoescuelaApp</h1>
        <p>Control de clases y contabilidad</p>
        {error && <div className="alerta alerta-error" style={{ marginBottom:"20px" }}>{error}</div>}
        {cargando ? (
          <div className="loading"><div className="spinner"></div>Conectando...</div>
        ) : (
          <button className="btn btn-primary" onClick={() => login()}
            style={{ width:"100%", justifyContent:"center", padding:"14px", fontSize:"16px" }}>
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
              alt="Google" style={{ width:"20px", height:"20px" }} />
            Entrar con Google
          </button>
        )}
        <p style={{ marginTop:"24px", fontSize:"12px", color:"#999" }}>
          Solo accesible con tu cuenta de Google
        </p>
      </div>
    </div>
  );
}

export default Login;
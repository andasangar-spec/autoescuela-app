import React, { useState } from "react";
import { useGoogleLogin } from "@react-oauth/google";
import logo from "../logo.png";

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
    <div style={styles.page}>
      {/* Logo */}
      <img src={logo} alt="LogiConta" style={styles.logo} />

      {/* Nombre y subtítulo */}
      <div style={styles.appName}>LogiConta</div>
      <div style={styles.appSub}>Class Control and Accounting</div>

      {/* Espacio */}
      <div style={{ flex: 1 }} />

      {/* Error */}
      {error && (
        <div style={styles.errorBox}>{error}</div>
      )}

      {/* Botón Google */}
      {cargando ? (
        <div style={styles.loadingBox}>
          <div style={styles.spinner}></div>
          <span style={{ color: "#4A5568", fontSize: "14px" }}>Conectando...</span>
        </div>
      ) : (
        <button style={styles.googleBtn} onClick={() => login()}>
          <img
            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
            alt="Google"
            style={{ width: "22px", height: "22px" }}
          />
          <span style={styles.googleBtnText}>Sign in with Google</span>
        </button>
      )}

      <div style={styles.note}>Solo accesible con tu cuenta de Google autorizada</div>

      {/* Espacio inferior */}
      <div style={{ height: "60px" }} />
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: "80px",
    paddingLeft: "32px",
    paddingRight: "32px",
    background: "radial-gradient(ellipse at 60% 40%, #d6dde6 0%, #c8d1db 40%, #b8c4cf 100%)",
    backgroundSize: "cover",
  },
  logo: {
    width: "200px",
    height: "200px",
    objectFit: "contain",
    marginBottom: "28px",
    filter: "drop-shadow(0 8px 24px rgba(74,107,140,0.25))",
  },
  appName: {
    fontSize: "42px",
    fontWeight: "800",
    color: "#0D2137",
    letterSpacing: "-1px",
    fontFamily: "'Inter', -apple-system, sans-serif",
    marginBottom: "6px",
    textAlign: "center",
  },
  appSub: {
    fontSize: "16px",
    fontWeight: "400",
    color: "#4A5568",
    fontFamily: "'Inter', -apple-system, sans-serif",
    textAlign: "center",
    marginBottom: "0px",
  },
  errorBox: {
    background: "#FEE2E2",
    border: "1px solid #FECACA",
    color: "#991B1B",
    borderRadius: "10px",
    padding: "12px 16px",
    fontSize: "13px",
    marginBottom: "16px",
    width: "100%",
    maxWidth: "320px",
    textAlign: "center",
  },
  googleBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    background: "white",
    border: "1.5px solid #E2E8F0",
    borderRadius: "12px",
    padding: "14px 28px",
    cursor: "pointer",
    boxShadow: "0 2px 12px rgba(0,0,0,0.10)",
    width: "100%",
    maxWidth: "320px",
    marginBottom: "14px",
    transition: "box-shadow 0.2s",
  },
  googleBtnText: {
    fontSize: "15px",
    fontWeight: "600",
    color: "#2C3A4A",
    fontFamily: "'Inter', -apple-system, sans-serif",
  },
  note: {
    fontSize: "12px",
    color: "#6B7280",
    textAlign: "center",
    fontFamily: "'Inter', -apple-system, sans-serif",
  },
  loadingBox: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "14px 28px",
    marginBottom: "14px",
  },
  spinner: {
    width: "20px",
    height: "20px",
    border: "2.5px solid #E2E8F0",
    borderTopColor: "#2272D4",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
};

export default Login;

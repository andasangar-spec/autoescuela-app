import React, { useState, useEffect, useMemo } from 'react';
import { getPagos } from '../services/googleApi';
import { format, parse, isWithinInterval, startOfDay, endOfDay, isValid } from 'date-fns';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const Contabilidad = () => {
  const [pagos, setPagos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fechaInicio, setFechaInicio] = useState(format(new Date(new Date().getFullYear(), 0, 1), 'yyyy-MM-dd'));
  const [fechaFin, setFechaFin] = useState(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => { cargarDatos(); }, []);

  const cargarDatos = async () => {
    setLoading(true);
    const datos = await getPagos();
    setPagos(Array.isArray(datos) ? datos : []);
    setLoading(false);
  };

  const pagosFiltrados = useMemo(() => {
    const start = startOfDay(new Date(fechaInicio));
    const end = endOfDay(new Date(fechaFin));
    return pagos.filter(p => {
      const pDate = parse(p.fecha, 'dd/MM/yyyy', new Date());
      return isValid(pDate) && isWithinInterval(pDate, { start, end });
    });
  }, [pagos, fechaInicio, fechaFin]);

  const exportarExcel = () => {
    const ws = XLSX.utils.json_to_sheet(pagosFiltrados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Contabilidad");
    XLSX.writeFile(wb, `Contabilidad_${fechaInicio}_${fechaFin}.xlsx`);
  };

  const exportarPDF = () => {
    const doc = new jsPDF();
    doc.text(`Reporte Contable: ${fechaInicio} a ${fechaFin}`, 14, 15);
    doc.autoTable({
      head: [['Fecha', 'Concepto', 'Ingreso', 'Gasto']],
      body: pagosFiltrados.map(p => [p.fecha, p.concepto, p.ingreso || 0, p.gasto || 0]),
    });
    doc.save(`Contabilidad.pdf`);
  };

  return (
    <div className="main-content-wrapper">
      <div className="card">
        <div className="card-header">
          <h2>Gestión Contable</h2>
          <div className="filtros" style={{ display: 'flex', gap: '10px' }}>
            <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
            <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
            <button onClick={exportarExcel} className="btn btn-outline">📥 Excel</button>
            <button onClick={exportarPDF} className="btn btn-outline">📥 PDF</button>
          </div>
        </div>
        <div className="card-body">
          {loading ? <p>Cargando...</p> : (
            <table className="tabla-datos">
              <thead><tr><th>Fecha</th><th>Concepto</th><th>Ingreso</th><th>Gasto</th></tr></thead>
              <tbody>
                {pagosFiltrados.map((p, i) => (
                  <tr key={i}>
                    <td>{p.fecha}</td><td>{p.concepto}</td>
                    <td className="text-success">{p.ingreso || "-"}</td>
                    <td className="text-danger">{p.gasto || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default Contabilidad;

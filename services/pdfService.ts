import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';
import { GeneratedExam, Question } from "./types";

export const generateExamPdf = (exam: GeneratedExam) => {
  const doc = new jsPDF();
  const { config, questions, date } = exam;

  // Header Box
  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.rect(10, 10, 190, 40);

  // Institution & Professor
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(config.nombreInstitucion.toUpperCase(), 105, 20, { align: "center" });
  
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`Profesor(a): ${config.nombreProfesor}`, 15, 30);
  doc.text(`Fecha: ${date}`, 140, 30);
  
  doc.setFont("helvetica", "bold");
  doc.text(`Asignatura: ${config.asignatura}`, 15, 38);
  doc.text(`Curso: ${config.curso}`, 140, 38);
  
  doc.setFont("helvetica", "italic");
  if (config.tema) {
    doc.text(`Tema: ${config.tema}`, 15, 46);
  }

  // Student info section
  doc.setFont("helvetica", "normal");
  doc.text("Nombre del Estudiante: ____________________________________________________", 15, 60);

  // Title
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("EVALUACIÓN ESCRITA", 105, 75, { align: "center" });

  // Questions
  let currentY = 85;

  questions.forEach((q, index) => {
    if (currentY > 250) {
      doc.addPage();
      currentY = 20;
    }

    // Question text
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    const questionText = `${index + 1}. ${q.pregunta}`;
    const splitQuestion = doc.splitTextToSize(questionText, 180);
    doc.text(splitQuestion, 15, currentY);
    currentY += splitQuestion.length * 6 + 4;

    if (q.tipo === 'mc' && q.opciones) {
      // Multiple choice: show options A) B) C) D)
      doc.setFontSize(10.5);
      doc.setFont("helvetica", "normal");

      const opts = [
        { letra: 'A', texto: q.opciones.a },
        { letra: 'B', texto: q.opciones.b },
        { letra: 'C', texto: q.opciones.c || '' },
        { letra: 'D', texto: q.opciones.d || '' },
      ].filter(o => o.texto.trim() !== '');

      opts.forEach(opt => {
        if (currentY > 270) {
          doc.addPage();
          currentY = 20;
        }
        const optLine = doc.splitTextToSize(`   ${opt.letra}) ${opt.texto}`, 175);
        doc.text(optLine, 18, currentY);
        currentY += optLine.length * 5.5 + 2;
      });

      currentY += 6;

    } else if (q.tipo === 'vf') {
      // Verdadero/Falso
      doc.setFontSize(10.5);
      doc.setFont("helvetica", "normal");
      doc.text("   □ Verdadero     □ Falso", 18, currentY);
      currentY += 12;

    } else {
      // Open question: lines for answer
      doc.setDrawColor(200);
      doc.line(20, currentY, 190, currentY);
      currentY += 8;
      doc.line(20, currentY, 190, currentY);
      currentY += 12;
    }
  });

  // Footer page numbering
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(10);
    doc.text(`Página ${i} de ${pageCount}`, 105, 290, { align: "center" });
  }

  // ANSWER KEY PAGE (teacher only)
  doc.addPage();
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("HOJA DE RESPUESTAS (SOLO PARA EL DOCENTE)", 105, 20, { align: "center" });
  
  let keyY = 35;
  questions.forEach((q, index) => {
    if (keyY > 270) {
      doc.addPage();
      keyY = 20;
    }
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");

    if (q.tipo === 'mc' && q.respuestaCorrecta) {
      doc.text(`${index + 1}. Respuesta correcta: ${q.respuestaCorrecta}`, 15, keyY);
      keyY += 6;
      if (q.justificacion) {
        doc.setFont("helvetica", "italic");
        const splitJust = doc.splitTextToSize(`   Justificación: ${q.justificacion}`, 175);
        doc.text(splitJust, 15, keyY);
        keyY += splitJust.length * 5 + 4;
      }
    } else {
      doc.text(`${index + 1}.`, 15, keyY);
      doc.setFont("helvetica", "normal");
      const splitAns = doc.splitTextToSize(q.respuesta, 170);
      doc.text(splitAns, 25, keyY);
      keyY += splitAns.length * 5 + 5;
    }
  });

  doc.save(`Examen_${config.asignatura}_${config.curso}_${date}.pdf`);
};

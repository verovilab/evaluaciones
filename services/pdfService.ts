
import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';
import { GeneratedExam } from "../types.ts";

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
  doc.text((config.nombreInstitucion || "INSTITUCIÓN EDUCATIVA").toUpperCase(), 105, 20, { align: "center" });
  
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`Profesor(a): ${config.nombreProfesor || "____________________"}`, 15, 30);
  doc.text(`Fecha: ${date}`, 140, 30);
  
  doc.setFont("helvetica", "bold");
  doc.text(`Asignatura: ${config.asignatura}`, 15, 38);
  doc.text(`Curso: ${config.curso}`, 140, 38);
  
  doc.setFont("helvetica", "italic");
  doc.text(`Tema: ${config.tema || "General"}`, 15, 46);

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
    if (currentY > 270) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    const questionText = `${index + 1}. ${q.pregunta}`;
    const splitQuestion = doc.splitTextToSize(questionText, 180);
    doc.text(splitQuestion, 15, currentY);
    
    // Solo dejamos espacio entre preguntas, sin líneas
    currentY += (splitQuestion.length * 7) + 8;
  });

  // Footer page numbering
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(10);
    doc.text(`Página ${i} de ${pageCount}`, 105, 290, { align: "center" });
  }

  // KEY / Answers page
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
    doc.text(`${index + 1}.`, 15, keyY);
    doc.setFont("helvetica", "normal");
    const ansText = q.respuesta;
    const splitAns = doc.splitTextToSize(ansText, 170);
    doc.text(splitAns, 25, keyY);
    keyY += (splitAns.length * 5) + 5;
  });

  doc.save(`Examen_${config.asignatura}_${config.curso}_${date}.pdf`);
};

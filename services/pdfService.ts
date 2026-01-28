
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";
import autoTable from 'https://esm.sh/jspdf-autotable@3.8.2';
import { GeneratedExam } from "../types.ts";

export const generateExamPdf = (exam: GeneratedExam) => {
  const doc = new jsPDF();
  const { config, questions, date } = exam;

  // Header Box - Ultra Compact
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.rect(10, 8, 190, 30);

  // Institution & Professor
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text((config.nombreInstitucion || "INSTITUCIÓN EDUCATIVA").toUpperCase(), 105, 15, { align: "center" });
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Docente: ${config.nombreProfesor || "Verónica Vila Bordó"}`, 15, 23);
  doc.text(`Fecha: ${date}`, 140, 23);
  
  doc.setFont("helvetica", "bold");
  doc.text(`Asignatura: ${config.asignatura}`, 15, 29);
  doc.text(`Curso: ${config.curso}`, 140, 29);
  
  doc.setFont("helvetica", "italic");
  doc.text(`Tema: ${config.tema || questions[0]?.tema || "General"}`, 15, 35);

  // Student info section - Tight
  doc.setFont("helvetica", "normal");
  doc.text("Estudiante: ____________________________________________________________________", 15, 45);

  // Title - Small
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("EVALUACIÓN ESCRITA", 105, 55, { align: "center" });

  // Questions - Compact font (Size 10)
  let currentY = 62;
  questions.forEach((q, index) => {
    if (currentY > 275) {
      doc.addPage();
      currentY = 15;
    }

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    const questionText = `${index + 1}. ${q.pregunta}`;
    const splitQuestion = doc.splitTextToSize(questionText, 180);
    
    // Check if question fits, if not, new page
    const height = (splitQuestion.length * 5) + 6;
    if (currentY + height > 285) {
      doc.addPage();
      currentY = 15;
    }

    doc.text(splitQuestion, 15, currentY);
    currentY += height;
  });

  // Footer page numbering - Compact
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.text(`Pág. ${i} / ${pageCount}`, 105, 292, { align: "center" });
  }

  // KEY / Answers page - Also compact
  doc.addPage();
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("CLAVE DE RESPUESTAS (SOLO DOCENTE)", 105, 15, { align: "center" });
  
  let keyY = 25;
  questions.forEach((q, index) => {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    const prefix = `${index + 1}. `;
    const ansText = q.respuesta;
    const splitAns = doc.splitTextToSize(ansText, 175);
    
    const h = (splitAns.length * 4) + 4;
    if (keyY + h > 280) {
      doc.addPage();
      keyY = 20;
    }

    doc.text(prefix, 15, keyY);
    doc.setFont("helvetica", "normal");
    doc.text(splitAns, 22, keyY);
    keyY += h;
  });

  doc.save(`Examen_${config.asignatura}_${config.curso}_${date}.pdf`);
};

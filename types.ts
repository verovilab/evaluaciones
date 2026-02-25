
export interface Question {
  id: string | number;
  pregunta: string;
  respuesta: string;
  tema?: string;
  dificultad?: string;
  tipo?: 'abierta' | 'mc' | 'vf';
  opciones?: {
    a: string;
    b: string;
    c?: string;
    d?: string;
  };
  respuestaCorrecta?: string; // "A", "B", "C" o "D"
  justificacion?: string;
}

export interface ExamConfig {
  asignatura: string;
  curso: string;
  tema: string;
  cantidadPreguntas: number;
  nombreProfesor: string;
  nombreInstitucion: string;
}

export interface GeneratedExam {
  config: ExamConfig;
  questions: Question[];
  date: string;
}

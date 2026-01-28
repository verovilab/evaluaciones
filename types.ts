
export interface Question {
  id: string | number;
  pregunta: string;
  respuesta: string;
  tema?: string;
  dificultad?: string;
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

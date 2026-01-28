
import React, { useState, useCallback, useMemo } from 'react';
import { 
  FileUp, 
  Download, 
  BookOpen, 
  Settings, 
  ClipboardList, 
  AlertCircle,
  CheckCircle2,
  Trash2,
  BrainCircuit,
  PlusCircle
} from 'lucide-react';
import { ASIGNATURAS, CURSOS } from './constants';
import { Question, ExamConfig, GeneratedExam } from './types';
import { generateExamPdf } from './services/pdfService';
import { improveQuestion } from './services/geminiService';

const App: React.FC = () => {
  const [csvData, setCsvData] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isImproving, setIsImproving] = useState<string | null>(null);

  const [config, setConfig] = useState<ExamConfig>({
    asignatura: ASIGNATURAS[0],
    curso: CURSOS[0],
    tema: '',
    cantidadPreguntas: 5,
    nombreProfesor: '',
    nombreInstitucion: ''
  });

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const rows = text.split('\n');
        const headers = rows[0].split(',').map(h => h.trim().toLowerCase());
        
        // Basic validation of CSV headers
        if (!headers.includes('pregunta') || !headers.includes('respuesta')) {
          throw new Error('El CSV debe contener al menos las columnas "pregunta" y "respuesta"');
        }

        const parsed: Question[] = rows.slice(1)
          .filter(row => row.trim() !== '')
          .map((row, idx) => {
            const values = row.split(',').map(v => v.trim());
            const q: any = { id: idx };
            headers.forEach((header, i) => {
              q[header] = values[i] || '';
            });
            return q as Question;
          });

        setCsvData(parsed);
        setSuccess(`Se han cargado ${parsed.length} preguntas correctamente.`);
        setTimeout(() => setSuccess(null), 3000);
      } catch (err: any) {
        setError(err.message || 'Error al procesar el archivo CSV.');
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  const filteredQuestions = useMemo(() => {
    if (!config.tema) return csvData;
    return csvData.filter(q => 
      q.tema?.toLowerCase().includes(config.tema.toLowerCase()) ||
      q.pregunta.toLowerCase().includes(config.tema.toLowerCase())
    );
  }, [csvData, config.tema]);

  const handleGeneratePdf = () => {
    if (csvData.length === 0) {
      setError("Carga un banco de preguntas primero.");
      return;
    }

    if (filteredQuestions.length < config.cantidadPreguntas) {
      setError(`Solo hay ${filteredQuestions.length} preguntas disponibles para este tema.`);
      return;
    }

    // Randomize selection
    const shuffled = [...filteredQuestions].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, config.cantidadPreguntas);

    const exam: GeneratedExam = {
      config,
      questions: selected,
      date: new Date().toLocaleDateString('es-ES')
    };

    generateExamPdf(exam);
    setSuccess("PDF generado con éxito.");
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleImproveText = async (id: string | number) => {
    const qIndex = csvData.findIndex(q => q.id === id);
    if (qIndex === -1) return;
    
    setIsImproving(id.toString());
    const improved = await improveQuestion(csvData[qIndex].pregunta);
    
    const newData = [...csvData];
    newData[qIndex] = { ...newData[qIndex], pregunta: improved };
    setCsvData(newData);
    setIsImproving(null);
  };

  const removeQuestion = (id: string | number) => {
    setCsvData(prev => prev.filter(q => q.id !== id));
  };

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <header className="bg-indigo-700 text-white py-8 px-6 shadow-lg mb-8">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-3 rounded-2xl">
              <BookOpen className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">EduGen</h1>
              <p className="text-indigo-100 opacity-80">Generador de Evaluaciones Académicas</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 transition-colors px-6 py-3 rounded-xl cursor-pointer font-medium shadow-sm border border-indigo-400/30">
              <FileUp className="w-5 h-5" />
              <span>Cargar CSV de Preguntas</span>
              <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Alerts */}
        <div className="lg:col-span-12">
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
              <AlertCircle className="text-red-500 w-5 h-5 flex-shrink-0" />
              <span className="text-red-700 font-medium">{error}</span>
              <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">×</button>
            </div>
          )}
          {success && (
            <div className="bg-emerald-50 border-l-4 border-emerald-500 p-4 rounded-r-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
              <CheckCircle2 className="text-emerald-500 w-5 h-5 flex-shrink-0" />
              <span className="text-emerald-700 font-medium">{success}</span>
              <button onClick={() => setSuccess(null)} className="ml-auto text-emerald-400 hover:text-emerald-600">×</button>
            </div>
          )}
        </div>

        {/* Configuration Section */}
        <section className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center gap-2 mb-6 border-b pb-4 border-slate-100">
              <Settings className="w-5 h-5 text-indigo-600" />
              <h2 className="text-xl font-bold text-slate-800">Configuración</h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">Institución Educativa</label>
                <input 
                  type="text" 
                  value={config.nombreInstitucion}
                  onChange={(e) => setConfig({...config, nombreInstitucion: e.target.value})}
                  placeholder="Ej: Colegio San José"
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">Docente</label>
                <input 
                  type="text" 
                  value={config.nombreProfesor}
                  onChange={(e) => setConfig({...config, nombreProfesor: e.target.value})}
                  placeholder="Nombre y Apellido"
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-600 mb-1">Asignatura</label>
                  <select 
                    value={config.asignatura}
                    onChange={(e) => setConfig({...config, asignatura: e.target.value})}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  >
                    {ASIGNATURAS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-600 mb-1">Curso</label>
                  <select 
                    value={config.curso}
                    onChange={(e) => setConfig({...config, curso: e.target.value})}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  >
                    {CURSOS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">Filtrar por Tema/Palabra Clave (opcional)</label>
                <input 
                  type="text" 
                  value={config.tema}
                  onChange={(e) => setConfig({...config, tema: e.target.value})}
                  placeholder="Ej: Álgebra"
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">Cantidad de Preguntas</label>
                <div className="flex items-center gap-4">
                  <input 
                    type="range" 
                    min="1" 
                    max={Math.min(filteredQuestions.length || 20, 50)} 
                    value={config.cantidadPreguntas}
                    onChange={(e) => setConfig({...config, cantidadPreguntas: parseInt(e.target.value)})}
                    className="flex-grow accent-indigo-600"
                  />
                  <span className="font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100 min-w-[3rem] text-center">
                    {config.cantidadPreguntas}
                  </span>
                </div>
              </div>

              <button 
                onClick={handleGeneratePdf}
                disabled={csvData.length === 0}
                className={`w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold shadow-lg transition-all transform active:scale-95 ${
                  csvData.length > 0 
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700' 
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                <Download className="w-5 h-5" />
                Descargar Evaluación PDF
              </button>
            </div>
          </div>

          <div className="bg-indigo-50 rounded-2xl p-6 border border-indigo-100">
            <h3 className="text-indigo-900 font-bold flex items-center gap-2 mb-2">
              <BrainCircuit className="w-5 h-5" />
              Sugerencia de Uso
            </h3>
            <p className="text-indigo-700 text-sm leading-relaxed">
              Puedes cargar un archivo CSV con columnas tituladas <code className="bg-indigo-200/50 px-1 rounded text-indigo-900 font-semibold">pregunta</code>, <code className="bg-indigo-200/50 px-1 rounded text-indigo-900 font-semibold">respuesta</code> y <code className="bg-indigo-200/50 px-1 rounded text-indigo-900 font-semibold">tema</code>. El sistema seleccionará aleatoriamente la cantidad que pidas basándose en tus filtros.
            </p>
          </div>
        </section>

        {/* Questions List Section */}
        <section className="lg:col-span-8">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-indigo-600" />
                <h2 className="text-xl font-bold text-slate-800">
                  Banco de Preguntas 
                  <span className="ml-2 text-sm font-normal text-slate-500">
                    ({filteredQuestions.length} {filteredQuestions.length === 1 ? 'disponible' : 'disponibles'})
                  </span>
                </h2>
              </div>
              {csvData.length > 0 && (
                <button 
                  onClick={() => setCsvData([])}
                  className="text-red-500 hover:text-red-700 text-sm font-medium flex items-center gap-1 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Vaciar banco
                </button>
              )}
            </div>

            <div className="divide-y divide-slate-100 max-h-[700px] overflow-y-auto">
              {csvData.length === 0 ? (
                <div className="p-20 flex flex-col items-center text-center opacity-50">
                  <div className="bg-slate-100 p-6 rounded-full mb-4">
                    <FileUp className="w-12 h-12 text-slate-400" />
                  </div>
                  <p className="text-slate-500 font-medium text-lg">Carga un archivo CSV para comenzar</p>
                  <p className="text-slate-400 text-sm">Aparecerán aquí todas tus preguntas cargadas</p>
                </div>
              ) : (
                filteredQuestions.map((q, idx) => (
                  <div key={q.id} className="p-6 hover:bg-slate-50 transition-colors group">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-grow">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="bg-slate-200 text-slate-600 text-xs font-bold px-2 py-1 rounded">#{idx + 1}</span>
                          {q.tema && (
                            <span className="bg-indigo-50 text-indigo-600 text-xs font-semibold px-2 py-1 rounded border border-indigo-100 uppercase tracking-wider">
                              {q.tema}
                            </span>
                          )}
                        </div>
                        <h4 className="text-slate-800 font-medium text-lg mb-2">{q.pregunta}</h4>
                        <div className="bg-slate-100 p-3 rounded-lg border-l-4 border-slate-300">
                          <p className="text-slate-600 text-sm">
                            <span className="font-bold text-slate-500 text-xs uppercase block mb-1">Respuesta:</span>
                            {q.respuesta}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleImproveText(q.id)}
                          disabled={!!isImproving}
                          title="Mejorar redacción con IA"
                          className={`p-2 rounded-lg text-indigo-600 hover:bg-indigo-100 transition-colors border border-transparent hover:border-indigo-200 ${isImproving === q.id.toString() ? 'animate-pulse' : ''}`}
                        >
                          <BrainCircuit className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => removeQuestion(q.id)}
                          className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            
            {csvData.length > 0 && filteredQuestions.length === 0 && (
              <div className="p-12 text-center">
                <p className="text-slate-500">No hay preguntas que coincidan con el filtro de tema.</p>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Footer Info */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t border-slate-200 p-4 text-center">
        <p className="text-slate-500 text-sm font-medium">
          EduGen Pro — Herramienta de Soporte Docente
        </p>
      </footer>
    </div>
  );
};

export default App;

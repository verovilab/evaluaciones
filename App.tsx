
import React, { useState, useMemo } from 'react';
import { 
  FileUp, 
  Download, 
  BookOpen, 
  Settings, 
  ClipboardList, 
  AlertCircle,
  CheckCircle2,
  Trash2,
  Sparkles,
  FileSpreadsheet,
  Edit3,
  RefreshCw,
  Search
} from 'lucide-react';
import { ASIGNATURAS, CURSOS } from './constants.ts';
import { Question, ExamConfig, GeneratedExam } from './types.ts';
import { generateExamPdf } from './services/pdfService.ts';
import { reviewAndFix, createAlternativeVersion } from './services/geminiService.ts';

const App: React.FC = () => {
  const [csvData, setCsvData] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | number | null>(null);

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
        
        if (!headers.includes('pregunta') || !headers.includes('respuesta')) {
          throw new Error('El CSV debe tener columnas "pregunta" y "respuesta"');
        }

        const parsed: Question[] = rows.slice(1)
          .filter(row => row.trim() !== '')
          .map((row, idx) => {
            const values = row.split(',').map(v => v.trim());
            const q: any = { id: `q-${Date.now()}-${idx}` };
            headers.forEach((header, i) => {
              q[header] = values[i] || '';
            });
            return q as Question;
          });

        setCsvData(parsed);
        setSuccess(`Base de datos cargada: ${parsed.length} preguntas.`);
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
    return csvData.filter(q => 
      q.pregunta.toLowerCase().includes(searchTerm.toLowerCase()) ||
      q.tema?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [csvData, searchTerm]);

  const handleAction = async (id: string | number, action: 'fix' | 'paraphrase') => {
    const qIndex = csvData.findIndex(q => q.id === id);
    if (qIndex === -1) return;
    
    setProcessingId(id);
    try {
      const originalText = csvData[qIndex].pregunta;
      const newText = action === 'fix' 
        ? await reviewAndFix(originalText) 
        : await createAlternativeVersion(originalText);
      
      const newData = [...csvData];
      newData[qIndex] = { ...newData[qIndex], pregunta: newText };
      setCsvData(newData);
      setSuccess(action === 'fix' ? "Ortografía corregida" : "Versión alternativa generada");
    } catch (e) {
      setError("Error al conectar con el asistente.");
    } finally {
      setProcessingId(null);
      setTimeout(() => setSuccess(null), 2000);
    }
  };

  // Fix: Added missing removeQuestion function to allow deleting questions from the list
  const removeQuestion = (id: string | number) => {
    setCsvData(prev => prev.filter(q => q.id !== id));
  };

  const handleGeneratePdf = () => {
    if (csvData.length === 0) return setError("Sube tu CSV primero.");
    
    // Si la docente tiene filtros activos, usamos esos. Si no, random del total.
    const pool = filteredQuestions.length > 0 ? filteredQuestions : csvData;
    const count = Math.min(config.cantidadPreguntas, pool.length);
    
    const selected = [...pool]
      .sort(() => 0.5 - Math.random())
      .slice(0, count);

    generateExamPdf({
      config,
      questions: selected,
      date: new Date().toLocaleDateString('es-ES')
    });
    setSuccess("Examen PDF generado correctamente.");
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Navbar Minimalista */}
      <header className="bg-white border-b border-slate-200 py-4 px-8 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg text-white">
              <ClipboardList className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">EduGen <span className="text-indigo-600">CSV Manager</span></h1>
          </div>
          
          <div className="flex gap-4">
            <label className="flex items-center gap-2 bg-slate-800 text-white hover:bg-slate-700 px-5 py-2 rounded-full cursor-pointer transition-all shadow-md text-sm font-medium">
              <FileSpreadsheet className="w-4 h-4" />
              <span>Importar mi CSV</span>
              <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        </div>
      </header>

      <main className="flex-grow max-w-7xl mx-auto w-full p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Panel Izquierdo: Configuración del PDF */}
        <aside className="lg:col-span-4 space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
              <Settings className="w-4 h-4" /> Formato de Impresión
            </h2>
            
            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-600 ml-1">Institución / Escuela</label>
                <input 
                  type="text" 
                  value={config.nombreInstitucion}
                  onChange={(e) => setConfig({...config, nombreInstitucion: e.target.value})}
                  className="w-full px-4 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all"
                  placeholder="Ej: Instituto Tecnológico"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-600 ml-1">Docente Responsable</label>
                <input 
                  type="text" 
                  value={config.nombreProfesor}
                  onChange={(e) => setConfig({...config, nombreProfesor: e.target.value})}
                  className="w-full px-4 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all"
                  placeholder="Tu nombre"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-600 ml-1">Asignatura</label>
                  <select 
                    value={config.asignatura}
                    onChange={(e) => setConfig({...config, asignatura: e.target.value})}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                  >
                    {ASIGNATURAS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-600 ml-1">Curso</label>
                  <select 
                    value={config.curso}
                    onChange={(e) => setConfig({...config, curso: e.target.value})}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                  >
                    {CURSOS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <div className="flex justify-between items-center mb-3">
                  <label className="text-xs font-bold text-slate-600">Preguntas en el examen</label>
                  <span className="text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded text-xs">{config.cantidadPreguntas}</span>
                </div>
                <input 
                  type="range" 
                  min="1" 
                  max={csvData.length || 10} 
                  value={config.cantidadPreguntas}
                  onChange={(e) => setConfig({...config, cantidadPreguntas: parseInt(e.target.value)})}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>

              <button 
                onClick={handleGeneratePdf}
                disabled={csvData.length === 0}
                className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg transition-all transform active:scale-95 ${
                  csvData.length > 0 
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200' 
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                }`}
              >
                <Download className="w-5 h-5" />
                Descargar Examen PDF
              </button>
            </div>
          </div>

          <div className="bg-indigo-600 text-white p-6 rounded-2xl shadow-lg relative overflow-hidden group">
            <Sparkles className="absolute -right-4 -top-4 w-24 h-24 text-white/10 group-hover:rotate-12 transition-transform" />
            <h3 className="font-bold mb-2 flex items-center gap-2">Asistente de Revisión</h3>
            <p className="text-xs text-indigo-100 leading-relaxed">
              Aunque tus preguntas sean perfectas, puedes usar la IA para corregir gazapos de escritura o para crear una "Versión B" del mismo examen.
            </p>
          </div>
        </aside>

        {/* Panel Derecho: Visualizador de preguntas del CSV */}
        <section className="lg:col-span-8 space-y-4 flex flex-col h-[80vh]">
          {/* Alertas */}
          {(error || success) && (
            <div className={`p-4 rounded-xl border flex items-center gap-3 animate-in fade-in slide-in-from-right-4 ${error ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
              {error ? <AlertCircle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
              <span className="text-sm font-semibold">{error || success}</span>
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col flex-grow">
            {/* Buscador y Stats */}
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row gap-4 justify-between items-center">
              <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Buscar en mis preguntas..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-full text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase">
                <BookOpen className="w-4 h-4" />
                <span>{filteredQuestions.length} Preguntas disponibles</span>
              </div>
            </div>

            {/* Listado de Preguntas */}
            <div className="flex-grow overflow-y-auto divide-y divide-slate-100">
              {csvData.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-12 opacity-40">
                  <FileSpreadsheet className="w-20 h-20 text-slate-300 mb-4" />
                  <p className="text-xl font-bold text-slate-600">No hay datos cargados</p>
                  <p className="text-sm max-w-xs mt-2">Importa un archivo CSV para empezar a organizar tu examen.</p>
                </div>
              ) : (
                filteredQuestions.map((q, idx) => (
                  <div key={q.id} className="p-6 hover:bg-slate-50 transition-all group flex gap-6">
                    <div className="flex-grow">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] font-black text-slate-300 uppercase tracking-tighter">PREGUNTA {idx + 1}</span>
                        {q.tema && <span className="bg-indigo-50 text-indigo-600 text-[10px] font-bold px-2 py-0.5 rounded border border-indigo-100 uppercase">{q.tema}</span>}
                      </div>
                      <p className="text-slate-800 font-medium mb-3">{q.pregunta}</p>
                      <div className="bg-slate-100/50 p-3 rounded-lg border border-slate-200/50">
                        <span className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Clave de Respuesta:</span>
                        <p className="text-slate-600 text-sm italic">{q.respuesta}</p>
                      </div>
                    </div>
                    
                    {/* Botones de Acción IA */}
                    <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-all">
                      <button 
                        onClick={() => handleAction(q.id, 'fix')}
                        disabled={!!processingId}
                        title="Corregir ortografía"
                        className="p-2 bg-white border border-slate-200 rounded-lg text-emerald-600 hover:bg-emerald-50 hover:border-emerald-200 transition-all shadow-sm flex items-center justify-center"
                      >
                        {processingId === q.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Edit3 className="w-4 h-4" />}
                      </button>
                      <button 
                        onClick={() => handleAction(q.id, 'paraphrase')}
                        disabled={!!processingId}
                        title="Crear variante (Versión B)"
                        className="p-2 bg-white border border-slate-200 rounded-lg text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 transition-all shadow-sm flex items-center justify-center"
                      >
                        <RefreshCw className={`w-4 h-4 ${processingId === q.id ? 'animate-spin' : ''}`} />
                      </button>
                      <button 
                        onClick={() => removeQuestion(q.id)}
                        className="p-2 bg-white border border-slate-200 rounded-lg text-red-400 hover:bg-red-50 hover:border-red-200 transition-all shadow-sm flex items-center justify-center"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </main>
      
      <footer className="bg-white border-t border-slate-200 p-4 text-center">
        <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">
          EduGen CSV — Diseñado para el flujo de trabajo docente profesional
        </p>
      </footer>
    </div>
  );
};

export default App;

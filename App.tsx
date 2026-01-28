
import React, { useState, useMemo } from 'https://esm.sh/react@19.0.0';
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
  Search,
  CheckSquare,
  Square,
  Save,
  X
} from 'https://esm.sh/lucide-react@0.475.0';
import * as XLSX from 'https://esm.sh/xlsx@0.18.5';
import { ASIGNATURAS, CURSOS, COLEGIOS } from './constants.ts';
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
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [selectionMode, setSelectionMode] = useState<'random' | 'manual'>('random');
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());

  const [config, setConfig] = useState<ExamConfig>({
    asignatura: ASIGNATURAS[0],
    curso: CURSOS[0],
    tema: '',
    cantidadPreguntas: 5,
    nombreProfesor: 'Verónica Vila Bordó',
    nombreInstitucion: COLEGIOS[0]
  });

  const cleanValue = (val: any) => {
    if (val === undefined || val === null) return '';
    const str = String(val).trim();
    return str.replace(/^["']+|["']+$/g, '').replace(/""/g, '"').trim();
  };

  const processData = (rawData: any[]) => {
    if (rawData.length === 0) throw new Error('El archivo está vacío.');

    const headers = Object.keys(rawData[0]);
    const preguntaKey = headers.find(k => k.toLowerCase().trim() === 'pregunta') || headers[0];
    const respuestaKey = headers.find(k => k.toLowerCase().trim() === 'respuesta') || headers[1];
    const temaKey = headers.find(k => k.toLowerCase().trim() === 'tema') || headers[2];

    const parsed: Question[] = rawData.map((row, idx) => ({
      id: `q-${Date.now()}-${idx}`,
      pregunta: cleanValue(row[preguntaKey]),
      respuesta: cleanValue(row[respuestaKey]),
      tema: temaKey ? cleanValue(row[temaKey]) : ''
    })).filter(q => q.pregunta !== '');

    setCsvData(parsed);
    setSuccess(`¡Listo! Se cargaron ${parsed.length} preguntas.`);
    setTimeout(() => setSuccess(null), 4000);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);

    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        if (isExcel) {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const json = XLSX.utils.sheet_to_json(worksheet);
          processData(json);
        } else {
          let text = e.target?.result as string;
          text = text.replace(/^\uFEFF/, '');
          const rows = text.split(/\r?\n/).filter(row => row.trim() !== '');
          const firstRow = rows[0];
          const separator = firstRow.includes(';') ? ';' : ',';
          const csvHeaders = firstRow.split(separator).map(h => h.trim().toLowerCase());
          
          const csvJson = rows.slice(1).map(row => {
            const values = row.split(separator);
            const obj: any = {};
            csvHeaders.forEach((h, i) => obj[h] = values[i]);
            return obj;
          });
          processData(csvJson);
        }
      } catch (err: any) {
        setError(err.message || 'Error al procesar el archivo.');
      } finally {
        setLoading(false);
        if (event.target) event.target.value = '';
      }
    };

    if (isExcel) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  };

  const filteredQuestions = useMemo(() => {
    if (!searchTerm) return csvData;
    const term = searchTerm.toLowerCase();
    return csvData.filter(q => 
      q.pregunta.toLowerCase().includes(term) ||
      (q.tema && q.tema.toLowerCase().includes(term))
    );
  }, [csvData, searchTerm]);

  const toggleSelection = (id: string | number) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedIds(newSelected);
  };

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
      setSuccess(action === 'fix' ? "Ortografía corregida" : "Versión B generada");
    } catch (e) {
      setError("Error al conectar con la IA.");
    } finally {
      setProcessingId(null);
      setTimeout(() => setSuccess(null), 2000);
    }
  };

  const saveQuestionEdit = (id: string | number, newPregunta: string, newRespuesta: string) => {
    setCsvData(prev => prev.map(q => q.id === id ? { ...q, pregunta: newPregunta, respuesta: newRespuesta } : q));
    setEditingId(null);
    setSuccess("Pregunta actualizada.");
    setTimeout(() => setSuccess(null), 2000);
  };

  const handleGeneratePdf = () => {
    if (csvData.length === 0) return setError("Primero sube tu archivo.");
    
    let selected: Question[] = [];
    if (selectionMode === 'manual') {
      selected = csvData.filter(q => selectedIds.has(q.id));
      if (selected.length === 0) return setError("Selecciona al menos una pregunta para el modo manual.");
    } else {
      const pool = filteredQuestions.length > 0 ? filteredQuestions : csvData;
      const count = Math.min(config.cantidadPreguntas, pool.length);
      selected = [...pool].sort(() => 0.5 - Math.random()).slice(0, count);
    }

    generateExamPdf({
      config,
      questions: selected,
      date: new Date().toLocaleDateString('es-ES')
    });
    setSuccess("Examen PDF generado correctamente.");
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <header className="bg-white border-b border-slate-200 py-3 px-8 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-1.5 rounded-lg text-white">
              <ClipboardList className="w-5 h-5" />
            </div>
            <h1 className="text-lg font-bold text-slate-800 tracking-tight">EduGen <span className="text-indigo-600">Pro</span></h1>
          </div>
          
          <div className="flex gap-4">
            <label className="flex items-center gap-2 bg-slate-800 text-white hover:bg-slate-700 px-5 py-2 rounded-full cursor-pointer transition-all shadow-md text-xs font-semibold active:scale-95 group">
              {loading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <FileSpreadsheet className="w-3 h-3 group-hover:scale-110 transition-transform" />}
              <span>{loading ? 'Procesando...' : 'Cargar Banco (Excel/CSV)'}</span>
              <input type="file" accept=".csv, .xlsx, .xls" onChange={handleFileUpload} className="hidden" disabled={loading} />
            </label>
          </div>
        </div>
      </header>

      <main className="flex-grow max-w-7xl mx-auto w-full p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        <aside className="lg:col-span-4 space-y-4">
          <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Settings className="w-3 h-3" /> Configuración General
            </h2>
            
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 ml-1">Institución / Colegio</label>
                <select 
                  value={config.nombreInstitucion}
                  onChange={(e) => setConfig({...config, nombreInstitucion: e.target.value})}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-xs"
                >
                  {COLEGIOS.map(col => <option key={col} value={col}>{col}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 ml-1">Docente Responsable</label>
                <input 
                  type="text" 
                  value={config.nombreProfesor}
                  onChange={(e) => setConfig({...config, nombreProfesor: e.target.value})}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-xs transition-all"
                  placeholder="Nombre de la profesora"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 ml-1">Asignatura</label>
                  <select 
                    value={config.asignatura}
                    onChange={(e) => setConfig({...config, asignatura: e.target.value})}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-xs"
                  >
                    {ASIGNATURAS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 ml-1">Curso</label>
                  <select 
                    value={config.curso}
                    onChange={(e) => setConfig({...config, curso: e.target.value})}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-xs"
                  >
                    {CURSOS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <label className="text-[10px] font-bold text-slate-500 mb-2 block uppercase">Modo de Selección</label>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <button 
                    onClick={() => setSelectionMode('random')}
                    className={`py-2 px-3 rounded-lg text-[10px] font-bold border transition-all ${selectionMode === 'random' ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200'}`}
                  >
                    Aleatorio
                  </button>
                  <button 
                    onClick={() => setSelectionMode('manual')}
                    className={`py-2 px-3 rounded-lg text-[10px] font-bold border transition-all ${selectionMode === 'manual' ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200'}`}
                  >
                    Manual ({selectedIds.size})
                  </button>
                </div>

                {selectionMode === 'random' && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Cantidad de preguntas</label>
                      <span className="text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded text-[10px]">{config.cantidadPreguntas}</span>
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
                )}
              </div>

              <button 
                onClick={handleGeneratePdf}
                disabled={csvData.length === 0}
                className={`w-full py-3 rounded-lg font-bold flex items-center justify-center gap-2 shadow-md transition-all transform active:scale-95 text-sm ${
                  csvData.length > 0 
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-100' 
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                <Download className="w-4 h-4" />
                Descargar Evaluación
              </button>
            </div>
          </div>

          <div className="bg-gradient-to-br from-indigo-600 to-violet-700 text-white p-5 rounded-xl shadow-lg relative overflow-hidden">
            <Sparkles className="absolute -right-2 -top-2 w-16 h-16 text-white/10" />
            <h3 className="text-xs font-bold mb-1 flex items-center gap-2">Tips Docente</h3>
            <p className="text-[10px] text-indigo-100 leading-tight">
              Diseño ultra-compacto (Calibri 10) para maximizar ahorro de papel. Las respuestas se incluyen en una hoja separada al final.
            </p>
          </div>
        </aside>

        <section className="lg:col-span-8 space-y-4 flex flex-col h-[78vh]">
          {error && (
            <div className="px-4 py-2 rounded-lg border bg-red-50 border-red-200 text-red-700 flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="text-xs font-semibold">{error}</span>
              <button onClick={() => setError(null)} className="ml-auto text-red-400">×</button>
            </div>
          )}
          {success && (
            <div className="px-4 py-2 rounded-lg border bg-emerald-50 border-emerald-200 text-emerald-700 flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span className="text-xs font-semibold">{success}</span>
              <button onClick={() => setSuccess(null)} className="ml-auto text-emerald-400">×</button>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col flex-grow">
            <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row gap-3 justify-between items-center">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Buscar en el banco..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-inner"
                />
              </div>
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase">
                <BookOpen className="w-3.5 h-3.5" />
                <span>{filteredQuestions.length} Items disponibles</span>
              </div>
            </div>

            <div className="flex-grow overflow-y-auto divide-y divide-slate-100">
              {csvData.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-12 opacity-30">
                  <FileSpreadsheet className="w-16 h-16 mb-4" />
                  <p className="text-lg font-bold">Sin datos</p>
                  <p className="text-xs mt-1">Carga un Excel para ver tus preguntas aquí.</p>
                </div>
              ) : (
                filteredQuestions.map((q, idx) => (
                  <div key={q.id} className={`p-4 hover:bg-slate-50/80 transition-all group flex gap-4 ${selectedIds.has(q.id) && selectionMode === 'manual' ? 'bg-indigo-50/50' : ''}`}>
                    {selectionMode === 'manual' && (
                      <button 
                        onClick={() => toggleSelection(q.id)}
                        className="mt-1 flex-shrink-0"
                      >
                        {selectedIds.has(q.id) ? (
                          <CheckSquare className="w-5 h-5 text-indigo-600" />
                        ) : (
                          <Square className="w-5 h-5 text-slate-300" />
                        )}
                      </button>
                    )}
                    
                    <div className="flex-grow min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[9px] font-black text-slate-300 uppercase tracking-tighter">PREGUNTA #{idx + 1}</span>
                        {q.tema && <span className="bg-slate-100 text-slate-600 text-[8px] font-bold px-1.5 py-0.5 rounded border border-slate-200 uppercase">{q.tema}</span>}
                      </div>
                      
                      {editingId === q.id ? (
                        <div className="space-y-3 p-3 bg-white border border-indigo-200 rounded-lg shadow-sm">
                          <div className="space-y-1">
                            <label className="text-[8px] font-bold uppercase text-slate-400">Pregunta:</label>
                            <textarea 
                              id={`edit-p-${q.id}`}
                              defaultValue={q.pregunta}
                              className="w-full p-2 text-xs border border-slate-200 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none min-h-[60px]"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[8px] font-bold uppercase text-slate-400">Respuesta:</label>
                            <textarea 
                              id={`edit-r-${q.id}`}
                              defaultValue={q.respuesta}
                              className="w-full p-2 text-xs border border-slate-200 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none min-h-[40px]"
                            />
                          </div>
                          <div className="flex justify-end gap-2">
                            <button 
                              onClick={() => setEditingId(null)}
                              className="px-2 py-1 text-[10px] text-slate-500 hover:bg-slate-100 rounded flex items-center gap-1"
                            >
                              <X className="w-3 h-3" /> Cancelar
                            </button>
                            <button 
                              onClick={() => {
                                const p = (document.getElementById(`edit-p-${q.id}`) as HTMLTextAreaElement).value;
                                const r = (document.getElementById(`edit-r-${q.id}`) as HTMLTextAreaElement).value;
                                saveQuestionEdit(q.id, p, r);
                              }}
                              className="px-2 py-1 text-[10px] bg-indigo-600 text-white hover:bg-indigo-700 rounded flex items-center gap-1 font-bold"
                            >
                              <Save className="w-3 h-3" /> Guardar Cambios
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-slate-800 font-medium text-sm mb-2 leading-relaxed break-words">{q.pregunta}</p>
                          <div className="bg-slate-50/80 p-2.5 rounded-lg border border-slate-200/50">
                            <span className="text-[8px] font-bold text-slate-400 uppercase block mb-0.5">Clave Respuesta:</span>
                            <p className="text-slate-600 text-xs italic line-clamp-2">{q.respuesta}</p>
                          </div>
                        </>
                      )}
                    </div>
                    
                    <div className="flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                      <button 
                        onClick={() => setEditingId(q.id)}
                        className="p-1.5 bg-white border border-slate-200 rounded-lg text-indigo-600 hover:bg-indigo-50 shadow-sm transition-colors"
                        title="Editar manualmente"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={() => handleAction(q.id, 'fix')}
                        disabled={!!processingId}
                        className="p-1.5 bg-white border border-slate-200 rounded-lg text-emerald-600 hover:bg-emerald-50 shadow-sm"
                        title="Corregir ortografía con IA"
                      >
                        {processingId === q.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      </button>
                      <button 
                        onClick={() => setCsvData(prev => prev.filter(item => item.id !== q.id))}
                        className="p-1.5 bg-white border border-slate-200 rounded-lg text-red-400 hover:bg-red-50 shadow-sm"
                        title="Eliminar ítem"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </main>
      
      <footer className="bg-white border-t border-slate-200 py-2 px-8 flex justify-between items-center text-[9px] font-bold text-slate-400 uppercase tracking-widest">
        <span>EduGen Pro — Gestión de Exámenes</span>
        <span>Docente: Verónica Vila Bordó</span>
      </footer>
    </div>
  );
};

export default App;

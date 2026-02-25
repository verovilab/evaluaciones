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
  BrainCircuit,
  CheckSquare,
  List,
  Pencil,
  Save,
  X,
  Shuffle,
  MousePointerClick,
  SpellCheck,
  RefreshCw
} from 'lucide-react';
import { ASIGNATURAS, CURSOS, INSTITUCIONES, DOCENTES } from './constants';
import { Question, ExamConfig, GeneratedExam } from './types';
import { generateExamPdf } from './services/pdfService';
import { reviewAndFix, createAlternativeVersion } from './services/geminiService';

// ─── CSV Parser ───────────────────────────────────────────────────────────────
function parseCSV(text: string): Question[] {
  const lines = text.split('\n').filter(l => l.trim() !== '');
  if (lines.length < 2) throw new Error('El CSV está vacío o no tiene datos.');

  const parseRow = (row: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '"') {
        if (inQuotes && row[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const rawHeaders = parseRow(lines[0]).map(h => h.toLowerCase().replace(/^"|"$/g, ''));
  const isMultipleChoice = rawHeaders.includes('option a') || rawHeaders.includes('opcion_a') || rawHeaders.includes('opción a');
  const isSimple = rawHeaders.includes('pregunta') && rawHeaders.includes('respuesta');

  if (!isMultipleChoice && !isSimple) {
    throw new Error('Formato CSV no reconocido. Debe tener columnas "pregunta"/"respuesta" o "Question"/"Option A"/"Option B"/"Correct Answer".');
  }

  return lines.slice(1).map((line, idx) => {
    const values = parseRow(line);
    const get = (key: string) => {
      const i = rawHeaders.indexOf(key);
      return i >= 0 ? (values[i] || '').replace(/^"|"$/g, '').trim() : '';
    };

    if (isMultipleChoice) {
      const correctRaw = get('correct answer') || get('respuesta_correcta') || '';
      const correctLetter = correctRaw.replace(/^([ABCD])[\.\)].*/i, '$1').trim().toUpperCase();
      return {
        id: idx,
        pregunta: get('question') || get('pregunta'),
        respuesta: correctRaw,
        respuestaCorrecta: correctLetter,
        tipo: 'mc' as const,
        opciones: {
          a: get('option a') || get('opcion_a') || get('opción a'),
          b: get('option b') || get('opcion_b') || get('opción b'),
          c: get('option c') || get('opcion_c') || get('opción c'),
          d: get('option d') || get('opcion_d') || get('opción d'),
        },
        justificacion: get('rationale') || get('justificacion') || get('justificación'),
        tema: get('tema') || get('topic') || '',
        dificultad: get('dificultad') || get('difficulty') || '',
      } as Question;
    } else {
      const tipoRaw = get('tipo')?.toLowerCase();
      const tipo = tipoRaw === 'vf' ? 'vf' : tipoRaw === 'mc' ? 'mc' : 'abierta';
      return {
        id: idx,
        pregunta: get('pregunta'),
        respuesta: get('respuesta'),
        tipo: tipo as Question['tipo'],
        tema: get('tema') || '',
        dificultad: get('dificultad') || '',
      } as Question;
    }
  }).filter(q => q.pregunta.trim() !== '');
}

// ─── Badge por tipo ────────────────────────────────────────────────────────────
const TipoBadge: React.FC<{ tipo?: string }> = ({ tipo }) => {
  if (!tipo || tipo === 'abierta') return (
    <span className="bg-slate-100 text-slate-500 text-xs font-semibold px-2 py-1 rounded border border-slate-200 uppercase tracking-wider flex items-center gap-1">
      <List className="w-3 h-3" /> Abierta
    </span>
  );
  if (tipo === 'mc') return (
    <span className="bg-purple-50 text-purple-600 text-xs font-semibold px-2 py-1 rounded border border-purple-100 uppercase tracking-wider flex items-center gap-1">
      <CheckSquare className="w-3 h-3" /> Múltiple opción
    </span>
  );
  if (tipo === 'vf') return (
    <span className="bg-amber-50 text-amber-600 text-xs font-semibold px-2 py-1 rounded border border-amber-100 uppercase tracking-wider flex items-center gap-1">
      <CheckSquare className="w-3 h-3" /> V / F
    </span>
  );
  return null;
};

// ─── App ───────────────────────────────────────────────────────────────────────
const App: React.FC = () => {
  const [csvData, setCsvData] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // null | "fix:{id}" | "alt:{id}"
  const [aiAction, setAiAction] = useState<string | null>(null);

  // Modo de selección: 'aleatorio' | 'manual'
  const [modoSeleccion, setModoSeleccion] = useState<'aleatorio' | 'manual'>('aleatorio');
  // IDs de preguntas seleccionadas manualmente
  const [seleccionadas, setSeleccionadas] = useState<Set<string | number>>(new Set());

  // Edición inline
  const [editandoId, setEditandoId] = useState<string | number | null>(null);
  const [editForm, setEditForm] = useState<{ pregunta: string; respuesta: string; tema: string }>({ pregunta: '', respuesta: '', tema: '' });

  const [config, setConfig] = useState<ExamConfig>({
    asignatura: ASIGNATURAS[0],
    curso: CURSOS[0],
    tema: '',
    cantidadPreguntas: 5,
    nombreProfesor: DOCENTES[0],
    nombreInstitucion: INSTITUCIONES[0]
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
        const parsed = parseCSV(text);
        setCsvData(parsed);
        setSeleccionadas(new Set());
        const mcCount = parsed.filter(q => q.tipo === 'mc').length;
        const abCount = parsed.filter(q => !q.tipo || q.tipo === 'abierta').length;
        const parts = [];
        if (mcCount > 0) parts.push(`${mcCount} de múltiple opción`);
        if (abCount > 0) parts.push(`${abCount} abiertas`);
        setSuccess(`Se cargaron ${parsed.length} preguntas: ${parts.join(', ')}.`);
        setTimeout(() => setSuccess(null), 4000);
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

  const toggleSeleccion = (id: string | number) => {
    setSeleccionadas(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleTodas = () => {
    if (seleccionadas.size === filteredQuestions.length) {
      setSeleccionadas(new Set());
    } else {
      setSeleccionadas(new Set(filteredQuestions.map(q => q.id)));
    }
  };

  const handleGeneratePdf = () => {
    if (csvData.length === 0) { setError("Carga un banco de preguntas primero."); return; }

    let selected: Question[] = [];

    if (modoSeleccion === 'manual') {
      selected = csvData.filter(q => seleccionadas.has(q.id));
      if (selected.length === 0) {
        setError("Seleccioná al menos una pregunta en modo Manual.");
        return;
      }
    } else {
      if (filteredQuestions.length < config.cantidadPreguntas) {
        setError(`Solo hay ${filteredQuestions.length} preguntas disponibles para este filtro.`);
        return;
      }
      const shuffled = [...filteredQuestions].sort(() => 0.5 - Math.random());
      selected = shuffled.slice(0, config.cantidadPreguntas);
    }

    const exam: GeneratedExam = { config, questions: selected, date: new Date().toLocaleDateString('es-ES') };
    generateExamPdf(exam);
    setSuccess("PDF generado con éxito.");
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleFixText = async (id: string | number) => {
    const qIndex = csvData.findIndex(q => q.id === id);
    if (qIndex === -1) return;
    setAiAction(`fix:${id}`);
    const fixed = await reviewAndFix(csvData[qIndex].pregunta);
    const newData = [...csvData];
    newData[qIndex] = { ...newData[qIndex], pregunta: fixed };
    setCsvData(newData);
    setAiAction(null);
  };

  const handleAlternativeText = async (id: string | number) => {
    const qIndex = csvData.findIndex(q => q.id === id);
    if (qIndex === -1) return;
    setAiAction(`alt:${id}`);
    const alt = await createAlternativeVersion(csvData[qIndex].pregunta);
    const newData = [...csvData];
    newData[qIndex] = { ...newData[qIndex], pregunta: alt };
    setCsvData(newData);
    setAiAction(null);
  };

  const removeQuestion = (id: string | number) => {
    setCsvData(prev => prev.filter(q => q.id !== id));
    setSeleccionadas(prev => { const next = new Set(prev); next.delete(id); return next; });
  };

  const startEdit = (q: Question) => {
    setEditandoId(q.id);
    setEditForm({ pregunta: q.pregunta, respuesta: q.respuesta, tema: q.tema || '' });
  };

  const saveEdit = (id: string | number) => {
    setCsvData(prev => prev.map(q => q.id === id ? { ...q, ...editForm } : q));
    setEditandoId(null);
  };

  const cancelEdit = () => setEditandoId(null);

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
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg flex items-center gap-3">
              <AlertCircle className="text-red-500 w-5 h-5 flex-shrink-0" />
              <span className="text-red-700 font-medium">{error}</span>
              <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">×</button>
            </div>
          )}
          {success && (
            <div className="bg-emerald-50 border-l-4 border-emerald-500 p-4 rounded-r-lg flex items-center gap-3">
              <CheckCircle2 className="text-emerald-500 w-5 h-5 flex-shrink-0" />
              <span className="text-emerald-700 font-medium">{success}</span>
              <button onClick={() => setSuccess(null)} className="ml-auto text-emerald-400 hover:text-emerald-600">×</button>
            </div>
          )}
        </div>

        {/* Configuration */}
        <section className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center gap-2 mb-6 border-b pb-4 border-slate-100">
              <Settings className="w-5 h-5 text-indigo-600" />
              <h2 className="text-xl font-bold text-slate-800">Configuración</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">Institución Educativa</label>
                <select value={config.nombreInstitucion}
                  onChange={(e) => setConfig({...config, nombreInstitucion: e.target.value})}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all">
                  {INSTITUCIONES.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">Docente</label>
                <select value={config.nombreProfesor}
                  onChange={(e) => setConfig({...config, nombreProfesor: e.target.value})}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all">
                  {DOCENTES.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-600 mb-1">Asignatura</label>
                  <select value={config.asignatura}
                    onChange={(e) => setConfig({...config, asignatura: e.target.value})}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all">
                    {ASIGNATURAS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-600 mb-1">Curso</label>
                  <select value={config.curso}
                    onChange={(e) => setConfig({...config, curso: e.target.value})}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all">
                    {CURSOS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">Filtrar por Tema/Palabra Clave (opcional)</label>
                <input type="text" value={config.tema}
                  onChange={(e) => setConfig({...config, tema: e.target.value})}
                  placeholder="Ej: Álgebra"
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
              </div>

              {/* ── Modo de Selección ── */}
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-2">Modo de Selección</label>
                <div className="flex rounded-xl overflow-hidden border border-slate-200">
                  <button
                    onClick={() => setModoSeleccion('aleatorio')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-all ${
                      modoSeleccion === 'aleatorio'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white text-slate-500 hover:bg-slate-50'
                    }`}>
                    <Shuffle className="w-4 h-4" /> Aleatorio
                  </button>
                  <button
                    onClick={() => setModoSeleccion('manual')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-all ${
                      modoSeleccion === 'manual'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white text-slate-500 hover:bg-slate-50'
                    }`}>
                    <MousePointerClick className="w-4 h-4" /> Manual ({seleccionadas.size})
                  </button>
                </div>
                {modoSeleccion === 'manual' && (
                  <p className="text-xs text-indigo-600 mt-1.5 font-medium">
                    ✓ Hacé click en las preguntas del banco para seleccionarlas
                  </p>
                )}
              </div>

              {/* Cantidad — solo en modo aleatorio */}
              {modoSeleccion === 'aleatorio' && (
                <div>
                  <label className="block text-sm font-semibold text-slate-600 mb-1">Cantidad de Preguntas</label>
                  <div className="flex items-center gap-4">
                    <input type="range" min="1"
                      max={Math.min(filteredQuestions.length || 20, 50)}
                      value={config.cantidadPreguntas}
                      onChange={(e) => setConfig({...config, cantidadPreguntas: parseInt(e.target.value)})}
                      className="flex-grow accent-indigo-600" />
                    <span className="font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100 min-w-[3rem] text-center">
                      {config.cantidadPreguntas}
                    </span>
                  </div>
                </div>
              )}

              <button onClick={handleGeneratePdf} disabled={csvData.length === 0}
                className={`w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold shadow-lg transition-all transform active:scale-95 ${
                  csvData.length > 0 
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700' 
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}>
                <Download className="w-5 h-5" />
                Descargar Evaluación PDF
                {modoSeleccion === 'manual' && seleccionadas.size > 0 && (
                  <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded-full ml-1">
                    {seleccionadas.size} preguntas
                  </span>
                )}
              </button>
            </div>
          </div>

          <div className="bg-indigo-50 rounded-2xl p-6 border border-indigo-100">
            <h3 className="text-indigo-900 font-bold flex items-center gap-2 mb-2">
              <BrainCircuit className="w-5 h-5" />
              Formatos de CSV aceptados
            </h3>
            <p className="text-indigo-700 text-sm leading-relaxed mb-2">
              <strong>Múltiple opción:</strong> columnas <code className="bg-indigo-200/50 px-1 rounded text-indigo-900">Question</code>, <code className="bg-indigo-200/50 px-1 rounded text-indigo-900">Option A…D</code>, <code className="bg-indigo-200/50 px-1 rounded text-indigo-900">Correct Answer</code>
            </p>
            <p className="text-indigo-700 text-sm leading-relaxed">
              <strong>Abierto/Simple:</strong> columnas <code className="bg-indigo-200/50 px-1 rounded text-indigo-900">pregunta</code>, <code className="bg-indigo-200/50 px-1 rounded text-indigo-900">respuesta</code> y opcionalmente <code className="bg-indigo-200/50 px-1 rounded text-indigo-900">tema</code>, <code className="bg-indigo-200/50 px-1 rounded text-indigo-900">tipo</code>
            </p>
          </div>
        </section>

        {/* Questions List */}
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
              <div className="flex items-center gap-3">
                {modoSeleccion === 'manual' && csvData.length > 0 && (
                  <button onClick={toggleTodas}
                    className="text-indigo-600 hover:text-indigo-800 text-sm font-medium transition-colors">
                    {seleccionadas.size === filteredQuestions.length ? 'Deseleccionar todas' : 'Seleccionar todas'}
                  </button>
                )}
                {csvData.length > 0 && (
                  <button onClick={() => { setCsvData([]); setSeleccionadas(new Set()); }}
                    className="text-red-500 hover:text-red-700 text-sm font-medium flex items-center gap-1 transition-colors">
                    <Trash2 className="w-4 h-4" />
                    Vaciar banco
                  </button>
                )}
              </div>
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
                filteredQuestions.map((q, idx) => {
                  const isSelected = seleccionadas.has(q.id);
                  const isEditing = editandoId === q.id;

                  return (
                    <div
                      key={q.id}
                      onClick={() => modoSeleccion === 'manual' && !isEditing && toggleSeleccion(q.id)}
                      className={`p-6 transition-colors group relative ${
                        modoSeleccion === 'manual' ? 'cursor-pointer' : ''
                      } ${
                        isSelected
                          ? 'bg-indigo-50 border-l-4 border-indigo-500'
                          : 'hover:bg-slate-50 border-l-4 border-transparent'
                      }`}>

                      {/* Checkbox visual en modo manual */}
                      {modoSeleccion === 'manual' && (
                        <div className={`absolute top-5 left-4 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                          isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white'
                        }`}>
                          {isSelected && <span className="text-white text-xs font-bold">✓</span>}
                        </div>
                      )}

                      <div className={`flex justify-between items-start gap-4 ${modoSeleccion === 'manual' ? 'pl-8' : ''}`}>
                        <div className="flex-grow">
                          {/* Badges */}
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="bg-slate-200 text-slate-600 text-xs font-bold px-2 py-1 rounded">#{idx + 1}</span>
                            <TipoBadge tipo={q.tipo} />
                            {q.tema && !isEditing && (
                              <span className="bg-indigo-50 text-indigo-600 text-xs font-semibold px-2 py-1 rounded border border-indigo-100 uppercase tracking-wider">
                                {q.tema}
                              </span>
                            )}
                          </div>

                          {/* ── MODO EDICIÓN ── */}
                          {isEditing ? (
                            <div className="space-y-3 mt-2" onClick={e => e.stopPropagation()}>
                              <div>
                                <label className="text-xs font-semibold text-slate-500 uppercase mb-1 block">Pregunta</label>
                                <textarea
                                  value={editForm.pregunta}
                                  onChange={e => setEditForm(f => ({ ...f, pregunta: e.target.value }))}
                                  rows={3}
                                  className="w-full px-3 py-2 rounded-lg border border-indigo-300 focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 text-sm resize-none"
                                />
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-slate-500 uppercase mb-1 block">Respuesta / Clave</label>
                                <input
                                  type="text"
                                  value={editForm.respuesta}
                                  onChange={e => setEditForm(f => ({ ...f, respuesta: e.target.value }))}
                                  className="w-full px-3 py-2 rounded-lg border border-indigo-300 focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 text-sm"
                                />
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-slate-500 uppercase mb-1 block">Tema</label>
                                <input
                                  type="text"
                                  value={editForm.tema}
                                  onChange={e => setEditForm(f => ({ ...f, tema: e.target.value }))}
                                  className="w-full px-3 py-2 rounded-lg border border-indigo-300 focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 text-sm"
                                />
                              </div>
                              <div className="flex gap-2 pt-1">
                                <button
                                  onClick={() => saveEdit(q.id)}
                                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors">
                                  <Save className="w-4 h-4" /> Guardar
                                </button>
                                <button
                                  onClick={cancelEdit}
                                  className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 text-slate-600 text-sm font-semibold rounded-lg hover:bg-slate-200 transition-colors">
                                  <X className="w-4 h-4" /> Cancelar
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <h4 className="text-slate-800 font-medium text-lg mb-3">{q.pregunta}</h4>

                              {q.tipo === 'mc' && q.opciones && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 mb-3">
                                  {(['a','b','c','d'] as const).map(letra => {
                                    if (!q.opciones![letra]) return null;
                                    const isCorrect = q.respuestaCorrecta?.toLowerCase() === letra;
                                    return (
                                      <div key={letra}
                                        className={`flex items-start gap-2 px-3 py-2 rounded-lg text-sm border ${
                                          isCorrect 
                                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-semibold' 
                                          : 'bg-slate-50 border-slate-200 text-slate-600'
                                        }`}>
                                        <span className="font-bold uppercase shrink-0">{letra})</span>
                                        <span>{q.opciones![letra]}</span>
                                        {isCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 ml-auto" />}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {q.tipo === 'vf' && (
                                <div className="flex gap-3 mb-3">
                                  <span className={`px-3 py-1 rounded-lg text-sm border font-semibold ${q.respuesta?.toLowerCase().includes('verdad') ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>✓ Verdadero</span>
                                  <span className={`px-3 py-1 rounded-lg text-sm border font-semibold ${q.respuesta?.toLowerCase().includes('fals') ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>✗ Falso</span>
                                </div>
                              )}

                              {q.tipo !== 'mc' && (
                                <div className="bg-slate-100 p-3 rounded-lg border-l-4 border-slate-300">
                                  <p className="text-slate-600 text-sm">
                                    <span className="font-bold text-slate-500 text-xs uppercase block mb-1">Respuesta:</span>
                                    {q.respuesta}
                                  </p>
                                </div>
                              )}
                              {q.tipo === 'mc' && q.justificacion && (
                                <div className="bg-amber-50 p-3 rounded-lg border-l-4 border-amber-300 mt-2">
                                  <p className="text-amber-800 text-sm">
                                    <span className="font-bold text-amber-600 text-xs uppercase block mb-1">Justificación:</span>
                                    {q.justificacion}
                                  </p>
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        {/* Acciones */}
                        {!isEditing && (
                          <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => startEdit(q)}
                              title="Editar pregunta"
                              className="p-2 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors border border-transparent hover:border-indigo-200">
                              <Pencil className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => handleFixText(q.id)}
                              disabled={!!aiAction}
                              title="Corregir ortografía y gramática"
                              className={`p-2 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors border border-transparent hover:border-emerald-200 ${aiAction === `fix:${q.id}` ? 'animate-pulse' : ''}`}>
                              <SpellCheck className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => handleAlternativeText(q.id)}
                              disabled={!!aiAction}
                              title="Generar versión alternativa"
                              className={`p-2 rounded-lg text-indigo-600 hover:bg-indigo-100 transition-colors border border-transparent hover:border-indigo-200 ${aiAction === `alt:${q.id}` ? 'animate-pulse' : ''}`}>
                              <RefreshCw className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => removeQuestion(q.id)}
                              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
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

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t border-slate-200 p-4 text-center">
        <p className="text-slate-500 text-sm font-medium">
          EduGen Pro — Herramienta de Soporte Docente
        </p>
      </footer>
    </div>
  );
};

export default App;

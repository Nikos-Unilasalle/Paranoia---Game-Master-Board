
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { GameState, ScenarioFile, OmniResponse, GameClock } from './types';
import { MarkdownUploader } from './components/MarkdownUploader';
import { ResponseCard } from './components/ResponseCard';
import { Clocks } from './components/Clocks';
import { Dice } from './components/Dice';
import { geminiService } from './services/geminiService';
import { TRANSLATIONS, LanguageKey } from './utils/translations';

const INITIAL_CLOCKS: GameClock[] = [
  { id: 'alerte', name: 'ALERTE', current: 0, max: 4 },
  { id: 'suspicion', name: 'SUSPICION', current: 0, max: 6 },
  { id: 'ressources', name: 'RESSOURCES', current: 5, max: 5 },
];

const LANGUAGES: LanguageKey[] = ['English', 'Français', 'Español', 'Italiano', 'Deutsch', '中文', '日本語'];

type ViewMode = 'TERMINAL' | 'INDICES' | 'PNJ' | 'PJ' | 'TABLE_RECAP';

const App: React.FC = () => {
  // --- State ---
  const [files, setFiles] = useState<ScenarioFile[]>([]);
  const [gameState, setGameState] = useState<GameState>({
    run_id: crypto.randomUUID(),
    language: 'Français',
    etape_active: "INIT",
    horloges: INITIAL_CLOCKS,
    indices_vus: [],
    objets_en_jeu: [],
    pnj_state: [],
    dernières_actions: [],
    last_options: [],
    cache_indices: null,
    cache_personnages: null,
    cache_joueurs: null,
  });
  
  const [history, setHistory] = useState<OmniResponse[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('TERMINAL');
  const [isPlayerMode, setIsPlayerMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [customQuery, setCustomQuery] = useState("");
  
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Translation Helper
  const t = TRANSLATIONS[gameState.language as LanguageKey] || TRANSLATIONS['Français'];

  // --- Auto-Scroll ---
  useEffect(() => {
    if (scrollRef.current && viewMode === 'TERMINAL') {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, viewMode, loading]);

  // --- File Categorization ---
  const individualBriefings = useMemo(() => files.filter(f => f.name.startsWith('04_')).sort((a,b) => a.name.localeCompare(b.name)), [files]);
  const missionBriefing = useMemo(() => files.find(f => f.name.startsWith('02_')), [files]);
  const endingFile = useMemo(() => files.find(f => f.name.startsWith('09_')), [files]);

  // --- Timeline Parsing (Updated for ## STEP format) ---
  const steps = useMemo(() => {
    if (files.length === 0) return [];
    const scenarioFile = files.find(f => f.name.includes("05_") || f.name.toLowerCase().includes("etapes")) || files[0];
    if (!scenarioFile) return [];

    const lines = scenarioFile.content.split('\n');
    const extractedSteps: string[] = [];
    
    lines.forEach(line => {
        const trimLine = line.trim();
        // Strict Match: Must start with "## STEP"
        if (trimLine.toUpperCase().startsWith('## STEP')) {
             const cleanName = trimLine.replace(/^#+\s*/, '').trim();
             extractedSteps.push(cleanName);
        }
    });
    return extractedSteps.length > 0 ? extractedSteps : ["INTRO", "DEVELOPPEMENT", "CLIMAX", "CONCLUSION"];
  }, [files]);

  // --- Helpers for Step Content Extraction ---
  
  const getStepBounds = (stepName: string | null) => {
    if (!stepName || files.length === 0) return null;
    const scenarioFile = files.find(f => f.name.includes("05_") || f.name.toLowerCase().includes("etapes"));
    if (!scenarioFile) return null;

    const lines = scenarioFile.content.split('\n');
    let startIndex = -1;
    let endIndex = -1;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.replace(/^#+\s*/, '').trim() === stepName) {
            startIndex = i;
        } else if (startIndex !== -1 && line.toUpperCase().startsWith('## STEP')) {
            endIndex = i;
            break;
        }
    }
    if (startIndex === -1) return null;
    if (endIndex === -1) endIndex = lines.length;
    
    return { lines, startIndex, endIndex };
  };

  const getStepDescription = (stepName: string): string[] => {
      const bounds = getStepBounds(stepName);
      if (!bounds) return [t.desc_not_found];

      const { lines, startIndex, endIndex } = bounds;
      // Capture text from startIndex + 1 until the first sub-header (###) or end
      const descriptionLines: string[] = [];
      
      for (let i = startIndex + 1; i < endIndex; i++) {
          const line = lines[i].trim();
          if (line.startsWith('###')) break; // Stop at sub-chapters (Options, Table)
          if (line.length > 0) descriptionLines.push(line);
      }
      return descriptionLines.length > 0 ? descriptionLines : [t.no_desc];
  };

  // --- Table Extraction Logic (Line-by-Line approach) ---
  const currentStepTable = useMemo(() => {
      const bounds = getStepBounds(gameState.etape_active);
      if (!bounds) return null;

      const { lines, startIndex, endIndex } = bounds;
      const stepLines = lines.slice(startIndex, endIndex);

      // Find the last table within this block
      let tables: string[][] = [];
      let currentTable: string[] = [];
      let insideTable = false;

      for (let i = 0; i < stepLines.length; i++) {
          const line = stepLines[i].trim();
          
          if (line.startsWith('|')) {
              if (!insideTable) {
                  insideTable = true;
                  currentTable = [];
              }
              currentTable.push(line);
          } else {
              if (insideTable) {
                  // Table ended
                  if (currentTable.length > 0) {
                      tables.push([...currentTable]);
                  }
                  insideTable = false;
                  currentTable = [];
              }
          }
      }
      if (insideTable && currentTable.length > 0) {
          tables.push([...currentTable]);
      }

      return tables.length > 0 ? tables[tables.length - 1] : null;

  }, [files, gameState.etape_active]);


  useEffect(() => {
    // Auto-select the first briefing or mission start if available
    if (files.length > 0 && gameState.etape_active === "INIT") {
        if (missionBriefing) {
            setGameState(prev => ({ ...prev, etape_active: missionBriefing.name }));
        } else if (steps.length > 0) {
            setGameState(prev => ({ ...prev, etape_active: steps[0] }));
        }
    }
  }, [files, steps, missionBriefing, gameState.etape_active]);

  // --- Core Logic ---

  const addToHistory = (response: OmniResponse) => {
      setHistory(prev => [...prev, { ...response, timestamp: Date.now() }]);
      
      // Update State based on response type
      if (response.type === 'TURN_RESULT' || response.type === 'OPTIONS') {
          const newOpts = response.type === 'TURN_RESULT' ? response.new_options : response.choices;
          setGameState(prev => ({ ...prev, last_options: newOpts }));
      }
      if (response.type === 'CLUE_DROPS') {
          setGameState(prev => ({ ...prev, cache_indices: response }));
      }
      if (response.type === 'CHARACTERS_LIST') {
          setGameState(prev => ({ ...prev, cache_personnages: response }));
      }
      if (response.type === 'PLAYERS_LIST') {
          setGameState(prev => ({ ...prev, cache_joueurs: response }));
      }
  };

  const executePrompt = async (intent: string, query: string, hidden: boolean = false) => {
    setLoading(true);
    try {
      const response = await geminiService.generateResponse(files, gameState, query, intent);
      if (!hidden) {
          addToHistory(response);
      } else {
          // For hidden fetches (like refreshing cache without showing in terminal)
          if (response.type === 'CLUE_DROPS') setGameState(prev => ({...prev, cache_indices: response}));
          if (response.type === 'CHARACTERS_LIST') setGameState(prev => ({...prev, cache_personnages: response}));
          if (response.type === 'PLAYERS_LIST') setGameState(prev => ({...prev, cache_joueurs: response}));
      }
      
      // Update Action Log
      if (!hidden) {
        setGameState(prev => ({
            ...prev,
            dernières_actions: [
                { qui: "SYSTEM", action: intent, résumé: query.substring(0, 20) + ".." },
                ...prev.dernières_actions.slice(0, 15)
            ]
        }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      if (viewMode === 'TERMINAL') setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleInputSubmit = () => {
      const val = customQuery.trim();
      if (!val) return;

      // Switch back to terminal if we are in an overlay
      if (viewMode !== 'TERMINAL') setViewMode('TERMINAL');

      // 1. Number Logic
      const numVal = parseInt(val);
      if (!isNaN(numVal) && numVal >= 1 && numVal <= 10 && gameState.last_options.length >= numVal) {
          const selectedOption = gameState.last_options[numVal - 1];
          executePrompt("TURN_RESULT", `Action: Le joueur choisit l'option ${numVal}: "${selectedOption}". Analyse les conséquences et propose 10 nouvelles options.`);
      } else {
      // 2. Free Text Logic
          executePrompt("TURN_RESULT", `Action libre des joueurs: "${val}". Analyse les conséquences et propose 10 nouvelles options.`);
      }
      setCustomQuery("");
  };

  // --- Export Logic ---
  const downloadHistory = () => {
    if (history.length === 0) return;
    const generateText = () => {
        let output = `PARANOIA GM BOARD - SESSION LOG\nRUN ID: ${gameState.run_id}\nDATE: ${new Date().toLocaleString()}\n----------------------------------------\n\n`;
        history.forEach((entry, i) => {
             output += `[${entry.type}] ${JSON.stringify(entry)}\n`;
        });
        return output;
    };
    const blob = new Blob([generateText()], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `paranoia_session.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // --- Overlay Handlers ---
  
  const toggleIndices = () => {
      if (viewMode === 'INDICES') {
          setViewMode('TERMINAL');
      } else {
          setViewMode('INDICES');
          if (!gameState.cache_indices) {
              executePrompt(
                  "CLUE_DROPS", 
                  "Génère une liste d'indices pour l'étape en cours. IMPÉRATIF: Mélange (1) des indices vitaux pour la progression du scénario, (2) des indices suspects pointant vers les secrets des PJ, et (3) des fausses pistes.", 
                  true
              );
          }
      }
  };

  const togglePNJ = () => {
      if (viewMode === 'PNJ') {
          setViewMode('TERMINAL');
      } else {
          setViewMode('PNJ');
          if (!gameState.cache_personnages) {
              executePrompt("CHARACTERS_LIST", "Liste les PNJ (Non-Joueurs) importants pour l'histoire, en excluant les joueurs.", true);
          }
      }
  };

  const togglePJ = () => {
      if (viewMode === 'PJ') {
          setViewMode('TERMINAL');
      } else {
          setViewMode('PJ');
          if (!gameState.cache_joueurs) {
              executePrompt("PLAYERS_LIST", "Analyse le fichier des personnages joueurs et liste tous les PJ.", true);
          }
      }
  };

  const toggleTable = () => {
      setViewMode(prev => prev === 'TABLE_RECAP' ? 'TERMINAL' : 'TABLE_RECAP');
  };

  const handleStepSelect = (step: string) => {
      setGameState(prev => ({ ...prev, etape_active: step, cache_indices: null }));
      
      // 1. Announce step
      addToHistory({
          type: 'COMPUTER_MESSAGE',
          bullets: [`${t.init_step}: ${step}`, t.loading_data],
          sources: ["SYSTEM"]
      });

      // 2. Display Original Scenario Text (Raw)
      const rawTextLines = getStepDescription(step);
      addToHistory({
          type: 'PLAYER_FACING',
          title: t.archive_data,
          bullets: rawTextLines,
          sources: ["ORIGINAL_SCENARIO_FILE"]
      });

      // 3. Auto-generate Options based on this text
      const contextText = rawTextLines.join('\n');
      executePrompt(
          "OPTIONS", 
          `Les joueurs commencent cette étape: "${step}". Voici la description du scénario: "${contextText.substring(0, 1000)}...". Sur la base de ce texte, génère 10 options d'actions logiques et probables pour commencer.`
      );
  };

  const handleFileSelect = (file: ScenarioFile) => {
      setGameState(prev => ({ ...prev, etape_active: file.name }));
      
      // Display content strictly
      addToHistory({
          type: 'PLAYER_FACING',
          title: file.name.toUpperCase().replace('.MD', ''),
          bullets: file.content.split('\n').filter(l => l.trim().length > 0 && !l.startsWith('#')),
          sources: [file.name]
      });
      // Do not trigger auto-options for simple document reading
  };

  // --- Render ---

  if (files.length === 0) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-black p-4 font-mono">
        <div className="border-retro p-8 max-w-2xl w-full text-center relative overflow-hidden">
            {/* Background decorative elements */}
            <div className="absolute top-0 left-0 w-full h-1 bg-amber-900/50"></div>
            <div className="absolute bottom-0 left-0 w-full h-1 bg-amber-900/50"></div>

            <h1 className="text-xl font-bold mb-2 text-glow">>> PARANOIA_GM_BOARD_V2.0</h1>
            <p className="mb-6 opacity-80 text-sm">SECURE TERMINAL ACCESS</p>

            <div className="mb-8">
                <p className="text-amber-500 text-xs uppercase mb-2">{t.select_lang}</p>
                <div className="flex flex-wrap justify-center gap-2">
                    {LANGUAGES.map(lang => (
                        <button 
                            key={lang}
                            onClick={() => setGameState(prev => ({ ...prev, language: lang }))}
                            className={`px-3 py-1 border text-xs font-bold uppercase transition-all ${gameState.language === lang ? 'bg-amber-500 text-black border-amber-500 shadow-[0_0_10px_#ffb000]' : 'border-amber-900 text-amber-900 hover:border-amber-500 hover:text-amber-500'}`}
                        >
                            {lang}
                        </button>
                    ))}
                </div>
            </div>

            <p className="mb-4 text-xs opacity-60">
                {t.lang_set}: <span className="text-amber-500 font-bold">{gameState.language.toUpperCase()}</span>
            </p>

            <MarkdownUploader onUpload={setFiles} language={gameState.language as LanguageKey} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-black text-amber-500 font-mono overflow-hidden p-1 gap-1">
      
      {/* HEADER */}
      <header className="h-8 border-retro flex items-center justify-between px-3 shrink-0 bg-gray-900 select-none">
        <div className="flex items-center gap-4 text-xs">
            <span className="font-bold text-glow">PARANOIA_GM_BOARD</span>
            <span className="opacity-50">|</span>
            <span>{files[0].name.replace('.md','').toUpperCase()}</span>
            <span className="opacity-50">|</span>
            <span className="text-amber-300 font-bold truncate max-w-[200px]">{gameState.etape_active}</span>
            <span className="opacity-50">|</span>
            <span className="text-xs text-amber-700">{gameState.language}</span>
        </div>
        <div className="flex gap-2 text-xs">
             <button onClick={() => setIsPlayerMode(!isPlayerMode)} className={`px-2 border border-transparent hover:border-amber-500 ${isPlayerMode ? 'bg-amber-500 text-black' : 'opacity-50'}`}>
                 {isPlayerMode ? t.visual_mode : t.gm_mode}
             </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden gap-1 relative">
        
        {/* LEFT COL: TIMELINE */}
        <aside className="w-48 flex flex-col gap-1 shrink-0">
            <div className="flex-1 border-retro flex flex-col overflow-hidden bg-black">
                <div className="bg-amber-900/40 text-amber-500 px-2 py-1 font-bold border-b border-amber-900/50 mb-1 text-xs uppercase">
                    >> {t.timeline}
                </div>
                <div className="overflow-y-auto flex-1 p-1 space-y-1 custom-scrollbar">
                    
                    {/* SECTION: BRIEFINGS (04) */}
                    {individualBriefings.length > 0 && (
                        <>
                            <div className="text-[10px] text-amber-700 font-bold px-2 pt-1">{t.personal_briefs}</div>
                            {individualBriefings.map((f) => (
                                <div 
                                    key={f.name}
                                    onClick={() => handleFileSelect(f)}
                                    className={`cursor-pointer px-2 py-1 text-[10px] border-l-2 leading-tight transition-all hover:bg-gray-900 truncate ${gameState.etape_active === f.name ? 'border-amber-500 bg-amber-900/20 text-white font-bold' : 'border-transparent text-amber-500/60'}`}
                                    title={f.name}
                                >
                                    {f.name.replace('04_', '').replace('.md', '')}
                                </div>
                            ))}
                            <div className="border-b border-amber-900/50 my-2 mx-2"></div>
                        </>
                    )}

                    {/* SECTION: MISSION ALERT (02) */}
                    {missionBriefing && (
                        <div 
                            onClick={() => handleFileSelect(missionBriefing)}
                            className={`cursor-pointer px-2 py-2 text-[10px] border-l-2 leading-tight transition-all hover:bg-gray-900 mb-1 ${gameState.etape_active === missionBriefing.name ? 'border-amber-500 bg-amber-900/20 text-white font-bold' : 'border-transparent text-amber-300'}`}
                        >
                            {t.mission_alert}
                        </div>
                    )}

                    {/* SECTION: STEPS (05) */}
                    {steps.map((step, i) => {
                        const isActive = gameState.etape_active === step;
                        return (
                            <div 
                                key={i}
                                onClick={() => handleStepSelect(step)}
                                className={`cursor-pointer px-2 py-2 text-[10px] border-l-2 leading-tight transition-all hover:bg-gray-900 ${isActive ? 'border-amber-500 bg-amber-900/20 text-white font-bold' : 'border-transparent text-amber-500/60'}`}
                            >
                                {step}
                            </div>
                        )
                    })}

                    {/* SECTION: ENDINGS (09) */}
                    {endingFile && (
                        <div 
                            onClick={() => handleFileSelect(endingFile)}
                            className={`cursor-pointer px-2 py-2 text-[10px] border-l-2 leading-tight transition-all hover:bg-gray-900 mt-2 ${gameState.etape_active === endingFile.name ? 'border-amber-500 bg-amber-900/20 text-white font-bold' : 'border-transparent text-red-400/70'}`}
                        >
                            {t.debriefing}
                        </div>
                    )}
                </div>
            </div>
            
            {/* DICE MODULE */}
             <div className="h-24 border-retro-dim flex flex-col bg-black p-2">
                 <Dice language={gameState.language as LanguageKey} />
             </div>
        </aside>

        {/* CENTER COL: MAIN TERMINAL & INPUT */}
        <main className="flex-1 flex flex-col gap-1 min-w-0 relative">
            
            {/* TERMINAL OUTPUT AREA */}
            <div className="flex-1 border-retro bg-black relative flex flex-col overflow-hidden">
                <div 
                    ref={scrollRef}
                    className={`flex-1 overflow-y-auto p-4 custom-scrollbar ${viewMode !== 'TERMINAL' ? 'opacity-10 pointer-events-none filter blur-sm' : ''}`}
                >
                    {history.length === 0 && (
                        <div className="mt-20 text-center opacity-30">
                             <div className="text-2xl font-bold mb-2">{t.ready}</div>
                             <p className="text-xs">{t.select_timeline}</p>
                        </div>
                    )}
                    {history.map((resp, idx) => (
                        <ResponseCard key={idx} data={resp} isPlayerMode={isPlayerMode} language={gameState.language as LanguageKey} />
                    ))}
                    
                    {loading && (
                        <div className="animate-pulse text-amber-500 font-bold text-xs mt-4">
                            {t.analyzing}
                        </div>
                    )}
                </div>

                {/* OVERLAYS */}
                
                {/* INDICES */}
                {viewMode === 'INDICES' && (
                     <div className="absolute inset-4 border-2 border-amber-500 bg-black z-10 flex flex-col shadow-lg shadow-black/80">
                         <div className="bg-amber-500 text-black px-2 py-1 font-bold flex justify-between items-center">
                             <span>{t.investigation}</span>
                             <button onClick={() => setViewMode('TERMINAL')} className="hover:bg-black hover:text-amber-500 px-2">X</button>
                         </div>
                         <div className="p-4 overflow-y-auto flex-1">
                             <p className="text-xs text-amber-900 mb-4 font-mono">{t.type_info}</p>
                             {gameState.cache_indices ? (
                                 <ResponseCard data={gameState.cache_indices} isPlayerMode={isPlayerMode} language={gameState.language as LanguageKey} />
                             ) : (
                                 <div className="text-center mt-10 animate-pulse">{t.loading}</div>
                             )}
                             <button onClick={() => executePrompt("CLUE_DROPS", "Force refresh indices", true)} className="mt-4 border border-amber-900 text-xs px-2 py-1 hover:bg-amber-900/20">{t.force_refresh}</button>
                         </div>
                     </div>
                )}

                {/* PNJ (NPCs) */}
                 {viewMode === 'PNJ' && (
                     <div className="absolute inset-4 border-2 border-amber-500 bg-black z-10 flex flex-col shadow-lg shadow-black/80">
                         <div className="bg-amber-500 text-black px-2 py-1 font-bold flex justify-between items-center">
                             <span>{t.npc_registry}</span>
                             <button onClick={() => setViewMode('TERMINAL')} className="hover:bg-black hover:text-amber-500 px-2">X</button>
                         </div>
                         <div className="p-4 overflow-y-auto flex-1">
                             {gameState.cache_personnages ? (
                                 <ResponseCard data={gameState.cache_personnages} isPlayerMode={isPlayerMode} language={gameState.language as LanguageKey} />
                             ) : (
                                 <div className="text-center mt-10 animate-pulse">{t.searching}</div>
                             )}
                             <button onClick={() => executePrompt("CHARACTERS_LIST", "Force refresh PNJ", true)} className="mt-4 border border-amber-900 text-xs px-2 py-1 hover:bg-amber-900/20">{t.force_refresh}</button>
                         </div>
                     </div>
                )}

                {/* PJ (PCs) */}
                {viewMode === 'PJ' && (
                     <div className="absolute inset-4 border-2 border-amber-500 bg-black z-10 flex flex-col shadow-lg shadow-black/80">
                         <div className="bg-amber-500 text-black px-2 py-1 font-bold flex justify-between items-center">
                             <span>{t.pc_registry}</span>
                             <button onClick={() => setViewMode('TERMINAL')} className="hover:bg-black hover:text-amber-500 px-2">X</button>
                         </div>
                         <div className="p-4 overflow-y-auto flex-1">
                             {gameState.cache_joueurs ? (
                                 <ResponseCard data={gameState.cache_joueurs} isPlayerMode={isPlayerMode} language={gameState.language as LanguageKey} />
                             ) : (
                                 <div className="text-center mt-10 animate-pulse">{t.analyzing_pc}</div>
                             )}
                             <button onClick={() => executePrompt("PLAYERS_LIST", "Force refresh PJ", true)} className="mt-4 border border-amber-900 text-xs px-2 py-1 hover:bg-amber-900/20">{t.force_refresh}</button>
                         </div>
                     </div>
                )}

                {/* TABLE RECAP OVERLAY */}
                {viewMode === 'TABLE_RECAP' && (
                    <div className="absolute inset-4 border-2 border-amber-500 bg-black z-10 flex flex-col shadow-lg shadow-black/80">
                        <div className="bg-amber-500 text-black px-2 py-1 font-bold flex justify-between items-center">
                             <span>{t.summary_table}: {gameState.etape_active}</span>
                             <button onClick={() => setViewMode('TERMINAL')} className="hover:bg-black hover:text-amber-500 px-2">X</button>
                        </div>
                        <div className="p-4 overflow-y-auto flex-1 font-mono text-sm">
                            {currentStepTable ? (
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr>
                                            {currentStepTable[0].split('|').filter(c => c.trim()).map((h, i) => (
                                                <th key={i} className="border border-amber-900 bg-amber-900/20 p-2 text-amber-500 font-bold uppercase">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {currentStepTable.slice(1).map((row, idx) => {
                                            if (row.includes('---')) return null;
                                            return (
                                                <tr key={idx} className="hover:bg-amber-900/10">
                                                    {row.split('|').filter(c => c.trim()).map((cell, cIdx) => (
                                                        <td key={cIdx} className="border border-amber-900/50 p-2 text-amber-500/80 align-top">{cell}</td>
                                                    ))}
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            ) : (
                                <div className="text-center opacity-50 mt-10 flex flex-col items-center">
                                    <span className="text-xl mb-2">⚠</span>
                                    <span>{t.no_table}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
            
            {/* COMMAND DECK */}
            <div className="border-retro bg-gray-900/50 flex flex-col shrink-0">
                {/* Dynamic Main Tab Name */}
                <div className="flex border-b border-amber-900/50">
                    <div className="px-4 py-2 bg-amber-900/30 text-amber-500 font-bold text-xs uppercase flex-1 border-r border-amber-900/50 truncate">
                         {gameState.etape_active || t.waiting}
                    </div>
                    <button onClick={toggleIndices} className={`px-4 py-2 text-xs font-bold uppercase border-r border-amber-900/50 hover:bg-amber-900/20 ${viewMode === 'INDICES' ? 'bg-amber-500 text-black' : 'text-amber-500/70'}`}>
                        {t.clues}
                    </button>
                    <button onClick={togglePNJ} className={`px-4 py-2 text-xs font-bold uppercase border-r border-amber-900/50 hover:bg-amber-900/20 ${viewMode === 'PNJ' ? 'bg-amber-500 text-black' : 'text-amber-500/70'}`}>
                        {t.npc}
                    </button>
                    <button onClick={togglePJ} className={`px-4 py-2 text-xs font-bold uppercase hover:bg-amber-900/20 ${viewMode === 'PJ' ? 'bg-amber-500 text-black' : 'text-amber-500/70'}`}>
                        {t.pc}
                    </button>
                </div>

                {/* INPUT AREA */}
                <div className="p-2 flex gap-2 bg-black">
                    <div className="pt-1 text-amber-500 font-bold text-lg animate-pulse">{'>'}</div>
                    <input 
                        ref={inputRef}
                        type="text" 
                        value={customQuery}
                        onChange={(e) => setCustomQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleInputSubmit()}
                        placeholder={t.input_placeholder}
                        className="flex-1 bg-transparent border-none focus:ring-0 text-amber-500 placeholder-amber-900/50 focus:outline-none font-mono text-base"
                        autoFocus
                        autoComplete="off"
                    />
                    <button 
                        onClick={handleInputSubmit} 
                        disabled={loading}
                        className="px-4 bg-amber-900 hover:bg-amber-500 hover:text-black transition-colors text-sm font-bold uppercase disabled:opacity-50"
                    >
                        {loading ? '...' : t.enter}
                    </button>
                </div>
            </div>
        </main>

        {/* RIGHT COL: MONITORING */}
        <aside className="w-56 flex flex-col gap-1 shrink-0">
            <div className="h-1/2 border-retro flex flex-col bg-black">
                <div className="bg-amber-900/40 px-2 py-1 text-amber-500 border-b border-amber-900/50 text-xs mb-2 uppercase">
                    >> {t.clocks}
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                    <Clocks clocks={gameState.horloges} language={gameState.language as LanguageKey} onUpdate={(id, d) => setGameState(p => ({...p, horloges: p.horloges.map(c => c.id === id ? {...c, current: Math.max(0, Math.min(c.max, c.current + d))} : c)}))} />
                </div>
            </div>

            <div className="flex-1 border-retro flex flex-col bg-black p-1 gap-1 overflow-y-auto">
                 <div className="bg-amber-900/20 p-1 text-[10px] text-center mb-2 opacity-60">{t.gm_tools}</div>
                 <RetroButton onClick={() => executePrompt("GM_BRIEF", "Brief rapide de la situation.")} label={t.brief} />
                 <RetroButton onClick={() => executePrompt("RAIL_BRIDGES", "3 moyens de ramener les joueurs sur le scénario.")} label={t.bridges} />
                 <div className="my-1 border-t border-amber-900/50"></div>
                 <RetroButton onClick={toggleTable} label={t.recap} />
                 <div className="my-1 border-t border-amber-900/50"></div>
                 <RetroButton onClick={downloadHistory} label={t.save_logs} />
            </div>
        </aside>

      </div>
    </div>
  );
};

const RetroButton: React.FC<{ onClick: () => void, label: string }> = ({ onClick, label }) => (
    <button 
        onClick={onClick}
        className="w-full border border-amber-900 bg-black hover:bg-amber-500 hover:text-black text-amber-500 transition-colors uppercase text-xs font-bold py-2 mb-1"
    >
        {label}
    </button>
);

export default App;

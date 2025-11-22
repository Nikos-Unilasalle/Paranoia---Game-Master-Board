
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { GameState, ScenarioFile, OmniResponse, GameClock } from './types';
import { MarkdownUploader } from './components/MarkdownUploader';
import { ResponseCard } from './components/ResponseCard';
import { Clocks } from './components/Clocks';
import { Dice } from './components/Dice';
import { geminiService } from './services/geminiService';

const INITIAL_CLOCKS: GameClock[] = [
  { id: 'alerte', name: 'ALERTE', current: 0, max: 4 },
  { id: 'suspicion', name: 'SUSPICION', current: 0, max: 6 },
  { id: 'ressources', name: 'RESSOURCES', current: 5, max: 5 },
];

type ViewMode = 'TERMINAL' | 'INDICES' | 'PNJ' | 'PJ';

const App: React.FC = () => {
  // --- State ---
  const [files, setFiles] = useState<ScenarioFile[]>([]);
  const [gameState, setGameState] = useState<GameState>({
    run_id: crypto.randomUUID(),
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

  // --- Auto-Scroll ---
  useEffect(() => {
    if (scrollRef.current && viewMode === 'TERMINAL') {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, viewMode, loading]);

  // --- Timeline Parsing ---
  const steps = useMemo(() => {
    if (files.length === 0) return [];
    const scenarioFile = files.find(f => f.name.includes("05_etapes_scenario.md")) 
                      || files.find(f => f.name.includes("etapes"))
                      || files[0];
    if (!scenarioFile) return [];

    const lines = scenarioFile.content.split('\n');
    const extractedSteps: string[] = [];
    let inTable = false;
    
    lines.forEach(line => {
        const trimLine = line.trim();
        if (trimLine.startsWith('|')) { inTable = true; return; }
        if (trimLine === '') { inTable = false; }
        if (!inTable && trimLine.startsWith('#')) {
             const cleanName = trimLine.replace(/^#+\s*/, '').trim();
             if (cleanName.length > 2 && !cleanName.toLowerCase().includes("crédits")) {
                 extractedSteps.push(cleanName);
             }
        }
    });
    return extractedSteps.length > 0 ? extractedSteps : ["INTRO", "DEVELOPPEMENT", "CLIMAX", "CONCLUSION"];
  }, [files]);

  useEffect(() => {
    if (steps.length > 0 && gameState.etape_active === "INIT") {
        setGameState(prev => ({ ...prev, etape_active: steps[0] }));
    }
  }, [steps, gameState.etape_active]);

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
            const time = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : 'Unknown Time';
            output += `[${time}] TYPE: ${entry.type}\n`;
            
            if ('title' in entry) output += `TITRE: ${entry.title}\n`;
            if ('scene' in entry) output += `SCÈNE: ${entry.scene}\n`;
            if ('trigger' in entry) output += `DÉCLENCHEUR: ${entry.trigger}\n`;
            if ('prompt' in entry) output += `PROMPT: ${entry.prompt}\n`;

            output += `CONTENU:\n`;
            
            if ('bullets' in entry) {
                entry.bullets.forEach(b => output += ` - ${b}\n`);
            }
            if ('choices' in entry) {
                entry.choices.forEach((c, idx) => output += ` ${idx + 1}. ${c}\n`);
            }
            if ('consequences' in entry) {
                output += ` > CONSÉQUENCES:\n`;
                entry.consequences.forEach(c => output += `   * ${c}\n`);
                output += ` > NOUVELLES OPTIONS:\n`;
                entry.new_options.forEach((o, idx) => output += `   ${idx + 1}. ${o}\n`);
            }
            if ('players' in entry) {
                entry.players.forEach(p => output += ` - ${p.name} [${p.society}]\n`);
            }
            if ('characters' in entry) {
                entry.characters.forEach(c => output += ` - ${c.name} (${c.role})\n`);
            }
            if ('bridges' in entry) {
                output += ` > FROM: ${entry.from} TO ${entry.to}\n`;
                entry.bridges.forEach(b => output += ` - ${b}\n`);
            }

            output += `\n----------------------------------------\n\n`;
        });
        return output;
    };

    const blob = new Blob([generateText()], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `paranoia_session_${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // --- Overlay Handlers ---
  
  const toggleIndices = () => {
      if (viewMode === 'INDICES') {
          setViewMode('TERMINAL');
      } else {
          setViewMode('INDICES');
          if (!gameState.cache_indices) {
              // Mise à jour critique : demande explicite de croiser scénario et secrets des PJ
              executePrompt(
                  "CLUE_DROPS", 
                  "Liste les indices pour cette étape. IMPORTANT : Inclus des indices vitaux pour le scénario, MAIS AUSSI des indices qui éveillent la suspicion sur les PJ (en rapport avec leurs sociétés secrètes ou missions) et des fausses pistes.", 
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
              executePrompt("PLAYERS_LIST", "Analyse le fichier des personnages joueurs (ex: 03_personnages_joueurs.md) et liste tous les PJ avec leurs mutations, sociétés et objectifs.", true);
          }
      }
  };

  const handleStepSelect = (step: string) => {
      setGameState(prev => ({ ...prev, etape_active: step, cache_indices: null }));
      
      // Announce step change in terminal
      addToHistory({
          type: 'COMPUTER_MESSAGE',
          bullets: [`INITIALISATION ÉTAPE: ${step}`, "CHARGEMENT DU BRIEF..."],
          sources: ["SYSTEM"]
      });

      // Automatically trigger a Player Facing description (Intro)
      executePrompt(
          "PLAYER_FACING", 
          `Nous débutons l'étape: "${step}". Génère une description d'introduction immersive (PLAYER_FACING) à lire aux joueurs pour planter le décor et la situation initiale de cette étape.`
      );
  };


  // --- Render ---

  if (files.length === 0) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-black p-4 font-mono">
        <div className="border-retro p-8 max-w-2xl w-full text-center">
            <h1 className="text-base font-bold mb-4 text-glow">>> PARANOIA_GM_BOARD_V2.0</h1>
            <p className="mb-8 opacity-80">INITIALISATION... VEUILLEZ CHARGER LE SCÉNARIO.</p>
            <MarkdownUploader onUpload={setFiles} />
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
            <span className="text-amber-300 font-bold">{gameState.etape_active}</span>
        </div>
        <div className="flex gap-2 text-xs">
             <button onClick={() => setIsPlayerMode(!isPlayerMode)} className={`px-2 border border-transparent hover:border-amber-500 ${isPlayerMode ? 'bg-amber-500 text-black' : 'opacity-50'}`}>
                 {isPlayerMode ? 'VISUAL_MODE' : 'GM_MODE'}
             </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden gap-1 relative">
        
        {/* LEFT COL: TIMELINE */}
        <aside className="w-48 flex flex-col gap-1 shrink-0">
            <div className="flex-1 border-retro flex flex-col overflow-hidden bg-black">
                <div className="bg-amber-900/40 text-amber-500 px-2 py-1 font-bold border-b border-amber-900/50 mb-1 text-xs uppercase">
                    >> Timeline
                </div>
                <div className="overflow-y-auto flex-1 p-1 space-y-1 custom-scrollbar">
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
                </div>
            </div>
            
            {/* DICE MODULE (Replacment for last input buffer) */}
             <div className="h-24 border-retro-dim flex flex-col bg-black p-2">
                 <Dice />
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
                             <div className="text-2xl font-bold mb-2">PRÊT À JOUER</div>
                             <p className="text-xs">Sélectionnez une option ou tapez une action.</p>
                        </div>
                    )}
                    {history.map((resp, idx) => (
                        <ResponseCard key={idx} data={resp} isPlayerMode={isPlayerMode} />
                    ))}
                    
                    {loading && (
                        <div className="animate-pulse text-amber-500 font-bold text-xs mt-4">
                            >> ANALYSE EN COURS...
                        </div>
                    )}
                </div>

                {/* OVERLAYS */}
                
                {/* INDICES */}
                {viewMode === 'INDICES' && (
                     <div className="absolute inset-4 border-2 border-amber-500 bg-black z-10 flex flex-col shadow-lg shadow-black/80">
                         <div className="bg-amber-500 text-black px-2 py-1 font-bold flex justify-between items-center">
                             <span>DONNÉES D'ENQUÊTE (INDICES)</span>
                             <button onClick={() => setViewMode('TERMINAL')} className="hover:bg-black hover:text-amber-500 px-2">X</button>
                         </div>
                         <div className="p-4 overflow-y-auto flex-1">
                             {gameState.cache_indices ? (
                                 <ResponseCard data={gameState.cache_indices} isPlayerMode={isPlayerMode} />
                             ) : (
                                 <div className="text-center mt-10 animate-pulse">CHARGEMENT DES INDICES...</div>
                             )}
                             <button onClick={() => executePrompt("CLUE_DROPS", "Force refresh indices", true)} className="mt-4 border border-amber-900 text-xs px-2 py-1 hover:bg-amber-900/20">FORCER L'ACTUALISATION</button>
                         </div>
                     </div>
                )}

                {/* PNJ (NPCs) */}
                 {viewMode === 'PNJ' && (
                     <div className="absolute inset-4 border-2 border-amber-500 bg-black z-10 flex flex-col shadow-lg shadow-black/80">
                         <div className="bg-amber-500 text-black px-2 py-1 font-bold flex justify-between items-center">
                             <span>REGISTRE DES PNJ (NON-JOUEURS)</span>
                             <button onClick={() => setViewMode('TERMINAL')} className="hover:bg-black hover:text-amber-500 px-2">X</button>
                         </div>
                         <div className="p-4 overflow-y-auto flex-1">
                             {gameState.cache_personnages ? (
                                 <ResponseCard data={gameState.cache_personnages} isPlayerMode={isPlayerMode} />
                             ) : (
                                 <div className="text-center mt-10 animate-pulse">RECHERCHE DANS LA BASE DE DONNÉES...</div>
                             )}
                             <button onClick={() => executePrompt("CHARACTERS_LIST", "Force refresh PNJ", true)} className="mt-4 border border-amber-900 text-xs px-2 py-1 hover:bg-amber-900/20">FORCER L'ACTUALISATION</button>
                         </div>
                     </div>
                )}

                {/* PJ (PCs) */}
                {viewMode === 'PJ' && (
                     <div className="absolute inset-4 border-2 border-amber-500 bg-black z-10 flex flex-col shadow-lg shadow-black/80">
                         <div className="bg-amber-500 text-black px-2 py-1 font-bold flex justify-between items-center">
                             <span>REGISTRE DES PJ (JOUEURS)</span>
                             <button onClick={() => setViewMode('TERMINAL')} className="hover:bg-black hover:text-amber-500 px-2">X</button>
                         </div>
                         <div className="p-4 overflow-y-auto flex-1">
                             {gameState.cache_joueurs ? (
                                 <ResponseCard data={gameState.cache_joueurs} isPlayerMode={isPlayerMode} />
                             ) : (
                                 <div className="text-center mt-10 animate-pulse">ANALYSE DES PROFILS JOUEURS...</div>
                             )}
                             <button onClick={() => executePrompt("PLAYERS_LIST", "Force refresh PJ", true)} className="mt-4 border border-amber-900 text-xs px-2 py-1 hover:bg-amber-900/20">FORCER L'ACTUALISATION</button>
                         </div>
                     </div>
                )}
            </div>
            
            {/* COMMAND DECK */}
            <div className="border-retro bg-gray-900/50 flex flex-col shrink-0">
                {/* Dynamic Main Tab Name */}
                <div className="flex border-b border-amber-900/50">
                    <div className="px-4 py-2 bg-amber-900/30 text-amber-500 font-bold text-xs uppercase flex-1 border-r border-amber-900/50 truncate">
                         {gameState.etape_active || 'ATTENTE SCÉNARIO'}
                    </div>
                    <button onClick={toggleIndices} className={`px-4 py-2 text-xs font-bold uppercase border-r border-amber-900/50 hover:bg-amber-900/20 ${viewMode === 'INDICES' ? 'bg-amber-500 text-black' : 'text-amber-500/70'}`}>
                        INDICES (REF)
                    </button>
                    <button onClick={togglePNJ} className={`px-4 py-2 text-xs font-bold uppercase border-r border-amber-900/50 hover:bg-amber-900/20 ${viewMode === 'PNJ' ? 'bg-amber-500 text-black' : 'text-amber-500/70'}`}>
                        PNJ (REF)
                    </button>
                    <button onClick={togglePJ} className={`px-4 py-2 text-xs font-bold uppercase hover:bg-amber-900/20 ${viewMode === 'PJ' ? 'bg-amber-500 text-black' : 'text-amber-500/70'}`}>
                        PJ (REF)
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
                        placeholder="ENTREZ UNE ACTION OU UN NUMÉRO D'OPTION..." 
                        className="flex-1 bg-transparent border-none focus:ring-0 text-amber-500 placeholder-amber-900/50 focus:outline-none font-mono text-base"
                        autoFocus
                        autoComplete="off"
                    />
                    <button 
                        onClick={handleInputSubmit} 
                        disabled={loading}
                        className="px-4 bg-amber-900 hover:bg-amber-500 hover:text-black transition-colors text-sm font-bold uppercase disabled:opacity-50"
                    >
                        {loading ? '...' : 'ENTRÉE'}
                    </button>
                </div>
            </div>
        </main>

        {/* RIGHT COL: MONITORING */}
        <aside className="w-56 flex flex-col gap-1 shrink-0">
            <div className="h-1/2 border-retro flex flex-col bg-black">
                <div className="bg-amber-900/40 px-2 py-1 text-amber-500 border-b border-amber-900/50 text-xs mb-2 uppercase">
                    >> Horloges
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                    <Clocks clocks={gameState.horloges} onUpdate={(id, d) => setGameState(p => ({...p, horloges: p.horloges.map(c => c.id === id ? {...c, current: Math.max(0, Math.min(c.max, c.current + d))} : c)}))} />
                </div>
            </div>

            <div className="flex-1 border-retro flex flex-col bg-black p-1 gap-1 overflow-y-auto">
                 <div className="bg-amber-900/20 p-1 text-[10px] text-center mb-2 opacity-60">OUTILS MJ</div>
                 <RetroButton onClick={() => executePrompt("GM_BRIEF", "Brief rapide de la situation.")} label="BRIEF SCÈNE" />
                 <RetroButton onClick={() => executePrompt("RAIL_BRIDGES", "3 moyens de ramener les joueurs sur le scénario.")} label="PONTS NARRATIFS" />
                 <div className="my-2 border-t border-amber-900/50"></div>
                 <RetroButton onClick={downloadHistory} label="SAUVEGARDER LOGS" />
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

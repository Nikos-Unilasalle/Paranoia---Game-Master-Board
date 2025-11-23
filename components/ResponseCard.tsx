
import React from 'react';
import { OmniResponse } from '../types';
import { TRANSLATIONS, LanguageKey } from '../utils/translations';

interface Props {
  data: OmniResponse;
  isPlayerMode: boolean;
  language: LanguageKey;
}

export const ResponseCard: React.FC<Props> = ({ data, isPlayerMode, language }) => {
  const t = TRANSLATIONS[language];

  // Helper for rendering list items
  const renderItem = (item: string, idx: number, showNumber: boolean = true) => (
      <div key={idx} className="flex items-start group mb-1 leading-relaxed text-sm">
          <span className="mr-3 opacity-50 select-none w-6 text-right shrink-0 font-mono text-xs pt-0.5">
              {showNumber ? String(idx + 1).padStart(2, '0') : '>'}
          </span>
          <div className="text-amber-500/90">
              {item.replace(/\[Improv.*?\]/g, '')}
              {item.includes('[Improv') && !isPlayerMode && (
                  <span className="ml-2 text-[10px] opacity-50 border border-amber-900 text-amber-700 px-1 rounded inline-block align-middle" title="Generated Content">AI</span>
              )}
          </div>
      </div>
  );

  // Title Construction
  let title = t.output;
  if (data.type === 'GM_BRIEF') title = `${t.brief}: ${data.scene || 'N/A'}`;
  else if (data.type === 'PLAYER_FACING') title = data.title || t.scene_desc;
  else if (data.type === 'OPTIONS') title = data.prompt || t.options;
  else if (data.type === 'CONSEQUENCES') title = `${t.impact}: ${data.trigger || 'UNKNOWN'}`;
  else if (data.type === 'RAIL_BRIDGES') title = t.realignment;
  else if (data.type === 'COMPUTER_MESSAGE') title = t.sys_msg;
  else if (data.type === 'CLUE_DROPS') title = t.investigation;
  else if (data.type === 'TURN_RESULT') title = `${t.turn_res}: ${data.trigger}`;
  else if (data.type === 'CHARACTERS_LIST') title = t.npc_registry;
  else if (data.type === 'PLAYERS_LIST') title = t.pc_registry;

  return (
    <div className="mb-6 border-b border-amber-900/20 pb-4 last:border-0 animate-in fade-in duration-300 slide-in-from-bottom-2">
      {/* Header */}
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-amber-500 font-bold bg-amber-900/20 px-2 py-0.5 text-xs uppercase tracking-wide">{data.type.replace('_', ' ')}</span>
        <span className="text-amber-700 text-xs font-mono uppercase truncate flex-1"> // {title}</span>
        {data.timestamp && <span className="text-[10px] text-amber-900">{new Date(data.timestamp).toLocaleTimeString()}</span>}
      </div>

      {/* Content Body */}
      <div className="pl-2 border-l border-amber-900/30 space-y-3">
        
        {/* Generic Bullets */}
        {'bullets' in data && data.bullets.map((item, i) => renderItem(item, i, false))}
        
        {/* Choices */}
        {'choices' in data && data.choices.map((item, i) => renderItem(item, i, true))}

        {/* Bridges */}
        {'bridges' in data && data.bridges.map((item, i) => renderItem(item, i, true))}

        {/* Turn Result (The core game loop view) */}
        {data.type === 'TURN_RESULT' && (
            <div className="space-y-4">
                <div>
                    <div className="text-amber-500 text-xs font-bold uppercase mb-1 opacity-70">>> {t.consequences}</div>
                    {data.consequences.map((item, i) => renderItem(item, i, false))}
                </div>
                <div>
                     <div className="text-amber-500 text-xs font-bold uppercase mb-1 opacity-70">>> {t.new_options}</div>
                     {data.new_options.map((item, i) => renderItem(item, i, true))}
                </div>
            </div>
        )}

        {/* Characters List (PNJ) */}
        {data.type === 'CHARACTERS_LIST' && (
            <div className="grid grid-cols-1 gap-2">
                {data.characters.map((char, i) => (
                    <div key={i} className="flex gap-2 items-baseline">
                        <span className="text-amber-500 font-bold whitespace-nowrap text-sm">{char.name}</span>
                        <span className="text-amber-700 text-xs uppercase">[{char.role}]</span>
                        <span className="text-amber-500/80 text-sm italic">- {char.trait}</span>
                    </div>
                ))}
            </div>
        )}

        {/* Players List (PJ) */}
        {data.type === 'PLAYERS_LIST' && (
            <div className="space-y-4">
                {data.players.map((p, i) => (
                    <div key={i} className="border border-amber-900/30 p-2 bg-amber-900/5">
                        <div className="flex justify-between items-baseline mb-1 border-b border-amber-900/20 pb-1">
                            <span className="text-amber-500 font-bold text-sm">{p.name}</span>
                            <span className="text-amber-700 text-xs uppercase font-mono">{p.mutation}</span>
                        </div>
                        <div className="text-amber-500/70 text-xs mb-2 italic">{p.description_short}</div>
                        
                        <div className="grid grid-cols-1 gap-1">
                            <div className="flex gap-2 text-xs">
                                <span className="text-amber-700 font-bold w-16 shrink-0">{t.society}:</span>
                                <span className="text-amber-500">{p.society}</span>
                            </div>
                            <div className="flex gap-2 text-xs">
                                <span className="text-amber-700 w-16 shrink-0 text-right opacity-50">>></span>
                                <span className="text-amber-500/90">{p.society_goal}</span>
                            </div>
                            <div className="flex gap-2 text-xs mt-1">
                                <span className="text-amber-700 font-bold w-16 shrink-0">{t.personal}:</span>
                                <span className="text-amber-500/90">{p.personal_goal}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        )}

      </div>
      
      {/* Footer Sources */}
      {!isPlayerMode && data.sources && data.sources.length > 0 && (
         <div className="mt-2 text-[10px] text-amber-900 pl-2 font-mono">
             {t.source}: {data.sources.join(' + ')}
         </div>
      )}
    </div>
  );
};

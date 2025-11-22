
import React, { useState } from 'react';

export const Dice: React.FC = () => {
  const [value, setValue] = useState<number>(6);
  const [rolling, setRolling] = useState(false);

  const roll = () => {
    if (rolling) return;
    setRolling(true);
    let duration = 0;
    const maxDuration = 600;
    const interval = setInterval(() => {
      setValue(Math.floor(Math.random() * 6) + 1);
      duration += 50;
      if (duration >= maxDuration) {
        clearInterval(interval);
        setRolling(false);
      }
    }, 50);
  };

  const dots: Record<number, number[]> = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8]
  };

  return (
    <div className="flex flex-col items-center justify-center h-full w-full select-none cursor-pointer group" onClick={roll}>
        <div className="text-[10px] text-amber-900 mb-1 uppercase group-hover:text-amber-500">D6_MODULE</div>
        <div className={`w-12 h-12 border-2 border-amber-500 flex items-center justify-center bg-black relative transition-transform ${rolling ? 'animate-spin' : ''}`}>
            {/* Grid 3x3 for dots */}
            <div className="grid grid-cols-3 grid-rows-3 gap-1 w-8 h-8">
                {Array.from({length: 9}).map((_, i) => (
                    <div key={i} className={`rounded-full w-1.5 h-1.5 ${dots[value]?.includes(i) ? 'bg-amber-500 shadow-[0_0_4px_#ffb000]' : 'bg-transparent'}`}></div>
                ))}
            </div>
            {/* Shine effect */}
            <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/10 to-transparent pointer-events-none"></div>
        </div>
        <div className="mt-1 text-amber-500 font-bold text-xs">RESULT: {value}</div>
    </div>
  );
};

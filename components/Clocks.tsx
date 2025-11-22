import React from 'react';
import { GameClock } from '../types';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

interface ClocksProps {
  clocks: GameClock[];
  onUpdate: (id: string, delta: number) => void;
}

export const Clocks: React.FC<ClocksProps> = ({ clocks, onUpdate }) => {
  if (clocks.length === 0) return <div className="text-amber-900 text-xs p-2">NO_ACTIVE_MONITORS</div>;

  return (
    <div className="space-y-4">
      {clocks.map((clock) => {
        // Prepare data for Pie Chart
        const data = [];
        for(let i=0; i<clock.max; i++) {
            // 1 = filled, 0 = empty
            data.push({ name: i, value: 1, filled: i < clock.current });
        }

        return (
          <div key={clock.id} className="flex items-center gap-2 p-1 hover:bg-gray-900">
            {/* Small Pie Chart */}
            <div className="h-10 w-10 relative shrink-0 cursor-pointer group">
                 <div className="absolute inset-0 flex z-10">
                    <div className="w-1/2 h-full" onClick={() => onUpdate(clock.id, -1)} title="-1"></div>
                    <div className="w-1/2 h-full" onClick={() => onUpdate(clock.id, 1)} title="+1"></div>
                </div>
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                    <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        innerRadius={6}
                        outerRadius={16}
                        startAngle={90}
                        endAngle={-270}
                        paddingAngle={10}
                        dataKey="value"
                        stroke="none"
                    >
                        {data.map((entry, index) => (
                            <Cell 
                                key={`cell-${index}`} 
                                fill={entry.filled ? '#ffb000' : '#202020'} 
                                stroke={entry.filled ? '#000' : '#332200'}
                                strokeWidth={1}
                            />
                        ))}
                    </Pie>
                    </PieChart>
                </ResponsiveContainer>
            </div>
            
            {/* Text Info */}
            <div className="flex-1 flex flex-col justify-center">
                <div className="flex justify-between items-baseline">
                    <span className="text-xs font-bold uppercase tracking-widest">{clock.name}</span>
                    <span className="text-xs font-mono text-amber-500">{clock.current}/{clock.max}</span>
                </div>
                {/* Bar representation alternative */}
                <div className="flex gap-0.5 mt-1">
                    {Array.from({length: clock.max}).map((_, i) => (
                        <div key={i} className={`h-1 flex-1 ${i < clock.current ? 'bg-amber-500' : 'bg-gray-800'}`}></div>
                    ))}
                </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
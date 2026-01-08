import React from 'react';
import { FaCut, FaGift } from 'react-icons/fa';
import { motion } from 'framer-motion';

interface LoyaltyCardProps {
  points: number;       // 0 a 10
  rewards: number;      // Quantas vezes já completou
  customerName: string;
}

export const LoyaltyCard: React.FC<LoyaltyCardProps> = ({ points, rewards, customerName }) => {
  const totalSlots = 10; // Cartão de 10 cortes

  return (
    <div className="w-full max-w-sm mx-auto perspective-1000 mb-6">
      <div className="bg-gray-900 rounded-2xl p-6 border border-orange-500/30 shadow-2xl relative overflow-hidden group hover:border-orange-500 transition-colors duration-500">
        
        {/* Fundo Decorativo */}
        <div className="absolute -right-10 -top-10 text-gray-800 opacity-20 rotate-12 group-hover:rotate-45 transition duration-700">
           <FaCut size={150} />
        </div>

        {/* Cabeçalho */}
        <div className="flex justify-between items-start mb-6 relative z-10">
          <div>
            <h3 className="text-orange-500 font-bold uppercase tracking-widest text-xs">Cartão Fidelidade</h3>
            <p className="text-white font-bold text-lg">{customerName}</p>
          </div>
          <div className="text-right">
             <div className="bg-orange-500/20 text-orange-400 px-3 py-1 rounded-full text-xs font-bold border border-orange-500/30 flex items-center gap-1">
                <FaGift /> {rewards} Completos
             </div>
          </div>
        </div>

        {/* Grid de Selos */}
        <div className="grid grid-cols-5 gap-3 relative z-10">
          {Array.from({ length: totalSlots }).map((_, i) => {
            const isFilled = i < points;
            return (
              <div 
                key={i} 
                className={`aspect-square rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                  isFilled 
                    ? 'bg-orange-500 border-orange-500 text-gray-900 shadow-[0_0_10px_rgba(249,115,22,0.6)] scale-105' 
                    : 'bg-gray-800 border-gray-700 text-gray-600'
                }`}
              >
                {isFilled ? (
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                    <FaCut size={14} />
                  </motion.div>
                ) : (
                  <span className="text-[10px] font-bold opacity-50">{i + 1}</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Mensagem de Progresso */}
        <div className="mt-6 text-center">
            {points === 0 && rewards > 0 ? (
                 <p className="text-green-400 text-xs font-bold animate-pulse">Parabéns! Você ganhou um corte grátis!</p>
            ) : points >= 9 ? (
                 <p className="text-yellow-400 text-xs font-bold">Falta só 1 para ganhar!</p>
            ) : (
                 <p className="text-gray-500 text-xs">Complete 10 cortes e ganhe 1 grátis.</p>
            )}
        </div>
        
        {/* Barra de Progresso Fina */}
        <div className="mt-4 h-1 w-full bg-gray-800 rounded-full overflow-hidden">
            <div 
                className="h-full bg-orange-500 transition-all duration-1000" 
                style={{ width: `${(points / totalSlots) * 100}%` }}
            />
        </div>

      </div>
    </div>
  );
};
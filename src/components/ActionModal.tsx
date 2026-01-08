import React from 'react';
import { FaExclamationTriangle, FaCheck, FaTimes } from 'react-icons/fa';

interface ActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean; // Se for deletar/cancelar, fica vermelho
}

export const ActionModal: React.FC<ActionModalProps> = ({ 
  isOpen, onClose, onConfirm, title, description, 
  confirmText = "Confirmar", cancelText = "Cancelar", isDanger = false 
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden transform transition-all scale-100">
        
        {/* Cabeçalho */}
        <div className={`p-4 flex items-center gap-3 ${isDanger ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-800'}`}>
          <div className={`p-2 rounded-full ${isDanger ? 'bg-red-100' : 'bg-orange-100 text-orange-600'}`}>
             <FaExclamationTriangle />
          </div>
          <h3 className="font-bold text-lg">{title}</h3>
        </div>

        {/* Corpo */}
        <div className="p-6">
           <p className="text-gray-600 text-sm leading-relaxed">{description}</p>
        </div>

        {/* Rodapé / Botões */}
        <div className="p-4 bg-gray-50 flex gap-3 justify-end">
          <button 
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-bold text-gray-500 hover:bg-gray-200 transition"
          >
            {cancelText}
          </button>
          <button 
            onClick={() => { onConfirm(); onClose(); }}
            className={`px-4 py-2 rounded-lg text-sm font-bold text-white flex items-center gap-2 shadow-lg transition transform active:scale-95 ${
                isDanger 
                ? 'bg-red-500 hover:bg-red-600 shadow-red-500/30' 
                : 'bg-green-600 hover:bg-green-700 shadow-green-500/30'
            }`}
          >
            <FaCheck /> {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
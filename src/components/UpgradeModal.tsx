// src/components/UpgradeModal.tsx
'use client';
import { FaCheck, FaWhatsapp, FaCopy, FaTimes } from 'react-icons/fa';
import { useState } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function UpgradeModal({ isOpen, onClose }: Props) {
  // ⚠️ ATENÇÃO CARIOCA: Troque pela SUA chave Pix real aqui!
  const MINHA_CHAVE_PIX = "claudesonborges@gmail.com"; 
  const MEU_NOME = "Rodrigo Borges";
  const VALOR = "29,90"; // Defina o preço aqui

  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(MINHA_CHAVE_PIX);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleZap = () => {
    const msg = `Olá! Fiz o Pix de R$ ${VALOR} e quero liberar meu Plano Pro no Cardápio. Segue o comprovante!`;
    // Seu número já está aqui
    window.open(`https://wa.me/5579996337995?text=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl relative overflow-hidden">
        
        {/* Cabeçalho */}
        <div className="bg-orange-600 p-6 text-center text-white relative">
          <button onClick={onClose} className="absolute top-4 right-4 text-white/80 hover:text-white"><FaTimes size={20}/></button>
          <h3 className="text-2xl font-bold mb-1">Seja Premium 🚀</h3>
          <p className="text-orange-100 text-sm">Desbloqueie todo o poder do seu delivery</p>
        </div>

        <div className="p-6">
          {/* Lista de Benefícios */}
          <div className="space-y-3 mb-6">
            <Item text="Produtos Ilimitados (Chega de travar em 8)" />
            <Item text="Cupons de Desconto para fidelizar" />
            <Item text="Personalização Total (Cores, Fundo, Capa)" />
            <Item text="QR Code Profissional" />
            <Item text="Prioridade no Suporte" />
          </div>

          {/* Área do Pix */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4 text-center">
            <p className="text-xs font-bold text-gray-500 uppercase mb-2">Valor da Assinatura Mensal</p>
            <p className="text-3xl font-black text-gray-800 mb-4">R$ {VALOR}<span className="text-sm font-normal text-gray-400">/mês</span></p>
            
            <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg p-2 mb-2">
                <input 
                    readOnly 
                    value={MINHA_CHAVE_PIX} 
                    className="flex-1 text-sm text-gray-600 outline-none text-center bg-transparent"
                />
                <button onClick={handleCopy} className="text-orange-600 hover:text-orange-700 font-bold text-xs flex items-center gap-1 px-2">
                    {copied ? "Copiado!" : <><FaCopy/> Copiar</>}
                </button>
            </div>
            <p className="text-xs text-gray-400">Favorecido: {MEU_NOME}</p>
          </div>

          {/* Botão de Ação */}
          <button 
            onClick={handleZap}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition transform hover:scale-[1.02] shadow-lg shadow-green-500/30"
          >
            <FaWhatsapp size={20} />
            Enviar Comprovante e Ativar
          </button>
        </div>
      </div>
    </div>
  );
}

function Item({text}: {text: string}) {
    return <div className="flex items-center gap-3 text-sm text-gray-600"><div className="bg-green-100 text-green-600 p-1 rounded-full"><FaCheck size={10}/></div>{text}</div>;
}
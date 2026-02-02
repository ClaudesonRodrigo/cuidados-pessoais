// src/components/FiscalModal.tsx
'use client';
import { useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { FaMagic, FaCopy, FaCheck, FaWhatsapp } from 'react-icons/fa';

export default function FiscalModal({ 
  isOpen, 
  onClose, 
  onSave 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onSave: (cpf: string, phone: string) => void 
}) {
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');
  const [showPix, setShowPix] = useState(false);
  const [copied, setCopied] = useState(false);

  // Chave Pix do BeautyPro (Substitua pela sua chave real)
  const PIX_KEY = "79996337995"; 
  const PIX_VALUE = "29.90";

  if (!isOpen) return null;

  const handleCopyPix = () => {
    navigator.clipboard.writeText(PIX_KEY);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white p-6 rounded-[2.5rem] w-full max-w-sm shadow-2xl relative overflow-hidden border border-purple-100">
        
        {/* Decorativo de Fundo */}
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-purple-50 rounded-full blur-3xl -z-10" />

        {!showPix ? (
          <div className="animate-in slide-in-from-bottom-4 duration-300">
            <h3 className="text-2xl font-bold mb-2 text-gray-900 font-serif-luxury italic">Quase lá! 🚀</h3>
            <p className="text-sm text-gray-500 mb-6">Para ativar sua assinatura **BeautyPro**, precisamos de alguns dados para segurança.</p>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-black text-purple-400 mb-1 ml-1">CPF ou CNPJ</label>
                <input 
                  type="text" 
                  value={cpf} 
                  onChange={e => setCpf(e.target.value)} 
                  className="w-full bg-gray-50 border border-purple-50 p-3 rounded-2xl outline-none focus:border-purple-400 focus:bg-white text-gray-900 transition-all"
                  placeholder="000.000.000-00"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest font-black text-purple-400 mb-1 ml-1">WhatsApp</label>
                <input 
                  type="text" 
                  value={phone} 
                  onChange={e => setPhone(e.target.value)} 
                  className="w-full bg-gray-50 border border-purple-50 p-3 rounded-2xl outline-none focus:border-purple-400 focus:bg-white text-gray-900 transition-all"
                  placeholder="(00) 90000-0000"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 text-gray-400 font-bold text-sm hover:text-gray-600 transition">Talvez depois</button>
              <button 
                onClick={() => { 
                  if(cpf.length >= 11 && phone.length >= 10) {
                    setShowPix(true);
                  } else {
                    alert("Por favor, preencha os dados corretamente.");
                  }
                }} 
                className="flex-2 bg-purple-600 text-white py-4 rounded-2xl font-bold text-sm hover:bg-purple-700 transition shadow-xl shadow-purple-200"
              >
                Continuar
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center animate-in zoom-in-95 duration-300">
            <div className="bg-purple-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
               <FaMagic className="text-purple-600 text-xl" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Pagamento Seguro</h3>
            <p className="text-xs text-gray-500 mb-6">Escaneie o QR Code abaixo para ativar seu plano mensal de **R$ {PIX_VALUE}**.</p>
            
            <div className="bg-white p-4 rounded-3xl border border-purple-100 inline-block mb-6 shadow-inner">
              <QRCodeCanvas 
                value={`00020126360014BR.GOV.BCB.PIX0111${PIX_KEY}5204000053039865405${PIX_VALUE}5802BR5915BeautyProSaaS6007Aracaju62070503***6304`}
                size={180}
                level="H"
                includeMargin={false}
              />
            </div>

            <div className="space-y-3">
              <button 
                onClick={handleCopyPix}
                className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white py-4 rounded-2xl font-bold text-sm hover:bg-gray-800 transition"
              >
                {copied ? <><FaCheck className="text-green-400"/> Copiado!</> : <><FaCopy/> Copiar Chave Pix</>}
              </button>
              
              <button 
                onClick={() => {
                  onSave(cpf, phone);
                  onClose();
                }}
                className="w-full text-purple-600 font-bold text-sm py-2 hover:underline"
              >
                Já realizei o pagamento
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
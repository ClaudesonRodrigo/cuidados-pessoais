import React, { useState, useEffect } from 'react';
import { FaTimes, FaMoneyBillWave, FaShoppingCart, FaArrowDown, FaArrowUp, FaSave } from 'react-icons/fa';
import { LinkData, TransactionData } from '@/lib/pageService';
import { Timestamp } from 'firebase/firestore';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: TransactionData) => Promise<void>;
  pageSlug: string;
  services: LinkData[]; // Para o autocomplete na venda
}

export const TransactionModal: React.FC<TransactionModalProps> = ({ isOpen, onClose, onSave, pageSlug, services }) => {
  const [type, setType] = useState<'income' | 'expense'>('income');
  const [description, setDescription] = useState('');
  const [value, setValue] = useState('');
  const [category, setCategory] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Categorias Sugeridas
  const incomeCats = ['Serviço Balcão', 'Venda Produto', 'Outros'];
  const expenseCats = ['Aluguel', 'Energia/Água', 'Produtos/Estoque', 'Marketing', 'Manutenção', 'Pessoal', 'Outros'];

  // Reseta form ao abrir
  useEffect(() => {
    if (isOpen) {
        setType('income'); setDescription(''); setValue(''); setCategory('Serviço Balcão'); setIsSaving(false);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description || !value) return;

    setIsSaving(true);
    try {
        await onSave({
            pageSlug,
            type,
            description,
            value: parseFloat(value.replace(',', '.')),
            category,
            date: Timestamp.now(),
            createdAt: Timestamp.now()
        });
        onClose();
    } catch (error) {
        console.error(error);
    } finally {
        setIsSaving(false);
    }
  };

  const handleServiceSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const selectedTitle = e.target.value;
      if (!selectedTitle) return;
      
      const service = services.find(s => s.title === selectedTitle);
      if (service) {
          setDescription(service.title);
          if (service.price) setValue(service.price.replace(',', '.'));
          setCategory('Serviço Balcão');
      }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl relative">
        
        {/* Header com Abas */}
        <div className="flex text-center font-bold text-sm cursor-pointer">
            <div onClick={() => setType('income')} className={`flex-1 p-4 flex items-center justify-center gap-2 transition ${type === 'income' ? 'bg-green-100 text-green-700 border-b-2 border-green-500' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>
                <FaArrowUp /> ENTRADA (Venda)
            </div>
            <div onClick={() => setType('expense')} className={`flex-1 p-4 flex items-center justify-center gap-2 transition ${type === 'expense' ? 'bg-red-100 text-red-700 border-b-2 border-red-500' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>
                <FaArrowDown /> SAÍDA (Despesa)
            </div>
        </div>

        <button onClick={onClose} className="absolute top-2 right-2 p-2 text-gray-400 hover:text-gray-600 rounded-full bg-white/50"><FaTimes /></button>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
            
            {/* Atalho de Produtos (Só para Entrada) */}
            {type === 'income' && services.length > 0 && (
                <div className="bg-gray-50 p-3 rounded-lg border border-dashed border-gray-300">
                    <label className="text-xs font-bold text-gray-500 mb-1 flex items-center gap-1"><FaShoppingCart/> Venda Rápida (Selecionar Serviço)</label>
                    <select onChange={handleServiceSelect} className="w-full bg-white border rounded p-2 text-sm outline-none focus:border-green-500">
                        <option value="">-- Selecione --</option>
                        {services.map((s, i) => <option key={i} value={s.title}>{s.title} - R$ {s.price}</option>)}
                    </select>
                </div>
            )}

            <div>
                <label className="text-xs font-bold text-gray-500">Descrição</label>
                <input 
                    type="text" 
                    value={description} 
                    onChange={e => setDescription(e.target.value)} 
                    placeholder={type === 'income' ? "Ex: Corte + Barba avulso" : "Ex: Conta de Luz"}
                    className="w-full border p-3 rounded-lg outline-none focus:ring-2 focus:ring-opacity-50 focus:ring-orange-500"
                    autoFocus
                    required 
                />
            </div>

            <div className="flex gap-4">
                <div className="flex-1">
                    <label className="text-xs font-bold text-gray-500">Valor (R$)</label>
                    <input 
                        type="number" 
                        step="0.01"
                        value={value} 
                        onChange={e => setValue(e.target.value)} 
                        placeholder="0.00"
                        className={`w-full border p-3 rounded-lg outline-none font-bold text-lg ${type === 'income' ? 'text-green-600' : 'text-red-600'}`}
                        required 
                    />
                </div>
                <div className="flex-1">
                    <label className="text-xs font-bold text-gray-500">Categoria</label>
                    <input 
                        list="categories" 
                        value={category} 
                        onChange={e => setCategory(e.target.value)} 
                        className="w-full border p-3 rounded-lg outline-none" 
                        placeholder="Selecione..."
                    />
                    <datalist id="categories">
                        {(type === 'income' ? incomeCats : expenseCats).map(c => <option key={c} value={c} />)}
                    </datalist>
                </div>
            </div>

            <button 
                type="submit" 
                disabled={isSaving}
                className={`w-full py-4 rounded-xl font-bold text-white shadow-lg transition transform active:scale-95 flex items-center justify-center gap-2 ${type === 'income' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
            >
                {isSaving ? 'Salvando...' : <><FaSave/> {type === 'income' ? 'Lançar Venda' : 'Lançar Despesa'}</>}
            </button>

        </form>
      </div>
    </div>
  );
};
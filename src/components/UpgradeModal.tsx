// src/components/UpgradeModal.tsx
'use client';
import { FaCheck, FaCreditCard, FaTimes } from 'react-icons/fa';
import { useRef, useState } from 'react';
import { auth } from '@/lib/firebaseClient';
import { createCheckoutHandler, type CheckoutUiStatus } from '@/lib/upgradeCheckout';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function UpgradeModal({ isOpen, onClose }: Props) {
  const [checkoutStatus, setCheckoutStatus] = useState<CheckoutUiStatus>({ state: 'idle' });
  const checkoutHandler = useRef<ReturnType<typeof createCheckoutHandler> | null>(null);

  if (!checkoutHandler.current) {
    checkoutHandler.current = createCheckoutHandler({
      getCurrentUser: () => auth.currentUser,
      fetch: (input, init) => window.fetch(input, init),
      redirect: (url) => window.location.assign(url),
      onStatusChange: setCheckoutStatus,
    });
  }

  if (!isOpen) return null;

  const isLoading = checkoutStatus.state === 'loading';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl relative overflow-hidden">
        <div className="bg-orange-600 p-6 text-center text-white relative">
          <button onClick={onClose} className="absolute top-4 right-4 text-white/80 hover:text-white"><FaTimes size={20}/></button>
          <h3 className="text-2xl font-bold mb-1">Seja Premium 🚀</h3>
          <p className="text-orange-100 text-sm">Desbloqueie todo o poder do seu Salão Digital</p>
        </div>

        <div className="p-6">
          <div className="space-y-3 mb-6">
            <Item text="Produtos Ilimitados (Chega de travar em 8)" />
            <Item text="Cupons de Desconto para fidelizar" />
            <Item text="Personalização Total (Cores, Fundo, Capa)" />
            <Item text="QR Code Profissional" />
            <Item text="Prioridade no Suporte" />
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4 text-center">
            <p className="text-xs font-bold text-gray-500 uppercase mb-2">Valor da Assinatura Mensal</p>
            <p className="text-3xl font-black text-gray-800 mb-1">R$ 29,90<span className="text-sm font-normal text-gray-400">/mês</span></p>
            <p className="text-xs text-gray-500">7 dias grátis. Pagamento seguro pelo Stripe.</p>
          </div>

          <button
            onClick={() => checkoutHandler.current?.()}
            disabled={isLoading}
            className="w-full bg-orange-600 hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-70 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition transform hover:scale-[1.02] disabled:hover:scale-100 shadow-lg shadow-orange-500/30"
          >
            <FaCreditCard size={18} />
            {isLoading ? 'Preparando pagamento...' : 'Assinar BeautyPro'}
          </button>
          {checkoutStatus.state === 'error' && (
            <p role="alert" className="mt-3 text-center text-sm font-medium text-red-600">
              {checkoutStatus.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Item({text}: {text: string}) {
  return <div className="flex items-center gap-3 text-sm text-gray-600"><div className="bg-green-100 text-green-600 p-1 rounded-full"><FaCheck size={10}/></div>{text}</div>;
}

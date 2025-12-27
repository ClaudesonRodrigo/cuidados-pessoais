// src/app/admin/login/page.tsx
'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { signInWithGoogle } from '@/lib/authService';
import Link from 'next/link';
import { FaGoogle, FaArrowLeft } from 'react-icons/fa';

export default function LoginPage() {
  const router = useRouter();

  const handleGoogleSignIn = async () => {
    // AQUI ESTÁ O SEGREDO: Passamos 'owner'
    // Quem entra por aqui quer GERENCIAR uma barbearia
    const user = await signInWithGoogle('owner');
    if (user) {
      router.push('/admin/dashboard');
    } else {
      alert("Houve um erro ao tentar fazer login. Tente novamente.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col lg:flex-row">
      
      {/* Lado Esquerdo - Visual / Marketing */}
      <div className="hidden lg:flex lg:w-1/2 bg-blue-600 text-white flex-col justify-center px-12 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-linear-to-br from-blue-600 to-purple-700 opacity-90 z-0"></div>
        {/* Círculos decorativos */}
        <div className="absolute top-10 left-10 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl"></div>
        <div className="absolute bottom-10 right-10 w-64 h-64 bg-purple-500 opacity-20 rounded-full blur-3xl"></div>

        <div className="relative z-10">
          <h2 className="text-4xl font-bold mb-6">Bem-vindo de volta!</h2>
          <p className="text-blue-100 text-lg mb-8 leading-relaxed">
            Gerencie sua Barbearia, analise suas métricas e personalize sua agenda digital para atrair mais clientes.
          </p>
          <div className="bg-white/10 backdrop-blur-sm p-6 rounded-xl border border-white/20">
            <p className="italic">&quot;Desde que comecei a usar o meu agendamento PRO, meus cliques no WhatsApp aumentaram 150%.&quot;</p>
            <div className="mt-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/30"></div>
              <span className="font-semibold text-sm">Usuário Satisfeito</span>
            </div>
          </div>
        </div>
      </div>

      {/* Lado Direito - Formulário */}
      <div className="flex-1 flex flex-col justify-center items-center p-8 lg:p-16 bg-white">
        <div className="w-full max-w-md">
          <Link href="/" className="inline-flex items-center text-sm text-gray-500 hover:text-blue-600 mb-8 transition-colors">
            <FaArrowLeft className="mr-2" /> Voltar para Home
          </Link>

          <div className="text-center mb-10">
            <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Acesse sua conta</h1>
            <p className="text-gray-600">Entre para gerenciar seu painel</p>
          </div>

          <div className="space-y-6">
            <button
              onClick={handleGoogleSignIn}
              className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold py-4 px-6 rounded-xl transition-all duration-300 shadow-sm hover:shadow-md group"
            >
              <FaGoogle className="text-red-500 text-xl group-hover:scale-110 transition-transform" />
              <span>Continuar com Google</span>
            </button>

            <div className="relative flex py-2 items-center">
              <div className="grow border-t border-gray-200"></div>
              <span className="shrink-0 mx-4 text-gray-400 text-xs uppercase">Seguro e Rápido</span>
              <div className="grow border-t border-gray-200"></div>
            </div>

            <p className="text-center text-xs text-gray-400 mt-8">
              Ao entrar, você concorda com nossos Termos de Serviço e Política de Privacidade.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
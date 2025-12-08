// src/app/page.tsx
'use client';
import Link from 'next/link';
import { FaUtensils, FaQrcode, FaMobileAlt, FaCheckCircle } from 'react-icons/fa';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white font-sans text-gray-900">
      <header className="fixed w-full bg-white/90 backdrop-blur z-50 border-b border-gray-100">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-xl text-orange-600">
            <FaUtensils /> CardápioPro
          </div>
          <Link href="/admin/login" className="bg-orange-600 text-white px-5 py-2 rounded-full font-bold hover:bg-orange-700 transition">
            Criar Cardápio Grátis
          </Link>
        </div>
      </header>

      <section className="pt-32 pb-20 bg-orange-50">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-6xl font-extrabold text-gray-900 mb-6">
            Seu Cardápio Digital <br/><span className="text-orange-600">Lindo e Sem Taxas.</span>
          </h1>
          <p className="text-lg text-gray-600 mb-8 max-w-xl mx-auto">
            Abandone o PDF. Crie um cardápio interativo com QR Code para suas mesas em minutos. Atualize preços pelo celular na hora.
          </p>
          <Link href="/admin/login" className="inline-flex items-center gap-2 bg-orange-600 text-white text-lg px-8 py-4 rounded-xl font-bold shadow-xl hover:bg-orange-700 transition transform hover:-translate-y-1">
            <FaQrcode /> Começar Agora
          </Link>
          <p className="mt-4 text-sm text-gray-500">Não precisa de cartão de crédito.</p>
        </div>
      </section>

      <section className="py-20">
        <div className="container mx-auto px-4 grid md:grid-cols-3 gap-8">
            {[
                {icon: FaMobileAlt, title: "Atualize no Celular", desc: "Acabou a coca-cola? Tire do cardápio em 1 segundo pelo seu celular."},
                {icon: FaQrcode, title: "QR Code Automático", desc: "O sistema gera o código para você imprimir e colocar nas mesas."},
                {icon: FaCheckCircle, title: "Zero Comissões", desc: "Não cobramos taxas sobre seus pedidos. O lucro é todo seu."}
            ].map((i,k) => (
                <div key={k} className="p-6 bg-gray-50 rounded-2xl border border-gray-100 text-center">
                    <i.icon className="mx-auto text-4xl text-orange-500 mb-4"/>
                    <h3 className="font-bold text-xl mb-2">{i.title}</h3>
                    <p className="text-gray-600">{i.desc}</p>
                </div>
            ))}
        </div>
      </section>
    </div>
  );
}